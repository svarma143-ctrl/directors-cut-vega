import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Agent } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';

import { buildGroundingMap, sanitizeGrounding, toSafeContext } from './playhead.js';
import { fallbackResponse } from './fallback.js';
import type { DirectorRequest, DirectorResponse, SafeMediaContext } from './types.js';

/**
 * The Director's Cut agent.
 *
 * It answers two things about the media currently playing:
 *   - a short contextual note ("what is happening right now")
 *   - trivia questions about what has already happened
 *
 * Everything it sees has been through `toSafeContext`, so it structurally
 * cannot know about the future.
 */

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const cueSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
});

const directorRequestSchema = z.object({
  media: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    duration: z.number().optional(),
    playhead: z.number().min(0),
    cues: z.array(cueSchema),
  }),
  questionCount: z.number().int().min(0).max(8).optional(),
  includeContext: z.boolean().optional(),
});

/**
 * How the model is selected.
 *
 * `bedrock` is the intended path and the one that satisfies the AWS Builder
 * mini-challenge. But a zero Bedrock model quota is common on new accounts
 * and the promotional credits for this hackathon ran out on 7 October 2026,
 * so we support an OpenAI-compatible fallback provider and, failing that, a
 * fully deterministic offline mode. Every response reports which path was
 * used via the `fallback` flag.
 */
async function createAgent(): Promise<{ agent: Agent | null; mode: string; reason?: string }> {
  const provider = (process.env.MODEL_PROVIDER ?? 'bedrock').toLowerCase();

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      return { agent: null, mode: 'offline', reason: 'OPENAI_API_KEY is not set' };
    }
    try {
      // Imported dynamically: the `openai` package is an optional peer
      // dependency, and a static import would break the Bedrock-only path.
      const { OpenAIModel } = await import('@strands-agents/sdk/models/openai');
      const agent = new Agent({
        model: new OpenAIModel({ api: 'chat', modelId: process.env.OPENAI_MODEL_ID ?? 'gpt-4o-mini' }),
        systemPrompt: SYSTEM_PROMPT,
      });
      return { agent, mode: 'openai' };
    } catch (err) {
      return { agent: null, mode: 'offline', reason: `OpenAI provider failed: ${String(err)}` };
    }
  }

  // Default: Bedrock.
  try {
    const agent = new Agent({
      model: new BedrockModel({
        region: process.env.AWS_REGION ?? 'us-east-1',
        modelId: process.env.BEDROCK_MODEL_ID ?? 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
      }),
      systemPrompt: SYSTEM_PROMPT,
    });
    return { agent, mode: 'bedrock' };
  } catch (err) {
    return { agent: null, mode: 'offline', reason: `Bedrock provider failed: ${String(err)}` };
  }
}

const SYSTEM_PROMPT = `You are the on-screen companion for a living-room TV app.

You will be given:
- the title of the media,
- the viewer's current playhead position,
- a list of numbered dialogue cues that the viewer has ALREADY WATCHED.

Rules you must follow:
1. You may only use the numbered cues you were given. Those cues are the past.
   You have no knowledge of what comes next and must never speculate about it.
2. If asked about something that has not happened yet in the cues you were given,
   say so plainly instead of guessing.
3. When you answer, cite the cue ids you used in the "groundingIn" field.
4. Tone: concise, warm, and suitable for a 10-foot viewing distance.
5. Never reveal that you were given a filtered transcript, and never mention
   spoilers, timelines, or the fact that you lack future context.
6. Trivia questions must be answerable from the cues you were given.`;

// ---------------------------------------------------------------------------
// Model interaction
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  context: z
    .object({
      title: z.string(),
      body: z.string(),
      groundingIn: z.array(z.number()),
    })
    .optional(),
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        options: z.array(z.string()),
        correctIndex: z.number(),
        explanation: z.string().optional(),
        groundingIn: z.array(z.number()),
      }),
    )
    .default([]),
});

/** Build the user-turn prompt from the safe context. */
function buildPrompt(request: DirectorRequest, safe: SafeMediaContext): string {
  const grounding = buildGroundingMap(safe);
  const lines = grounding.map((g) => `[${g.id}] ${g.text}`).join('\n');

  const wants = [];
  if (request.includeContext) wants.push('a "context" note explaining what is happening right now');
  if ((request.questionCount ?? 3) > 0) {
    wants.push(`${request.questionCount ?? 3} trivia question(s) about events so far`);
  }

  return [
    `Title: ${safe.title}`,
    safe.subtitle ? `Subtitle: ${safe.subtitle}` : null,
    `Playhead: ${Math.floor(safe.playhead)}s into the media`,
    '',
    'Dialogue already watched:',
    lines.length ? lines : '(none yet)',
    '',
    `Produce ${wants.join(' and ')}.`,
    'Respond with JSON only, matching:',
    '{"context": {"title": string, "body": string, "groundingIn": number[]}, "questions": [{"id": string, "question": string, "options": string[], "correctIndex": number, "explanation": string, "groundingIn": number[]}]}',
    'groundingIn must contain only cue ids listed above.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Pull the first JSON object out of a model response, tolerating prose around it. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model response contained no JSON object');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Normalise a Strands AgentResult into plain text.
 *
 * Strands returns an `AgentResult` whose exact shape varies by provider and
 * by whether streaming was used, so we walk the known shapes defensively.
 */
function extractText(result: unknown): string {
  if (typeof result === 'string') return result;

  const r = result as {
    message?: { content?: unknown; contentText?: unknown };
    content?: unknown;
    text?: unknown;
  };

  const messageContent = r?.message?.content;
  if (typeof messageContent === 'string') return messageContent;

  // Content blocks: [{ text: "..." }]
  if (Array.isArray(messageContent)) {
    const parts = messageContent
      .map((block) => {
        const b = block as { text?: unknown };
        return typeof b?.text === 'string' ? b.text : '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }

  if (typeof r?.message?.contentText === 'string') return r.message.contentText;
  if (typeof r?.text === 'string') return r.text;
  if (Array.isArray(r?.content)) return JSON.stringify(r.content);

  return JSON.stringify(result);
}

async function askModel(
  agent: Agent,
  request: DirectorRequest,
  safe: SafeMediaContext,
): Promise<DirectorResponse> {
  const result = await agent.invoke(buildPrompt(request, safe));

  // Strands returns an AgentResult whose shape varies by provider, so we
  // normalise defensively rather than assuming one shape.
  const text = extractText(result);

  const parsed = responseSchema.parse(extractJson(text));

  // Re-validate every grounding id against the safe context. A model can
  // invent ids, and an invented id is never safe to surface.
  const questions = parsed.questions.map((q, i) => ({
    id: q.id || `q-${i}`,
    question: q.question,
    options: q.options ?? [],
    correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : -1,
    explanation: q.explanation,
    groundedIn: sanitizeGrounding(q.groundingIn, safe),
  }));

  const context = parsed.context
    ? {
        id: 'ctx-0',
        title: parsed.context.title,
        body: parsed.context.body,
        groundedIn: sanitizeGrounding(parsed.context.groundingIn, safe),
      }
    : undefined;

  return {
    groundedIn: sanitizeGrounding(
      [...questions.flatMap((q) => q.groundedIn), ...(context?.groundedIn ?? [])],
      safe,
    ),
    context,
    questions,
    fallback: false,
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const { agent, mode, reason } = await createAgent();
if (mode !== 'bedrock') {
  console.warn(`[agent] running in "${mode}" mode${reason ? `: ${reason}` : ''}`);
} else {
  console.log('[agent] running in "bedrock" mode');
}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/ping', (_req: Request, res: Response) => {
  res.json({ status: 'Healthy', mode, reason });
});

app.post('/director', async (req: Request, res: Response) => {
  const parsed = directorRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', detail: parsed.error.issues });
    return;
  }

  const request = parsed.data as DirectorRequest;

  // The single choke point: the model only ever sees the filtered context.
  const safe = toSafeContext(request.media);

  try {
    if (!agent) {
      res.json(fallbackResponse(request, safe));
      return;
    }
    const response = await askModel(agent, request, safe);
    res.json(response);
  } catch (err) {
    // A quota error, throttling, or a malformed model response must not take
    // the demo down. Fall back and say so.
    console.warn('[agent] model call failed, using fallback:', String(err));
    res.json(fallbackResponse(request, safe));
  }
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`[agent] Director's Cut agent listening on :${port} (mode=${mode})`);
});

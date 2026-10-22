import type {
  ContextNote,
  DirectorRequest,
  DirectorResponse,
  SafeMediaContext,
  TriviaQuestion,
} from './types.js';
import { buildGroundingMap, sanitizeGrounding } from './playhead.js';

/**
 * A deterministic, offline generator.
 *
 * This exists for three reasons:
 *
 *  1. **Bedrock access is not guaranteed.** New AWS accounts frequently have
 *     a zero Bedrock model quota, and the promotional credits for this
 *     hackathon ran out on 7 October 2026. A demo that dies because an AWS
 *     quota is zero is a demo that scores zero.
 *  2. **Judging happens days later.** Judging runs 9-20 November, long after
 *     the submission deadline. If the agent depends on a live Bedrock call
 *     that has expired or been throttled, the judges cannot run it.
 *  3. **Honesty.** Every response carries a `fallback` flag, and the client
 *     surfaces it in the UI. We never let deterministic output masquerade
 *     as a live model response.
 *
 * The fallback is intentionally simple and extractive: it works from the
 * already-watched cues, so it is spoiler-safe by construction.
 */

const STOPWORDS = new Set(
  ('the a an and or but of to in on at for with from by as is are was were be been being ' +
    'this that these those it its he she they we you i his her their our your my not no ' +
    'do does did done have has had will would can could should may might must im ive dont')
    .split(' '),
);

/**
 * Pick the contentful words from a cue, rarest first.
 *
 * "Rarest first" matters: in "Go! Move your asses! Go go go!" the word
 * "go" appears three times, and a question whose answer is "go" is not a
 * question. Sorting by ascending frequency and then descending length puts
 * "asses" first, which is the word worth asking about.
 */
function keywords(text: string, limit = 5): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => a[1] - b[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([w]) => w);
}

/**
 * Replace a word in a line with a blank, keeping the rest of the line
 * readable so the question has some context.
 */
function maskWord(line: string, word: string): string | null {
  const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (!pattern.test(line)) return null;
  const masked = line.replace(pattern, '____');
  // Keep the masked line short enough to read on a TV.
  return masked.length > 90 ? `${masked.slice(0, 87)}...` : masked;
}

/** Deterministic string hash, so IDs are stable across runs. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Build extractive questions from the watched cues. */
function buildFallbackQuestions(safe: SafeMediaContext, count: number): TriviaQuestion[] {
  const grounding = buildGroundingMap(safe);
  const questions: TriviaQuestion[] = [];

  // Take the most recent cues first: they are the most relevant to what the
  // viewer is watching right now.
  const recent = [...safe.cues].slice(-10).reverse();

  for (const cue of recent) {
    if (questions.length >= count) break;

    const words = keywords(cue.text, 5);
    if (words.length < 1) continue;

    const idx = grounding.findIndex((g) => g.text === cue.text);
    const seed = hash(`${safe.title}:${cue.start}:${cue.text}`);

    // Prefer a question about the most distinctive word in the line.
    const answer = words[0];
    const distractors = words.slice(1, 4);
    if (distractors.length < 2) {
      // Not enough words in this line for a multiple-choice question. Fall
      // back to words from neighbouring watched lines, which keeps the
      // distractors plausible without reaching into the future.
      for (const other of recent) {
        if (other === cue) continue;
        for (const w of keywords(other.text, 5)) {
          if (w !== answer && !distractors.includes(w)) distractors.push(w);
          if (distractors.length >= 3) break;
        }
        if (distractors.length >= 3) break;
      }
    }
    if (distractors.length < 2) continue;

    const options = [answer, ...distractors.slice(0, 3)];
    // Rotate deterministically so the correct answer is not always first.
    const shift = seed % options.length;
    const rotated = [...options.slice(shift), ...options.slice(0, shift)];
    const correctIndex = rotated.indexOf(answer);

    // Build a fill-in-the-blank question from the line itself.
    const masked = maskWord(cue.text, answer);

    questions.push({
      id: `q-${seed.toString(36)}`,
      question: masked
        ? `Complete the line: "${masked}"`
        : `In "${safe.title}", what word completes the line at ${formatTime(cue.start)}?`,
      options: rotated,
      correctIndex,
      explanation: `The line at ${formatTime(cue.start)} reads: "${cue.text}"`,
      groundedIn: idx >= 0 ? [idx] : [],
    });
  }

  return questions;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Build an extractive context note from the most recent watched cue. */
function buildFallbackContext(safe: SafeMediaContext): ContextNote | undefined {
  if (safe.cues.length === 0) return undefined;
  const last = safe.cues[safe.cues.length - 1];
  const idx = safe.cues.length - 1;
  const words = keywords(last.text, 3);

  return {
    id: `ctx-${hash(last.text).toString(36)}`,
    title: `Now: ${formatTime(safe.playhead)}`,
    body: words.length
      ? `Right now the dialogue turns on ${words.join(', ')}. Recent line: "${last.text}"`
      : `Recent line: "${last.text}"`,
    groundedIn: [idx],
  };
}

/**
 * Produce a deterministic response.
 *
 * Used when the model is unavailable. The result is clearly marked as a
 * fallback so the UI can label it honestly.
 */
export function fallbackResponse(request: DirectorRequest, safe: SafeMediaContext): DirectorResponse {
  const count = Math.min(Math.max(request.questionCount ?? 3, 0), 8);
  const questions = count > 0 ? buildFallbackQuestions(safe, count) : [];
  const context = request.includeContext ? buildFallbackContext(safe) : undefined;

  return {
    groundedIn: sanitizeGrounding(
      [...questions.flatMap((q) => q.groundedIn), ...(context?.groundedIn ?? [])],
      safe,
    ),
    context,
    questions,
    fallback: true,
  };
}

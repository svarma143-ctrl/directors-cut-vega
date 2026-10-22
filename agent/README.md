# The Director's Cut agent

A [Strands Agents](https://strandsagents.com) agent that answers two
questions about the media currently playing on a Fire TV:

- **What is happening right now?** A short context note.
- **What has happened so far?** Trivia questions the viewer can answer.

## The one rule

**The model may only ever see media the viewer has already watched.**

That is enforced in `src/playhead.ts`, not in the prompt. `toSafeContext()`
filters the cue list down to the cues that have already started, and it is
the only route by which anything reaches the model. The future content is
never in the context window, so it cannot leak — no matter how the model is
prompted.

`test/playhead.test.ts` tries to leak the ending and asserts that it cannot.

## Running it

```bash
npm install
npm run build
node dist/index.js
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `MODEL_PROVIDER` | `bedrock` | `bedrock` or `openai` |
| `AWS_REGION` | `us-east-1` | Bedrock region |
| `BEDROCK_MODEL_ID` | `us.amazon.nova-lite-v1:0` | The model to use |
| `OPENAI_API_KEY` | - | Required when `MODEL_PROVIDER=openai` |
| `OPENAI_MODEL_ID` | `gpt-4o-mini` | The OpenAI model to use |

## The API

### `GET /ping`

```json
{ "status": "Healthy", "mode": "bedrock" }
```

`mode` is `bedrock`, `openai` or `offline`.

### `POST /director`

```json
{
  "media": {
    "title": "Tears of Steel",
    "subtitle": "Blender Foundation open movie - CC BY 3.0",
    "duration": 120,
    "playhead": 45,
    "cues": [
      { "start": 3, "end": 4, "text": "Are you ready?" },
      { "start": 43, "end": 45, "text": "There she is." }
    ]
  },
  "questionCount": 3,
  "includeContext": true
}
```

The response:

```json
{
  "groundedIn": [7],
  "context": {
    "id": "ctx-0",
    "title": "Now: 0:45",
    "body": "Right now the dialogue turns on ...",
    "groundedIn": [7]
  },
  "questions": [
    {
      "id": "q-...",
      "question": "Complete the line: \"There ____ is.\"",
      "options": ["she", "he", "they", "now"],
      "correctIndex": 0,
      "explanation": "The line at 0:43 reads: \"There she is.\"",
      "groundedIn": [7]
    }
  ],
  "fallback": false
}
```

`fallback` is `true` when the deterministic generator answered instead of the
model. The Fire TV app renders that as **LOCAL** rather than **AI**, so a
canned answer is never presented as a model response.

## The offline mode

Judging for this hackathon runs **9-20 November**, well after the submission
deadline, and the hackathon's AWS promotional credits ran out on 7 October.
New AWS accounts can also have a Bedrock model quota of zero.

So the agent always answers. If the model is unreachable, a deterministic
generator builds questions from the **same filtered context**, which makes it
spoiler-safe by construction. It is covered by the same tests.

## Tests

```bash
npx tsx --test test/playhead.test.ts
```

```
✔ cues after the playhead are withheld
✔ no withheld cue text appears anywhere in the safe context
✔ the villain reveal is unreachable early in playback
✔ a cue that has started is included even if it is still playing
✔ a cue that has not started is excluded
✔ nothing is visible before playback begins
✔ seeking backwards reduces visible context
✔ grounding ids only reference visible cues
✔ invented grounding ids are dropped
✔ the fallback generator never emits future content
✔ the fallback generator works with no cues at all
✔ question count is clamped to a sane range
```

## Deploying it

The agent is a plain Express service, so it runs on Lambda or in a container
on Bedrock AgentCore Runtime. See `docs/ARCHITECTURE.md` for the commands.

The Strands repository ships an official TypeScript example for AgentCore:
`site/docs/examples/typescript/deploy_to_bedrock_agentcore`.

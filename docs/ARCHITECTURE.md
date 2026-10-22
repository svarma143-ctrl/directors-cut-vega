# Architecture

## The shape of it

```
┌────────────────────────── Fire TV (Vega OS) ──────────────────────────┐
│                                                                        │
│  PlayerScreen.vega                                                    │
│    ├── video pane        KeplerVideoSurfaceView + W3C Media APIs        │
│    └── companion panel   DirectorPanel                                 │
│           │                                                            │
│           │ useDirector()                                               │
│           │   - asks when new cues become eligible                     │
│           │   - invalidates the answer after a seek                     │
│           ▼                                                            │
│  directorClient ── POST {ASSET_BASE_URL}/agent/director ───────────┐   │
└───────────────────────────────────────────────────────────────────┼───┘
                                                                    │
┌───────────────────────────────────────────────────────────────────▼───┐
│  Public HTTPS origin (the asset server, or a CDN in production)        │
│    /tears-of-steel.mp4        ──► media                               │
│    /tears-of-steel.cues.json  ──► the grounding cue list              │
│    /agent/director            ──► proxied to the agent                │
│    /agent/ping                ──► proxied to the agent                │
└───────────────────────────────────────────────────────────────────┬───┘
                                                                    │
┌───────────────────────────────────────────────────────────────────▼───┐
│  The agent (Node 22+, TypeScript)                                      │
│                                                                        │
│  POST /director                                                        │
│    │                                                                   │
│    ├─► toSafeContext()      ◄── the spoiler filter. The only place    │
│    │       keeps cues whose start <= playhead                         │
│    │                                                                   │
│    ├─► Strands Agent  ──►  Amazon Bedrock (Nova / Claude)              │
│    │       │   (model is pluggable: bedrock | openai)                  │
│    │       │                                                            │
│    │       └─► grounded response: context note + questions            │
│    │                                                                   │
│    └─► fallbackResponse()   ◄── deterministic, if the model is down    │
│            and flagged with `fallback: true`                          │
└────────────────────────────────────────────────────────────────────────┘
```

## Why one HTTPS origin

The Vega media player refuses cleartext HTTP for video:

```
MEDIA_PLAYER:MediaPlayerUtils.cpp(113) isUriSchemeSecure
  Got an insecure protocol/scheme http, return error
```

So the media has to be reachable over HTTPS even when it is on the same
machine as the app. Rather than run two tunnels, the asset server also
proxies `/agent/*` through to the local agent, and the Fire TV app only ever
needs one URL.

For a real deployment the same shape holds with the agent behind a public
endpoint (Lambda, or Bedrock AgentCore Runtime) and the media behind a CDN.

## The spoiler filter

This is the part worth reading the code for. `agent/src/playhead.ts`.

The rule is absolute: **the model may only ever see media the viewer has
already watched.**

A naive implementation sends the whole transcript and adds "avoid spoilers"
to the prompt. That fails because the future is still in the context window,
because transcripts get cached and logged, and because "avoid spoilers"
cannot be tested.

So the filter is structural:

```ts
export function toSafeContext(media: MediaContext): SafeMediaContext {
  const eligible = media.cues.filter((cue) => isCueEligible(cue, media.playhead));
  // ...
  return { title, duration, playhead, cues: eligible, truncated, withheldCount };
}
```

`toSafeContext` is the **single choke point**. Everything the agent sees
comes out of it, so the future cannot leak — not because the model was asked
not to, but because it was never told.

Two details matter:

- **A cue that has started is included**, even if it is still playing
  (`CUE_ELIGIBILITY_SLACK_SECONDS`). Otherwise the companion lags behind
  the screen and feels broken.
- **Grounding ids are re-validated.** Models occasionally invent ids; an
  invented id is dropped rather than surfaced, because an id we cannot
  verify is not safe to show.

Seeking backwards reduces the visible context, and the hook clears the
revealed answer when the question set changes.

## Refreshing: when should the companion speak up?

Not on a timer. The companion should speak when the story moves on.

`useDirector` counts how many cues have become eligible since the last
question and asks again once enough new dialogue has happened (or once we
have run a long way past the last question). Asking on a fixed interval
would either hammer the agent or let the panel go stale.

## The fallback

Judging runs **9-20 November**; the submission deadline is 23 October. The
hackathon's AWS promotional credits ran out on 7 October, and new AWS
accounts can have a Bedrock model quota of zero. A submission that depends
on a live Bedrock call at judging time is a submission that scores zero.

So the agent always answers:

| Situation | Mode | UI badge |
|---|---|---|
| Bedrock reachable | `bedrock` | **AI** |
| Model error, quota, timeout | `offline` (deterministic) | **LOCAL** |
| Agent unreachable | `offline` (deterministic) | **OFFLINE** |

The deterministic generator works from the *same filtered context*, so it is
spoiler-safe by construction, and it is covered by the same tests
(`the fallback generator never emits future content`).

Crucially the flag is surfaced all the way to the pixels. The panel never
presents canned output as a model response.

## Deploying the agent to AWS

The agent is a plain HTTP service, so it deploys the way a Strands agent is
meant to. The Strands repository ships an official TypeScript example for
this: `site/docs/examples/typescript/deploy_to_bedrock_agentcore`.

**Bedrock AgentCore Runtime** (the closest fit for a long-lived agent that
the TV app calls):

```bash
# 1. Build and push the container
docker build -t my-agent .
aws ecr create-repository --repository-name my-agent
docker tag my-agent:latest $ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com/my-agent:latest
docker push $ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com/my-agent:latest

# 2. Create the runtime
aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name my-agent \
  --agent-runtime-artifact containerConfiguration={containerUri=$ACCOUNTID.dkr.ecr.$AWS_REGION.amazonaws.com/my-agent:latest} \
  --role-arn $ROLE_ARN \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP

# 3. Invoke it
aws bedrock-agentcore-control invoke-agent-runtime \
  --agent-runtime-id my-agent-XXXXXXXXXX \
  --runtime-session-id session-1 \
  --payload '{"prompt": "..."}'
```

AgentCore Runtime requires `/ping` and `/invocations` endpoints and a
container image, which is why `agent/src/index.ts` exposes `/ping`. For a
simpler deployment, the same Express app runs unchanged on AWS Lambda with
a Function URL, which is well inside the free tier for a demo.

The Strands SDK is the integration point for the **AWS Builder mini
challenge**, and the model provider is pluggable, so the agent still works
for a judge whose Bedrock quota is zero.

## Why Strands

- **Same language as the Fire TV app** (TypeScript), so the agent and the
  client share types and a toolchain.
- **Apache-2.0 and AWS-maintained** — it is the framework Amazon points
  hackathon entrants at.
- **Pluggable model providers**: Bedrock by default, with an OpenAI
  provider for a fallback, which matters given the quota problem.
- **MCP-capable**, so the same agent could later be exposed as an MCP
  server, which is what the Alexa+ track expects.
- **An official path to AgentCore Runtime**, with a worked example in the
  Strands repository.

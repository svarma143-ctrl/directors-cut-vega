# Director's Cut

**An AI companion for Fire TV that answers from what you have already watched — and refuses to tell you what comes next.**

Built for the [Build, Ship, Shape: Amazon Developer Hackathon](https://amazonappdev2026.devpost.com/)
(Fire TV track, plus the AWS Builder and Open Source mini challenges).

The idea: while a film plays, an AI companion sits beside it on the TV. It
talks about what just happened, it quizzes you on what you have seen, and it
is structurally incapable of spoiling the rest of the movie.

---

## Why this is different from "an AI overlay on a video player"

The interesting problem is not generating trivia. It is **not generating
spoilers**, and doing that reliably rather than hopefully.

The naive implementation sends the whole transcript to the model and adds a
line to the prompt: *"please avoid spoilers."* That fails three ways:

1. **The future is still in the context window.** A soft instruction is not a
   boundary. A sufficiently creative prompt will walk around it.
2. **The future gets cached and logged.** Transcripts and episode metadata end
   up in caches, traces, and model memory, so the spoiler leaks even when the
   visible answer looks clean.
3. **"Avoid spoilers" is unmeasurable.** You cannot write a passing test for it.

So we do not ask the model to behave. **We filter the data before the model
ever sees it.**

```
                    full cue list  (all 22 cues, including the future)
                              |
                              v
                   toSafeContext()   <-- the single choke point
                              |
        keeps only cues whose start <= playhead
                              |
                              v
                   Strands agent  ->  Bedrock  ->  questions + context
```

The future content is never passed to the model, so it cannot leak. And
because the filter is code, not a prompt, it is testable — and it is tested.
`agent/test/playhead.test.ts` contains adversarial tests that try to leak the
ending and assert that it cannot be leaked:

```
✔ cues after the playhead are withheld
✔ no withheld cue text appears anywhere in the safe context
✔ the villain reveal is unreachable early in playback
✔ seeking backwards reduces visible context
✔ invented grounding ids are dropped
✔ the fallback generator never emits future content
```

> This is the same design as the *playhead-safe AI* skill proposed for
> `AmazonAppDev/devices-agent-skills`
> ([issue #11](https://github.com/AmazonAppDev/devices-agent-skills/issues/11)),
> which we contribute back as the Open Source mini challenge entry.

---

## What it does

| | |
|---|---|
| **Grounded** | The companion answers only from captions the viewer has already watched. |
| **Spoiler-proof** | The filter is structural, so the future cannot leak. Seeking backwards invalidates stale answers. |
| **Honest** | If the model is unavailable the panel says **LOCAL**; if the agent is unreachable it says **OFFLINE**. Canned output is never presented as AI. |
| **10-foot** | Sized against a 1920x1080 design resolution, with the shared UI's own pixel-scaling. |
| **Amazon-native** | Built on the Vega SDK with the official `react-native-multi-tv-app-sample`, using the W3C Media APIs, Kepler Media Controls, and Amazon's focus-management model. |

The companion panel shows three things:

1. **A context note** — what the dialogue is turning on right now.
2. **Trivia questions** — fill-in-the-blank questions about what has happened.
3. **Its grounding** — every answer cites the caption it came from.

---

## Repository layout

```
.
├── app/                      # The Fire TV app (React Native, Vega OS)
│   ├── apps/vega/            #   Vega app target (the one that ships)
│   ├── apps/expo-multi-tv/   #   Android TV / Fire OS / web target
│   └── packages/shared-ui/   #   Shared UI, including the companion panel
├── agent/                    # The Strands agent (TypeScript, AWS Bedrock)
│   ├── src/playhead.ts       #   The spoiler filter - the heart of the project
│   ├── src/fallback.ts       #   Deterministic offline generator
│   └── test/                 #   Adversarial spoiler-leak tests
├── assets/                   # Demo media (CC-BY Blender open movie)
├── tools/                    # Asset server + cue generation
└── docs/
    ├── FRICTION_LOG.md       # Problems we hit, for the Amazon teams
    └── PRODUCT_FEEDBACK.md   # Per-tool feedback (required by the rules)
```

---

## Running it

### Prerequisites

- **Node.js 22+** and **Yarn 4.5.0** (the repo pins the version; `corepack yarn`
  works without a global install)
- **The Vega SDK** on macOS or Ubuntu:
  ```bash
  curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash
  source ~/vega/env
  vega --version   # Active SDK Version: 0.24.12112
  ```

### 1. Start the agent

```bash
cd agent
npm install
npm run build

# With Amazon Bedrock (recommended - this is the AWS Builder mini challenge):
AWS_REGION=us-east-1 node dist/index.js

# Without credentials, the agent runs in deterministic offline mode.
node dist/index.js
```

The agent listens on `:8080` and exposes `GET /ping` and `POST /director`.

### 2. Serve the demo media

The Vega media player refuses cleartext HTTP for video URLs, so the media has
to be reachable over HTTPS — even from localhost. The asset server also proxies
`/agent/*` through to the agent, so a single public origin serves both.

```bash
node tools/serve-assets.mjs                    # :8099, HTTP
cloudflared tunnel --url http://localhost:8099  # gives you an https:// origin
```

Put that `https://...` URL into `app/packages/shared-ui/src/config/demo.ts`
(`ASSET_BASE_URL`).

### 3. Build and run the app

```bash
./tools/build-vega.sh debug
```

That installs dependencies and builds the `.vpkg`. It also works if the
project path contains a space — the Vega build toolchain does not quote the
paths it passes to `kepler-module-manifest-builder`, so a path like
`~/Documents/My Project` fails with `/bin/sh: /path/with: No such file or
directory`. When it detects a space, the script builds from a space-free
staging directory instead.

To build by hand (from a path without spaces):

```bash
cd app
corepack yarn install
corepack yarn build:vega:debug
```

Then install it on the Vega Virtual Device:

```bash
vega virtual-device start
cd app/apps/vega
vega run-app build/aarch64-debug/vega_aarch64.vpkg \
  com.giolaq.multitv.vega.main -d VirtualDevice
```

### 4. Watch

Open **Tears of Steel** from the home screen and press **Watch now**.

> **Note on the OK button.** The Vega Virtual Device reports the OK button as
> `kpenter`, and React Native only translates `KEYCODE_DPAD_CENTER` and
> `KEYCODE_ENTER` into the TV "select" event. If your automation cannot
> activate a focused tile, send evdev key **28** (`KEY_ENTER`) rather than 96
> (`KEY_KPENTER`). See `docs/FRICTION_LOG.md`.

---

## The agent

The companion is a [Strands Agents](https://strandsagents.com) TypeScript agent
(`@strands-agents/sdk`) talking to Amazon Bedrock.

```ts
const agent = new Agent({
  model: new BedrockModel({ region: 'us-east-1' }),
  systemPrompt: SYSTEM_PROMPT,
});
```

Strands is chosen because it is the same language as the Fire TV app, it is
AWS's own open-source agent SDK (so it counts for the **AWS Builder** mini
challenge), and it has an official path to
[Bedrock AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html).

The model is **pluggable**: `MODEL_PROVIDER=bedrock` (default) or
`MODEL_PROVIDER=openai`. The agent has an official deploy-to-AgentCore example
in the Strands repo that we mirror in `docs/ARCHITECTURE.md`.

### Why the agent always answers something

Judging for this hackathon runs **9-20 November**, long after the submission
deadline, and AWS promotional credits ran out on **7 October 2026**. A demo
that depends on a live Bedrock call that has expired scores zero.

So the agent has a deterministic fallback that works from the same filtered
context. Every response carries a `fallback` flag, the UI renders it as
**LOCAL** rather than **AI**, and the panel never lets canned output pose as
a model response.

---

## The demo media

**Tears of Steel** by the Blender Foundation, released under
**CC-BY 3.0**. We ship a two-minute excerpt with Blender's own official
English subtitle track, which gives the companion real dialogue to ground on.

The cue list in `app/packages/shared-ui/src/data/tearsOfSteelCues.ts` is
**generated** from Blender's `TOS-en.srt` by `tools/generate-media-ts.mjs`, so
the AI is grounded in exactly the words the viewer is reading. It is never
typed by hand.

---

## Attributing the upstream work

The Fire TV app is built on
[`AmazonAppDev/react-native-multi-tv-app-sample`](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample),
specifically the `upgrade/vega-0.24-rn-0.83` branch (PR #132), which
migrates the Vega app to the React Native 0.83 runtime required by Vega SDK
0.24. We keep that project's MIT-0 licence and copyright headers.

Our changes to it are:

| File | Change |
|---|---|
| `packages/shared-ui/src/screens/PlayerScreen.vega.tsx` | Split the player into a video pane and the companion panel. |
| `packages/shared-ui/src/components/player/VideoPlayer.vega.tsx` | Wrap the absolutely-positioned video surface in a sized container so it fills the pane instead of the whole screen; set `scalingmode="fit"`. |
| `packages/shared-ui/src/components/director/DirectorPanel.tsx` | **New.** The companion panel. |
| `packages/shared-ui/src/hooks/useDirector.ts` | **New.** Talks to the agent, refreshes when new dialogue has been watched. |
| `packages/shared-ui/src/services/directorClient.ts` | **New.** Agent client. |
| `packages/shared-ui/src/config/demo.ts` | **New.** Endpoint configuration. |
| `packages/shared-ui/src/data/demoMedia.ts`, `tearsOfSteelCues.ts` | **New.** The demo title and its generated cue list. |
| `packages/shared-ui/src/data/moviesData.ts` | Put the demo title first in the catalogue. |
| `packages/shared-ui/src/app/remote-control/RemoteControlManager.kepler.ts` | Handle the `kpenter` event the Virtual Device reports. |
| `packages/shared-ui/src/types/director.ts` | **New.** The agent contract. |

---

## Licence

Our code: MIT-0, matching the upstream sample. See `LICENSE`.

Demo media: Tears of Steel, © Blender Foundation, CC-BY 3.0. See `ATTRIBUTION.md`.

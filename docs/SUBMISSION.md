# Submission

Everything you need to submit, and the answers to put in the form.

---

## Checklist

- [ ] **Push the repo to GitHub** — `./tools/push-to-github.sh <your-github-username>`
      (needs `export GITHUB_TOKEN=...`; see `tools/push-to-github.sh`).
      The repo must be **public** and contain the **MIT-0 `LICENSE`** — both are
      already committed, so a public repo is the simplest option. If you
      prefer a private one, add `knmeiss`, `giolaq`, `anishamalde`,
      `mosesroth` and `emersonsklar` as collaborators (invites expire after
      7 days, so do this close to the deadline).
- [ ] **Upload the demo video** to YouTube or Vimeo, **public**, **under
      3 minutes**, **in English**.
      The recording is at `docs/directors-cut-demo.mp4` (1080p, with audio).
      Title suggestion: *"Director's Cut — an AI Fire TV companion that never
      spoils the movie"*.
- [ ] **Fill in the form.** Copy the text below.
- [ ] **Re-record with live Bedrock** if you get credentials working, so the
      badge reads **AI** instead of **LOCAL**. See "Swapping in Bedrock" below.
- [ ] **Open the upstream pull request** — `tools/push-to-github.sh` does it,
      and the description is already written in `docs/UPSTREAM_PR.md`. This is
      the Open Source mini challenge entry; it must be a *separate* contribution
      from the primary-track repo.
- [ ] **Write the friction logs** in the form. `docs/FRICTION_LOG.md` has ten
      entries, each with the reproduction, the severity and a workaround.
      Submissions with friction logs can earn **up to a 10% judging bonus**.
- [ ] **Write the product feedback** in the form. `docs/PRODUCT_FEEDBACK.md`
      covers every tool we used. This is a *required* field, not an optional
      one.

---

## Which tracks to enter

- **Primary track:** Fire TV
- **Mini challenge 1:** AWS Builder — the agent is a Strands Agents SDK agent
  on Amazon Bedrock, with the integration documented in `docs/ARCHITECTURE.md`.
  (Kiro Crew also qualifies on its own, if you use it.)
- **Mini challenge 2:** Open Source — the upstream pull request described in
  `docs/OPEN_SOURCE_CONTRIBUTION.md`.

You can only win one track prize and one mini challenge prize. Fire TV is the
largest pool ($25K / $15K / $4K), so it should be the primary.

---

## Project description (for the form)

### Title

**Director's Cut — an AI companion for Fire TV that answers from what you have already watched**

### Short description

> An AI companion sits beside the film on your Fire TV. It talks about what just
> happened, quizzes you on what you have seen, and is structurally incapable of
> spoiling the rest of the movie.

### Full description

> Most "AI on TV" demos ask a model not to spoil the film. We took the
> opposite approach: we made it impossible for the model to know the future.
>
> Director's Cut is a Fire TV app for Vega OS. While a film plays, an AI
> companion panel sits beside the video. It shows what the dialogue is turning
> on right now, and offers fill-in-the-blank questions about what you have
> already watched. You can reveal an answer with the remote, and every answer
> cites the caption it came from.
>
> The interesting engineering is in how we keep it spoiler-free. The obvious
> approach — send the whole transcript, add "please avoid spoilers" to the
> prompt — fails three ways. The future is still in the context window, so a
> soft instruction is not a boundary. The transcript ends up in caches and
> logs, so the spoiler leaks even when the answer looks clean. And
> "avoid spoilers" is unmeasurable, so you cannot write a passing test for it.
>
> So we filter the data instead of instructing the model. A single function,
> `toSafeContext()`, keeps only the cues the viewer has already watched, and
> it is the only route by which anything reaches the model. The future content
> is never in the context window, so it cannot leak no matter how the model is
> prompted. Because the filter is code rather than prose, it is testable, and
> the agent's test suite contains adversarial tests that try to leak the ending
> and assert that they cannot. Seeking backwards shrinks the visible context
> and invalidates a stale answer.
>
> The companion is a Strands Agents SDK agent on Amazon Bedrock, in TypeScript,
> sharing a language and a type system with the Fire TV app. It degrades
> honestly: if the model is unreachable it answers deterministically from the
> same filtered context, and the panel says **LOCAL** rather than **AI**. A
> canned answer is never dressed up as a model response — which matters,
> because the hackathon's AWS credits ran out before the judging period.
>
> Built on Amazon's own React Native TV sample with the W3C Media APIs on
> Vega, with real captions from Blender's open movie *Tears of Steel*.

### Tracks and tags

- Primary track: **Fire TV**
- Mini challenges: **AWS Builder**, **Open Source**
- Priority categories: **AI-enhanced viewing**, **multi-modal UX**
- Themes: Machine Learning/AI, Productivity

### Which Amazon developer tools did you use?

- **Amazon Vega Developer Tools** (Vega CLI, Vega SDK 0.24.12112, Vega Virtual Device)
- **Amazon Devices Builder Tools** — the MCP server and its offline documentation database
- **`@amazon-devices/react-native-w3cmedia`** — W3C Media APIs, the caption surface, `scalingmode`
- **`@amazon-devices/kepler-media-controls`** — media session state and transport commands
- **`@amazon-devices/react-native-kepler`** — `TVEventHandler`, `useKeplerAppStateManager`
- **Amazon Bedrock** via the **Strands Agents SDK** — the companion's inference
- **`react-native-multi-tv-app-sample`** — the app we started from

### Product feedback

Use `docs/PRODUCT_FEEDBACK.md`. It has a section per tool with: what we used
it for, what worked well, what needs work, how onboarding felt, and whether we
would build with it again.

### Friction logs

Use the entries in `docs/FRICTION_LOG.md`. Each has the task attempted, the
steps, what we expected versus what actually happened, a severity, the
workaround, and an actionable suggestion.

The ten entries, in brief:

| # | Severity | Summary |
|---|---|---|
| FL-01 | High | The media player rejects cleartext HTTP for video URLs, with an error that does not mention the scheme |
| FL-02 | High | The Virtual Device's OK button is delivered as `kpenter` and React Native never turns it into a `select` event, so **nothing can be activated on the simulator** |
| FL-03 | High | The build toolchain does not quote paths, so a project path with a space fails the build |
| FL-04 | High | The sample's default branch does not build against the current SDK (RN 0.72 vs SDK 0.24) |
| FL-05 | Medium | There is no way to screenshot or record the Virtual Device |
| FL-06 | Medium | `yarn typecheck` reports 200 errors on a clean checkout |
| FL-07 | Medium | The Virtual Device reports a 960x540 dp window on a 1920x1080 screen, so raw pixel numbers are silently doubled |
| FL-08 | Medium | `KeplerVideoSurfaceView` has no sized parent, so it can only be used full-screen |
| FL-09 | Low | `ActivityIndicator` renders oversized on Vega |
| FL-10 | High | New AWS accounts can have a zero Bedrock model quota, and the hackathon's credits ran out on 7 October |

### Optional: testing link

The judges can run the whole thing themselves. In the README:

```bash
./tools/build-vega.sh debug
vega virtual-device start
cd app/apps/vega && vega run-app build/aarch64-debug/vega_aarch64.vpkg \
  com.giolaq.multitv.vega.main -d VirtualDevice
```

The agent runs locally with no credentials, so the panel works offline.

---

## Swapping in Bedrock

When you have credentials, this is the whole change:

```bash
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0   # optional

cd agent && npm run build && node dist/index.js
```

`GET /ping` then reports `"mode": "bedrock"` and the panel badge changes
from **LOCAL** to **AI**.

If Bedrock rejects the call, the agent falls back and logs the reason:

```
[agent] model call failed, using fallback: <reason>
```

Common reasons:

| Reason | Fix |
|---|---|
| `Access to Bedrock models is not allowed for this account` | Request model access in the Bedrock console, or switch to an Amazon model (`us.amazon.nova-lite-v1:0`) which needs no Marketplace subscription |
| `ValidationException: Too many tokens per day` / quota 0 | Raise the service quota, or wait out the daily limit |
| `Could not load credentials from any providers` | Credentials are not reaching the process |

To re-record the demo with the live model, start the agent and the asset
server, then run the recording script. Nothing else changes.

---

## What the demo video shows

| Time | What happens |
|---|---|
| 0:00 | The home screen, with *Tears of Steel* featured |
| 0:05 | The details page for the title |
| 0:12 | Playback starts; the companion panel appears beside the video |
| 0:15 | The panel's context note names the line being spoken right now |
| 0:25 | The companion refreshes as new dialogue is watched |
| 0:35 | **OK** on a question reveals the answer, the options, and the source caption |
| 0:50 | The panel tracks the playhead onward |

The video has **no dead time**: navigation happens before the recording
starts, and the script waits for playback to actually begin.

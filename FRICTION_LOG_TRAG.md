# Director's Cut — Amazon Vega + Fire TV toolchain friction log (trag.dev format)

| Reviewer | Status |
| :--- | :--- |
| **svarma143-ctrl** (solo hackathon builder, Agent-assisted) | Complete |
| **Amazon Vega SDK team** | Under review |

> **Canonical evidence trail**: [`FRICTION_LOG.md`](FRICTION_LOG.md) — 23 dated entries with raw logs, bisect trees, and verbatim error chains. This file is the trag.dev-structured view of the *same evidence*; every friction point below cites its source entries (#N). Nothing here is reconstructed from memory.

## BLUF (bottom line up front)

**Grade: C+** — Vega shipped us a functional path (VVD + RN 0.72 + w3cmedia builds a complete, working Vega app: full 10-minute MSE video with synced captions, Strands-AI trivia, bots, and remote keys), but the journey there had three 🔥-severity walls where the platform silently failed while reporting success, cost ~2 working days combined, and a community thread confirmed RN 0.83 media simply has **no working configuration**. If you skim only the log floods, you will conclude the platform is broken; read the friction points below and you will find each wall has a specific, fixable name. Not urgent for anyone already on RN 0.72 — extremely urgent for every team starting today on the RN 0.83 template.

## Persona

- **Role:** solo hackathon builder (mid-level full-stack, strong TS/React, no prior Fire TV or Android)
- **Experience with this product:** first time using Vega SDK/VVD; first time in Amazon's TV/dev ecosystem
- **Goal:** install SDK on a Mac → build an AI watch-party trivia companion (video + captions + LLM trivia + TV remote) → run and demo it on the Vega Virtual Device → publish repo by deadline
- **Technical context:** Apple silicon Mac (macOS 15, no Xcode, no Homebrew, no Java — deliberately clean, to reflect judges'/onboarding reality); agent-driven CLI, log-analysis, and CI workflows throughout; Node 24, SDK 0.24.12112, Vega CLI 1.4.7

## Scope

Workflows tested, end to end:

- [x] SDK install (installer script + config setup) on a non-sudo Mac
- [x] Sample repo bootstrap → own app launch (static UI) on VVD
- [x] Media-stack integration on RN 0.83 (w3cmedia)
- [x] Media-stack integration on RN 0.72 + w3cmedia (complete app: video/captions/trivia/keys)
- [x] Media transport: plain URL → file:// → MSE fallback ladder
- [x] AI engine (Strands Agents + Fastify) development loop on host ↔ VVD
- [x] Publish: repo creation (agent-driven), GitHub Actions CI, public release
- [x] Build/deploy/verify cycle on a cold-started VVD; team Friction-log review cycle (#23)

## Pros

- **The VVD is free, boots in seconds, and was explicitly hackathon-legal** — no Fire TV stick needed, no device acquisition friction at all
- **RN 0.72 + w3cmedia genuinely works at full scale** — streamed a 61 MB fragmented MP4 buffer-append-by-append over range requests (flat JS-heap, zero memory growth), audio included
- **w3cmedia ships the entire MSE API** (MediaSource/SourceBuffer/appendBuffer/QuotaExceededError) — an unexpected, very high-ceiling escape hatch
- **`npm` packages are the durable source of truth** — installed packages' `.d.ts` files and bundled sources out-documented the (temp-dir-hosted, purgeable) official docs, and everything needed to survive was in those files
- **`loggingctl log -f` streams *everything*** — impenetrable at first, but every single root cause (LCM transition timeout, MPB 50004 blob parse miss, Strands event chain) was findable inside it
- **Strands Agents SDK's model layer makes provider swaps trivial** — our deterministic-Mock ↔ Bedrock swap was ~1 flag (`STRANDS_BEDROCK=1`), no app changes
- **Community support is real and fast**: Amazon staff answered our platform-policy question in the dev forum within days — that thread is the **only** reason the RN-0.83 wall ever got a name
- **The toolchain worked end-to-end once pointed at the escape hatch**: `react-native build-vega` (minutes, warm cache), jest + tsc + GH-Actions, deploy via `vega run-app` — all standard, scriptable
- **Agent-friendly workflow**: after the first two days, almost every loop was `vega run-app` → `loggingctl log -f` → grep → ship — clean CI, 9/9 tests, reproducible

## Cons

- **RN 0.83 template + w3cmedia = 2 days of silent ANR death with zero diagnostics** (community-confirmed, no working config) — the default path's biggest landmine and doc hole
- **Media transport policy blocks all practical schemes (cleartext http, file://) with deep-silent failures** (`MEDIA_ERR_SRC_NOT_SUPPORTED`, message literally `"Error Occurred."`), and MSE — the solution — is undocumented. Only formally confirmed because an Amazon staffer named the platform policy in the dev forum in Feb 2026
- **VVD has no built-in screenshot or screen-capture** — and the official screenshooter explicitly doesn't support virtual devices. A hackathon **dev-demo** requirement (show the app running) straight-up could not be done without a 70-line ctypes window-finder workaround
- **Every routine deploy emits a >100-line error flood** on cold boot — pressure-testing "quickly verify nothing broke": our own final verify-deploy was aborted instead, defending against false errors
- **`vega run-app` uninstalls and reinstalls on every launch** even when the vpkg is unchanged — friction paid on every one of thousands of expected launches
- **App stdout/stderr are unreachable** via `run-app`; no `adb logcat` analog exists at all, so cross-language debugging collapses to stderr-echo + guesswork
- **Glass-edge library bugs eat your day silently**: w3cmedia never wires mount-time `src` (silent black pane), blob URLs parse off-by-one without a query suffix (silent no-attach)
- **The AI-story toolchain** (Strands + our engine) worked well, but the SDK's docs quickstart is **unrunnable without Bedrock credentials** — and fresh AWS accounts ship with all-Bedrock quotas = 0 by default

## Friction

### 1. RN 0.83 + w3cmedia: "Successfully launched" then silently ANR-killed — no diagnostics at all

**Severity:** 🔥 Critical
**Evidence / entries:** #6, #13 (~4 h + killed the media branch twice)
**Raw line that explains everything** (buried in lcm info logs):
```
lcm-transition-monitor: Transition timed out - appInst[N]: Creating surfaces
lcm-server: Forcefully terminating process N with reason AppNotResponding
```
**Expected:** a media-app on the current default RN template either works with the documented config, or fails loudly explaining which module init blocked surface creation.
**Actual:** bisect-only diagnosis: static Text UI → works; + w3cmedia native injection (2.3.2 and 2.3.2-rn-83) → surface-creation timeout → SIGQUIT, screen forever shows launcher, no JS error, no stderr, nothing in any user-facing log. Community thread later confirmed an npm-native-loader deadlock in `libkeplerscript-runtime-loader-4` on RN 0.83 for media/player-service START, explicitly stating "A media app currently has no working configuration on RN 0.83."
**Recommendation:** (a) surface the ANR reason (which stem/module failed init, with the blocking stack) inside the transition-timeout log line; (b) ship (or explicitly deprecate) the RN-0.83 media stack — a "which RN version works with which runtime" matrix in every doc that mentions either.

### 2. Media pipeline: platform blocks `http://` AND `file://` on VVD with an empty error, and MSE is undocumented

**Severity:** 🔥 Critical
**Evidence / entries:** #19 (~2 h to isolate), platform-confirmed in Amazon dev forum (2026-02)
**Expected:** one of the supported media transports to work by default, and a **named error** ("cleartext http blocked by platform policy") when one is blocked — a policy error should say its policy.
**Actual:** `MPB UNF callback … Open failed -1 → 50004 → MEDIA_ERR_SRC_NOT_SUPPORTED (code 4)` with a literally-empty user-facing message; the open fails in ~2 ms with **zero packets** leaving the device — instantaneous platform refusal that reads for hours like a network bug. `file:///` fails the same way (message: literally `"Error Occurred."`).
**Recommendation:** (a) name the blocked scheme in the MPB error + MediaError message; (b) publish the official VVD per-scheme support matrix (w3cmedia URL-addressable vs cleartext-blocked vs file-blocked vs MSE-never-URLs); (c) support `file://` for app-packaged media on VVD — "get the demo movie on screen" is the first project every TV hackathon team ships.

### 3. w3cmedia's two silent glass bugs: mount-time `src` never wired; blob URL parsed off-by-one

**Severity:** 🔥 Critical — both scanned as "library fine, my bug" for hours
**Evidence / entries:** #18 (~2.5 h), #20 (~20 min)
**Expected:** `<Video src autoplay>` starts; `video.src = blob:///id` attaches the MediaSource. Any miss throws or logs visibly.
**Actual:** `componentDidUpdate` only propagates props.src **on a transition between renders** — mount-time src is dropped, and autoplay plays an empty player → `MEDIA_ERR_SRC_NOT_SUPPORTED` → silent black pane (native logs even claim `play resolved`). Blob URLs: `setSrcWithCustomHeaders` does `url.indexOf('?')` → -1 → `slice(prefixLen, -1)` drops the last char of the id → `parseInt('')` → NaN → silent return, no error event, no console log.
**Recommendation:** (a) apply src in `componentDidMount` too (or emit the error visibly); (b) `slice(prefixLen, endIndex === -1 ? undefined : endIndex)` + console.error on the GlobalMediaSources lookup miss; (c) since the device runs the SystemBundle (not the dist we can read), even a two-sentence CHANGELOG "mount-time src unsupported; blob URLs need `?`" would have saved ~3 h.

### 4. The VVD cold-boot log flood: 110 raw "error" lines in 30 s, and only three of them mean anything

**Severity:** ⚠️ High (directly caused this — our final pre-wrap verification cycle was aborted by a self-imposed >10-error tripwire)
**Evidence / entries:** #23 (+ #8 for the always-failing system stems)
**Expected:** a fresh `vega run-app` deploy produces a calm, app-scoped signal ("app launched; first frame rendered") or a tight, relevant error set.
**Actual:** message_router "privileges missing" ×10, servicergrd "service not found" ×6 (boot noise), then pkgmgrd "Resource not found"/fsync noise (benign install), then real GST signals — `h264parse caps without codec_data`/`Failed to get duration`/audio `GetWriteBuff err=11` — a second pipeline 5 s later that *plausibly* was our fallback reel, but the platform provides no way to say "only these five lines are your app."
**Recommendation:** (a) `loggingctl` boot-noise suppression window (or a "--quiet boot" filter preset); (b) a stable "launched + first frame" success line from `vega run-app`; (c) GST should fail loud-and-specific on missing/partial fMP4 input; (d) one consolidated "media session replaced" info line instead of leaking audio-lock release errors.

### 5. No built-in screenshot / screen capture on VVD

**Severity:** ⚠️ High
**Evidence / entries:** #4, #12 (~45 min + a recurring tax per visual iteration)
**Expected:** `vega virtual-device screenshot --out shot.png` exists (the docs' own screenshooter mentioning vvrp suggests a superset was intended).
**Actual:** the tool doesn't work on vvrp targets; macOS path is a maze (`screencapture -x -l <windowID>` needs a CGWindowID: JXA segfaults, swift one-file scripts fail on CLT's known `SwiftBridging` bug, pyobjc not installed; window-raise needs Accessibility permission). A ~70-line ctypes `CGWindowListCopyWindowInfo` wrapper finally worked.
**Recommendation:** ship the official `vega virtual-device screenshot`; a fallback always helps — even exposing a `--list-windows`-style flag (or letting `vda` report window metadata) would have been the developer-quality unlock we spent an hour hand-rolling via ctypes.

### 6. `vega run-app`: full uninstall + reinstall per launch, forever

**Severity:** ⚡ Medium
**Evidence / entry:** #7 (~10–15 s × ~40 launches)
**Expected:** re-run the same app quickly after a rebuild (or a `--skip-install` analog).
**Actual:** strict uninstall → reinstall cycle each and every launch (pkgmgr logs it; the "Failed to fsync … Input/Output error" noise tail follows); digest never checked.
**Recommendation:** digest-skip unchanged vpks (or `--skip-install`); for hackathon-speed iteration this is the top quality-of-life fix we'd ask for.

### 7. Samples pin an exact SDK patch; installers emit the wrong interactive footgun pair

**Severity:** ⚡ Medium (uniquely high for day-0 onboarding)
**Evidence / entries:** #1, #2, #3, #17 (~80 min combined)
**Expected:** fresh install (NONINTERACTIVE) → done; clone the flagship sample → build succeeds against the SDK the installer just gave you.
**Actual:** `sdk-installer`'s `NONINTERACTIVE=true` covers the download but NOT `vega sdk config setup` (interactive, EOF-fails piped); after manual setup `~/vega/env` doesn't materialize either; then the sample pins `vega-sdk-requirements.json` = `0.24.9914` while the installer provides `0.24.12112` — build refuses; npm's install-scripts gate silently skips the kepler postinstall (a trailing `npm warn`, not an error); and any CLI subcommand run from a project path containing a space dies quoting bugs. Each has a one-line fix, and none is visible to a first-timer.
**Recommendation:** (a) honor NONINTERACTIVE end to end + write `~/vega/env` = documented defaults; (b) allow patch-level compatibility within a minor SDK line (or `--sdk any-0.24`); (c) escalate silently-skipped install-scripts when a package has a postinstall feeding a build system; (d) quote `$PWD` in CLI-internal shell calls (or warn+reject a space path with actionable text).

### 8. Core docs are missing the three pages every TV developer first needs

**Severity:** ⚠️ High
**Evidence / entries:** #11, #13 (media setup docs note) — "discovered only from `.d.ts`"
**Expected:** "TV input events in React Native on Vega" and "w3cmedia setup: `[wants]` privileges + babel transform" exist as first-class doc pages that the API reference cross-links.
**Actual:** TV input events (`useTVEventHandler`, HWEvent `eventType` ∈ {up, down, left, right, select, back, playpause, …}) exist in the kepler fork's `Libraries/TV/` but have no doc page (docs cover WebView key handling); the `[wants]`/`[offers]` manifest config + babel JSX-transform requirement for w3cmedia live on a separate doc page that the "use the media API" path never points to — so an app coded exactly per the API docs still fails at launch.
**Recommendation:** (a) one page: input events + full event type enumeration for RN apps; (b) a "media app checklist" page (privileges + babel + runtime matrix) linked from the w3cmedia API reference; (c) cite `.d.ts` as canonical config where it beat the HTML docs.

### 9. Strands SDK quickstart is unrunnable offline — no shipped deterministic provider

**Severity:** ⚠️ High for offline/classroom/hackathon development
**Evidence / entry:** #10 (~1 h)
**Expected:** an offline-safe way to run the Agent quickly, or a documented custom-provider recipe.
**Actual:** fresh AWS accounts have all-Bedrock quotas = 0 (non-adjustable), so the docs' first flow errors for something that has nothing to do with your code; no `MockModel` ships.
**Recommendation:** ship a `MockModel` in-box (we wrote a ~90-line `Model` implementation that emits `modelMessageStartEvent` → `modelContentBlockDeltaEvent{textDelta}` → `modelMessageStopEvent` and typed the whole contract) + the custom-provider doc page — consider an official "run agents offline" recipe (CI, hackathons, classrooms).

### 10. The infrastructure tax: workspace hygiene, session fragility, and agent-loop script safety

**Severity:** ⚡ Medium (each small; they compound across a multi-day hackathon)
**Evidence / entries:** #5, #14, #15, #16 (~1 h combined)
**Expected:** the build-tools docs DB persists across sessions, VVD state reads accurately, and overnight cleanup doesn't eat helpers — especially through sessions where agents drive edits, logs, and screenshots concurrently.
**Actual:** docs DB died with disk-cleanup mid-session (all research rerouted through installed packages); VVD decays overnight (status reads `running:false` while a stale vda daemon hangs on; no `virtual-device doctor`; stale launcher tiles); `$TMPDIR` helpers disappear; `pkill -f` self-matches your own compound commands and silently ate capture cycles.
**Recommendation:** (a) configurable persistent docs DB location; (b) `vega virtual-device doctor` (know when its daemon is pointing at dead QEMU); (c) surface stale-tile reality ("app was already uninstalled") in the launcher; (d) nothing on Amazon's side for the last two — but our own preflight script (`curl localhost:8788/health`, `virtual-device status` before any capture) models the pattern: **preflight everything your agent will spend 20 minutes silently failing over.**

### 11. The dev-loop dispatch overhead: repo forms, CI, tsconfig interaction, template tests

**Severity:** ⚡ Medium (submit-phase; nothing while coding)
**Evidence / entries:** #21, #22 + test-suite rebuild (template `App.spec` crashing under jest because its kepler imports demand native modules — fixed with jest mocks for w3cmedia, the MSE player, and the engine client)
**Expected:** each one-click repo form does its job; CI runs after one config; testing a native-media OTT app in jest has a documented recipe.
**Actual:** GitHub's new-repo form's segmented-visibility control has no form semantics (empty `input[type=radio]`, no aria-pressed) and a submit-success indistinguishable from a no-op click — plus SPA URL checks race the re-render; CI's own type-check walkthrough of `engine/` turned the first CI run into a live demo of the polyrepo-in-one-folder landmine; the template's own snapshot tests assert its obsolete "all four tiles" UI — and no sample exists showing how to mock w3cmedia's TurboModule for testing.
**Recommendation:** (a) template ships a passing, *meaningful* test suite with native-module jest mocks (this is the one file a first-timer will struggle with); (b) polyrepo-in-one-folder guidance in the sample repo README; (c) GitHub: add role=radiogroup/aria-pressed + blocking inline validation to the new-repo visibility control.

## Questions

- Is there a **per-SDK ↔ per-RN-version media-capability matrix**? Today the only answer is inside community threads and our bisect tree.
- Is **MSE on w3cmedia** intended to be the recommended load path on Fire TV (and will the platform leverage the full API, incl. fragments/multiple SourceBuffers), or is it incidental? It's currently completely undocumented.
- Is the `file://` block on VVD (vs. real HW) permanent policy, or does it differ when the target is a vvrp?
- Will `useTVEventHandler`/HWEvent be documented under `@amazon-devices/react-native-kepler`, with the event enum in TypeScript plus a doc table?
- Will `loggingctl` remain a single undifferentiated fire-hose, or is an "app-only" streaming/filter mode planned?
- What is the intended longer-term path for a deterministic `MockModel` in the Strands SDK (bundled per provider?), or is the ad-hoc ~90-line custom `Model` implementation the prescribed answer?
- Do `vega run-app` / the project toolchain plan to honor npm install-scripts gates, so kepler's postinstall runs without manual `npm install-scripts approve`?

## Recommendations (prioritized)

1. **🔥 Publish the RN-version ↔ runtime media matrix** — one table would have saved our bisect tree and two days; add "RN 0.83 + w3cmedia = silent ANR" to the RN-0.83 template README until fixed (#13).
2. **🔥 Name the blocked scheme + ship the VVD media transport matrix + support `file://` for app-packaged media** — a policy that errors with policy text instead of a blank `"Error Occurred."` is developer-respect; allowing `file://` on VVD rescues the first project every TV team ships (#19).
3. **🔥 w3cmedia: wire mount-time `src`, fix the blob-URL off-by-one, error visibly** — three silent failure modes in one library is the day's largest debugging multiplier (#18, #20).
4. **⚠️ Surface ANR reasons + a `--console` (stdout/stderr streaming) on run-app** — every silent death above gets 5× faster to fix (#6, #13).
5. **⚠️ Official `vega virtual-device screenshot`** — the exact hackathon-impossible gap; the workaround we shipped (`ctypes` window finder) is fragile on every OS update (#4, #12).
6. **⚠️ Docs: input events + media-setup checklist pages and `.d.ts`-as-canonical config** — the samples of the new developer path shouldn't need the fork's source as their main reference (#11, #13-notes).
7. **⚠️ Strands: in-repo MockModel + custom-provider recipe** — unblocks offline dev, CI, and web-wide the quickstart demographic the paper docs assume (#10).
8. **⚡ loggingctl boot-noise gate & `vega run-app` digest-skip redeploy** — the day-one time-waster that keeps on taking (#7, #8, #23).
9. **⚡ Installer & sample fixes** — honor NONINTERACTIVE everywhere, patch-version-tolerant sample SDK pins, loud silent-skips, quote project paths (#1–3, #17).
10. **⚡ Non-Vega polish** — persistent docs DB location, `virtual-device doctor`, stale-tile reality; template test suite shipped with kepler/w3cmedia jest mocks (#5, #14, plus the template-test work).

## Video timestamps

No continuous screen recording was used for this log (agent-driven CLI workflows; the deployment session was frozen by a self-imposed abort rule before any capture). Key evidence instead lives in [`FRICTION_LOG.md`](FRICTION_LOG.md) verbatim log excerpts, referenced by entry number in every friction point above.

## Screen recording

- Full session: none (agent-driven terminal + loggingctl streams; raw error signature preserved in the working notes of the main-repo FRICTION_LOG.md).

## Test environment

- OS: macOS 15, Apple silicon (no Xcode, no Homebrew, no Java)
- Device: Vega Virtual Device (vvrp) 0.24.12112
- SDK/API tested: Vega SDK 0.24.12112; Vega CLI 1.4.7; React Native 0.83 (kepler fork) + 0.72-runtime; @amazon-devices/react-native-w3cmedia 2.3.2 / 2.3.2-rn-83; @strands-agents/sdk 1.22.0/strands-stream; Fastify 5; Strands engine Node 20+ on host (:8788)
- Editor/agent: agent-driven terminal workflows through the coding harness; ego-browser for web surfaces
- Tools exercised: `vega run-app`, `vega virtual-device`, `vda shell/loggingctl`, jest + tsc + GitHub Actions CI

## What succeeded

- ✅ A complete, shippable product: video (MSE pipeline) + captions + Strands-AI trivia + critic bots + TV remote — full loop on the VVD with RN 0.72, published and CI-green
- ✅ VVD freeness/boot-speed as the hackathon demo substrate (allowed by the milestone & announcement rules)
- ✅ Found and shipped the MSE range-fetch architecture — a **generalizable platform escape hatch** for the cleartext/file policy wall
- ✅ Deterministic, zero-signup demo mode (Strands MockModel + local fallback trivia) — judges need no accounts or keys
- ✅ Every root cause was eventually **named**, as was every error's own mechanism

## What failed

- ❌ RN 0.83 + w3cmedia: two days and the media branch, with zero diagnostics during the failure window
- ❌ Plain media loading (URL or file://), any scheme, on the VVD; only MSE escaped
- ❌ Native screenshotting: no device-side tooling, and host-side capture needed a homegrown window-finder — the platform requirement "show it running" had to be satisfied without the platform's help
- ❌ Documentation self-sufficiency: the onboarding funnel (installer → sample → docs → media toolchain) hits four undocumented mini-walls in the first hour
- ❌ The last verification cycle (Oct 24): frozen by our own >10-error tripwire under the cold-boot noise (friction #4 above; playback unverified as shipped states)

## Appendix

### Scratch pad

The raw, head-preserving stream-of-consciousness behind every claim above — all 23 entries, with verbatim logs, the RN-0.83 bisect trees, the MSE discovery chain, and the abort decision from the tripwired session: **[`FRICTION_LOG.md`](FRICTION_LOG.md)**. Retained as the canonical evidence file; this document intentionally does not paraphrase or summarize it away.

---

*Structured per [trag.dev's Friction Log Guide](https://trag.dev/context/friction-log/) (CC) — BLUF/persona/friction/recommendations format; content unchanged from the canonical log.*

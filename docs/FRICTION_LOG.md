# Friction log

Problems we hit while building Director's Cut for Fire TV, written for the
teams that own the tools. Each entry follows the shape the hackathon asks
for: what we attempted, what we expected, what actually happened, how severe
it is, what we worked around, and what would fix it.

Everything below was hit while building a Vega OS Fire TV app with
**Vega SDK 0.24.12112 / Vega CLI 1.4.7**, React Native 0.83, on macOS 15.3
(Apple Silicon). The Vega Virtual Device was the only Fire TV target
available to us.

---

## FL-01 · The media player refuses cleartext HTTP for video URLs

**Severity:** High — it blocks any app that streams from a local or LAN
server, which is a very common Fire TV development setup.

**Task:** Play an MP4 served by a local HTTP server while developing on the
Vega Virtual Device.

**Steps:** Started a static file server on the host's `localhost:8099`, set
the video URL to `http://10.0.2.2:8099/tears-of-steel.mp4` (the Android
emulator's alias for the host loopback), and ran the app.

**Expected:** The player fetches the file over HTTP, as it does on Android TV.

**Actual:** Playback fails immediately with:

```
ERROR MEDIA_PLAYER:MediaPlayerUtils.cpp(113) isUriSchemeSecure
  Got an insecure protocol/scheme http, return error
W3CMEDIA:makeMediaError: code= 4 msg = URI: http://10.0.2.2:8099/tears-of-steel.mp4
```

The same request succeeds from `adb shell curl`, so this is the player, not
the network.

**Workaround:** Serve the media over HTTPS. We tunnel the local asset server
to a public `https://` origin and proxy the rest of the app's API through the
same origin, so the Fire TV app needs exactly one public URL.

**Suggestion:** Document this constraint on the media player docs pages and in
the sample app's README. It is not discoverable from the error, and the first
symptom is a generic "Playback Error" with no mention of the scheme. A
one-line note next to `MediaPlayerUtils` — or a clearer error that says
"video URLs must use https" — would have saved us an hour. It would also be
good to know whether a debuggable build can opt in to cleartext, since that
is the natural development loop.

---

## FL-02 · The Virtual Device's OK button is not delivered as "select"

**Severity:** High — it makes the official sample app's focusable tiles
impossible to activate on the simulator.

**Task:** Automate the simulator to press OK on a focused tile.

**Steps:** Used the Vega Virtual Device's own gRPC endpoint to send remote
key events, and also tried the emulator console.

**Expected:** OK activates the focused element, as it does on a physical Fire
TV Stick.

**Actual:** The key is delivered and the app receives it —
`GWSI_LOG: Consumed key:KP_Enter state:1` — but no press fires. The Virtual
Device's on-screen remote sends the numpad-enter key, which Android maps to
`KEYCODE_NUMPAD_ENTER`, and React Native only translates `KEYCODE_DPAD_CENTER`
and `KEYCODE_ENTER` into the TV `select` event:

```
// ReactAndroidHWInputDeviceHelper.kt
KeyEvent.KEYCODE_DPAD_CENTER to "select",
KeyEvent.KEYCODE_ENTER to "select",
```

`KEYCODE_NUMPAD_ENTER` is not in that table, so no `select` event is
produced. `react-tv-space-navigation` triggers `onSelect` from
`onAccessibilityAction('activate')`, which is driven by that same `select`
event, so nothing activates.

**Workaround:** Send evdev `KEY_ENTER` (28) instead of `KEY_KPENTER` (96).
That maps to `KEYCODE_ENTER` and RN maps it to `select`. We have included a
small helper script with the project.

**Suggestion:** Either make the Virtual Device's remote send
`KEY_DPAD_CENTER`, or add `KEYCODE_NUMPAD_ENTER` to React Native's
`select` mapping, or document that automation must use key code 28. The
Virtual Device is the only Fire TV target most hackathon entrants will have,
so a first-run experience where OK does nothing on every focusable tile is a
significant papercut. It is worth noting that `RemoteControlManager` in the
sample also does not map `kpenter`, so we had to add that as well.

---

## FL-03 · The build toolchain does not quote paths

**Severity:** High — the build fails for anyone whose project path contains a
space, with an error that does not mention paths.

**Task:** Build the Vega app from `/Users/<you>/Documents/My Project`.

**Steps:** `corepack yarn build:vega:debug`.

**Expected:** A build, or an error about the project.

**Actual:**

```
error Unable to generate a manifest: Error: Command failed:
  .../kepler-module-manifest-builder/dist/src/cli.js build -d /Users/<you>/Documents/My Project/...
/bin/sh: /Users/<you>/Documents/My: No such file or directory
```

`kepler-compatibility-metro-config` builds a shell command by concatenating
paths without quoting them, so the first path component becomes the command.

**Workaround:** We ship `tools/build-vega.sh`, which detects a space in the
project path and builds from a space-free staging directory.

**Suggestion:** Quote the paths in
`@amazon-devices/kepler-compatibility-metro-config` and
`@amazon-devices/kepler-module-manifest-builder`. This is a one-line fix in
each and it affects every project, not just ours. Failing more gracefully —
"the project path must not contain spaces" — would also help.

---

## FL-04 · The sample's default branch cannot build against the current SDK

**Severity:** High — it is the first thing a new entrant does.

**Task:** Follow the Resources page: clone `react-native-multi-tv-app-sample`
and build the Vega app.

**Expected:** `yarn build:vega:debug` produces a `.vpkg`.

**Actual:** `apps/vega/package.json` on `main` pins `react-native: 0.72.0`
and `@amazon-devices/react-native-kepler: ^2.0.0`, while Vega SDK 0.24
requires React Native 0.83 and `react-native-kepler` 4.x. The build fails on
the runtime version. The CLI reference says as much: *"SDK v22 and below
ONLY support React Native 72"*, which reads the other way round from how the
sample is set up.

**Workaround:** We build from the `upgrade/vega-0.24-rn-0.83` branch
(PR #132, by @giolaq, currently open and mergeable). It is a faithful
migration and it works.

**Suggestion:** Merge PR #132, or point the Resources page at
`react-native-multi-tv-helloworld` (already on RN 0.83) for first-time
users. The Resources page currently lists the app-sample as "the most
complete starter" with no note about the SDK/RN version pairing.

---

## FL-05 · There is no way to screenshot the Virtual Device

**Severity:** Medium — the demo video is a required deliverable.

**Task:** Capture stills and a screen recording of the app running on the
Vega Virtual Device.

**Steps:** Tried the documented `gwsi-tool-screenshooter` via
`vega exec vda shell`, then `adb shell screencap`, then the emulator console.

**Expected:** A PNG.

**Actual:**

- `gwsi-tool-screenshooter` **does not work on virtual devices.** The CLI
  reference is explicit: *"This tool only works on physical Vega or Kepler
  devices. It does NOT work on virtual devices (vvrp)."* The check is
  `vega device info` → `product` contains `vvrp` → virtual → refuse.
- The Virtual Device image has **no `screencap` binary**:
  `adb shell screencap` → `command not found`.
- The emulator console is on port **5554**, not 5555, and there is no
  documented screen-record command for the VVD.

**Workaround:** We drive the emulator's gRPC endpoint directly (a community
driver, `@fortemate/vega-vvd-driver`, does this well) to poll frames and pipe
them to ffmpeg. That produces clean 1080p footage with audio.

**Suggestion:** Since the VVD is the simulator, a screenshot/screen-record
command on it would be as useful as the physical-device one. The `vvd`-style
gRPC endpoint already exists inside the emulator; exposing
`vega device screenshot` and `vega device screenrecord` for the Virtual
Device would close the gap and make recorded demos much easier for
everyone in this hackathon.

---

## FL-06 · `yarn typecheck` fails on a clean checkout

**Severity:** Medium — it makes the sample look broken before you change
anything.

**Task:** `yarn typecheck` in a freshly cloned `react-native-multi-tv-app-sample`.

**Expected:** No errors.

**Actual:** **200 TypeScript errors on the pristine `main` branch**, before
any change. Most are `Cannot find name 'console'`,
`Cannot find name 'fetch'` and `Cannot find module 'react-native'` in
`packages/shared-ui` — the package's `tsconfig` does not pick up the React
Native types or the DOM/Node libs it needs.

**Workaround:** We typecheck the agent (`agent/npm run build`, strict mode,
clean) and rely on the Metro/Babel build for the app. We also diff the error
count against a pristine checkout so we can tell our errors from the
pre-existing ones.

**Suggestion:** Fix the `shared-ui` tsconfig so `yarn typecheck` is a usable
signal for contributors. It is a good first task for someone new to the
project, and it is currently a trap: it looks like your change broke the
build when it did not.

---

## FL-07 · The Virtual Device reports a 960x540 dp window on a 1920x1080 screen

**Severity:** Medium — a silent factor-of-two error in every layout.

**Task:** Lay out a side panel beside the video.

**Expected:** `width: 620` is 620 pixels.

**Actual:** The VVD's React Native window reports 960x540 dp on a 1920x1080
surface, so `width: 620` is 620 **dp** and renders 1240 physical pixels. Our
panel came out twice the intended width and pushed the video into a narrow
strip.

**Workaround:** Use the sample's own `scaledPixels()` helper
(`react-native-pixel-perfect` with a 1920x1080 design resolution), which is
what the rest of the shared UI does.

**Suggestion:** This is worth a line in the design-system docs, because the
sample uses `scaledPixels()` consistently without explaining why a raw
`fontSize: 24` would be wrong. A short "why we scale, and how to check"
note in `packages/shared-ui` would save a lot of head-scratching. It might
also be worth a `useDesignScale()` hook that returns the scale factor, rather
than every caller having to know.

---

## FL-08 · `KeplerVideoSurfaceView` has no sized parent in the sample

**Severity:** Medium — it blocks any split-screen layout.

**Task:** Put a video on the left and a companion panel on the right.

**Steps:** Follow `packages/shared-ui/src/components/player/VideoPlayer.vega.tsx`,
which renders `KeplerVideoSurfaceView` with `position: 'absolute',
width: '100%', height: '100%'`.

**Expected:** The surface fills its container.

**Actual:** The component returns a **fragment**, so the absolutely-positioned
surface has no positioned ancestor and resolves against the root view. It
spans the entire screen, and the companion panel is drawn on top of the
video. Adding `position: 'relative'` to the pane is not enough on its own.

**Workaround:** We wrap the surface and the caption view in a sized `View`
(`flex: 1, position: 'relative'`) inside `VideoPlayer.vega.tsx`, and set
`scalingmode="fit"`.

**Suggestion:** Either wrap the sample's surface in a sized container, or
document that consumers must do so. As written, the component can only be
used full-screen, which is a real constraint for any Fire TV app that wants
a side panel or picture-in-picture layout.

---

## FL-09 · `ActivityIndicator` renders oversized on Vega

**Severity:** Low.

**Task:** Show a small "thinking" indicator next to the companion's status
badge.

**Expected:** A small spinner.

**Actual:** `ActivityIndicator size="small"` renders at roughly 100x100 dp
on Vega and overlaps the adjacent text.

**Workaround:** A small styled `View` used as a dot.

**Suggestion:** Not sure this is a bug — the platform may be scaling the
indicator by density. But the default looks broken in a TV layout, so it is
worth a look.

---

## FL-10 · New AWS accounts can have a Bedrock model quota of zero

**Severity:** High for hackathon entrants, and it is not Amazon-specific.

**Task:** Call Amazon Bedrock from the agent so the submission qualifies for
the AWS Builder mini challenge.

**Expected:** The promotional credits requested through the hackathon form
cover the inference.

**Actual:** Two separate problems.

1. **The hackathon's AWS promotional credits ran out.** The Resources page
   was updated on 7 October: *"Unfortunately, we are out of credit codes and
   are no longer accepting credit requests."* The request form itself
   closed on 21 October.
2. **New AWS accounts can have a Bedrock model quota of zero.** Reported on
   the hackathon forum (thread #45416) by another entrant: every applied
   Bedrock model quota is 0, while the AWS defaults are non-zero; the
   quotas needed are marked "Not adjustable"; IAM is correct and support
   confirmed that AWS-side enablement is required. The same
   `ValidationException: Operation not allowed` appears in thread #45474.
   Support declined to escalate.

**Workaround:** The agent runs in a deterministic offline mode when the model
is unreachable, and every response carries a `fallback` flag that the UI
renders as **LOCAL** rather than **AI**. The demo therefore never depends on
a live Bedrock call, which also matters because **judging runs 9-20
November**, long after the submission deadline.

**Suggestion:** For the next round, either fund credits through the end of
the judging period, or publish the list of accounts that hit the zero-quota
wall and the steps that did work, so entrants can plan around it. The
Strands SDK's pluggable model providers also help here: a team with any
other model credential can still demonstrate the integration. Worth calling
out in the Rules or FAQ that **Kiro Crew alone qualifies** for the AWS
Builder mini challenge, since it needs no AWS account at all.

---

## Things that went well

Worth recording, because they are the reasons this was buildable in a day.

- **The offline documentation database is excellent.** The
  `@amazon-devices/amazon-devices-buildertools-mcp` package ships all 589
  Vega and Fire OS documents as a local SQLite database. Being able to grep
  the entire documentation set offline — and offline, because the hackathon
  deadline makes connectivity a liability — settled several design questions
  (camera and microphone privileges, EPG packages, Media Controls) that would
  otherwise have needed a dozen web searches.
- **`useTVEventHandler` and the `RemoteControlManager` pattern** made
  remote handling straightforward once the event names were understood.
- **The W3C Media APIs on Vega** are a good fit for this project: the
  `TextTracks` feature, `MediaControls` and `scalingmode` are all present
  and well documented.
- **`react-tv-space-navigation`** provides usable focus management for free;
  the only gap was the `select` event described in FL-02.
- **The VVD boots in 30-60 seconds and the app installs in one command**,
  which made tight iteration loops possible.

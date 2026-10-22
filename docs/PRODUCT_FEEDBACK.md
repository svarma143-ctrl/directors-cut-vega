# Product feedback

Feedback on every tool, API and SDK we used, as the hackathon requires. We
have tried to be specific: naming the tool, what we used it for, what worked,
what did not, how the onboarding felt, and whether we would use it again.

---

## Amazon Devices Builder Tools (MCP server + Agent Skills)

**Used for:** Reading the entire Vega and Fire OS documentation offline, and
as the starting point for understanding the platform's capabilities.

**What worked well:** The MCP server ships a local SQLite database of all 589
Vega and Fire OS documents. Being able to grep it offline was the single
biggest time-saver of the project — several design decisions (camera and
microphone privileges, the EPG provider packages, Media Controls and the
`interactive` component category) came out of two minutes of searching rather
than an afternoon of clicking through a docs site. The `Builder Tools Power`
packaging for Kiro is a nice touch and made the MCP server easy to adopt.

**What needs work:** The package is described as a Kiro Power, but it is
actually a plain npm package with a documented MCP server. It was not obvious
from the Resources page that the documentation could be queried offline as a
database, and the SQL schema is not documented anywhere. A "here is how to
grep the docs offline" snippet in the README would get this in front of far
more people.

**Onboarding (zero to hello world):** About 20 minutes, most of it spent
finding the package rather than using it. `npm i -g
@amazon-devices/amazon-devices-buildertools-mcp` then pointing an MCP client
at it is all it takes, but nothing tells you that.

**Would we build with it again?** Yes, without hesitation. It should be the
default first step for anyone building for Vega.

---

## Amazon Vega Developer Tools (VVM, CLI, Virtual Device)

**Used for:** Building the app (`.vpkg`), running it on the Vega Virtual
Device, and capturing the demo video.

**What worked well:** The install is genuinely good — one script, and you get
the CLI, the SDK, the Virtual Device and the VS Code extension. The CLI
covers the whole loop (`vega sdk install`, `vega virtual-device start`,
`vega run-app`, `vega device ...`) and `vega --version` reporting both the
Active SDK Version and the CLI Version is exactly what you want when you are
supporting someone else. The Virtual Device boots in 30-60 seconds and is
pixel-accurate at 1920x1080. `vega exec vda ...` and the VDA reference are
useful for device-side debugging.

**What needs work:** Three things cost us real time, and all three are in
the friction log with workarounds:

1. `vega sdk install` without `--non-interactive` fails with
   `Error: failed to get SDK path: failed to read input: EOF` in any
   non-TTY environment, and the installer script's `NONINTERACTIVE=true`
   does not cover the SDK step. It would help if the installer script and
   the CLI agreed on the flag, and if the CLI printed a hint when stdin is
   not a TTY.
2. There is no screenshot or screen-record command for the Virtual Device
   (FL-05). The documented `gwsi-tool-screenshooter` explicitly refuses
   virtual devices, and the VVD image has no `screencap`. For a hackathon
   where a demo video is a required deliverable, this is a conspicuous gap.
3. The build toolchain does not quote paths, so a project path with a space
   fails (FL-03).

**Onboarding (zero to hello world):** About 90 minutes for us, most of it in
the version-matching trap (FL-04) and the Rosetta requirement, which the docs
mention but the installer only reveals when it refuses to run.

**Would we build with it again?** Yes. It is the only Fire TV target that
most hackathon entrants will have, and it is a good one. It just needs the
three fixes above.

---

## `react-native-multi-tv-app-sample` (AmazonAppDev)

**Used for:** The entire Fire TV app: home screen, catalogue, details screen,
video player, focus management, drawer navigation, and the Vega-specific
W3C media player path.

**What worked well:** This is a genuinely good starter. The drawer, hero
banner, content grid and player are all production-shaped, the focus
management is real rather than a demo, and the `.kepler.tsx` / `.android.tsx`
/ `.ios.tsx` platform-split pattern is elegant. The `packages/shared-ui`
theme with `scaledPixels`, `colors`, `typography` and `safeZones` is a
coherent design system we were able to drop a new panel into without
fighting anyone.

**What needs work:** Three things.

1. `main` does not build against the current SDK (FL-04). We built from PR
   #132. Please merge it, or point newcomers at
   `react-native-multi-tv-helloworld`.
2. `yarn typecheck` reports 200 errors on a clean checkout (FL-06).
3. `KeplerVideoSurfaceView` is rendered without a sized parent, so it can
   only be used full-screen (FL-08). That is a real limitation for any app
   that wants a side panel, which is a common Fire TV pattern.

**Onboarding (zero to hello world):** Genuinely good — 30 minutes to a
running app on the simulator, once the version pairing is right. The
`rn-tv-ui-best-practices` Agent Skill in `devices-agent-skills` is also
excellent and I wish I had found it on day one.

**Would we build with it again?** Yes, and we hope our PR to it is merged.

---

## `devices-agent-skills` (AmazonAppDev)

**Used for:** The `rn-tv-ui-best-practices` skill, which is the reference we
used for focus management, 10-foot typography, safe zones and input
handling. It also showed us the shape of a good contribution, which is the
model for our Open Source mini challenge entry.

**What worked well:** The skill is genuinely excellent. The
`navigation-and-focus.md`, `layout-patterns.md` and `input-handling.md`
references are precise and opinionated in the right places, and the static
audit script caught things in our own code. The "hand off to the human
reviewer" convention — being explicit about what cannot be verified without
hardware — is a good habit.

**What needs work:** Skills are installed with `gh skill install` or
`npx skills add`, which requires the GitHub CLI or a network fetch, and
there is no `package.json`-style pinning, so it is hard to reproduce the
exact version a project was written against. The `vega-specifics.md`
reference states that `useTVEventHandler` receives no events unless
`manifest.toml` declares `com.amazon.inputd.service`, but on SDK 0.24 on the
Virtual Device we receive events either way (this is reported in
[issue #9](https://github.com/AmazonAppDev/devices-agent-skills/issues/9)).
That contradiction cost us time, so it would be good to resolve it in the
skill itself.

**Onboarding (zero to hello world):** Two minutes for an agent that already
supports skills. Zero for a human without the GitHub CLI.

**Would we build with it again?** Yes.

---

## React Native 0.83 / `@amazon-devices/react-native-kepler` 4.x

**Used for:** The app runtime on Vega.

**What worked well:** RN 0.83 with React 19.2 works well on Vega. The
`@amazon-devices/react-native-kepler` package exposes the platform pieces
that RN does not have — `TVEventHandler`, `useKeplerAppStateManager`,
`usePermissionsKepler` and the Kepler Media Controls TurboModule — and they
are small, well-typed and easy to use.

**What needs work:** The `EventType` naming is inconsistent between the
Virtual Device and a physical Stick: the VVD reports the OK button as
`kpenter`, while the docs and the sample talk about `select`. React Native
maps only `KEYCODE_DPAD_CENTER` and `KEYCODE_ENTER` to `select`, so the
`kpenter` event is delivered but never becomes a press (FL-02). Normalising
the event names across the Virtual Device and real hardware, or documenting
the difference, would remove a whole class of confusion.

**Onboarding (zero to hello world):** The React Native side is ordinary. The
Amazon-specific parts took longer to get right — mostly because the event
names and the manifest requirements are spread across several documents.

**Would we build with it again?** Yes.

---

## `@amazon-devices/react-native-w3cmedia` (W3C Media APIs on Vega)

**Used for:** Video playback, the caption surface, and the media controls
integration behind the companion panel.

**What worked well:** Real W3C Media APIs on a TV platform are a
refreshing change from the `react-native-video` world. `scalingmode`
(`none` / `fit` / `strech` / `fill`) is genuinely useful and is exactly what
you need to letterbox a scope film correctly next to a side panel.
`KeplerCaptionsView` and the `TextTracks` feature mean captions can be
rendered natively. `MediaControls` gives transport commands for free.

**What needs work:** The `scalingmode` default is `strech`, which is a
confusing name and a surprising default. `fit` is what almost every app
wants. Also, `KeplerVideoSurfaceView` needs a sized parent (FL-08), which is
not mentioned in the component's documentation.

**Onboarding (zero to hello world):** Good, given the W3C background. The
`react_native_for_vega_media_player.md` document in the Builder Tools
database is thorough.

**Would we build with it again?** Yes.

---

## `@amazon-devices/kepler-media-controls`

**Used for:** Media session state and transport commands, so the Fire TV
system UI and Alexa can see and control our playback.

**What worked well:** The interface-provider model in `manifest.toml` is
clean, and the documentation is precise about which commands are core and
which are feature-gated — including the warning that missing `features`
entries silently prevent commands from being delivered.

**What needs work:** The silent failure mode is the sharp edge. A missing
`features` entry means a command simply never arrives, with no error at all.
A validation warning at build time for a `command_options` entry that has no
corresponding `features` entry would help.

**Onboarding (zero to hello world):** Good, and the documentation is better
than most. The manifest block is a bit dense but the reference is thorough.

**Would we build with it again?** Yes.

---

## `react-tv-space-navigation` 6.x

**Used for:** Focus management across the home grid, the details screen and
the companion panel.

**What worked well:** Focus movement, `hasTVPreferredFocus`, and the
accessibility-action based activation model work well together, and the
library is pleasant to use.

**What needs work:** Its activation path depends on React Native's `select`
event, which the Virtual Device does not deliver for its own OK button
(FL-02). That coupling is invisible from the library's documentation, and
it means "focus works but cannot be activated" on the simulator, which is
hard to diagnose.

**Onboarding (zero to hello world):** Reasonable for anyone who has built a
TV app before. The `FocusableView` API is small but the relationship between
`SpatialNavigationRoot`, `SpatialNavigationFocusableView` and
`hasTVPreferredFocus` takes a little reading.

**Would we build with it again?** Yes.

---

## Amazon Bedrock (via the Strands Agents TypeScript SDK)

**Used for:** Generating the companion's context note and trivia questions.

**What worked well:** Strands is an excellent fit. It is TypeScript, so the
agent and the Fire TV app share a language and a type system; it is
Apache-2.0 and AWS-maintained; the `Agent` API is a handful of lines; and
the tool/model abstractions make the agent easy to point at a different
provider. The official deploy-to-AgentCore-Runtime example meant the
deployment path was obvious.

**What needs work:** The optional model providers are installed as optional
peer dependencies, and a static import of one of them breaks the default
Bedrock-only path with `ERR_MODULE_NOT_FOUND`. The provider modules should
either be lazily loaded by the SDK or the package should not fail at import
time. Separately, the zero-quota problem on new accounts (FL-10) is a real
barrier for anyone trying this for the first time.

**Onboarding (zero to hello world):** Very quick with the docs — an agent
with one tool is about twenty lines.

**Would we build with it again?** Yes. Strands plus Bedrock is the right
shape for an agent that needs to be small, typed and deployable.

---

## The public documentation

**Used for:** Everything else.

**What worked well:** The Fire TV and Vega documentation is genuinely good.
The Builder Tools' offline database (above) makes it searchable, the media
and focus-management guides are practical, and the "Requirements for
Multimedia Apps" and "TV App Design UX Guidelines" pages tell you what the
platform actually expects.

**What needs work:** The hard-won constraints are the ones that are hardest
to find. The cleartext-HTTP restriction on video URLs (FL-01) appears
nowhere in the media documentation; the Virtual Device's `kpenter` event
name (FL-02) is not documented anywhere; the `kpenter`/`select` mapping
difference between the Virtual Device and real hardware (FL-02) is not
mentioned; and the fact that the sample on `main` does not build against the
current SDK (FL-04) is not flagged on the Resources page.

**Onboarding (zero to hello world):** Good for the documented path, and the
sample gets you to "hello world" quickly.

**Would we build with it again?** Yes — and we would love the four
constraints above to be documented, because each of them cost an hour that
should have gone into the product.

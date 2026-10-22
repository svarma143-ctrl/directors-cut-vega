# Open Source mini challenge — contribution

The hackathon's Open Source mini challenge requires a contribution to a
public repository *in addition to* the primary-track submission. The primary
track's own repository does not count (confirmed on the discussion forum by
Emerson Sklar), so this is a separate, upstream contribution.

## What we are contributing

**Two bug fixes to
[`AmazonAppDev/react-native-multi-tv-app-sample`](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample),
the official Fire TV / Vega starter that the Resources page points every
entrant at.**

Branch: `fix/vega-kpenter-and-video-surface-sizing`
Base: `upgrade/vega-0.24-rn-0.83` (PR #132, the RN 0.83 migration for Vega
SDK 0.24, by @giolaq)

### 1. The OK button does nothing on the Vega Virtual Device

`RemoteControlManager.kepler.ts` mapped `select` and `enter` to `Enter`, but
not `kpenter` — which is what the Virtual Device actually reports, because
its on-screen remote sends the numpad-enter key. React Native only
translates `KEYCODE_DPAD_CENTER` and `KEYCODE_ENTER` into the TV `select`
event, so `KEYCODE_NUMPAD_ENTER` never becomes a press.

The result is that on the simulator, focus moves with the D-pad but **no
focusable element can be activated at all**. The key reaches the app (the
Vega log shows `Consumed key:KP_Enter`), so it looks like the app is
swallowing it.

This affects everyone using the Virtual Device, which is the only Fire TV
target most hackathon entrants will have.

### 2. `KeplerVideoSurfaceView` had no sized parent

`VideoPlayer.vega.tsx` rendered the surface inside a fragment, so the
absolutely positioned surface resolved against the root view and spanned the
whole screen. The component could therefore only be used full-screen — any
layout that puts the video beside something else (a side panel,
picture-in-picture) draws the other view *on top of* the video.

The fix wraps the surface and caption view in a sized `View` and sets
`scalingmode="fit"` so a scope film letterboxes correctly rather than being
stretched to the pane.

### Also

A README note that the Vega build toolchain does not quote paths, so a
project directory containing a space fails the build with
`/bin/sh: /path/with: No such file or directory`.

## Why these two

They are the changes we needed most, they are small, they are independent of
any app-specific code, and both are documented with a reproduction in
`docs/FRICTION_LOG.md` (FL-02 and FL-08).

They also happen to be the two blockers that would stop another entrant
from building a Fire TV app with a side panel on the Virtual Device, which
is a common Fire TV layout.

## Pull request

The PR is prepared on the branch above and its description is in
`docs/UPSTREAM_PR.md`. It needs to be pushed to a fork and opened against
`AmazonAppDev/react-native-multi-tv-app-sample`.

```bash
git clone --branch upgrade/vega-0.24-rn-0.83 \
  https://github.com/AmazonAppDev/react-native-multi-tv-app-sample.git
cd react-native-multi-tv-app-sample
git checkout -b fix/vega-kpenter-and-video-surface-sizing
# ... apply the change ...
git push origin fix/vega-kpenter-and-video-surface-sizing
```

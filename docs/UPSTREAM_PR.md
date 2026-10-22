# fix(vega): handle the Virtual Device's OK event and size the video surface

Two fixes for Vega OS apps, both found while building a Fire TV app that puts an AI companion panel beside the video.

## 1. The OK button does nothing on the Virtual Device

`RemoteControlManager` ignored the OK button on the Vega Virtual Device.

The Virtual Device's on-screen remote sends the numpad-enter key, which Android maps to `KEYCODE_NUMPAD_ENTER`. React Native only translates `KEYCODE_DPAD_CENTER` and `KEYCODE_ENTER` into the TV `select` event:

```kotlin
// ReactAndroidHWInputDeviceHelper.kt
KeyEvent.KEYCODE_DPAD_CENTER to "select",
KeyEvent.KEYCODE_ENTER to "select",
```

`KEYCODE_NUMPAD_ENTER` is not in that table, so no `select` event is produced. The key still reaches the app — the Vega log shows `Consumed key:KP_Enter` — but `react-tv-space-navigation`, which triggers `onSelect` from `onAccessibilityAction('activate')`, never fires. The symptom is that focus moves with the D-pad but nothing can be activated, which is hard to diagnose.

This PR maps `kpenter` and the equivalent raw keycode names to `Enter`.

Note that this also affects automation: sending evdev `KEY_ENTER` (28) instead of `KEY_KPENTER` (96) makes the Virtual Device behave like a physical Stick.

## 2. `KeplerVideoSurfaceView` has no sized parent

`VideoPlayer.vega` rendered the surface inside a fragment, so the absolutely positioned surface had no positioned ancestor and resolved against the root view. It spanned the entire screen.

The practical effect is that the component can only be used full-screen. Any layout that puts the video beside something else — a side panel, picture-in-picture — draws the other view on top of the video instead.

This PR wraps the surface and the caption view in a sized `View`, and sets `scalingmode="fit"` so a scope film letterboxes correctly rather than being stretched to the pane.

## Also

Documented in the README that the Vega build toolchain does not quote the paths it passes to `kepler-module-manifest-builder`, so a project path containing a space fails with:

```
/bin/sh: /path/with: No such file or directory
```

## Testing

Built and run on the Vega Virtual Device with **Vega SDK 0.24.12112**, **Vega CLI 1.4.7**, React Native 0.83, on macOS 15.3 (Apple Silicon).

- `yarn build:vega:debug` produces a `.vpkg` for armv7, aarch64 and x86_64.
- With fix 1, the OK button activates the focused tile on the Virtual Device.
- With fix 2, a video renders inside a pane that is not the full screen, and the pane beside it is not overdrawn.

Both fixes are independent of each other and of any app-specific code.

## Context

These came up while building an open-source Fire TV app that pairs video playback with a live AI companion panel, for the Build, Ship, Shape Amazon Developer Hackathon. Happy to split this into two PRs if that is preferred.

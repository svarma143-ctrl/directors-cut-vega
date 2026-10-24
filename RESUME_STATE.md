# Director's Cut — resume state (saved Oct 22 2026 ~08:40 PDT)

Hackathon: Amazon "Build, Ship, Shape" — https://amazonappdev2026.devpost.com/ — deadline **Fri Oct 23, 12:00pm PDT**.

## Status: PAUSED before app code was written. Everything below is verified and ready.

## Toolchain — verified working end-to-end
- Vega SDK 0.24.12112 installed at `/Users/Coding/vega/sdk/vega-sdk/main/0.24.12112`, CLI 1.4.7 at `~/vega/bin`.
- `source ~/vega/env` before any vega/vda command.
- **Version note**: repo pins `0.24.9914` in `vega-sdk-requirements.json`; we edited it to `0.24.12112` (already done).
- yarn 4.5.0 via corepack; checked into `~/.npm-global` (npm global prefix pointed there; PATH export in ~/.zshrc exists).
  - Every new shell: `export PATH="$HOME/.npm-global/bin:$PATH"`.
- Reference app is this repo (Amazon sample, RN 0.83): `~/Code/react-native-multi-tv-helloworld`.
- Build: `cd ~/Code/react-native-multi-tv-helloworld && yarn workspace @multitv/vega run build:debug` → `packages/vega/build/aarch64-debug/vega_aarch64.vpkg` (built OK, ~2.4MB).
- Deploy: `source ~/vega/env && cd packages/vega && vega run-app build/aarch64-debug/vega_aarch64.vpkg com.amazondeveloper.hellosharedworkspace.main -d VirtualDevice` → prints "Installed … Successfully launched the app".
- Capture: no SDK screenshooter on VVD. Use fullscreen `screencapture -x file.png` with VVD focused (Screen Recording permission granted; verified working).

## Virtual device
- `vega virtual-device start` (GUI by default). Stop with `vega virtual-device stop`. Status: `vega virtual-device status`.
- Networking: QEMU user-net → **host reachable at 10.0.2.2 from inside the VVD** (ping verified). Internet works from VVD.
- Device adapters: `$KEPLER_SDK_PATH/bin/tools/vda shell …` (serial `emulator-5554`, already had one running instance).

## Key API findings (from offline docs DB, don't re-research)
- Remote input: Kepler RN fork (`@amazon-devices/react-native-kepler` rn0.83) ships `Libraries/TV/useTVEventHandler.js` + `TVEventHandler.js`; kepler path registers `useAddHWEventListenerCallback`. HWEvent has `evtType` like up/down/left/right/select/back/playPause. BackHandler recommended for back.
- Offline docs DB: `/private/var/folders/.../opencode/vegaDB/node_modules/@amazon-devices/amazon-devices-buildertools-mcp/dist/assets/vega-developer-context.db` (use `/usr/bin/sqlite3`; schema: document_metadata(id,display_name,...) + document_content + document_content_fts, join on rowid).
- Standalone packages exist on npm: `@amazon-devices/react-native-w3cmedia` **2.3.2** (media playback — to add), `@strands-agents/sdk` **1.22.0** (installed already in ai-engine/).

## What exists on disk right now (all in this repo)
- `ai-engine/` — npm project created; deps installed: `@strands-agents/sdk@1.22.0`, fastify, tsx, typescript. **server.ts not yet written.**
- `ai-engine/media/` — partial (interrupted) `big_buck_bunny_720p.mp4` download from archive.org: delete to free space; full file is 61MB re-downloadable:
  `curl -L -o big_buck_bunny_720p.mp4 "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4"`
- Strands API contract for MockModel (verified from `.d.ts`): subclass `Model`, implement `updateConfig/getConfig` + `stream(messages) → AsyncIterable<ModelStreamEvent>`; events: `modelMessageStartEvent{role:'assistant'}` → `modelContentBlockStartEvent` → `modelContentBlockDeltaEvent{delta:{type:'textDelta',text}}` → `modelMessageStopEvent{stopReason:'endTurn'}`.
- Plan of record: AI engine = fastify on :8787 served to TV app at `http://10.0.2.2:8787`; Strands Agent with `MockModel` (deterministic trivia keyed to playhead + subtitle lines); real `BedrockModel` only if user's AWS account later has Bedrock quota (it likely does NOT — new-account quotas are 0; user confirmed unavailable/unsure).
- App concept: "Director's Cut" — plays public-domain Big Buck Bunny inside the app (w3cmedia), reads bundled SRT captions synced to playhead, side "AI Director's Panel" generates playhead-synced trivia with mock watch-party players. In-app fallback generator if server unreachable so demo never dies.
- Decisions: no physical Fire TV hardware (simulator-only demo — allowed and sanctioned); Bedrock assume unavailable; skip VSK/Alexa angle; skip camera/mic concepts.

## Compliance reminders for submission
- Video <3 min must show app running on Fire TV **Vega simulator/VVD** (confirmed as valid footage by hackathon announcements).
- Public GitHub repo w/ OSS license OR private repo shared with testing@devpost.com + reviewers (knmeiss, giolaq, anishamalde, mosesroth, emersonsklar); reviewer invites expire after 7 days.
- Product feedback on EVERY tool/API/SDK used (required); friction log = up to 10% bonus.
- AI tools used questions + eligibility checkboxes on the form: https://bit.ly/amazonappdev26d
- Can't capture another app's video/audio; app must play the video itself (that's why w3cmedia).

## Resume commands (cheat sheet)
```bash
export PATH="$HOME/.npm-global/bin:$PATH" && source ~/vega/env
cd ~/Code/react-native-multi-tv-helloworld
yarn install                        # idempotent, fast
yarn workspace @multitv/vega run build:debug
vega virtual-device start
cd packages/vega && vega run-app build/aarch64-debug/vega_aarch64.vpkg com.amazondeveloper.hellosharedworkspace.main -d VirtualDevice
cd ../../ai-engine && npm run start  # after server.ts is written
```

## Space reclaimed / to reclaim (user is freeing disk space)
- Delete candidates: `ai-engine/media/*.mp4` (partial), `packages/*/node_modules`, root `node_modules`, `packages/expotv/node_modules`, `packages/*/build`, `.yarn/install-state.gz` — all regenerated by `yarn install` / rebuild.
- `~/vega/sdk` ≈ 6 GB — re-downloadable via get_vvm.sh if ever needed.

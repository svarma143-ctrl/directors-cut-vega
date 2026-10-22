# Attribution

## Demo media

**Tears of Steel** — © Blender Foundation | [durian.blender.org](https://durian.blender.org)

Released under the **Creative Commons Attribution 3.0 Unported (CC BY 3.0)**
licence. <https://creativecommons.org/licenses/by/3.0/>

We ship a two-minute excerpt (`assets/tears-of-steel.mp4`) together with
Blender's own official English subtitle track (`TOS-en.srt`, from
`https://download.blender.org/demo/movies/ToS/subtitles/`), re-timed to the
excerpt.

The cue list the AI companion is grounded on
(`app/packages/shared-ui/src/data/tearsOfSteelCues.ts`) is **generated**
directly from that subtitle file by `tools/generate-media-ts.mjs`, so the
grounding is exactly the dialogue the viewer is watching.

## Upstream code

The Fire TV app in `app/` is built on
[`AmazonAppDev/react-native-multi-tv-app-sample`](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample),
branch `upgrade/vega-0.24-rn-0.83` (PR #132).

That project is licensed **MIT-0**, © Amazon.com, Inc. or its affiliates. We
keep the original `LICENSE` and all copyright headers in `app/`. Our changes
are listed in the README.

## Other software

| Software | Licence | Used for |
|---|---|---|
| [Strands Agents](https://github.com/strands-agents/harness-sdk) | Apache-2.0 | The AI agent |
| [Amazon Bedrock](https://aws.amazon.com/bedrock/) | AWS service | Model inference |
| [react-tv-space-navigation](https://github.com/bam.tech/react-tv-space-navigation) | MIT | Focus management |
| [react-native-pixel-perfect](https://github.com/rakannimer/react-native-pixel-perfect) | MIT | Design-resolution scaling |
| [react-native-w3cmedia](https://github.com/AmazonAppDev) (Amazon-published) | MIT-0 | W3C Media APIs on Vega |
| [cloudflared](https://github.com/cloudflare/cloudflared) | Apache-2.0 | Optional HTTPS tunnel for local development |
| [ffmpeg](https://ffmpeg.org) | LGPL/GPL | Demo video encoding |

#!/usr/bin/env node
/**
 * Generate the TypeScript cue table for the Fire TV app from the official
 * Blender subtitle file.
 *
 * The cue timings and text are copied verbatim from Blender's own
 * `TOS-en.srt`, shifted into the clipped video's timeline. Generating the
 * table from the source file (rather than typing it by hand) guarantees the
 * AI is grounded in the exact dialogue the viewer is watching.
 *
 * Usage:
 *   node tools/generate-media-ts.mjs <input.srt> <offset> <duration> <out.ts>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , srtPath, offsetArg, durationArg, outPath] = process.argv;
if (!srtPath || !outPath) {
  console.error('usage: node generate-media-ts.mjs <in.srt> <offset> <duration> <out.ts>');
  process.exit(1);
}

const offset = Number(offsetArg ?? 0);
const duration = Number(durationArg ?? Infinity);

function parseTimestamp(ts) {
  const m = ts.trim().match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!m) return null;
  const [, h, mm, ss, ms] = m;
  return Number(h) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, '0')) / 1000;
}

const srt = readFileSync(srtPath, 'utf8');
const cues = [];

for (const block of srt.split(/\n\s*\n/)) {
  const lines = block.split('\n').filter(Boolean);
  const timeIndex = lines.findIndex((l) => l.includes('-->'));
  if (timeIndex === -1) continue;

  const [rawStart, rawEnd] = lines[timeIndex].split('-->');
  const start = parseTimestamp(rawStart);
  const end = parseTimestamp(rawEnd);
  if (start === null || end === null) continue;

  const relStart = start - offset;
  const relEnd = end - offset;
  if (relEnd <= 0 || relStart >= duration) continue;

  const text = lines
    .slice(timeIndex + 1)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) continue;

  cues.push({
    start: Number(Math.max(0, relStart).toFixed(2)),
    end: Number(Math.min(relEnd, duration).toFixed(2)),
    text,
  });
}

const ts = `/**
 * GENERATED FILE - do not edit by hand.
 *
 * Produced by \`tools/generate-media-ts.mjs\` from Blender's official
 * \`TOS-en.srt\` for the open movie "Tears of Steel" (CC-BY 3.0),
 * re-timed to the excerpt used by this demo.
 *
 * These cues are the grounding source for the AI companion. The agent
 * filters them down to the already-watched portion before the model sees
 * them, which is what makes the playhead-safety guarantee real.
 */

import type { Cue } from '../../types/director';

export const TEARS_OF_STEEL_CUES: Cue[] = ${JSON.stringify(cues, null, 2)};
`;

writeFileSync(outPath, ts, 'utf8');
console.log(`wrote ${cues.length} cues to ${outPath}`);

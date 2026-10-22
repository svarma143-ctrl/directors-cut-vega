#!/usr/bin/env node
/**
 * Build the Director's Cut demo assets.
 *
 * Takes:
 *   - an SRT subtitle file for a source video
 *   - the source offset (seconds) that the clip was cut at
 *   - the clip duration
 *
 * Writes:
 *   - a WebVTT file whose timings are relative to the clip
 *   - a JSON cue list used by the Fire TV app as the AI grounding source
 *
 * The cue list is the important artifact: it is what the agent filters down
 * to the already-watched portion before the model ever sees it.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , srtPath, offsetArg, durationArg, vttOut, jsonOut] = process.argv;

if (!srtPath || !vttOut || !jsonOut) {
  console.error(
    'usage: node build-cues.mjs <input.srt> <offsetSeconds> <durationSeconds> <out.vtt> <out.json>',
  );
  process.exit(1);
}

const offset = Number(offsetArg ?? 0);
const duration = Number(durationArg ?? Infinity);

const srt = readFileSync(srtPath, 'utf8');

/** Parse an SRT timestamp "HH:MM:SS,mmm" into seconds. */
function parseTimestamp(ts) {
  const m = ts.trim().match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!m) return null;
  const [, h, mm, ss, ms] = m;
  return Number(h) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, '0')) / 1000;
}

/** Format seconds as a WebVTT timestamp "HH:MM:SS.mmm". */
function formatVtt(seconds) {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Collapse an SRT block's text into a single line suitable for a cue. */
function normaliseText(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const blocks = srt.split(/\n\s*\n/);
const cues = [];

for (const block of blocks) {
  const lines = block.split('\n').filter(Boolean);
  const timeIndex = lines.findIndex((l) => l.includes('-->'));
  if (timeIndex === -1) continue;

  const [rawStart, rawEnd] = lines[timeIndex].split('-->');
  const start = parseTimestamp(rawStart);
  const end = parseTimestamp(rawEnd);
  if (start === null || end === null) continue;

  // Shift into clip-relative time.
  const relStart = start - offset;
  const relEnd = end - offset;

  // Skip anything outside the clip.
  if (relEnd <= 0) continue;
  if (relStart >= duration) continue;

  const text = normaliseText(lines.slice(timeIndex + 1).join('\n'));
  if (!text) continue;

  cues.push({
    start: Math.max(0, Number(relStart.toFixed(3))),
    end: Number(Math.min(relEnd, duration).toFixed(3)),
    text,
  });
}

// --- WebVTT ---------------------------------------------------------------
const vtt = [
  'WEBVTT',
  '',
  ...cues.flatMap((cue, i) => [
    `${i + 1}`,
    `${formatVtt(cue.start)} --> ${formatVtt(cue.end)}`,
    cue.text,
    '',
  ]),
].join('\n');
writeFileSync(vttOut, vtt, 'utf8');

// --- JSON cue list --------------------------------------------------------
const payload = {
  title: 'Tears of Steel',
  subtitle: 'Blender Foundation open movie (CC-BY 3.0)',
  duration,
  cues,
};
writeFileSync(jsonOut, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(
  `wrote ${cues.length} cues -> ${vttOut} and ${jsonOut} ` +
    `(clip ${offset}s..${offset + duration}s)`,
);

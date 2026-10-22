import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGroundingMap, sanitizeGrounding, toSafeContext } from '../src/playhead.js';
import { fallbackResponse } from '../src/fallback.js';
import type { Cue, MediaContext } from '../src/types.js';

/**
 * The core safety property:
 *
 *   The model must never receive information about content the viewer has
 *   not yet watched.
 *
 * These tests are deliberately written as an adversarial reader would: they
 * try to leak the future and assert that it cannot be leaked.
 */

const CUES: Cue[] = [
  { start: 0, end: 4, text: 'The captain studies the map of the northern coast.' },
  { start: 4, end: 9, text: 'She argues that the harbour will freeze before dawn.' },
  { start: 9, end: 14, text: 'The engineer laughs and calls her a dreamer.' },
  { start: 14, end: 20, text: 'The storm arrives early and the lights fail.' },
  { start: 20, end: 26, text: 'They discover the beacon has been extinguished.' },
  { start: 26, end: 32, text: 'The villain reveals the harbour was never ice.' },
];

function mediaAt(playhead: number): MediaContext {
  return { title: 'The Long Harbour', duration: 32, playhead, cues: CUES };
}

test('cues after the playhead are withheld', () => {
  const safe = toSafeContext(mediaAt(10));
  assert.equal(safe.cues.length, 3, 'only cues 0,1,2 should be visible at 10s');
  assert.equal(safe.truncated, true);
  assert.equal(safe.withheldCount, 3);
});

test('no withheld cue text appears anywhere in the safe context', () => {
  const safe = toSafeContext(mediaAt(10));
  const serialized = JSON.stringify(safe);
  for (const withheld of CUES.slice(3)) {
    assert.ok(
      !serialized.includes(withheld.text),
      `FUTURE CONTENT LEAKED: "${withheld.text}"`,
    );
  }
});

test('the villain reveal is unreachable early in playback', () => {
  const early = JSON.stringify(toSafeContext(mediaAt(5)));
  assert.ok(!early.includes('harbour was never ice'), 'ending leaked at 5s');

  const late = JSON.stringify(toSafeContext(mediaAt(30)));
  assert.ok(late.includes('harbour was never ice'), 'ending should be visible at 30s');
});

test('a cue that has started is included even if it is still playing', () => {
  const safe = toSafeContext(mediaAt(10));
  assert.ok(
    safe.cues.some((c) => c.text === CUES[2].text),
    'the currently-playing cue should be visible',
  );
});

test('a cue that has not started is excluded', () => {
  const safe = toSafeContext(mediaAt(9));
  assert.ok(
    !safe.cues.some((c) => c.text === CUES[3].text),
    'a cue starting at 14s must not be visible at 9s',
  );
});

test('nothing is visible before playback begins', () => {
  const safe = toSafeContext(mediaAt(0));
  assert.equal(safe.cues.length, 1, 'only the cue starting at 0s is eligible');
  assert.ok(safe.cues.every((c) => c.start <= 0.5));
});

test('seeking backwards reduces visible context', () => {
  const forward = toSafeContext(mediaAt(25));
  const backward = toSafeContext(mediaAt(5));
  assert.ok(backward.cues.length < forward.cues.length);
  assert.ok(
    !JSON.stringify(backward).includes('beacon has been extinguished'),
    'seeking back must not retain future cues',
  );
});

test('grounding ids only reference visible cues', () => {
  const safe = toSafeContext(mediaAt(10));
  const grounding = buildGroundingMap(safe);
  assert.equal(grounding.length, safe.cues.length);
  grounding.forEach((g, i) => assert.equal(g.id, i));
});

test('invented grounding ids are dropped', () => {
  const safe = toSafeContext(mediaAt(10));
  const sanitized = sanitizeGrounding([0, 2, 99, -1, 1.7, 'x', NaN], safe);
  assert.deepEqual(sanitized, [0, 2, 1].sort((a, b) => a - b));
  assert.ok(!sanitized.includes(99), 'out-of-range id must be dropped');
});

test('the fallback generator never emits future content', () => {
  const request = {
    media: mediaAt(10),
    questionCount: 5,
    includeContext: true,
  };
  const safe = toSafeContext(request.media);
  const response = fallbackResponse(request, safe);

  const serialized = JSON.stringify(response);
  for (const withheld of CUES.slice(3)) {
    assert.ok(!serialized.includes(withheld.text), `FUTURE CONTENT LEAKED: "${withheld.text}"`);
  }
  assert.equal(response.fallback, true, 'fallback responses must be labelled as such');
});

test('the fallback generator works with no cues at all', () => {
  const request = {
    media: { title: 'Empty', playhead: 0, cues: [] },
    questionCount: 3,
    includeContext: true,
  };
  const safe = toSafeContext(request.media);
  const response = fallbackResponse(request, safe);
  assert.equal(response.questions.length, 0);
  assert.equal(response.context, undefined);
});

test('question count is clamped to a sane range', () => {
  const request = { media: mediaAt(30), questionCount: 999, includeContext: false };
  const safe = toSafeContext(request.media);
  const response = fallbackResponse(request, safe);
  assert.ok(response.questions.length <= 8, 'must not generate an unbounded number of questions');
});

import type { Cue, MediaContext, SafeMediaContext } from './types.js';

/**
 * Playhead safety.
 *
 * The rule this module enforces is simple and absolute: **the model may only
 * ever see media that the viewer has already watched.**
 *
 * A naive implementation would send the whole transcript and add a prompt
 * line like "avoid spoilers". That fails in three ways:
 *
 *  1. The future content is still in the context window, so a sufficiently
 *     creative prompt can surface it. Prompt-level instructions are a
 *     soft boundary, not a hard one.
 *  2. Transcripts and episode metadata get cached, logged, and remembered by
 *     the model or by any intermediate log, so the spoiler leaks even when
 *     the answer looks clean.
 *  3. "Avoid spoilers" is unmeasurable. You cannot test it.
 *
 * So we filter structurally instead. The filter happens in this module, before
 * any model call, and the result is the only thing the agent ever sees.
 * Because the future data is never passed to the model, it cannot leak.
 */

/**
 * How much slack to allow on a cue that is currently playing.
 *
 * A cue whose `start` is a hair before the playhead is still being spoken,
 * so excluding it would make the assistant feel like it is lagging behind
 * the screen. We keep cues that have started, and drop the rest.
 */
const CUE_ELIGIBILITY_SLACK_SECONDS = 0.5;

/**
 * A cue is eligible if the viewer has already reached it.
 *
 * "Reached" means the cue has started playing. A cue that has not started
 * yet is future content and is withheld.
 */
export function isCueEligible(cue: Cue, playhead: number): boolean {
  return cue.start <= playhead + CUE_ELIGIBILITY_SLACK_SECONDS;
}

/**
 * Reduce a full media context to the subset that is safe to send to a model.
 *
 * This is the single choke point for spoiler prevention. Everything the
 * agent sees must come out of this function.
 */
export function toSafeContext(media: MediaContext): SafeMediaContext {
  const eligible = media.cues.filter((cue) => isCueEligible(cue, media.playhead));

  // Keep the original cue indices so the model can cite *which* moments it
  // drew on, and so the client can verify grounding.
  const safeCues: Cue[] = [];
  for (const cue of eligible) {
    safeCues.push(cue);
  }

  const withheldCount = media.cues.length - safeCues.length;

  return {
    title: media.title,
    subtitle: media.subtitle,
    duration: media.duration,
    playhead: media.playhead,
    cues: safeCues,
    truncated: withheldCount > 0,
    withheldCount,
  };
}

/**
 * Build the grounding reference the model is given: an id -> cue map.
 *
 * The model is asked to cite grounding ids. We only ever expose ids for
 * eligible cues, so a citation is inherently spoiler-free.
 */
export function buildGroundingMap(safe: SafeMediaContext): { id: number; text: string }[] {
  return safe.cues.map((cue, index) => ({ id: index, text: cue.text }));
}

/**
 * Validate that every grounding id the model returned actually exists in the
 * safe context.
 *
 * Models occasionally invent ids. An invented id is either a hallucination or
 * a signal that the model reached for something it should not have. Either
 * way we drop it rather than surface a citation we cannot verify.
 */
export function sanitizeGrounding(ids: unknown, safe: SafeMediaContext): number[] {
  if (!Array.isArray(ids)) return [];
  const max = safe.cues.length;
  const out = new Set<number>();
  for (const raw of ids) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    const idx = Math.trunc(n);
    if (idx >= 0 && idx < max) out.add(idx);
  }
  return [...out].sort((a, b) => a - b);
}

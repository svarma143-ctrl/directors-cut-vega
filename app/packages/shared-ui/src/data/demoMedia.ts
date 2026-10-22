import type { Cue } from '../types/director';
import { TEARS_OF_STEEL_CUES } from './tearsOfSteelCues';
import { resolveAssetBaseUrl } from '../config/demo';

export { resolveAssetBaseUrl };

/**
 * The demo media registry.
 *
 * Each entry pairs a piece of media with the caption track that grounds the
 * AI companion. In a production app this would come from the streaming
 * service's caption API and be fetched per title; for this project the cue
 * tracks are shipped alongside the app so the demo is fully self-contained
 * and works offline.
 *
 * The cue list is deliberately stored in full (including future cues). The
 * agent filters it down to the already-watched portion before the model ever
 * sees it, which is what makes the playhead-safety guarantee meaningful.
 */

export interface MediaEntry {
  /** The title as shown on screen. */
  title: string;
  /** Secondary line, e.g. the licence or episode name. */
  subtitle?: string;
  /** Where the video is served from. */
  videoUrl: string;
  /** Poster image. */
  posterUrl?: string;
  /** Total duration in seconds. */
  duration: number;
  /** The full caption track for the media. */
  cues: Cue[];
}

/**
 * The demo title.
 *
 * "Tears of Steel" is an open movie released by the Blender Foundation
 * under CC-BY 3.0. We use a short excerpt with its official English subtitle
 * track, which gives the AI companion real dialogue to ground on.
 */
export const DEMO_MEDIA: MediaEntry = {
  title: 'Tears of Steel',
  subtitle: 'Blender Foundation open movie - CC BY 3.0',
  videoUrl: `${resolveAssetBaseUrl()}/tears-of-steel.mp4`,
  posterUrl: `${resolveAssetBaseUrl()}/tears-of-steel-poster.jpg`,
  duration: 120,
  cues: TEARS_OF_STEEL_CUES,
};

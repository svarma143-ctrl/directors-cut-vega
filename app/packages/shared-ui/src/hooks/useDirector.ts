import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pingAgent, requestDirectorResponse } from '../services/directorClient';
import type { Cue, DirectorResponse } from '../types/director';

/**
 * Manages the conversation with the Director's Cut agent.
 *
 * The important behaviour here is *when* to ask.
 *
 * Asking on every playhead tick would hammer the agent and produce answers
 * that flicker. Asking only once would make the panel stale. The rule we use
 * is: ask when the viewer has moved meaningfully forward, and invalidate the
 * answer whenever the viewer seeks, because a seek can move backwards into
 * territory the previous answer was not allowed to consider.
 */

/**
 * How often we poll the agent for liveness.
 */
const PING_INTERVAL_MS = 15000;

/**
 * How many new cues must have been watched before we ask again.
 *
 * Refreshing on a fixed timer is wrong for this product: the companion
 * should speak up when the story moves on, not on the clock. We count the
 * cues that have become eligible since the last question and re-ask once
 * enough new dialogue has happened.
 */
const REFRESH_CUE_THRESHOLD = 1;

export interface UseDirectorOptions {
  title: string;
  subtitle?: string;
  duration?: number;
  /** Current playback position in seconds. */
  playhead: number;
  /** The full cue list for the media. */
  cues: Cue[];
  /** Whether playback is currently active. */
  active: boolean;
}

export interface UseDirectorResult {
  response: DirectorResponse | null;
  loading: boolean;
  offline: boolean;
  /** Force a refresh, e.g. when the user asks for more questions. */
  refresh: () => void;
}

export function useDirector(options: UseDirectorOptions): UseDirectorResult {
  const { title, subtitle, duration, playhead, cues, active } = options;

  const [response, setResponse] = useState<DirectorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  // The last playhead we generated a response for.
  const lastAskedAtRef = useRef<number>(-Infinity);
  // How many cues were eligible at the time of the last question.
  const lastCueCountRef = useRef<number>(0);
  // The title the current response belongs to.
  const currentTitleRef = useRef<string>('');
  // Guards against overlapping requests.
  const inFlightRef = useRef(false);

  /** How many cues the viewer has already seen. */
  const eligibleCueCount = useMemo(() => {
    let count = 0;
    for (const cue of cues) {
      if (cue.start <= playhead + 0.5) count += 1;
    }
    return count;
  }, [cues, playhead]);

  const ask = useCallback(
    async (force = false) => {
      if (inFlightRef.current) return;
      if (!active) return;

      inFlightRef.current = true;
      setLoading(true);
      try {
        const result = await requestDirectorResponse({
          media: { title, subtitle, duration, playhead, cues },
          questionCount: 3,
          includeContext: true,
        });

        if (result) {
          setResponse(result);
          setOffline(false);
          lastAskedAtRef.current = playhead;
          lastCueCountRef.current = eligibleCueCount;
          currentTitleRef.current = title;
        } else {
          setOffline(true);
        }
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [active, title, subtitle, duration, playhead, cues, eligibleCueCount],
  );

  // Initial load, and a reload when the title changes.
  useEffect(() => {
    if (currentTitleRef.current !== title) {
      currentTitleRef.current = title;
      setResponse(null);
      lastAskedAtRef.current = -Infinity;
      lastCueCountRef.current = 0;
    }
    void ask();
    // `ask` intentionally omitted: we only want to re-ask on title change,
    // not on every playhead tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  // Refresh as the story moves on: ask again once new dialogue has been
  // watched, or once we have run a long way past the last question.
  useEffect(() => {
    if (!active) return;

    const newCues = eligibleCueCount - lastCueCountRef.current;
    const farPastLastAsk = playhead - lastAskedAtRef.current > 60;

    if (newCues >= REFRESH_CUE_THRESHOLD || farPastLastAsk) {
      void ask();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleCueCount, playhead, active]);

  // Liveness polling.
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const alive = await pingAgent();
      if (!cancelled) setOffline(!alive);
    };

    void check();
    const timer = setInterval(check, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(() => {
    lastAskedAtRef.current = -Infinity;
    void ask(true);
  }, [ask]);

  return { response, loading, offline, refresh };
}

export default useDirector;

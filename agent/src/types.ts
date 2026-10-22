/**
 * Shared types for the Director's Cut agent and the Fire TV client.
 *
 * The central idea of "playhead safety" lives in `playhead.ts`: an AI
 * assistant for a TV app must answer strictly from what the viewer has
 * already watched. Nothing about the future may reach the model.
 */

/** A single subtitle/caption cue with its own timing on the media timeline. */
export interface Cue {
  /** Start time of the cue, in seconds from the beginning of the media. */
  start: number;
  /** End time of the cue, in seconds. */
  end: number;
  /** The spoken/dialogue text for this cue. */
  text: string;
}

/** Everything the agent knows about the media being watched. */
export interface MediaContext {
  /** Title of the piece (movie, episode, match, etc.). */
  title: string;
  /** Optional finer-grained identity: season/episode, teams, league, etc. */
  subtitle?: string;
  /** Total duration of the media in seconds, when known. */
  duration?: number;
  /** The viewer's current playback position, in seconds. */
  playhead: number;
  /**
   * The full cue list for the media. The agent NEVER receives this directly —
   * `toSafeContext` filters it before anything reaches the model.
   */
  cues: Cue[];
}

/** The filtered, model-safe view of the media. */
export interface SafeMediaContext {
  title: string;
  subtitle?: string;
  /** Duration is included so the model can reason about pacing, not future content. */
  duration?: number;
  /** The viewer's playhead position. */
  playhead: number;
  /** Only cues that have already finished (or are currently playing). */
  cues: Cue[];
  /** True when at least one cue was withheld. */
  truncated: boolean;
  /** How many cues were withheld, for observability and testing. */
  withheldCount: number;
}

/** A generated trivia question. */
export interface TriviaQuestion {
  id: string;
  question: string;
  /** Multiple-choice answers. Empty for open-ended questions. */
  options: string[];
  /** Index into `options` of the correct answer, or -1 for open-ended. */
  correctIndex: number;
  /** Optional short explanation shown after answering. */
  explanation?: string;
  /** Which media cue(s) this question was derived from. */
  groundedIn: number[];
}

/** A contextual note about what is happening right now. */
export interface ContextNote {
  id: string;
  title: string;
  body: string;
  groundedIn: number[];
}

/** The response returned to the Fire TV app. */
export interface DirectorResponse {
  /** Which cues the answer was grounded in. */
  groundedIn: number[];
  /** The context note, if the request asked for one. */
  context?: ContextNote;
  /** Trivia questions, if the request asked for them. */
  questions: TriviaQuestion[];
  /**
   * True when the model was unavailable and a deterministic fallback produced
   * this response. Surfaced in the UI and in logs so a demo never silently
   * fakes intelligence.
   */
  fallback: boolean;
}

/** What the client asks for. */
export interface DirectorRequest {
  media: MediaContext;
  /** How many trivia questions to generate. */
  questionCount?: number;
  /** Whether to include a "what's happening" context note. */
  includeContext?: boolean;
}

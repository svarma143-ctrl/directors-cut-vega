/**
 * Types shared between the Fire TV client and the Director's Cut agent.
 *
 * These mirror the agent's `src/types.ts`. The agent is a separate service
 * (it may run on a laptop, in a Lambda, or on Bedrock AgentCore), so the
 * contract is expressed over JSON rather than imports.
 */

/** A single subtitle/caption cue with its own timing on the media timeline. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Everything the agent needs to know about the media being watched. */
export interface MediaContext {
  title: string;
  subtitle?: string;
  duration?: number;
  /** The viewer's current playback position, in seconds. */
  playhead: number;
  /**
   * The full cue list for the media. The agent filters this to the already
   * watched portion before anything reaches the model, so future content can
   * never reach the LLM.
   */
  cues: Cue[];
}

export interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  groundedIn: number[];
}

export interface ContextNote {
  id: string;
  title: string;
  body: string;
  groundedIn: number[];
}

export interface DirectorResponse {
  groundedIn: number[];
  context?: ContextNote;
  questions: TriviaQuestion[];
  /**
   * True when the agent could not reach its model and returned a
   * deterministic result instead. The UI labels this so a demo never
   * presents canned output as if it were live AI.
   */
  fallback: boolean;
}

export interface DirectorRequest {
  media: MediaContext;
  questionCount?: number;
  includeContext?: boolean;
}

// Temporary local stub until PR1 lands `ProgressPayload` in session-protocol.
// Replace imports from this file with `@cosmic-agent/session-protocol`.
export type ComposePhase =
  | "seed_resolved"
  | "walk_complete"
  | "intro_outro_selected"
  | "preview_started"
  | "preview_complete";

export interface ProgressError {
  code: string;
  message: string;
}

export interface ComposeProgressPayload {
  operation: "compose";
  phase: ComposePhase;
  pct?: number;
  step?: number;
  message?: string;
  error?: ProgressError;
}

export type ProgressPayload = ComposeProgressPayload;

/**
 * workflow-state.ts — Phase Transition Validation + Stop Reasons
 *
 * v4.2.0 Phase 04: Operational governance for workflow lifecycle.
 *
 * Validates phase transitions (observe -> think -> plan -> build ->
 * execute -> verify -> learn -> complete) and records stop reasons
 * for session termination audit trails.
 *
 * Design:
 * - Forward-only phase transitions (no backward jumps, no skipping)
 * - Same-phase re-fires are idempotent (ok)
 * - Any phase -> complete is always allowed (crash recovery / manual override)
 * - Stop reasons persisted to MEMORY/STATE/ for post-session analysis
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { paiPath } from './paths';

// --- Types ------------------------------------------------------------------

export type Phase = 'observe' | 'think' | 'plan' | 'build' | 'execute' | 'verify' | 'learn' | 'complete';

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export type StopReason = 'completed' | 'user-exit' | 'compaction' | 'crash-recovery' | 'budget-wrapup' | 'timeout' | 'unknown';

export interface StopRecord {
  sessionId: string;
  reason: StopReason;
  timestamp: string;
}

// --- Constants --------------------------------------------------------------

/** Ordered phase sequence for validation */
const PHASE_ORDER: readonly Phase[] = [
  'observe',
  'think',
  'plan',
  'build',
  'execute',
  'verify',
  'learn',
  'complete',
] as const;

// --- Phase Transition Validation --------------------------------------------

/**
 * Validate whether a phase transition is allowed.
 *
 * Rules:
 * 1. Same phase -> same phase: ok (idempotent re-fire)
 * 2. Forward by exactly one step: ok
 * 3. Any phase -> complete: ok (crash recovery / manual override)
 * 4. Backward transitions: rejected
 * 5. Skip transitions (e.g., observe -> build): rejected
 */
export function validatePhaseTransition(current: Phase, next: Phase): ValidationResult {
  const currentIdx = PHASE_ORDER.indexOf(current);
  const nextIdx = PHASE_ORDER.indexOf(next);

  // Unknown phases
  if (currentIdx === -1) {
    return { ok: false, reason: `Unknown current phase: ${current}` };
  }
  if (nextIdx === -1) {
    return { ok: false, reason: `Unknown next phase: ${next}` };
  }

  // Same phase re-fire: idempotent
  if (current === next) {
    return { ok: true };
  }

  // Any -> complete: always allowed (crash recovery / manual override)
  if (next === 'complete') {
    return { ok: true };
  }

  // Backward transition: rejected
  if (nextIdx < currentIdx) {
    return { ok: false, reason: `Backward transition not allowed: ${current} -> ${next}` };
  }

  // Forward by exactly one step: ok
  if (nextIdx === currentIdx + 1) {
    return { ok: true };
  }

  // Skip transition: rejected
  return { ok: false, reason: `Skip transition not allowed: ${current} -> ${next} (must go through ${PHASE_ORDER[currentIdx + 1]})` };
}

// --- Stop Reason Recording --------------------------------------------------

/**
 * Record why a session stopped.
 * Persists to MEMORY/STATE/stop-reason-{sessionId}.json.
 */
export function recordStopReason(sessionId: string, reason: StopReason): StopRecord {
  const record: StopRecord = {
    sessionId,
    reason,
    timestamp: new Date().toISOString(),
  };

  const filePath = paiPath('MEMORY', 'STATE', `stop-reason-${sessionId}.json`);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
  } catch {
    /* Silent — stop reason persistence must never block workflow */
  }

  return record;
}

/**
 * Get the file path where a stop reason would be persisted.
 * Exported for testing.
 */
export function getStopReasonPath(sessionId: string): string {
  return paiPath('MEMORY', 'STATE', `stop-reason-${sessionId}.json`);
}

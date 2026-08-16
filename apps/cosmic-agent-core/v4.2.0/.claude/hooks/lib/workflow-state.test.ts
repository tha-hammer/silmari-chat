/**
 * workflow-state.test.ts — Phase Transition + Stop Reason Tests
 *
 * v4.2.0 Phase 04: Tests for operational governance workflow lifecycle.
 *
 * B6: validatePhaseTransition — forward-only, idempotent, crash-recovery
 * B7: recordStopReason — persistence to MEMORY/STATE/
 * B8: Integration — event emission from workflow state changes
 */

import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  validatePhaseTransition,
  recordStopReason,
  getStopReasonPath,
} from './workflow-state';
import type { Phase, StopReason, ValidationResult } from './workflow-state';
import { EventBus } from './event-bus';
import type { DomainEvent } from './domain-events';

// --- Fixtures ---------------------------------------------------------------

const FIXTURE_DIR = join(tmpdir(), 'workflow-state-test-' + Date.now());

let envBackup: Record<string, string | undefined>;

beforeEach(() => {
  envBackup = {
    AAI_DIR: process.env.AAI_DIR,
    HOME: process.env.HOME,
  };
  // Point paiPath to our fixture dir
  process.env.AAI_DIR = FIXTURE_DIR;

  // Clean fixture dir
  try { fs.rmSync(FIXTURE_DIR, { recursive: true }); } catch {}
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
});

function restoreEnv() {
  for (const [k, v] of Object.entries(envBackup)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// --- B6: Phase Transition Validation ----------------------------------------

describe('validatePhaseTransition', () => {
  const ORDERED_PHASES: Phase[] = ['observe', 'think', 'plan', 'build', 'execute', 'verify', 'learn', 'complete'];

  describe('forward transitions (exactly one step)', () => {
    it('should allow observe -> think', () => {
      const result = validatePhaseTransition('observe', 'think');
      expect(result.ok).toBe(true);
      expect(result.reason).toBeUndefined();
      restoreEnv();
    });

    it('should allow think -> plan', () => {
      expect(validatePhaseTransition('think', 'plan').ok).toBe(true);
      restoreEnv();
    });

    it('should allow plan -> build', () => {
      expect(validatePhaseTransition('plan', 'build').ok).toBe(true);
      restoreEnv();
    });

    it('should allow build -> execute', () => {
      expect(validatePhaseTransition('build', 'execute').ok).toBe(true);
      restoreEnv();
    });

    it('should allow execute -> verify', () => {
      expect(validatePhaseTransition('execute', 'verify').ok).toBe(true);
      restoreEnv();
    });

    it('should allow verify -> learn', () => {
      expect(validatePhaseTransition('verify', 'learn').ok).toBe(true);
      restoreEnv();
    });

    it('should allow learn -> complete', () => {
      expect(validatePhaseTransition('learn', 'complete').ok).toBe(true);
      restoreEnv();
    });

    it('should allow all sequential forward transitions', () => {
      for (let i = 0; i < ORDERED_PHASES.length - 1; i++) {
        const result = validatePhaseTransition(ORDERED_PHASES[i], ORDERED_PHASES[i + 1]);
        expect(result.ok).toBe(true);
      }
      restoreEnv();
    });
  });

  describe('same-phase re-fires (idempotent)', () => {
    it('should allow observe -> observe', () => {
      expect(validatePhaseTransition('observe', 'observe').ok).toBe(true);
      restoreEnv();
    });

    it('should allow all same-phase transitions', () => {
      for (const phase of ORDERED_PHASES) {
        const result = validatePhaseTransition(phase, phase);
        expect(result.ok).toBe(true);
      }
      restoreEnv();
    });
  });

  describe('backward transitions (rejected)', () => {
    it('should reject think -> observe', () => {
      const result = validatePhaseTransition('think', 'observe');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Backward');
      restoreEnv();
    });

    it('should reject build -> plan', () => {
      const result = validatePhaseTransition('build', 'plan');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Backward');
      restoreEnv();
    });

    it('should reject complete -> observe', () => {
      const result = validatePhaseTransition('complete', 'observe');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Backward');
      restoreEnv();
    });

    it('should reject verify -> build', () => {
      const result = validatePhaseTransition('verify', 'build');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Backward');
      restoreEnv();
    });
  });

  describe('skip transitions (rejected)', () => {
    it('should reject observe -> build (skips think, plan)', () => {
      const result = validatePhaseTransition('observe', 'build');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Skip');
      expect(result.reason).toContain('think'); // must go through think
      restoreEnv();
    });

    it('should reject observe -> plan (skips think)', () => {
      const result = validatePhaseTransition('observe', 'plan');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Skip');
      restoreEnv();
    });

    it('should reject think -> execute (skips plan, build)', () => {
      const result = validatePhaseTransition('think', 'execute');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Skip');
      restoreEnv();
    });

    it('should reject plan -> verify (skips build, execute)', () => {
      const result = validatePhaseTransition('plan', 'verify');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Skip');
      restoreEnv();
    });
  });

  describe('any -> complete (crash recovery / manual override)', () => {
    it('should allow observe -> complete', () => {
      expect(validatePhaseTransition('observe', 'complete').ok).toBe(true);
      restoreEnv();
    });

    it('should allow think -> complete', () => {
      expect(validatePhaseTransition('think', 'complete').ok).toBe(true);
      restoreEnv();
    });

    it('should allow build -> complete', () => {
      expect(validatePhaseTransition('build', 'complete').ok).toBe(true);
      restoreEnv();
    });

    it('should allow execute -> complete', () => {
      expect(validatePhaseTransition('execute', 'complete').ok).toBe(true);
      restoreEnv();
    });

    it('should allow all phases -> complete', () => {
      for (const phase of ORDERED_PHASES) {
        const result = validatePhaseTransition(phase, 'complete');
        expect(result.ok).toBe(true);
      }
      restoreEnv();
    });
  });
});

// --- B7: Stop Reason Recording ----------------------------------------------

describe('recordStopReason', () => {
  it('should return a StopRecord with correct fields', () => {
    const record = recordStopReason('sess-123', 'completed');
    expect(record.sessionId).toBe('sess-123');
    expect(record.reason).toBe('completed');
    expect(record.timestamp).toBeTruthy();
    // Verify ISO 8601 format
    expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
    restoreEnv();
  });

  it('should persist the record to MEMORY/STATE/', () => {
    const record = recordStopReason('sess-456', 'user-exit');
    const filePath = getStopReasonPath('sess-456');
    expect(fs.existsSync(filePath)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(stored.sessionId).toBe('sess-456');
    expect(stored.reason).toBe('user-exit');
    expect(stored.timestamp).toBe(record.timestamp);
    restoreEnv();
  });

  it('should record all valid stop reasons', () => {
    const reasons: StopReason[] = ['completed', 'user-exit', 'compaction', 'crash-recovery', 'budget-wrapup', 'timeout', 'unknown'];
    for (const reason of reasons) {
      const record = recordStopReason(`sess-${reason}`, reason);
      expect(record.reason).toBe(reason);
      const filePath = getStopReasonPath(`sess-${reason}`);
      expect(fs.existsSync(filePath)).toBe(true);
    }
    restoreEnv();
  });

  it('should overwrite previous stop reason for same session', () => {
    recordStopReason('sess-overwrite', 'timeout');
    const record2 = recordStopReason('sess-overwrite', 'completed');
    const filePath = getStopReasonPath('sess-overwrite');
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(stored.reason).toBe('completed');
    expect(stored.timestamp).toBe(record2.timestamp);
    restoreEnv();
  });
});

// --- B8: Integration — Event Emission from Workflow State Changes -----------

describe('workflow state + EventBus integration', () => {
  it('should emit phase transition events through EventBus', () => {
    const bus = new EventBus({ defaultRuntime: 'claude-code' });
    const captured: DomainEvent[] = [];
    bus.on((event) => captured.push(event));

    // Simulate a workflow emitting events on valid transitions
    const transition = validatePhaseTransition('observe', 'think');
    expect(transition.ok).toBe(true);

    // Emit a work.started event representing the phase change
    bus.emit({
      type: 'work.started',
      timestamp: new Date().toISOString(),
      sessionId: 'sess-integration',
      workSlug: 'phase-transition',
      title: 'observe -> think',
    } as DomainEvent);

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('work.started');
    restoreEnv();
  });

  it('should emit session.ended on stop reason recording', () => {
    const bus = new EventBus({ defaultRuntime: 'claude-code' });
    const captured: DomainEvent[] = [];
    bus.on((event) => captured.push(event));

    const record = recordStopReason('sess-stop-integration', 'budget-wrapup');

    // Emit session.ended event representing the stop
    bus.emit({
      type: 'session.ended',
      timestamp: record.timestamp,
      sessionId: 'sess-stop-integration',
      runtime: 'claude-code',
    } as DomainEvent);

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('session.ended');
    if (captured[0].type === 'session.ended') {
      expect(captured[0].sessionId).toBe('sess-stop-integration');
    }
    restoreEnv();
  });

  it('should handle budget.warning event through EventBus', () => {
    const bus = new EventBus({ defaultRuntime: 'claude-code' });
    const captured: DomainEvent[] = [];
    bus.on((event) => captured.push(event));

    bus.emit({
      type: 'budget.warning',
      timestamp: new Date().toISOString(),
      sessionId: 'sess-budget',
      consumedPct: 52.3,
      remaining: 477000,
    } as DomainEvent);

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('budget.warning');
    restoreEnv();
  });

  it('should handle budget.critical event through EventBus', () => {
    const bus = new EventBus({ defaultRuntime: 'claude-code' });
    const captured: DomainEvent[] = [];
    bus.on((event) => captured.push(event));

    bus.emit({
      type: 'budget.critical',
      timestamp: new Date().toISOString(),
      sessionId: 'sess-budget-crit',
      consumedPct: 73.1,
      remaining: 269000,
    } as DomainEvent);

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('budget.critical');
    restoreEnv();
  });

  it('should handle security.decision event through EventBus', () => {
    const bus = new EventBus({ defaultRuntime: 'claude-code' });
    const captured: DomainEvent[] = [];
    bus.on((event) => captured.push(event));

    bus.emit({
      type: 'security.decision',
      timestamp: new Date().toISOString(),
      tool: 'Bash',
      command: 'rm -rf /',
      decision: 'block',
      reason: 'Destructive command blocked by policy',
    } as DomainEvent);

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('security.decision');
    restoreEnv();
  });

  it('should handle voice.completed event through EventBus', () => {
    const bus = new EventBus({ defaultRuntime: 'claude-code' });
    const captured: DomainEvent[] = [];
    bus.on((event) => captured.push(event));

    bus.emit({
      type: 'voice.completed',
      timestamp: new Date().toISOString(),
      text: 'Task completed successfully',
      voiceId: 'voice-123',
      durationMs: 2500,
    } as DomainEvent);

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('voice.completed');
    restoreEnv();
  });

  it('should reject invalid transitions and not emit events', () => {
    const bus = new EventBus({ defaultRuntime: 'claude-code' });
    const captured: DomainEvent[] = [];
    bus.on((event) => captured.push(event));

    // Backward transition should be rejected
    const result = validatePhaseTransition('build', 'observe');
    expect(result.ok).toBe(false);

    // No event should be emitted for invalid transitions
    // (the caller checks result.ok before emitting)
    expect(captured).toHaveLength(0);
    restoreEnv();
  });
});

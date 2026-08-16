/**
 * workflow-budget.test.ts — v4.2.0 Workflow Budget Tests
 *
 * TDD behaviors from Plan 04a:
 * B2: Record session profile at SessionEnd
 * B5: Predict workflow budget from historical profiles
 * B6: Measure aggregate usage across session tree
 * B7: Recommend subagent delegation
 */

import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as beadsInit from './beads-init';

let mod: typeof import('./workflow-budget');
let execMock: ReturnType<typeof spyOn<typeof childProcess, 'execFileSync'>>;
let existsMock: ReturnType<typeof spyOn<typeof fs, 'existsSync'>>;
let readMock: ReturnType<typeof spyOn<typeof fs, 'readFileSync'>>;
let mkdirMock: ReturnType<typeof spyOn<typeof fs, 'mkdirSync'>>;
let readdirMock: ReturnType<typeof spyOn<typeof fs, 'readdirSync'>>;

let initialized = false;
let createCallCount = 0;

beforeEach(async () => {
  if (!initialized) {
    execMock = spyOn(childProcess, 'execFileSync') as any;
    existsMock = spyOn(fs, 'existsSync') as any;
    readMock = spyOn(fs, 'readFileSync') as any;
    mkdirMock = spyOn(fs, 'mkdirSync') as any;
    readdirMock = spyOn(fs, 'readdirSync') as any;
    mod = await import('./workflow-budget');
    initialized = true;
  }

  execMock.mockReset();
  existsMock.mockReset();
  readMock.mockReset();
  mkdirMock.mockReset();
  readdirMock.mockReset();
  createCallCount = 0;

  existsMock.mockReturnValue(true);
  mkdirMock.mockReturnValue(undefined as any);
  readMock.mockReturnValue('{}');

  execMock.mockImplementation(((cmd: any, args: any, _opts?: any) => {
    if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
    if (Array.isArray(args) && args[0] === 'create') {
      createCallCount++;
      return JSON.stringify({ id: `zk-profile-${createCallCount}` });
    }
    if (Array.isArray(args) && args[0] === 'update') return '{}';
    if (Array.isArray(args) && args[0] === 'list') {
      return JSON.stringify({ issues: [] });
    }
    return '{}';
  }) as any);

  const beadsIndex = await import('./beads-index');
  beadsIndex.resetBeadsCache();
  beadsInit._resetWorkspaceCache();
});

// ---- Fixtures ----

function makeProfile(overrides: Partial<import('./workflow-budget').SessionEndProfile> = {}): import('./workflow-budget').SessionEndProfile {
  return {
    sessionId: 'sess-1',
    workflowType: 'algorithm',
    phase: 'BUILD',
    model: 'claude-opus-4-6',
    contextWindowSize: 1000000,
    finalUsagePercent: 45,
    turnCount: 20,
    cumulativeOutput: 50000,
    durationMinutes: 15,
    subagentsSpawned: 2,
    filesChanged: 5,
    handoffTriggered: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// =========================================================================
// Behavior 2: Record session profile
// =========================================================================

describe('recordSessionProfile', () => {
  it('creates a note:state kind:budget-profile bead', () => {
    const profile = makeProfile();
    mod.recordSessionProfile(profile);

    const createCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'create'
    );
    expect(createCalls.length).toBe(1);
    const args = createCalls[0][1] as string[];
    const labelIdx = args.indexOf('-l');
    expect(labelIdx).toBeGreaterThan(-1);
    expect(args[labelIdx + 1]).toContain('note:state');
    expect(args[labelIdx + 1]).toContain('kind:budget-profile');
    expect(args[labelIdx + 1]).toContain('workflow:algorithm');
    expect(args[labelIdx + 1]).toContain('model:claude-opus-4-6');
  });

  it('stores full profile as notes JSON', () => {
    const profile = makeProfile();
    mod.recordSessionProfile(profile);

    const updateCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'update'
    );
    expect(updateCalls.length).toBe(1);
    const args = updateCalls[0][1] as string[];
    expect(args).toContain('--notes');
    // The notes should contain the JSON profile
    const notesIdx = args.indexOf('--notes');
    const notesContent = args[notesIdx + 1];
    const parsed = JSON.parse(notesContent);
    expect(parsed.workflowType).toBe('algorithm');
    expect(parsed.finalUsagePercent).toBe(45);
  });

  it('does nothing when beads unavailable', () => {
    execMock.mockImplementation((() => {
      throw new Error('not found');
    }) as any);

    // Should not throw
    mod.recordSessionProfile(makeProfile());
    expect(createCallCount).toBe(0);
  });
});

// =========================================================================
// detectWorkflowType
// =========================================================================

describe('detectWorkflowType', () => {
  it('returns native as fallback', () => {
    existsMock.mockReturnValue(false);
    expect(mod.detectWorkflowType('sess-1')).toBe('native');
  });

  it('returns native when state exists but no PRD', () => {
    existsMock.mockImplementation(((path: string) => {
      if (path.includes('current-work')) return true;
      return false;
    }) as any);
    readMock.mockImplementation(((path: string) => {
      if (path.includes('current-work')) return JSON.stringify({ task_title: 'Quick fix' });
      return '{}';
    }) as any);

    expect(mod.detectWorkflowType('sess-1')).toBe('native');
  });
});

// =========================================================================
// Behavior 5: Predict workflow budget
// =========================================================================

describe('predictWorkflowBudget', () => {
  it('returns null when fewer than 3 sessions', () => {
    execMock.mockImplementation(((cmd: any, args: any, _opts?: any) => {
      if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
      if (Array.isArray(args) && args[0] === 'list') {
        return JSON.stringify({ issues: [
          { notes: JSON.stringify(makeProfile({ finalUsagePercent: 40, turnCount: 15 })) },
          { notes: JSON.stringify(makeProfile({ finalUsagePercent: 50, turnCount: 20 })) },
        ]});
      }
      return '{}';
    }) as any);

    const result = mod.predictWorkflowBudget('algorithm', 'claude-opus-4-6');
    expect(result).toBeNull();
  });

  it('returns prediction with 3+ sessions', () => {
    execMock.mockImplementation(((cmd: any, args: any, _opts?: any) => {
      if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
      if (Array.isArray(args) && args[0] === 'list') {
        return JSON.stringify({ issues: [
          { notes: JSON.stringify(makeProfile({ finalUsagePercent: 40, turnCount: 15 })) },
          { notes: JSON.stringify(makeProfile({ finalUsagePercent: 50, turnCount: 20 })) },
          { notes: JSON.stringify(makeProfile({ finalUsagePercent: 45, turnCount: 18 })) },
        ]});
      }
      return '{}';
    }) as any);

    const result = mod.predictWorkflowBudget('algorithm', 'claude-opus-4-6');
    expect(result).not.toBeNull();
    expect(result!.historicalCount).toBe(3);
    expect(result!.estimatedContextPct).toBeGreaterThan(30);
    expect(result!.estimatedContextPct).toBeLessThan(60);
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it('recommends plan-handoff when p75 exceeds 70%', () => {
    execMock.mockImplementation(((cmd: any, args: any, _opts?: any) => {
      if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
      if (Array.isArray(args) && args[0] === 'list') {
        return JSON.stringify({ issues: [
          { notes: JSON.stringify(makeProfile({ finalUsagePercent: 75, turnCount: 30 })) },
          { notes: JSON.stringify(makeProfile({ finalUsagePercent: 80, turnCount: 35 })) },
          { notes: JSON.stringify(makeProfile({ finalUsagePercent: 72, turnCount: 28 })) },
        ]});
      }
      return '{}';
    }) as any);

    const result = mod.predictWorkflowBudget('algorithm', 'claude-opus-4-6');
    expect(result).not.toBeNull();
    expect(result!.recommendation).toBe('plan-handoff');
  });

  it('returns null when beads unavailable', () => {
    execMock.mockImplementation((() => {
      throw new Error('not found');
    }) as any);

    const result = mod.predictWorkflowBudget('algorithm', 'claude-opus-4-6');
    expect(result).toBeNull();
  });
});

// =========================================================================
// measurePredictionAccuracy
// =========================================================================

describe('measurePredictionAccuracy', () => {
  it('computes error and p75 comparison', () => {
    const prediction = {
      estimatedContextPct: 50,
      estimatedTurns: 20,
      confidence: 0.7,
      recommendation: 'proceed' as const,
      historicalCount: 10,
      p75ContextPct: 60,
    };
    const actual = makeProfile({ finalUsagePercent: 55, turnCount: 22 });

    const result = mod.measurePredictionAccuracy(prediction, actual);
    expect(result.errorPct).toBe(5);
    expect(result.withinP75).toBe(true);
  });

  it('detects when actual exceeds p75', () => {
    const prediction = {
      estimatedContextPct: 50,
      estimatedTurns: 20,
      confidence: 0.7,
      recommendation: 'proceed' as const,
      historicalCount: 10,
      p75ContextPct: 60,
    };
    const actual = makeProfile({ finalUsagePercent: 65 });

    const result = mod.measurePredictionAccuracy(prediction, actual);
    expect(result.withinP75).toBe(false);
  });
});

// =========================================================================
// Behavior 7: Recommend subagent delegation
// =========================================================================

describe('shouldDelegateToSubagent', () => {
  const makeSnapshot = (usagePercent: number): import('./context-budget').ContextSnapshot => ({
    sessionId: 'sess-1',
    turnCount: 10,
    lastTurnContext: 100000,
    cumulativeOutput: 20000,
    contextWindowSize: 1000000,
    usagePercent,
    model: 'claude-opus-4-6',
    timestamp: new Date().toISOString(),
  });

  it('recommends delegation when parent context above 50%', () => {
    const result = mod.shouldDelegateToSubagent(makeSnapshot(55), 'lookup');
    expect(result.delegate).toBe(true);
    expect(result.reason).toContain('50%');
  });

  it('recommends delegation for heavy task types', () => {
    const result = mod.shouldDelegateToSubagent(makeSnapshot(30), 'research');
    expect(result.delegate).toBe(true);
    expect(result.reason).toContain('research');
  });

  it('does not delegate for simple tasks at low context', () => {
    const result = mod.shouldDelegateToSubagent(makeSnapshot(15), 'lookup');
    expect(result.delegate).toBe(false);
    expect(result.reason).toContain('Sufficient');
  });

  it('recommends delegation when prediction shows high usage', () => {
    const prediction = {
      estimatedContextPct: 65,
      estimatedTurns: 25,
      confidence: 0.8,
      recommendation: 'plan-subagents' as const,
      historicalCount: 15,
      p75ContextPct: 70,
    };
    const result = mod.shouldDelegateToSubagent(makeSnapshot(25), 'synthesis', prediction);
    expect(result.delegate).toBe(true);
    expect(result.reason).toContain('Historical');
  });
});

import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  getConversationPath,
  measureContextUsage,
  checkBudget,
  formatBudgetReminder,
  measureAggregateUsage,
  shouldDelegateToSubagent,
  MODEL_CONTEXT_SIZES,
  THRESHOLD_INFO,
  THRESHOLD_RECOMMEND,
  THRESHOLD_CRITICAL,
  _resetBudgetState,
} from './context-budget';
import type { ContextSnapshot, BudgetCheck } from './context-budget';

// --- Fixtures ---------------------------------------------------------------

const FIXTURE_DIR = join(tmpdir(), 'context-budget-test-' + Date.now());
const SESSION_ID = 'test-session-abc123';
const PROJECT_DIR = '/home/testuser/Dev/MyProject';
const PROJECT_SLUG = '-home-testuser-Dev-MyProject';

function makeAssistantLine(usage: Record<string, number>, model = 'claude-opus-4-6'): string {
  return JSON.stringify({
    type: 'assistant',
    message: { model, usage },
    timestamp: Date.now(),
    sessionId: SESSION_ID,
  });
}

function makeConversationFile(lines: string[]): string {
  const dir = join(FIXTURE_DIR, '.claude', 'projects', PROJECT_SLUG);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${SESSION_ID}.jsonl`);
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
  return filePath;
}

function makeSubagentFile(agentId: string, lines: string[]): void {
  const dir = join(FIXTURE_DIR, '.claude', 'projects', PROJECT_SLUG, SESSION_ID, 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(join(dir, `${agentId}.jsonl`), lines.join('\n') + '\n');
}

// --- Setup ------------------------------------------------------------------

let envBackup: Record<string, string | undefined>;
let homedirSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  envBackup = {
    CLAUDE_SESSION_ID: process.env.CLAUDE_SESSION_ID,
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,
    AAI_DIR: process.env.AAI_DIR,
  };
  process.env.CLAUDE_SESSION_ID = SESSION_ID;
  process.env.CLAUDE_PROJECT_DIR = PROJECT_DIR;
  // Point AAI_DIR to fixture dir so paiPath resolves there
  process.env.AAI_DIR = FIXTURE_DIR;

  // Mock homedir() to return fixture dir (used by getConversationPath)
  homedirSpy = spyOn(os, 'homedir').mockReturnValue(FIXTURE_DIR);

  // Clean fixture dir
  try { fs.rmSync(FIXTURE_DIR, { recursive: true }); } catch {}
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  // Clean budget state
  _resetBudgetState(SESSION_ID);
});

// Restore env after each test - can't use afterEach easily, do in-test
function restoreEnv() {
  homedirSpy.mockRestore();
  for (const [k, v] of Object.entries(envBackup)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// --- B1: Measure context usage ----------------------------------------------

describe('getConversationPath', () => {
  it('should derive path from env vars and return it when file exists', () => {
    makeConversationFile(['{}']);
    const p = getConversationPath(SESSION_ID);
    expect(p).not.toBeNull();
    expect(p!).toContain(SESSION_ID);
    expect(p!).toContain(PROJECT_SLUG);
    restoreEnv();
  });

  it('should return null when session ID is missing', () => {
    delete process.env.CLAUDE_SESSION_ID;
    expect(getConversationPath()).toBeNull();
    restoreEnv();
  });

  it('should return null when project dir is missing', () => {
    delete process.env.CLAUDE_PROJECT_DIR;
    expect(getConversationPath(SESSION_ID)).toBeNull();
    restoreEnv();
  });

  it('should return null when file does not exist', () => {
    // Don't create the file
    expect(getConversationPath(SESSION_ID)).toBeNull();
    restoreEnv();
  });
});

describe('measureContextUsage', () => {
  it('should return exact token counts from the last assistant message', () => {
    makeConversationFile([
      JSON.stringify({ type: 'user', message: { content: 'hello' } }),
      makeAssistantLine({
        input_tokens: 100,
        cache_creation_input_tokens: 5000,
        cache_read_input_tokens: 200000,
        output_tokens: 500,
      }),
      JSON.stringify({ type: 'user', message: { content: 'continue' } }),
      makeAssistantLine({
        input_tokens: 50,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 300000,
        output_tokens: 800,
      }),
    ]);

    const snapshot = measureContextUsage(SESSION_ID);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.sessionId).toBe(SESSION_ID);
    expect(snapshot!.lastTurnContext).toBe(50 + 1000 + 300000); // last assistant msg
    expect(snapshot!.turnCount).toBe(2);
    expect(snapshot!.cumulativeOutput).toBe(500 + 800);
    expect(snapshot!.model).toBe('claude-opus-4-6');
    expect(snapshot!.contextWindowSize).toBe(1_000_000);
    expect(snapshot!.usagePercent).toBeCloseTo(30.105, 1); // 301050 / 1M * 100
    restoreEnv();
  });

  it('should auto-detect model and set correct context window', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 10,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 50000,
        output_tokens: 200,
      }, 'claude-sonnet-4-6'),
    ]);

    const snapshot = measureContextUsage(SESSION_ID);
    expect(snapshot!.model).toBe('claude-sonnet-4-6');
    expect(snapshot!.contextWindowSize).toBe(200_000);
    expect(snapshot!.usagePercent).toBeCloseTo(25.255, 1); // 50510 / 200K * 100
    restoreEnv();
  });

  it('should return null when no assistant messages exist', () => {
    makeConversationFile([
      JSON.stringify({ type: 'user', message: { content: 'hello' } }),
    ]);
    expect(measureContextUsage(SESSION_ID)).toBeNull();
    restoreEnv();
  });

  it('should return null when session ID is undefined', () => {
    delete process.env.CLAUDE_SESSION_ID;
    expect(measureContextUsage()).toBeNull();
    restoreEnv();
  });

  it('should handle malformed JSON lines gracefully', () => {
    makeConversationFile([
      'not valid json',
      '{ broken',
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 5000,
        output_tokens: 50,
      }),
    ]);
    const snapshot = measureContextUsage(SESSION_ID);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.turnCount).toBe(1);
    restoreEnv();
  });
});

// --- B2: Budget checking (threshold crossing semantics) ---------------------

describe('checkBudget', () => {
  it('should return none when usage is below 50%', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 100000, // ~10% of 1M
        output_tokens: 500,
      }),
    ]);
    const check = checkBudget(SESSION_ID);
    expect(check.action).toBe('none');
    expect(check.message).toBeUndefined();
    restoreEnv();
  });

  it('should return info at 50% threshold (first time)', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 510000, // ~51% of 1M
        output_tokens: 500,
      }),
    ]);
    const check = checkBudget(SESSION_ID);
    expect(check.action).toBe('info');
    restoreEnv();
  });

  it('should return none at 51% on second call (once-only)', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 510000, // ~51%
        output_tokens: 500,
      }),
    ]);
    const first = checkBudget(SESSION_ID);
    expect(first.action).toBe('info');
    const second = checkBudget(SESSION_ID);
    expect(second.action).toBe('none');
    restoreEnv();
  });

  it('should return recommend-handoff at 67% threshold', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 680000, // ~68% of 1M
        output_tokens: 500,
      }),
    ]);
    const check = checkBudget(SESSION_ID);
    expect(check.action).toBe('recommend-handoff');
    expect(check.message).toContain('/create_handoff');
    restoreEnv();
  });

  it('should return recommend-handoff only once', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 680000, // ~68%
        output_tokens: 500,
      }),
    ]);

    const first = checkBudget(SESSION_ID);
    expect(first.action).toBe('recommend-handoff');

    const second = checkBudget(SESSION_ID);
    expect(second.action).toBe('none'); // already emitted

    restoreEnv();
  });

  it('should return critical-handoff at 70% threshold', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 710000, // ~71% of 1M
        output_tokens: 500,
      }),
    ]);
    const check = checkBudget(SESSION_ID);
    expect(check.action).toBe('critical-handoff');
    expect(check.message).toContain('CRITICAL');
    expect(check.message).toContain('/create_handoff');
    restoreEnv();
  });

  it('should skip info and recommend when jumping from 40% to 96% (critical)', () => {
    // First call at low usage
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 100000, // ~10%
        output_tokens: 500,
      }),
    ]);
    const lowCheck = checkBudget(SESSION_ID);
    expect(lowCheck.action).toBe('none');

    // Now jump to 96%
    _resetBudgetState(SESSION_ID);
    try { fs.rmSync(FIXTURE_DIR + '/.claude', { recursive: true }); } catch {}
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 960000, // ~96%
        output_tokens: 500,
      }),
    ]);
    const highCheck = checkBudget(SESSION_ID);
    expect(highCheck.action).toBe('critical-handoff');

    // After critical, info and recommend should also be marked as emitted
    const afterCheck = checkBudget(SESSION_ID);
    expect(afterCheck.action).toBe('none');

    restoreEnv();
  });

  it('should return null snapshot when conversation unavailable', () => {
    // No conversation file created
    const check = checkBudget(SESSION_ID);
    expect(check.snapshot).toBeNull();
    expect(check.action).toBe('none');
    restoreEnv();
  });
});

// --- B3: Format reminder ----------------------------------------------------

describe('formatBudgetReminder', () => {
  const snapshot: ContextSnapshot = {
    sessionId: SESSION_ID,
    turnCount: 50,
    lastTurnContext: 680_000,
    cumulativeOutput: 30_000,
    contextWindowSize: 1_000_000,
    usagePercent: 68.0,
    model: 'claude-opus-4-6',
    timestamp: new Date().toISOString(),
  };

  it('should format recommend-handoff reminder with stats', () => {
    const msg = formatBudgetReminder({ snapshot, action: 'recommend-handoff' });
    expect(msg).toContain('Context window at');
    expect(msg).toContain('68.0%');
    expect(msg).toContain('/create_handoff');
    expect(msg).toContain('system-reminder');
    restoreEnv();
  });

  it('should format critical-handoff reminder with urgency', () => {
    const msg = formatBudgetReminder({
      snapshot: { ...snapshot, usagePercent: 72.0, lastTurnContext: 720_000 },
      action: 'critical-handoff',
    });
    expect(msg).toContain('CONTEXT BUDGET CRITICAL');
    expect(msg).toContain('Stop current work');
    expect(msg).toContain('/create_handoff');
    restoreEnv();
  });

  it('should return empty string for info action (logged only)', () => {
    const msg = formatBudgetReminder({ snapshot, action: 'info' });
    expect(msg).toBe('');
    restoreEnv();
  });

  it('should return empty string for none action', () => {
    const msg = formatBudgetReminder({ snapshot, action: 'none' });
    expect(msg).toBe('');
    restoreEnv();
  });

  it('should return empty string when snapshot is null', () => {
    const msg = formatBudgetReminder({ snapshot: null, action: 'recommend-handoff' });
    expect(msg).toBe('');
    restoreEnv();
  });
});

// --- B4: Aggregate usage ----------------------------------------------------

describe('measureAggregateUsage', () => {
  it('should aggregate parent + subagent token usage', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 200000,
        output_tokens: 5000,
      }),
    ]);
    makeSubagentFile('agent-research1', [
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 50000,
        output_tokens: 3000,
      }, 'claude-sonnet-4-6'),
    ]);
    makeSubagentFile('agent-impl1', [
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 30000,
        output_tokens: 2000,
      }, 'claude-sonnet-4-6'),
    ]);

    const agg = measureAggregateUsage(SESSION_ID);
    expect(agg).not.toBeNull();
    expect(agg!.subagents).toHaveLength(2);
    expect(agg!.totalOutputTokens).toBe(5000 + 3000 + 2000);
    expect(agg!.totalApiCalls).toBe(3); // 1 parent + 1 + 1 subagent
    restoreEnv();
  });

  it('should report individual subagent token counts', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 200000,
        output_tokens: 5000,
      }),
    ]);
    makeSubagentFile('agent-research1', [
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 50000,
        output_tokens: 3000,
      }, 'claude-sonnet-4-6'),
    ]);

    const agg = measureAggregateUsage(SESSION_ID);
    expect(agg!.subagents[0].outputTokens).toBe(3000);
    expect(agg!.subagents[0].model).toBe('claude-sonnet-4-6');
    expect(agg!.parentOutputTokens).toBe(5000);
    restoreEnv();
  });

  it('should work with no subagents', () => {
    makeConversationFile([
      makeAssistantLine({
        input_tokens: 1,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 100000,
        output_tokens: 2000,
      }),
    ]);
    const agg = measureAggregateUsage(SESSION_ID);
    expect(agg!.subagents).toHaveLength(0);
    expect(agg!.totalOutputTokens).toBe(2000);
    restoreEnv();
  });
});

// --- B5: Subagent delegation ------------------------------------------------

describe('shouldDelegateToSubagent', () => {
  const makeSnapshot = (usagePercent: number): ContextSnapshot => ({
    sessionId: SESSION_ID,
    turnCount: 20,
    lastTurnContext: usagePercent * 10000,
    cumulativeOutput: 5000,
    contextWindowSize: 1_000_000,
    usagePercent,
    model: 'claude-opus-4-6',
    timestamp: new Date().toISOString(),
  });

  it('should recommend delegation for research above 40%', () => {
    const result = shouldDelegateToSubagent(makeSnapshot(45), 'research');
    expect(result.delegate).toBe(true);
    expect(result.reason).toContain('Preserve parent');
    restoreEnv();
  });

  it('should not recommend delegation for research at 15%', () => {
    const result = shouldDelegateToSubagent(makeSnapshot(15), 'research');
    expect(result.delegate).toBe(false);
    expect(result.reason).toContain('Sufficient');
    restoreEnv();
  });

  it('should not recommend delegation for simple-lookup at 60%', () => {
    const result = shouldDelegateToSubagent(makeSnapshot(60), 'simple-lookup');
    expect(result.delegate).toBe(false);
    restoreEnv();
  });

  it('should recommend delegation for implementation at 60%', () => {
    const result = shouldDelegateToSubagent(makeSnapshot(60), 'implementation');
    expect(result.delegate).toBe(true);
    restoreEnv();
  });

  it('should handle null snapshot gracefully', () => {
    const result = shouldDelegateToSubagent(null, 'research');
    expect(result.delegate).toBe(false);
    expect(result.reason).toContain('No context data');
    restoreEnv();
  });
});

// --- Constants --------------------------------------------------------------

describe('MODEL_CONTEXT_SIZES', () => {
  it('should have correct sizes for known models', () => {
    expect(MODEL_CONTEXT_SIZES['claude-opus-4-6']).toBe(1_000_000);
    expect(MODEL_CONTEXT_SIZES['claude-sonnet-4-6']).toBe(200_000);
    expect(MODEL_CONTEXT_SIZES['claude-haiku-4-5']).toBe(200_000);
    expect(MODEL_CONTEXT_SIZES.default).toBe(200_000);
  });
});

describe('THRESHOLD constants', () => {
  it('should have correct threshold values', () => {
    expect(THRESHOLD_INFO).toBe(0.50);
    expect(THRESHOLD_RECOMMEND).toBe(0.67);
    expect(THRESHOLD_CRITICAL).toBe(0.70);
  });
});

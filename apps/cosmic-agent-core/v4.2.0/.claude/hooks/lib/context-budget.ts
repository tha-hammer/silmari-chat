/**
 * context-budget.ts — Proactive Context Budget with Handoff
 *
 * Measures context window consumption from the conversation JSONL,
 * checks thresholds, and recommends handoff when budget is critical.
 *
 * v4.2.0: Replaces Plan 04 B1-B3, B8 (reactive token budget + PreCompact).
 *
 * Design: Reads exact per-turn token usage from Claude Code's conversation
 * JSONL files. The effective context size on any turn is:
 *   input_tokens + cache_creation_input_tokens + cache_read_input_tokens
 *
 * This is the EXECUTE/MEASURE part of the prediction loop.
 */

import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { paiPath } from './paths';

/** Override for testing (bun caches os.homedir, ignoring HOME env changes) */
let _homeOverride: string | null = null;
export function _setHomeDir(dir: string | null): void { _homeOverride = dir; }
function getHome(): string { return _homeOverride || homedir(); }

// ─── Types ──────────────────────────────────────────────────────────────

export interface ContextSnapshot {
  sessionId: string;
  turnCount: number;
  lastTurnContext: number;
  cumulativeOutput: number;
  contextWindowSize: number;
  usagePercent: number;
  model: string;
  timestamp: string;
}

export interface BudgetCheck {
  snapshot: ContextSnapshot | null;
  action: 'none' | 'info' | 'recommend-handoff' | 'critical-handoff';
  message?: string;
}

export interface AggregateTokenUsage {
  parentSessionId: string;
  parentContextPct: number;
  parentOutputTokens: number;
  subagents: SubagentUsage[];
  totalOutputTokens: number;
  totalApiCalls: number;
}

export interface SubagentUsage {
  agentId: string;
  model: string;
  outputTokens: number;
  turnCount: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Known model context window sizes */
export const MODEL_CONTEXT_SIZES: Record<string, number> = {
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  // Older model IDs
  'claude-sonnet-4-5-20241022': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  default: 200_000,
};

/** Budget thresholds */
export const THRESHOLD_INFO = 0.50;
export const THRESHOLD_RECOMMEND = 0.67;
export const THRESHOLD_CRITICAL = 0.70;

// ─── Budget state (once-per-crossing) ───────────────────────────────────

interface BudgetState {
  infoEmitted: boolean;
  recommendEmitted: boolean;
  criticalEmitted: boolean;
}

/** Override for testing */
let _statePathOverride: string | null = null;
export function _setStatePath(dir: string | null): void { _statePathOverride = dir; }

function getBudgetStatePath(sessionId: string): string {
  if (_statePathOverride) return join(_statePathOverride, `budget-state-${sessionId}.json`);
  return paiPath('MEMORY', 'STATE', `budget-state-${sessionId}.json`);
}

function loadBudgetState(sessionId: string): BudgetState {
  const path = getBudgetStatePath(sessionId);
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }
  } catch { /* fresh state */ }
  return { infoEmitted: false, recommendEmitted: false, criticalEmitted: false };
}

function saveBudgetState(sessionId: string, state: BudgetState): void {
  const path = getBudgetStatePath(sessionId);
  try {
    const { writeFileSync, mkdirSync } = require('fs');
    const { dirname } = require('path');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state), 'utf-8');
  } catch { /* silent */ }
}

// ─── Context measurement ────────────────────────────────────────────────

/**
 * Derive the conversation JSONL path from env vars.
 * Pattern: ~/.claude/projects/{project-slug}/{sessionId}.jsonl
 * where project-slug = CLAUDE_PROJECT_DIR with '/' replaced by '-'
 */
export function getConversationPath(sessionId?: string): string | null {
  const sid = sessionId || process.env.CLAUDE_SESSION_ID;
  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  if (!sid) return null;
  if (!projectDir) return null;

  const slug = projectDir.replace(/\//g, '-');
  const conversationFile = join(getHome(), '.claude', 'projects', slug, `${sid}.jsonl`);
  return existsSync(conversationFile) ? conversationFile : null;
}

/**
 * Read the conversation JSONL to get current context utilization.
 *
 * Performance: reads the file from the tail (last 8KB) to find the most
 * recent assistant message with usage data. For the full snapshot (turnCount,
 * cumulativeOutput), does a single forward pass counting assistant messages.
 * Targets <10ms for files up to 5MB.
 */
export function measureContextUsage(sessionId?: string): ContextSnapshot | null {
  const sid = sessionId || process.env.CLAUDE_SESSION_ID;
  if (!sid) return null;

  const filePath = getConversationPath(sid);
  if (!filePath) return null;

  try {
    // Read last chunk to find the most recent assistant usage
    const lastUsage = readLastAssistantUsage(filePath);
    if (!lastUsage) return null;

    // Count turns and sum output tokens (forward pass)
    const stats = countTurnsAndOutput(filePath);

    const model = lastUsage.model || 'unknown';
    const contextWindowSize = MODEL_CONTEXT_SIZES[model] || MODEL_CONTEXT_SIZES.default;
    const lastTurnContext = (lastUsage.input_tokens || 0)
      + (lastUsage.cache_creation_input_tokens || 0)
      + (lastUsage.cache_read_input_tokens || 0);

    return {
      sessionId: sid,
      turnCount: stats.turnCount,
      lastTurnContext,
      cumulativeOutput: stats.cumulativeOutput,
      contextWindowSize,
      usagePercent: (lastTurnContext / contextWindowSize) * 100,
      model,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

interface UsageData {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
  model: string;
}

/**
 * Read the last ~8KB of the conversation file and find the most recent
 * assistant message with usage data. This avoids parsing the entire file.
 */
function readLastAssistantUsage(filePath: string): UsageData | null {
  try {
    const stat = statSync(filePath);
    const chunkSize = Math.min(stat.size, 8192);
    const buffer = Buffer.alloc(chunkSize);
    const fd = openSync(filePath, 'r');
    readSync(fd, buffer, 0, chunkSize, Math.max(0, stat.size - chunkSize));
    closeSync(fd);

    const chunk = buffer.toString('utf-8');
    const lines = chunk.split('\n').filter(Boolean);

    // Scan from end to find last assistant message with usage
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && entry.message?.usage) {
          return {
            input_tokens: entry.message.usage.input_tokens || 0,
            cache_creation_input_tokens: entry.message.usage.cache_creation_input_tokens || 0,
            cache_read_input_tokens: entry.message.usage.cache_read_input_tokens || 0,
            output_tokens: entry.message.usage.output_tokens || 0,
            model: entry.message.model || 'unknown',
          };
        }
      } catch { /* skip malformed lines */ }
    }

    // If not found in tail chunk, fall back to full scan from end
    if (stat.size > chunkSize) {
      const content = readFileSync(filePath, 'utf-8');
      const allLines = content.split('\n').filter(Boolean);
      for (let i = allLines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(allLines[i]);
          if (entry.type === 'assistant' && entry.message?.usage) {
            return {
              input_tokens: entry.message.usage.input_tokens || 0,
              cache_creation_input_tokens: entry.message.usage.cache_creation_input_tokens || 0,
              cache_read_input_tokens: entry.message.usage.cache_read_input_tokens || 0,
              output_tokens: entry.message.usage.output_tokens || 0,
              model: entry.message.model || 'unknown',
            };
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* file read error */ }
  return null;
}

/**
 * Count assistant turns and sum output tokens.
 * Single forward pass through the file.
 */
function countTurnsAndOutput(filePath: string): { turnCount: number; cumulativeOutput: number } {
  let turnCount = 0;
  let cumulativeOutput = 0;

  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant' && entry.message?.usage) {
          turnCount++;
          cumulativeOutput += entry.message.usage.output_tokens || 0;
        }
      } catch { /* skip */ }
    }
  } catch { /* file error */ }

  return { turnCount, cumulativeOutput };
}

// ─── Budget checking ────────────────────────────────────────────────────

/**
 * Check context budget and determine action.
 *
 * Fixed thresholds (always active):
 *   50% → info (logged, no injection)
 *   67% → recommend-handoff (soft system-reminder)
 *   70% → critical-handoff (strong system-reminder)
 *
 * Each threshold fires once per session (tracked via budget-state file).
 */
export function checkBudget(sessionId?: string): BudgetCheck {
  const snapshot = measureContextUsage(sessionId);
  if (!snapshot) return { snapshot: null, action: 'none' };

  const sid = snapshot.sessionId;
  const state = loadBudgetState(sid);
  const pct = snapshot.usagePercent / 100; // normalize to 0-1

  let action: BudgetCheck['action'] = 'none';

  if (pct >= THRESHOLD_CRITICAL && !state.criticalEmitted) {
    action = 'critical-handoff';
    state.criticalEmitted = true;
    state.recommendEmitted = true; // skip recommend if we jumped straight to critical
    state.infoEmitted = true;
    saveBudgetState(sid, state);
  } else if (pct >= THRESHOLD_RECOMMEND && !state.recommendEmitted) {
    action = 'recommend-handoff';
    state.recommendEmitted = true;
    state.infoEmitted = true;
    saveBudgetState(sid, state);
  } else if (pct >= THRESHOLD_INFO && !state.infoEmitted) {
    action = 'info';
    state.infoEmitted = true;
    saveBudgetState(sid, state);
  }

  const message = action !== 'none' ? formatBudgetReminder({ snapshot, action }) : undefined;
  return { snapshot, action, message };
}

/**
 * Format the handoff recommendation as a system-reminder block.
 */
export function formatBudgetReminder(check: BudgetCheck): string {
  if (!check.snapshot) return '';
  const s = check.snapshot;
  const usedK = Math.round(s.lastTurnContext / 1000);
  const totalK = Math.round(s.contextWindowSize / 1000);
  const pct = s.usagePercent.toFixed(1);

  if (check.action === 'critical-handoff') {
    return `<system-reminder>
CONTEXT BUDGET CRITICAL: ${pct}% consumed (${usedK}K of ${totalK}K tokens).
Stop current work and create a handoff NOW: /create_handoff
Continuing risks lossy auto-compaction. A fresh session via /resume_handoff
gives you full context capacity.
</system-reminder>`;
  }

  if (check.action === 'recommend-handoff') {
    return `<system-reminder>
Context window at ${pct}% (${usedK}K of ${totalK}K tokens).
Consider wrapping up current work and creating a handoff: /create_handoff
This preserves full context for the next session.
</system-reminder>`;
  }

  return ''; // info level is logged only, not injected
}

// ─── Aggregate usage (parent + subagents) ───────────────────────────────

/**
 * Measure aggregate token usage across parent + subagents.
 * Subagent conversations are at:
 *   ~/.claude/projects/{slug}/{sessionId}/subagents/agent-{id}.jsonl
 */
export function measureAggregateUsage(sessionId?: string): AggregateTokenUsage | null {
  const sid = sessionId || process.env.CLAUDE_SESSION_ID;
  if (!sid) return null;

  const parentSnapshot = measureContextUsage(sid);
  if (!parentSnapshot) return null;

  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  if (!projectDir) return { parentSessionId: sid, parentContextPct: parentSnapshot.usagePercent, parentOutputTokens: parentSnapshot.cumulativeOutput, subagents: [], totalOutputTokens: parentSnapshot.cumulativeOutput, totalApiCalls: parentSnapshot.turnCount };

  const slug = projectDir.replace(/\//g, '-');
  const subagentDir = join(getHome(), '.claude', 'projects', slug, sid, 'subagents');

  const subagents: SubagentUsage[] = [];
  let totalOutput = parentSnapshot.cumulativeOutput;
  let totalCalls = parentSnapshot.turnCount;

  try {
    if (existsSync(subagentDir)) {
      const { readdirSync } = require('fs');
      const files = readdirSync(subagentDir).filter((f: string) => f.endsWith('.jsonl'));
      for (const file of files) {
        try {
          const agentId = file.replace('.jsonl', '');
          const agentPath = join(subagentDir, file);
          const stats = countTurnsAndOutput(agentPath);

          // Get model from last assistant message
          const lastUsage = readLastAssistantUsage(agentPath);
          subagents.push({
            agentId,
            model: lastUsage?.model || 'unknown',
            outputTokens: stats.cumulativeOutput,
            turnCount: stats.turnCount,
          });
          totalOutput += stats.cumulativeOutput;
          totalCalls += stats.turnCount;
        } catch { /* skip unreadable subagent */ }
      }
    }
  } catch { /* silent */ }

  return {
    parentSessionId: sid,
    parentContextPct: parentSnapshot.usagePercent,
    parentOutputTokens: parentSnapshot.cumulativeOutput,
    subagents,
    totalOutputTokens: totalOutput,
    totalApiCalls: totalCalls,
  };
}

/**
 * Recommend whether to delegate work to subagents based on current context usage.
 */
export function shouldDelegateToSubagent(
  parentSnapshot: ContextSnapshot | null,
  taskType: string,
): { delegate: boolean; reason: string } {
  if (!parentSnapshot) return { delegate: false, reason: 'No context data available' };

  const pct = parentSnapshot.usagePercent;

  // Heavy research/file work should always delegate when context is above 40%
  const heavyTasks = ['research', 'codebase-search', 'file-analysis', 'grep', 'implementation'];
  if (heavyTasks.includes(taskType) && pct > 40) {
    return { delegate: true, reason: `Preserve parent context (${pct.toFixed(0)}%) for synthesis; delegate ${taskType} to subagent` };
  }

  // Above 55%, delegate anything non-trivial
  if (pct > 55 && taskType !== 'simple-lookup') {
    return { delegate: true, reason: `Parent at ${pct.toFixed(0)}%; delegate to preserve orchestration capacity` };
  }

  return { delegate: false, reason: `Sufficient parent context (${pct.toFixed(0)}%) for direct work` };
}

// ─── Testing helpers ────────────────────────────────────────────────────

/** Reset module state — for testing only */
export function _resetBudgetState(sessionId: string): void {
  const path = getBudgetStatePath(sessionId);
  try {
    const { unlinkSync } = require('fs');
    if (existsSync(path)) unlinkSync(path);
  } catch { /* silent */ }
}

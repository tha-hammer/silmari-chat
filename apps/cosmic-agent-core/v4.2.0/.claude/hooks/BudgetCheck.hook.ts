#!/usr/bin/env bun
/**
 * BudgetCheck.hook.ts — Context Budget Monitor (UserPromptSubmit)
 *
 * Measures context window usage and injects handoff recommendations
 * when thresholds are crossed. Part of the v4.2.0 proactive context
 * budget system (Plan 04a).
 *
 * TRIGGER: UserPromptSubmit
 * PERFORMANCE: <10ms (reads last 16KB of conversation JSONL)
 *
 * Thresholds:
 *   50% → info (logged to stderr, no injection)
 *   67% → recommend-handoff (soft system-reminder)
 *   70% → critical-handoff (strong system-reminder)
 *
 * Each threshold fires ONCE per session (state in budget-state-{sessionId}.json).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_DIR = process.env.AAI_DIR || join(process.env.HOME!, '.claude');
const STATE_DIR = join(BASE_DIR, 'MEMORY', 'STATE');

// ─── Types ─────────────────────────────────────────────────

interface BudgetState {
  infoEmitted: boolean;
  recommendEmitted: boolean;
  criticalEmitted: boolean;
}

interface BudgetCheck {
  usagePercent: number;
  action: 'none' | 'info' | 'recommend-handoff' | 'critical-handoff';
  message?: string;
}

// ─── Thresholds ────────────────────────────────────────────

const THRESHOLD_INFO = 50;
const THRESHOLD_RECOMMEND = 67;
const THRESHOLD_CRITICAL = 70;

// ─── State Management ──────────────────────────────────────

function getStatePath(sessionId: string): string {
  return join(STATE_DIR, `budget-state-${sessionId}.json`);
}

function loadBudgetState(sessionId: string): BudgetState {
  const path = getStatePath(sessionId);
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }
  } catch {}
  return { infoEmitted: false, recommendEmitted: false, criticalEmitted: false };
}

function saveBudgetState(sessionId: string, state: BudgetState): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(getStatePath(sessionId), JSON.stringify(state));
  } catch {}
}

// ─── Budget Check Logic ────────────────────────────────────

function checkBudget(sessionId: string): BudgetCheck {
  try {
    const { measureContextUsage } = require('./lib/context-budget');
    const snapshot = measureContextUsage(sessionId);
    if (!snapshot) return { usagePercent: 0, action: 'none' };

    const state = loadBudgetState(sessionId);
    const pct = snapshot.usagePercent;

    // Critical threshold (70%)
    if (pct >= THRESHOLD_CRITICAL && !state.criticalEmitted) {
      state.criticalEmitted = true;
      saveBudgetState(sessionId, state);

      // Emit event
      try {
        const { getEventBus } = require('./lib/event-bus');
        getEventBus().emit({
          type: 'budget.handoff-critical',
          sessionId,
          usagePercent: pct,
          turnCount: snapshot.turnCount,
          model: snapshot.model,
        });
      } catch {}

      return {
        usagePercent: pct,
        action: 'critical-handoff',
        message: formatCriticalReminder(pct, snapshot.lastTurnContext, snapshot.contextWindowSize),
      };
    }

    // Recommend threshold (67%)
    if (pct >= THRESHOLD_RECOMMEND && !state.recommendEmitted) {
      state.recommendEmitted = true;
      saveBudgetState(sessionId, state);

      // Emit event
      try {
        const { getEventBus } = require('./lib/event-bus');
        getEventBus().emit({
          type: 'budget.handoff-recommended',
          sessionId,
          usagePercent: pct,
          turnCount: snapshot.turnCount,
          model: snapshot.model,
        });
      } catch {}

      // Try to get prediction context
      let predictionNote = '';
      try {
        const { predictWorkflowBudget, detectWorkflowType } = require('./lib/workflow-budget');
        const wfType = detectWorkflowType(sessionId);
        const prediction = predictWorkflowBudget(wfType, snapshot.model);
        if (prediction) {
          predictionNote = `\nSessions like this typically consume ${prediction.estimatedContextPct.toFixed(0)}% total.`;
        }
      } catch {}

      return {
        usagePercent: pct,
        action: 'recommend-handoff',
        message: formatRecommendReminder(pct, snapshot.lastTurnContext, snapshot.contextWindowSize, predictionNote),
      };
    }

    // Info threshold (50%)
    if (pct >= THRESHOLD_INFO && !state.infoEmitted) {
      state.infoEmitted = true;
      saveBudgetState(sessionId, state);

      try {
        const { getEventBus } = require('./lib/event-bus');
        getEventBus().emit({
          type: 'budget.info',
          sessionId,
          usagePercent: pct,
          turnCount: snapshot.turnCount,
          model: snapshot.model,
        });
      } catch {}

      console.error(`[BudgetCheck] Context at ${pct.toFixed(0)}% (${(snapshot.lastTurnContext / 1000).toFixed(0)}K tokens)`);
      return { usagePercent: pct, action: 'info' };
    }

    return { usagePercent: pct, action: 'none' };
  } catch {
    return { usagePercent: 0, action: 'none' };
  }
}

// ─── Reminder Formatters ───────────────────────────────────

function formatRecommendReminder(pct: number, tokens: number, windowSize: number, predictionNote: string): string {
  return `<system-reminder>
Context window at ${pct.toFixed(0)}% (${(tokens / 1000).toFixed(0)}K of ${(windowSize / 1000).toFixed(0)}K tokens).${predictionNote}
Consider wrapping up current work and creating a handoff: /create_handoff
This preserves full context for the next session.
</system-reminder>`;
}

function formatCriticalReminder(pct: number, tokens: number, windowSize: number): string {
  return `<system-reminder>
CONTEXT BUDGET CRITICAL: ${pct.toFixed(0)}% consumed (${(tokens / 1000).toFixed(0)}K of ${(windowSize / 1000).toFixed(0)}K tokens).
Stop current work and create a handoff NOW: /create_handoff
Continuing risks lossy auto-compaction. A fresh session via /resume_handoff
gives you full context capacity.
</system-reminder>`;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.error('[BudgetCheck] No CLAUDE_SESSION_ID — skipping');
    process.exit(0);
  }

  // Read stdin (required by hook protocol) but we don't need the content
  try {
    await Promise.race([
      Bun.stdin.text(),
      new Promise<string>((_, reject) => setTimeout(() => reject('timeout'), 500))
    ]);
  } catch {}

  const result = checkBudget(sessionId);

  if (result.message) {
    // Inject system-reminder into stdout for Claude to see
    console.log(result.message);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));

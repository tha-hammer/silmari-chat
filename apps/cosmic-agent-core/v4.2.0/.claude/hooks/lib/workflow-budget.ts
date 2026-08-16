/**
 * Workflow Budget — v4.2.0
 *
 * Layer 2: Workflow profiling, prediction, and aggregate usage tracking.
 * Stores historical session metrics in beads for cross-session prediction.
 *
 * Behaviors:
 * - B2: Record session profile at SessionEnd
 * - B5: Predict workflow budget from historical profiles
 * - B6: Measure aggregate token usage across session tree
 * - B7: Recommend subagent delegation
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { isBeadsAvailable, brCreate, brList, brUpdate } from './beads-index';
import { ensureBeadsWorkspace } from './beads-init';
import { parseFrontmatter } from './prd-utils';
import { paiPath } from './paths';
import { measureContextUsage, getConversationPath, type ContextSnapshot } from './context-budget';

// ─── Types ─────────────────────────────────────────────────

export interface SessionEndProfile {
  sessionId: string;
  workflowType: string;
  phase?: string;
  model: string;
  contextWindowSize: number;
  finalUsagePercent: number;
  turnCount: number;
  cumulativeOutput: number;
  durationMinutes: number;
  subagentsSpawned: number;
  filesChanged: number;
  handoffTriggered: boolean;
  timestamp: string;
}

export interface WorkflowPrediction {
  estimatedContextPct: number;
  estimatedTurns: number;
  confidence: number;
  recommendation: 'proceed' | 'plan-subagents' | 'plan-handoff';
  historicalCount: number;
  p75ContextPct: number;
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
  durationMs: number;
}

// ─── Workflow Type Detection ───────────────────────────────

/**
 * Detect the workflow type for the current session.
 * Checks current-work state file and PRD frontmatter if available.
 */
export function detectWorkflowType(sessionId?: string): string {
  try {
    const stateDir = paiPath('MEMORY', 'STATE');
    const sid = sessionId || process.env.CLAUDE_SESSION_ID;
    const candidates = sid
      ? [join(stateDir, `current-work-${sid}.json`), join(stateDir, 'current-work.json')]
      : [join(stateDir, 'current-work.json')];

    for (const f of candidates) {
      if (!existsSync(f)) continue;
      const state = JSON.parse(readFileSync(f, 'utf-8'));
      if (state.prd_path && existsSync(state.prd_path)) {
        const content = readFileSync(state.prd_path, 'utf-8');
        const fm = parseFrontmatter(content);
        return fm?.mode || 'algorithm';
      }
      return 'native';
    }
  } catch {}
  return 'native';
}

// ─── Behavior 2: Record Session Profile ────────────────────

/**
 * Record the final context snapshot for this session into beads.
 * Stored as note:state kind:budget-profile with workflow and model labels.
 */
export function recordSessionProfile(profile: SessionEndProfile): void {
  if (!isBeadsAvailable()) return;
  if (!ensureBeadsWorkspace()) return;

  try {
    const labels = [
      'note:state',
      'kind:budget-profile',
      `workflow:${profile.workflowType}`,
      `model:${profile.model}`,
    ].join(',');

    const id = brCreate({
      title: `Session profile: ${profile.workflowType} (${profile.finalUsagePercent.toFixed(0)}%)`,
      type: 'docs',
      labels,
      description: `session: ${profile.sessionId}\nworkflow: ${profile.workflowType}\nmodel: ${profile.model}`,
    });

    if (id) {
      brUpdate(id, { notes: JSON.stringify(profile) });
    }
  } catch {
    // Silent — profile recording is non-critical
  }
}

// ─── Behavior 5: Predict Workflow Budget ───────────────────

/**
 * Predict context consumption for a workflow type based on historical profiles.
 * Returns null when insufficient history (<3 sessions).
 */
export function predictWorkflowBudget(
  workflowType: string,
  model: string,
  phase?: string
): WorkflowPrediction | null {
  if (!isBeadsAvailable()) return null;

  try {
    const profiles = brList({
      labels: ['kind:budget-profile', `workflow:${workflowType}`, `model:${model}`],
      limit: 50,
      sort: 'created_at',
      reverse: true,
    });

    if (profiles.length < 3) return null;

    // Parse stored profiles
    const parsed: SessionEndProfile[] = profiles
      .map((p: any) => {
        try { return JSON.parse(p.notes || '{}'); } catch { return null; }
      })
      .filter((p: any): p is SessionEndProfile => p !== null && typeof p.finalUsagePercent === 'number');

    if (parsed.length < 3) return null;

    // Compute statistics
    const usages = parsed.map(p => p.finalUsagePercent).sort((a, b) => a - b);
    const turns = parsed.map(p => p.turnCount);

    const mean = usages.reduce((s, v) => s + v, 0) / usages.length;
    const p75Index = Math.floor(usages.length * 0.75);
    const p75 = usages[p75Index] || mean;

    const meanTurns = turns.reduce((s, v) => s + v, 0) / turns.length;

    // Confidence based on sample size and variance
    const variance = usages.reduce((s, v) => s + (v - mean) ** 2, 0) / usages.length;
    const stdDev = Math.sqrt(variance);
    const sampleConfidence = Math.min(1, parsed.length / 25);  // full confidence at 25+
    const stabilityConfidence = Math.max(0, 1 - (stdDev / 50));  // penalize high variance
    const confidence = sampleConfidence * 0.6 + stabilityConfidence * 0.4;

    // Recommendation
    let recommendation: WorkflowPrediction['recommendation'] = 'proceed';
    if (p75 > 70) recommendation = 'plan-handoff';
    else if (p75 > 50) recommendation = 'plan-subagents';

    return {
      estimatedContextPct: mean,
      estimatedTurns: Math.round(meanTurns),
      confidence: Math.round(confidence * 100) / 100,
      recommendation,
      historicalCount: parsed.length,
      p75ContextPct: p75,
    };
  } catch {
    return null;
  }
}

/**
 * Compare actual session metrics against a prediction.
 */
export function measurePredictionAccuracy(
  prediction: WorkflowPrediction,
  actual: SessionEndProfile
): { errorPct: number; withinP75: boolean } {
  const errorPct = Math.abs(prediction.estimatedContextPct - actual.finalUsagePercent);
  const withinP75 = actual.finalUsagePercent <= prediction.p75ContextPct;
  return { errorPct, withinP75 };
}

// ─── Behavior 6: Aggregate Usage ───────────────────────────

/**
 * Measure aggregate token usage across parent + subagent conversations.
 */
export function measureAggregateUsage(sessionId?: string): AggregateTokenUsage | null {
  const sid = sessionId || process.env.CLAUDE_SESSION_ID;
  if (!sid) return null;

  const parentSnapshot = measureContextUsage(sid);
  if (!parentSnapshot) return null;

  const subagents: SubagentUsage[] = [];
  let totalOutput = parentSnapshot.cumulativeOutput;
  let totalCalls = parentSnapshot.turnCount;

  // Find subagent conversations
  const convPath = getConversationPath(sid);
  if (convPath) {
    const sessionDir = convPath.replace('.jsonl', '');
    const subagentDir = join(sessionDir, 'subagents');
    if (existsSync(subagentDir)) {
      try {
        const files = readdirSync(subagentDir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'));
        for (const file of files) {
          const usage = measureSubagentUsage(join(subagentDir, file));
          if (usage) {
            subagents.push(usage);
            totalOutput += usage.outputTokens;
            totalCalls += usage.turnCount;
          }
        }
      } catch {}
    }
  }

  return {
    parentSessionId: sid,
    parentContextPct: parentSnapshot.usagePercent,
    parentOutputTokens: parentSnapshot.cumulativeOutput,
    subagents,
    totalOutputTokens: totalOutput,
    totalApiCalls: totalCalls,
  };
}

function measureSubagentUsage(jsonlPath: string): SubagentUsage | null {
  try {
    const content = readFileSync(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    let outputTokens = 0;
    let turnCount = 0;
    let model = '';

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant' && entry.message?.usage) {
          outputTokens += entry.message.usage.output_tokens || 0;
          turnCount++;
          if (entry.message.model) model = entry.message.model;
        }
      } catch {}
    }

    const agentId = jsonlPath.split('/').pop()?.replace('.jsonl', '') || 'unknown';

    return {
      agentId,
      model,
      outputTokens,
      turnCount,
      durationMs: 0, // not easily derivable from JSONL
    };
  } catch {
    return null;
  }
}

// ─── Behavior 7: Subagent Delegation ───────────────────────

/**
 * Recommend whether to delegate work to a subagent.
 */
export function shouldDelegateToSubagent(
  parentSnapshot: ContextSnapshot,
  taskType: string,
  prediction?: WorkflowPrediction | null
): { delegate: boolean; reason: string } {
  // High context usage → always recommend delegation
  if (parentSnapshot.usagePercent > 50) {
    return { delegate: true, reason: 'Parent context above 50% — preserve for orchestration' };
  }

  // Heavy task types → recommend delegation
  const heavyTasks = ['research', 'file-analysis', 'implementation', 'codebase-search'];
  if (heavyTasks.includes(taskType.toLowerCase())) {
    return { delegate: true, reason: `${taskType} is file-heavy — delegate to preserve parent context` };
  }

  // Prediction says this workflow type typically exhausts context
  if (prediction && prediction.p75ContextPct > 60) {
    return { delegate: true, reason: `Historical data: ${prediction.p75ContextPct}% typical usage — plan early delegation` };
  }

  // Low usage + simple task → keep in parent
  if (parentSnapshot.usagePercent < 30) {
    return { delegate: false, reason: 'Sufficient parent context for direct work' };
  }

  return { delegate: false, reason: 'Default: work in parent context' };
}

/**
 * Retrieval Modes — v4.2.0
 *
 * Implements spec §16.3 retrieval modes: active-work, failure-aware,
 * preference-aware, deep-recall, and exploratory.
 *
 * v4.1.0 covered active-work + basic failure/preference.
 * v4.2.0 adds deep-recall (graph traversal) and exploratory (neighbor discovery).
 *
 * Behaviors:
 * - B1: Deep Recall traversal (br dep tree --max-depth 3, 200ms budget)
 * - B2: Exploratory retrieval (neighboring topics/hubs)
 * - B3: Ranking by spec §16.4 precedence
 * - B4: Token-budget-aware bundle trimming
 * - B7: ContextSearch mode selection
 */

import { isBeadsAvailable, brList, brSearchTerm } from './beads-index';
import { execFileSync } from 'child_process';
import { getBeadsDir } from './beads-init';
import { join } from 'path';
import { attachProvenance, renderContextBundle, type ProvenancedFragment, type ContextBundle } from './context-provenance';

// ─── Types ─────────────────────────────────────────────────

export type RetrievalMode = 'active-work' | 'failure-aware' | 'preference-aware' | 'deep-recall' | 'explore';

export interface RetrievalSeed {
  mode: RetrievalMode;
  workSlug?: string;
  labels?: string[];
  currentPhase?: string;
  tokenBudget?: number;
  topic?: string;
}

export interface RetrievedFragment {
  id: string;
  title: string;
  kind: string;
  noteClass: string;
  score: number;
  summary: string;
  labels?: string[];
  created_at?: string;
  description?: string;
}

export interface BundleItem {
  fragment: ProvenancedFragment;
  tokenEstimate: number;
  type: 'core' | 'expansion';
}

// ─── Ranking Weights (spec §16.4) ──────────────────────────

const WEIGHTS = {
  directRelation: 10,
  workflowMatch: 8,
  phaseRelevance: 6,
  graphProximity: 5,
  signalStrength: 4,
  permanence: 3,
  recency: 2,
  confidence: 1,
};

// ─── Behavior 1: Deep Recall ───────────────────────────────

/**
 * Deep Recall: graph-near prior work, decisions, failures, permanent notes.
 * Uses `br dep tree --max-depth 3` with a 200ms traversal budget.
 * Falls back to label-based queries on failure or timeout.
 */
export function retrieveDeepRecall(seed: RetrievalSeed): RetrievedFragment[] {
  if (!isBeadsAvailable()) return [];

  const fragments: RetrievedFragment[] = [];

  // Try graph traversal first
  try {
    if (seed.workSlug) {
      const rootId = findWorkItemId(seed.workSlug);
      if (rootId) {
        const neighbors = traverseGraph(rootId, 3, 200);
        for (const n of neighbors) {
          fragments.push({
            id: n.id,
            title: n.title || '',
            kind: extractKind(n.labels || []),
            noteClass: extractNoteClass(n.labels || []),
            score: 0,
            summary: n.description || n.title || '',
            labels: n.labels,
            created_at: n.created_at,
            description: n.description,
          });
        }
      }
    }
  } catch {
    // Graph traversal failed — fall through to label queries
  }

  // Supplement with label-based queries
  if (fragments.length < 5) {
    try {
      const decisions = brList({ labels: ['kind:decision'], limit: 5, sort: 'created_at', reverse: true });
      const failures = brList({ labels: ['kind:failure-pattern'], limit: 5, sort: 'created_at', reverse: true });
      const permanents = brList({ labels: ['note:permanent'], limit: 5, sort: 'created_at', reverse: true });

      for (const items of [decisions, failures, permanents]) {
        for (const item of items) {
          if (!fragments.some(f => f.id === item.id)) {
            fragments.push({
              id: item.id,
              title: item.title || '',
              kind: extractKind(item.labels || []),
              noteClass: extractNoteClass(item.labels || []),
              score: 0,
              summary: item.description || '',
              labels: item.labels,
              created_at: item.created_at,
              description: item.description,
            });
          }
        }
      }
    } catch {
      // Silent fallback
    }
  }

  return rankFragments(fragments, seed);
}

// ─── Behavior 2: Exploratory Retrieval ─────────────────────

/**
 * Exploratory: neighboring topics, workflows, customers, and hubs
 * that are not directly linked to the current work item.
 */
export function retrieveExploratory(seed: RetrievalSeed): RetrievedFragment[] {
  if (!isBeadsAvailable()) return [];

  const fragments: RetrievedFragment[] = [];

  try {
    // Get structure hubs (workflow-map, topic-hub, customer-map)
    const hubs = brList({ labels: ['note:structure'], limit: 10, sort: 'updated_at', reverse: true });
    for (const hub of hubs) {
      fragments.push({
        id: hub.id,
        title: hub.title || '',
        kind: extractKind(hub.labels || []),
        noteClass: 'structure',
        score: 0,
        summary: hub.description || '',
        labels: hub.labels,
        created_at: hub.created_at,
        description: hub.description,
      });
    }

    // If topic provided, search for related content
    if (seed.topic) {
      const related = brSearchTerm(seed.topic, 10);
      for (const item of related) {
        if (!fragments.some(f => f.id === item.id)) {
          fragments.push({
            id: item.id,
            title: item.title || '',
            kind: extractKind(item.labels || []),
            noteClass: extractNoteClass(item.labels || []),
            score: 0,
            summary: item.description || '',
            labels: item.labels,
            created_at: item.created_at,
            description: item.description,
          });
        }
      }
    }
  } catch {
    // Silent
  }

  return rankFragments(fragments, seed);
}

// ─── Behavior 3: Ranking ───────────────────────────────────

/**
 * Rank fragments by spec §16.4 precedence.
 * Weighted scoring: direct relation > workflow match > phase relevance >
 * graph proximity > signal strength > permanence > recency > confidence.
 */
export function rankFragments(candidates: RetrievedFragment[], seed: RetrievalSeed): RetrievedFragment[] {
  return candidates
    .map(c => ({ ...c, score: computeScore(c, seed) }))
    .sort((a, b) => b.score - a.score);
}

function computeScore(fragment: RetrievedFragment, seed: RetrievalSeed): number {
  let score = 0;
  const labels = fragment.labels || [];

  // Direct relation: linked to current work
  if (seed.workSlug && fragment.description?.includes(seed.workSlug)) {
    score += WEIGHTS.directRelation;
  }

  // Workflow match: same workflow label
  if (seed.labels) {
    for (const sl of seed.labels) {
      if (labels.includes(sl)) score += WEIGHTS.workflowMatch;
    }
  }

  // Phase relevance: matches current phase
  if (seed.currentPhase) {
    if (labels.some(l => l === `phase:${seed.currentPhase}`)) {
      score += WEIGHTS.phaseRelevance;
    }
  }

  // Permanence: permanent notes ranked higher than extracts
  if (labels.includes('note:permanent')) score += WEIGHTS.permanence;
  if (labels.includes('note:structure')) score += WEIGHTS.permanence - 1;

  // Recency: newer items score higher
  if (fragment.created_at) {
    const age = Date.now() - new Date(fragment.created_at).getTime();
    const ONE_DAY = 86400000;
    if (age < ONE_DAY) score += WEIGHTS.recency * 2;
    else if (age < 7 * ONE_DAY) score += WEIGHTS.recency;
    else if (age < 30 * ONE_DAY) score += WEIGHTS.recency * 0.5;
  }

  // Confidence
  if (labels.includes('confidence:high')) score += WEIGHTS.confidence;

  return score;
}

// ─── Behavior 4: Bundle Trimming ───────────────────────────

/**
 * Trim a ranked bundle to fit within a token budget.
 * Core fragments are retained; expansion fragments are dropped first.
 */
export function trimBundleToBudget(items: BundleItem[], budget: number): BundleItem[] {
  // Sort: core first, then by score descending
  const sorted = [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'core' ? -1 : 1;
    return b.fragment.score - a.fragment.score;
  });

  const result: BundleItem[] = [];
  let totalTokens = 0;

  for (const item of sorted) {
    if (totalTokens + item.tokenEstimate <= budget) {
      result.push(item);
      totalTokens += item.tokenEstimate;
    }
  }

  return result;
}

// ─── Behavior 7: Mode Resolution ───────────────────────────

/**
 * Resolve a context search mode string to a valid RetrievalMode.
 * Invalid or unknown modes fall back to 'active-work'.
 */
export function resolveContextMode(mode?: string): RetrievalMode {
  const validModes: RetrievalMode[] = ['active-work', 'failure-aware', 'preference-aware', 'deep-recall', 'explore'];
  if (mode && validModes.includes(mode as RetrievalMode)) {
    return mode as RetrievalMode;
  }
  return 'active-work';
}

/**
 * Execute retrieval for a given mode and seed.
 */
export function retrieve(seed: RetrievalSeed): RetrievedFragment[] {
  switch (seed.mode) {
    case 'deep-recall':
      return retrieveDeepRecall(seed);
    case 'explore':
      return retrieveExploratory(seed);
    case 'failure-aware':
      return brList({ labels: ['kind:failure-pattern'], limit: 10, sort: 'created_at', reverse: true })
        .map(item => ({
          id: item.id, title: item.title || '', kind: 'failure-pattern',
          noteClass: 'extract', score: 0, summary: item.description || '',
          labels: item.labels, created_at: item.created_at, description: item.description,
        }));
    case 'preference-aware':
      return brList({ labels: ['kind:preference', 'confidence:high'], limit: 10 })
        .map(item => ({
          id: item.id, title: item.title || '', kind: 'preference',
          noteClass: 'extract', score: 0, summary: item.description || '',
          labels: item.labels, created_at: item.created_at, description: item.description,
        }));
    case 'active-work':
    default:
      return brList({ labels: ['note:artifact', 'kind:prd'], status: 'open', limit: 10 })
        .map(item => ({
          id: item.id, title: item.title || '', kind: 'prd',
          noteClass: 'artifact', score: 0, summary: item.description || '',
          labels: item.labels, created_at: item.created_at, description: item.description,
        }));
  }
}

/**
 * Assemble a full context bundle: retrieve → rank → provenance → trim → render.
 */
export function assembleContextBundle(seed: RetrievalSeed): ContextBundle {
  const raw = retrieve(seed);
  const ranked = rankFragments(raw, seed);

  const provenanced = ranked.map(f =>
    attachProvenance(f, `${seed.mode} retrieval: ${f.kind} ranked #${ranked.indexOf(f) + 1}`)
  );

  const items: BundleItem[] = provenanced.map(f => ({
    fragment: f,
    tokenEstimate: estimateTokens(f.summary),
    type: 'core' as const,
  }));

  const trimmed = seed.tokenBudget
    ? trimBundleToBudget(items, seed.tokenBudget)
    : items;

  return {
    mode: seed.mode,
    fragments: trimmed.map(i => i.fragment),
    totalTokenEstimate: trimmed.reduce((sum, i) => sum + i.tokenEstimate, 0),
    assembledAt: new Date().toISOString(),
  };
}

// ─── Graph Traversal Helper ────────────────────────────────

function traverseGraph(rootId: string, maxDepth: number, timeoutMs: number): any[] {
  try {
    const result = execFileSync('br', [
      'dep', 'tree', rootId,
      '--max-depth', String(maxDepth),
      '--json',
      '--db', join(getBeadsDir(), 'beads.db'),
    ], {
      timeout: timeoutMs,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(result);
    return parsed.nodes || parsed || [];
  } catch {
    return [];
  }
}

function findWorkItemId(slug: string): string | null {
  try {
    const items = brList({
      labels: ['note:artifact', 'kind:prd'],
      descContains: slug,
      limit: 1,
    });
    return items.length > 0 ? items[0].id : null;
  } catch {
    return null;
  }
}

// ─── Utility Helpers ───────────────────────────────────────

function extractKind(labels: string[]): string {
  for (const l of labels) {
    if (l.startsWith('kind:')) return l.replace('kind:', '');
  }
  return 'unknown';
}

function extractNoteClass(labels: string[]): string {
  for (const l of labels) {
    if (l.startsWith('note:')) return l.replace('note:', '');
  }
  return 'extract';
}

function estimateTokens(text: string): number {
  return Math.ceil((text?.length || 0) / 4);
}

/**
 * Permanent Notes — v4.2.0
 *
 * Implements spec §11.3 Permanent Knowledge Objects and §13.6 promotion policy.
 * Permanent notes are provenance-grounded generalizations promoted from validated
 * extract clusters. They are never silently synthesized — ambiguous or contradictory
 * clusters require human review.
 *
 * Lifecycle: extract cluster → eligibility check → promotion (or review-needed)
 * Integration: Called from IntegrityCheck.hook.ts at SessionEnd
 */

import { isBeadsAvailable, brCreate, brUpdate, brList, brDepAdd, brClose } from './beads-index';
import { ensureBeadsWorkspace } from './beads-init';

// ─── Types ─────────────────────────────────────────────────

export interface ExtractNode {
  id: string;
  title: string;
  kind: string;
  labels: string[];
  confidence?: number;
  description?: string;
  created_at?: string;
}

export interface ExtractCluster {
  sources: ExtractNode[];
  sharedKind: string;
  sharedLabel?: string;       // e.g., 'workflow:auth-review', 'entity:acme-co'
  hasContradictions: boolean;
  confidence: number;         // average confidence of sources
}

export type PromotionResult =
  | { status: 'created'; id: string }
  | { status: 'review-needed'; reason: string }
  | { status: 'skipped'; reason: string };

export interface PermanentNote {
  id: string;
  title: string;
  labels: string[];
  sourceIds: string[];
}

export interface ReplacementResult {
  newId: string;
  oldId: string;
  supersededAt: string;
}

// ─── Constants ─────────────────────────────────────────────

const MIN_CLUSTER_SIZE = 2;
const MIN_CONFIDENCE = 0.6;

// ─── Eligibility ───────────────────────────────────────────

/**
 * Behavior 1: Determine if an extract cluster qualifies for permanent-note promotion.
 *
 * Requirements:
 * - At least MIN_CLUSTER_SIZE sources
 * - All sources have provenance (non-empty description)
 * - No unresolved contradictions
 * - Average confidence above threshold
 */
export function isPermanentCandidate(cluster: ExtractCluster): boolean {
  if (cluster.sources.length < MIN_CLUSTER_SIZE) return false;
  if (cluster.hasContradictions) return false;
  if (cluster.confidence < MIN_CONFIDENCE) return false;

  // All sources must have provenance
  const allHaveProvenance = cluster.sources.every(
    s => s.description && s.description.trim().length > 0
  );
  if (!allHaveProvenance) return false;

  return true;
}

// ─── Promotion ─────────────────────────────────────────────

/**
 * Behavior 2: Promote a validated cluster into a note:permanent node.
 * Behavior 3: Return review-needed for ambiguous clusters.
 *
 * Creates a permanent note with:
 * - title: one-line principle derived from cluster
 * - labels: note:permanent, kind:{sharedKind}, plus shared label if any
 * - notes: compact synthesized text (max 500 chars)
 * - derived-from edges to all source extracts
 */
export function promotePermanentNote(cluster: ExtractCluster): PromotionResult {
  if (!isBeadsAvailable()) return { status: 'skipped', reason: 'beads unavailable' };
  if (!ensureBeadsWorkspace()) return { status: 'skipped', reason: 'workspace init failed' };

  if (!isPermanentCandidate(cluster)) {
    if (cluster.hasContradictions) {
      return { status: 'review-needed', reason: `Contradictory sources: ${cluster.sources.map(s => s.id).join(', ')}` };
    }
    return { status: 'review-needed', reason: 'Cluster does not meet promotion criteria' };
  }

  // Synthesize title from cluster
  const title = synthesizeTitle(cluster);

  // Build labels
  const labels = [
    'note:permanent',
    `kind:${cluster.sharedKind}`,
    cluster.sharedLabel || null,
  ].filter(Boolean).join(',');

  // Build provenance summary
  const provenanceSummary = cluster.sources
    .map(s => `[${s.id}] ${s.title.slice(0, 60)}`)
    .join('; ');

  // Synthesize compact body
  const body = synthesizeBody(cluster).slice(0, 500);

  const id = brCreate({
    title: title.slice(0, 200),
    type: 'docs',
    labels,
    description: `Promoted from ${cluster.sources.length} sources: ${provenanceSummary.slice(0, 300)}`,
  });

  if (!id) return { status: 'skipped', reason: 'brCreate failed' };

  // Set notes with synthesized body
  brUpdate(id, { notes: body });

  // Link to all source extracts
  for (const source of cluster.sources) {
    brDepAdd(id, source.id, 'derived-from');
  }

  return { status: 'created', id };
}

/**
 * Behavior 6: Supersede an existing permanent note with an improved replacement.
 * The old note remains queryable — the new note links with 'supersedes'.
 */
export function promoteReplacement(
  oldNote: PermanentNote,
  cluster: ExtractCluster
): ReplacementResult | PromotionResult {
  const result = promotePermanentNote(cluster);
  if (result.status !== 'created') return result;

  // Add supersedes edge from new to old
  brDepAdd(result.id, oldNote.id, 'supersedes');

  return {
    newId: result.id,
    oldId: oldNote.id,
    supersededAt: new Date().toISOString(),
  };
}

// ─── Clustering ────────────────────────────────────────────

/**
 * Gather recent extracts from beads and group into candidate clusters.
 * Called at SessionEnd from IntegrityCheck.
 */
export function gatherExtractClusters(limit: number = 50): ExtractCluster[] {
  if (!isBeadsAvailable()) return [];

  try {
    const extracts = brList({
      labels: ['note:extract'],
      limit,
      sort: 'created_at',
      reverse: true,
    });

    if (extracts.length < MIN_CLUSTER_SIZE) return [];

    // Group by shared kind + shared label prefix
    const groups = new Map<string, ExtractNode[]>();
    for (const e of extracts) {
      const labels: string[] = e.labels || [];
      const kind = labels.find((l: string) => l.startsWith('kind:'))?.replace('kind:', '') || 'unknown';

      // Group by kind + any workflow/entity label
      const groupLabel = labels.find((l: string) =>
        l.startsWith('workflow:') || l.startsWith('entity:') || l.startsWith('topic:')
      ) || '';
      const key = `${kind}:${groupLabel}`;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        id: e.id,
        title: e.title || '',
        kind,
        labels,
        description: e.description,
        created_at: e.created_at,
      });
    }

    // Convert groups to clusters (only groups with enough members)
    const clusters: ExtractCluster[] = [];
    for (const [key, nodes] of groups) {
      if (nodes.length < MIN_CLUSTER_SIZE) continue;
      const [kind, label] = key.split(':');

      clusters.push({
        sources: nodes,
        sharedKind: kind,
        sharedLabel: label || undefined,
        hasContradictions: detectContradictions(nodes),
        confidence: nodes.reduce((sum, n) => sum + (n.confidence || 0.5), 0) / nodes.length,
      });
    }

    return clusters;
  } catch {
    return [];
  }
}

// ─── Helpers ───────────────────────────────────────────────

function synthesizeTitle(cluster: ExtractCluster): string {
  // Use the most common title pattern or the first source's title
  if (cluster.sources.length === 0) return 'Untitled permanent note';
  // Simple: use the first source's title as the basis
  return cluster.sources[0].title;
}

function synthesizeBody(cluster: ExtractCluster): string {
  const parts = [
    `Synthesized from ${cluster.sources.length} ${cluster.sharedKind} extracts.`,
  ];
  for (const s of cluster.sources.slice(0, 5)) {
    parts.push(`- ${s.title.slice(0, 80)}`);
  }
  if (cluster.sources.length > 5) {
    parts.push(`... and ${cluster.sources.length - 5} more`);
  }
  return parts.join('\n');
}

function detectContradictions(nodes: ExtractNode[]): boolean {
  // Simple heuristic: check for "correction", "actually", "not anymore" in titles
  const contradictionPatterns = /\b(correction|actually|not anymore|contradicts|override|reversal)\b/i;
  return nodes.some(n => contradictionPatterns.test(n.title));
}

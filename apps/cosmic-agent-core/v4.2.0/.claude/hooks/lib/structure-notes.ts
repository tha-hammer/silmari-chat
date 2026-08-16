/**
 * structure-notes.ts — v4.2.0 Structure Notes (Zettelkasten Navigation Layer)
 *
 * Implements spec §11.4 Structure Objects: workflow-map, customer-map,
 * topic-hub, and project-hub notes that provide navigable graph neighborhoods.
 *
 * Behaviors covered:
 * - B4: Create/upsert structure notes for workflows, customers, topics
 * - B5: Link permanent notes and structure notes into navigable neighborhoods
 * - B7: Render compact structure summaries for viewer and retrieval
 *
 * Spec: §§11.4, 14.1, 14.2, 14.3
 */

import { isBeadsAvailable, brCreate, brUpdate, brList, brDepAdd } from './beads-index';
import { ensureBeadsWorkspace } from './beads-init';
import type { PermanentNote } from './permanent-notes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StructureKind = 'workflow-map' | 'customer-map' | 'topic-hub' | 'project-hub';

export interface StructureNote {
  id: string;
  kind: StructureKind;
  label: string;
  title: string;
  linkedIds: string[];
}

export interface LinkInput {
  permanentNotes: Array<{ id: string; title: string }>;
  structureNotes: StructureNote[];
  workflowLabel?: string;
  customerLabel?: string;
}

export interface StructureSummaryInput extends StructureNote {
  linkedPermanentNotes?: Array<{ title: string }>;
  linkedFailures?: string[];
  linkedLearnings?: string[];
}

// ---------------------------------------------------------------------------
// Behavior 4: Create/upsert structure notes
// ---------------------------------------------------------------------------

/**
 * Create or update a structure note for a workflow, customer, topic, or project.
 *
 * Uses label-based upsert key. Accepts duplicate race risk under concurrent
 * sessions — reconciled by integrity/drift paths per v4.1.0 concurrency policy.
 */
export function upsertStructureNote(kind: StructureKind, label: string): string | null {
  if (!isBeadsAvailable()) return null;
  if (!ensureBeadsWorkspace()) return null;

  const title = formatStructureTitle(kind, label);
  const kindPrefix = kind.split('-')[0]; // workflow, customer, topic, project
  const labels = `note:structure,kind:${kind},${kindPrefix}:${label}`;

  // Upsert: check for existing structure note with same kind + label
  const existing = brList({
    labels: ['note:structure', `kind:${kind}`],
    descContains: label,
    limit: 1,
  });

  if (existing.length > 0) {
    // Update labels in case schema evolved
    brUpdate(existing[0].id, { labels });
    return existing[0].id;
  }

  // Create new structure note
  const id = brCreate({
    title,
    type: 'docs',
    labels,
    description: `Structure hub for ${kind}: ${label}`,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Behavior 5: Link notes into navigable graph neighborhoods
// ---------------------------------------------------------------------------

/**
 * Create graph edges between permanent notes, structure notes, and related entities.
 *
 * Edge types per spec §14.4:
 * - belongs-to-workflow: any note → workflow-map hub
 * - belongs-to-customer: any note → customer-map hub
 * - supports: permanent note → topic-hub or project-hub
 */
export function linkHigherOrderNotes(input: LinkInput): void {
  if (!isBeadsAvailable()) return;

  for (const pn of input.permanentNotes) {
    for (const sn of input.structureNotes) {
      const edgeType = getEdgeType(sn.kind, input);
      brDepAdd(pn.id, sn.id, edgeType);
    }
  }
}

// ---------------------------------------------------------------------------
// Behavior 7: Render structure-note summaries
// ---------------------------------------------------------------------------

/**
 * Render a compact operator-facing summary for a structure note.
 * Suitable for context assembly and beads_viewer inspection.
 * Stays compact (no full artifact expansion).
 */
export function renderStructureSummary(hub: StructureSummaryInput): string {
  const parts: string[] = [];

  parts.push(`## ${hub.title}`);
  parts.push(`Kind: ${hub.kind} | Label: ${hub.label}`);
  parts.push(`Linked nodes: ${hub.linkedIds.length}`);

  if (hub.linkedPermanentNotes && hub.linkedPermanentNotes.length > 0) {
    parts.push('\nTop permanent notes:');
    for (const pn of hub.linkedPermanentNotes.slice(0, 3)) {
      parts.push(`  - ${pn.title}`);
    }
  }

  if (hub.linkedFailures && hub.linkedFailures.length > 0) {
    parts.push('\nTop linked failures:');
    for (const f of hub.linkedFailures.slice(0, 3)) {
      parts.push(`  - ${f}`);
    }
  }

  if (hub.linkedLearnings && hub.linkedLearnings.length > 0) {
    parts.push('\nTop learnings:');
    for (const l of hub.linkedLearnings.slice(0, 3)) {
      parts.push(`  - ${l}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStructureTitle(kind: StructureKind, label: string): string {
  const kindLabel = kind
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `${kindLabel}: ${label}`;
}

function getEdgeType(kind: StructureKind, input: LinkInput): string {
  switch (kind) {
    case 'workflow-map':
      return 'belongs-to-workflow';
    case 'customer-map':
      return 'belongs-to-customer';
    default:
      return 'supports';
  }
}

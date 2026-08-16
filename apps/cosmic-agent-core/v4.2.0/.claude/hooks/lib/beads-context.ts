/**
 * beads-context.ts — Context retrieval via beads graph
 *
 * Phase 03 (behaviors 1-4): Query beads for active work, failures, preferences, learnings
 * Phase 07 (behavior 6): Drift detection between beads and filesystem
 *
 * Imports from beads-index.ts (created in parallel).
 * All functions return empty arrays / null when beads is unavailable — never throw.
 */

import { isBeadsAvailable, brList } from './beads-index';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getPaiDir } from './paths';

// ----- Interfaces -----

export interface BeadsWorkItem {
  id: string;
  title: string;
  labels: string[];
  phase?: string;
  description?: string;
  status?: string;
  updated_at?: string;
}

export interface BeadsFailure {
  id: string;
  title: string;
  labels: string[];
  linkedWorkId?: string;
  created_at?: string;
}

export interface DriftReport {
  drifted: boolean;
  beadsCount: number;
  filesystemCount: number;
  missing: string[];   // slugs in filesystem but not beads
  extra: string[];     // slugs in beads but not filesystem
}

// ----- Retrieval Functions -----

/**
 * Behavior 1: Active work items
 * Queries beads for open PRD artifacts, extracts phase from labels.
 */
export function getActiveWorkFromBeads(): BeadsWorkItem[] {
  if (!isBeadsAvailable()) return [];
  try {
    const raw = brList({ labels: ['note:artifact', 'kind:prd'], status: 'open', limit: 10 });
    return raw.map((issue: any) => ({
      id: issue.id,
      title: issue.title,
      labels: issue.labels || [],
      phase: issue.labels?.find((l: string) => l.startsWith('phase:'))?.replace('phase:', ''),
      description: issue.description,
      status: issue.status,
      updated_at: issue.updated_at,
    }));
  } catch { return []; }
}

/**
 * Behavior 2: Recent failure patterns
 * Returns failure patterns sorted by recency, up to limit.
 */
export function getRecentFailuresFromBeads(limit: number = 5): BeadsFailure[] {
  if (!isBeadsAvailable()) return [];
  try {
    const raw = brList({ labels: ['kind:failure-pattern'], limit, sort: 'updated_at', reverse: true });
    return raw.map((issue: any) => ({
      id: issue.id,
      title: issue.title,
      labels: issue.labels || [],
      linkedWorkId: issue.linkedWorkId,
      created_at: issue.created_at,
    }));
  } catch { return []; }
}

/**
 * Behavior 3: Preferences
 * Returns high-confidence preferences up to limit.
 */
export function getPreferencesFromBeads(limit: number = 5): BeadsWorkItem[] {
  if (!isBeadsAvailable()) return [];
  try {
    const raw = brList({ labels: ['kind:preference', 'confidence:high'], limit });
    return raw.map((issue: any) => ({
      id: issue.id,
      title: issue.title,
      labels: issue.labels || [],
    }));
  } catch { return []; }
}

/**
 * Recent learnings
 * Returns most recent learning nodes up to limit.
 */
export function getRecentLearningsFromBeads(limit: number = 3): BeadsWorkItem[] {
  if (!isBeadsAvailable()) return [];
  try {
    const raw = brList({ labels: ['kind:learning'], limit, sort: 'created_at', reverse: true });
    return raw.map((issue: any) => ({
      id: issue.id,
      title: issue.title,
      labels: issue.labels || [],
    }));
  } catch { return []; }
}

/**
 * Behavior 4: Assemble compact ContextBundle from beads
 * Returns formatted string < 2000 chars, or null when beads has no data
 * (null signals the caller to use filesystem fallback).
 */
export function assembleBeadsContext(): string | null {
  const work = getActiveWorkFromBeads();
  const failures = getRecentFailuresFromBeads(3);
  const prefs = getPreferencesFromBeads(5);
  const learnings = getRecentLearningsFromBeads(3);

  if (work.length === 0 && failures.length === 0 && prefs.length === 0 && learnings.length === 0) {
    return null;
  }

  const parts: string[] = ['## Beads Memory Context (auto-loaded)\n'];

  if (work.length > 0) {
    parts.push('**Active Work:**');
    for (const w of work) {
      parts.push(`  \u2022 [${w.id}] ${w.title} (phase: ${w.phase || '?'})`);
    }
  }

  if (failures.length > 0) {
    parts.push('\n**Recent Failure Patterns (avoid):**');
    for (const f of failures) {
      parts.push(`  \u2022 [${f.id}] ${f.title}`);
    }
  }

  if (prefs.length > 0) {
    parts.push('\n**Key Preferences:**');
    for (const p of prefs) {
      parts.push(`  \u2022 ${p.title}`);
    }
  }

  if (learnings.length > 0) {
    parts.push('\n**Recent Learnings:**');
    for (const l of learnings) {
      parts.push(`  \u2022 ${l.title}`);
    }
  }

  return parts.join('\n');
}

/**
 * Phase 07 Behavior 6: Drift detection
 * Compares beads graph against filesystem MEMORY/WORK/ directories.
 * Returns null when beads is unavailable.
 */
export function detectDrift(paiDir?: string): DriftReport | null {
  const dir = paiDir || getPaiDir();
  if (!isBeadsAvailable()) return null;
  try {
    const beadsItems = brList({ labels: ['note:artifact', 'kind:prd'], limit: 0 });
    const beadsSlugs = new Set<string>(
      beadsItems
        .map((i: any) => {
          const match = i.description?.match(/slug:\s*(.+)/);
          return match?.[1]?.trim();
        })
        .filter(Boolean) as string[]
    );

    const workDir = join(dir, 'MEMORY', 'WORK');
    const fsSlugs = new Set<string>();
    if (existsSync(workDir)) {
      for (const entry of readdirSync(workDir)) {
        if (existsSync(join(workDir, entry, 'PRD.md'))) {
          fsSlugs.add(entry);
        }
      }
    }

    const missing = [...fsSlugs].filter(s => !beadsSlugs.has(s));
    const extra = [...beadsSlugs].filter(s => !fsSlugs.has(s));

    return {
      drifted: missing.length > 0 || extra.length > 0,
      beadsCount: beadsSlugs.size,
      filesystemCount: fsSlugs.size,
      missing,
      extra,
    };
  } catch { return null; }
}

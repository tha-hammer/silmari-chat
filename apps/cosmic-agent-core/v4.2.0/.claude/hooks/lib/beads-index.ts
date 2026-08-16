// beads-index.ts -- Core adapter wrapping `br` CLI for indexing memory objects
//
// All functions degrade gracefully: if `br` is unavailable or any call fails,
// they return null/false/[] silently. No exceptions escape.
//
// Label conventions:
//   br create uses -l with comma-separated labels: -l "note:artifact,kind:prd"
//   br list uses repeatable -l for AND logic: -l note:artifact -l kind:prd

import { execFileSync } from 'child_process';
import { join } from 'path';
import { getBeadsDir, ensureBeadsWorkspace } from './beads-init';
import { parseCriteriaList } from './prd-utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BR = 'br';
export const ACTOR = 'aai-hooks';
export const TIMEOUT_READ = 500;   // Hot-path reads: 500ms max
export const TIMEOUT_WRITE = 1000; // Writes: 1000ms max
export const TIMEOUT_INIT = 3000;  // Init only: 3000ms max

// ---------------------------------------------------------------------------
// Availability cache
// ---------------------------------------------------------------------------

let _brAvailable: boolean | null = null;

export function isBeadsAvailable(): boolean {
  if (_brAvailable !== null) return _brAvailable;
  try {
    execFileSync(BR, ['--version'], { timeout: TIMEOUT_INIT, stdio: 'pipe' });
    _brAvailable = true;
  } catch {
    _brAvailable = false;
  }
  return _brAvailable;
}

export function resetBeadsCache(): void {
  _brAvailable = null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getDbFlag(): string[] {
  return ['--db', join(getBeadsDir(), 'beads.db')];
}

function baseFlags(): string[] {
  return ['--json', '--actor', ACTOR, ...getDbFlag()];
}

function confidenceBucket(c: number): string {
  if (c >= 0.8) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Low-level CLI wrappers
// ---------------------------------------------------------------------------

export function brCreate(opts: {
  title: string;
  type: string;
  labels: string;
  description?: string;
}): string | null {
  try {
    const args = ['create', opts.title, '-t', opts.type, ...baseFlags()];
    if (opts.labels) args.push('-l', opts.labels);
    if (opts.description) args.push('-d', opts.description);
    // NOTE: br create does NOT accept --notes. Use brUpdate() after creation.
    const result = execFileSync(BR, args, {
      timeout: TIMEOUT_WRITE, stdio: 'pipe', encoding: 'utf-8',
    });
    const parsed = JSON.parse(result);
    return parsed.id || null;
  } catch {
    return null;
  }
}

export function brUpdate(id: string, opts: {
  title?: string;
  description?: string;
  notes?: string;
  labels?: string;
  status?: string;
}): boolean {
  try {
    const args = ['update', id, ...baseFlags()];
    if (opts.title) args.push('--title', opts.title);
    if (opts.description) args.push('--description', opts.description);
    if (opts.notes) args.push('--notes', opts.notes);
    if (opts.labels) args.push('--set-labels', opts.labels);
    if (opts.status) args.push('-s', opts.status);
    execFileSync(BR, args, {
      timeout: TIMEOUT_WRITE, stdio: 'pipe', encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

export function brList(opts: {
  labels?: string[];
  status?: string;
  limit?: number;
  sort?: string;
  reverse?: boolean;
  descContains?: string;
}): any[] {
  try {
    const args = ['list', '--json', ...getDbFlag()];
    // Repeatable -l flags for AND logic
    if (opts.labels) {
      for (const label of opts.labels) {
        args.push('-l', label);
      }
    }
    if (opts.status) args.push('-s', opts.status);
    if (opts.limit) args.push('--limit', String(opts.limit));
    if (opts.sort) args.push('--sort', opts.sort);
    if (opts.reverse) args.push('--reverse');
    if (opts.descContains) args.push('--desc-contains', opts.descContains);
    const result = execFileSync(BR, args, {
      timeout: TIMEOUT_READ, stdio: 'pipe', encoding: 'utf-8',
    });
    const parsed = JSON.parse(result);
    return parsed.issues || parsed || [];
  } catch {
    return [];
  }
}

export function brFindBySlug(slug: string): string | null {
  try {
    const issues = brList({
      labels: ['note:artifact', 'kind:prd'],
      descContains: slug,
      limit: 1,
    });
    return issues.length > 0 ? issues[0].id : null;
  } catch {
    return null;
  }
}

export function brSearchTerm(query: string, limit?: number): any[] {
  try {
    const args = ['search', query, '--json', ...getDbFlag()];
    if (limit) args.push('--limit', String(limit));
    const result = execFileSync(BR, args, {
      timeout: TIMEOUT_READ, stdio: 'pipe', encoding: 'utf-8',
    });
    const parsed = JSON.parse(result);
    return parsed.issues || parsed || [];
  } catch {
    return [];
  }
}

export function brClose(id: string, reason?: string): boolean {
  try {
    const args = ['close', id, ...baseFlags()];
    if (reason) args.push('-r', reason);
    execFileSync(BR, args, {
      timeout: TIMEOUT_WRITE, stdio: 'pipe', encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

export function brDepAdd(fromId: string, toId: string, depType: string): boolean {
  try {
    const args = ['dep', 'add', fromId, toId, '--type', depType, ...baseFlags()];
    execFileSync(BR, args, {
      timeout: TIMEOUT_WRITE, stdio: 'pipe', encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// High-level index functions
// ---------------------------------------------------------------------------

export function indexWorkItem(
  fm: Record<string, string>,
  prdPath: string,
  sessionId?: string,
): string | null {
  if (!isBeadsAvailable()) return null;
  if (!ensureBeadsWorkspace()) return null;

  const title = fm.task || fm.slug || 'Untitled work item';
  const labels = [
    'note:artifact', 'kind:prd', 'memory:work',
    fm.phase ? `phase:${fm.phase}` : null,
    fm.effort ? `effort:${fm.effort}` : null,
  ].filter(Boolean).join(',');

  const description = `slug: ${fm.slug}\npath: ${prdPath}`;
  const notes = sessionId ? `session: ${sessionId}` : '';

  // Upsert: check if a bead for this slug already exists
  const existing = brFindBySlug(fm.slug);
  if (existing) {
    brUpdate(existing, { labels, description });
    if (notes) brUpdate(existing, { notes });
    return existing;
  }

  const id = brCreate({ title, type: 'task', labels, description });
  if (id && notes) brUpdate(id, { notes });
  return id;
}

export function indexCriteriaFragments(
  parentBeadsId: string,
  content: string,
): string[] {
  if (!isBeadsAvailable()) return [];
  if (!ensureBeadsWorkspace()) return [];

  const criteria = parseCriteriaList(content);
  const ids: string[] = [];

  for (const c of criteria) {
    const labels = 'note:extract,kind:criterion,memory:work';
    const id = brCreate({
      title: `${c.id}: ${c.description}`,
      type: 'task',
      labels,
      description: `parent: ${parentBeadsId}`,
    });
    if (id) {
      if (c.status === 'completed') brClose(id, 'Criterion met');
      brDepAdd(id, parentBeadsId, 'derived-from');
      ids.push(id);
    }
  }
  return ids;
}

export function indexLearning(
  category: string,
  summary: string,
  workSlug?: string,
  sessionId?: string,
): string | null {
  if (!isBeadsAvailable()) return null;
  if (!ensureBeadsWorkspace()) return null;

  const labels = [
    'note:extract', 'kind:learning', 'memory:learning',
    `learning:${category.toLowerCase()}`,
    sessionId ? 'source:claude-code' : null,
  ].filter(Boolean).join(',');

  const id = brCreate({ title: summary.slice(0, 200), type: 'docs', labels });
  if (id && workSlug) {
    const parentId = brFindBySlug(workSlug);
    if (parentId) brDepAdd(id, parentId, 'caused-by');
  }
  return id;
}

export function indexPreference(
  noteType: string,
  content: string,
  actor: string,
  confidence?: number,
): string | null {
  if (!isBeadsAvailable()) return null;
  if (!ensureBeadsWorkspace()) return null;

  const labels = [
    'note:extract', 'kind:preference', 'memory:relationship',
    `entity:${actor.toLowerCase().replace(/\s+/g, '-')}`,
    confidence != null ? `confidence:${confidenceBucket(confidence)}` : null,
  ].filter(Boolean).join(',');

  return brCreate({ title: content.slice(0, 200), type: 'docs', labels });
}

export function indexSignal(
  rating: number,
  sentiment: string,
  summary: string,
  sessionId?: string,
  activeWorkSlug?: string,
): string | null {
  if (!isBeadsAvailable()) return null;
  if (!ensureBeadsWorkspace()) return null;

  const ratingBucket = rating <= 4 ? 'low' : rating <= 6 ? 'medium' : 'high';
  const labels = [
    'note:extract', 'memory:signal',
    `rating:${ratingBucket}`,
    rating <= 4 ? 'kind:failure-pattern' : null,
    sessionId ? 'source:claude-code' : null,
  ].filter(Boolean).join(',');

  const id = brCreate({ title: summary.slice(0, 200), type: 'docs', labels });
  if (id && activeWorkSlug && rating <= 4) {
    const parentId = brFindBySlug(activeWorkSlug);
    if (parentId) brDepAdd(id, parentId, 'caused-by');
  }
  return id;
}

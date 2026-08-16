/**
 * beads-context.test.ts — Tests for beads context retrieval
 *
 * Mocks brList and isBeadsAvailable from ./beads-index to test
 * all retrieval functions and drift detection in isolation.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// ---- Mock beads-index before importing beads-context ----

const mockIsBeadsAvailable = mock(() => true);
const mockBrList = mock((_opts?: any) => [] as any[]);

mock.module('./beads-index', () => ({
  isBeadsAvailable: mockIsBeadsAvailable,
  brList: mockBrList,
}));

// Must import AFTER mock.module so the mocks are wired in
import {
  getActiveWorkFromBeads,
  getRecentFailuresFromBeads,
  getPreferencesFromBeads,
  getRecentLearningsFromBeads,
  assembleBeadsContext,
  detectDrift,
} from './beads-context';

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ---- Fixtures ----

const WORK_ITEMS = [
  {
    id: 'W-001',
    title: 'Implement authentication',
    labels: ['note:artifact', 'kind:prd', 'phase:design'],
    description: 'slug: implement-auth\nAuth system redesign',
    status: 'open',
    updated_at: '2026-04-01T10:00:00Z',
  },
  {
    id: 'W-002',
    title: 'Build dashboard',
    labels: ['note:artifact', 'kind:prd', 'phase:build'],
    description: 'slug: build-dashboard\nNew analytics dashboard',
    status: 'open',
    updated_at: '2026-04-02T10:00:00Z',
  },
  {
    id: 'W-003',
    title: 'Old migration',
    labels: ['note:artifact', 'kind:prd', 'phase:done'],
    description: 'slug: old-migration\nCompleted migration',
    status: 'closed',
    updated_at: '2026-03-01T10:00:00Z',
  },
];

const FAILURE_ITEMS = [
  { id: 'F-001', title: 'Timeout on large payloads', labels: ['kind:failure-pattern'], created_at: '2026-04-03T10:00:00Z' },
  { id: 'F-002', title: 'Race condition in cache', labels: ['kind:failure-pattern'], created_at: '2026-04-02T10:00:00Z' },
  { id: 'F-003', title: 'Memory leak in worker', labels: ['kind:failure-pattern'], created_at: '2026-04-01T10:00:00Z' },
  { id: 'F-004', title: 'Stale connection pool', labels: ['kind:failure-pattern'], created_at: '2026-03-30T10:00:00Z' },
  { id: 'F-005', title: 'SSL cert rotation miss', labels: ['kind:failure-pattern'], created_at: '2026-03-28T10:00:00Z' },
];

const PREFERENCE_ITEMS = [
  { id: 'P-001', title: 'TypeScript over Python', labels: ['kind:preference', 'confidence:high'] },
  { id: 'P-002', title: 'bun over npm', labels: ['kind:preference', 'confidence:high'] },
  { id: 'P-003', title: 'Markdown over HTML', labels: ['kind:preference', 'confidence:high'] },
];

const LEARNING_ITEMS = [
  { id: 'L-001', title: 'Bun test mocking requires mock.module', labels: ['kind:learning'] },
  { id: 'L-002', title: 'Hook timeout budget is 50ms', labels: ['kind:learning'] },
  { id: 'L-003', title: 'beads-index must be sync', labels: ['kind:learning'] },
];

// ---- Helpers ----

function resetMocks() {
  mockIsBeadsAvailable.mockReset();
  mockBrList.mockReset();
  mockIsBeadsAvailable.mockImplementation(() => true);
  mockBrList.mockImplementation(() => []);
}

// ==========================
// getActiveWorkFromBeads
// ==========================

describe('getActiveWorkFromBeads', () => {
  beforeEach(resetMocks);

  it('should return open work items with structured fields', () => {
    mockBrList.mockImplementation(() => WORK_ITEMS.filter(w => w.status === 'open'));

    const items = getActiveWorkFromBeads();

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveProperty('id', 'W-001');
    expect(items[0]).toHaveProperty('title', 'Implement authentication');
    expect(items[0]).toHaveProperty('labels');
    expect(items[0]).toHaveProperty('phase', 'design');
    expect(items[1]).toHaveProperty('phase', 'build');
  });

  it('should extract phase from labels', () => {
    mockBrList.mockImplementation(() => [
      { id: 'W-010', title: 'Test', labels: ['note:artifact', 'kind:prd', 'phase:review'], status: 'open' },
    ]);

    const items = getActiveWorkFromBeads();
    expect(items[0].phase).toBe('review');
  });

  it('should return empty array when beads is unavailable', () => {
    mockIsBeadsAvailable.mockImplementation(() => false);
    expect(getActiveWorkFromBeads()).toEqual([]);
    // brList should not be called when beads is unavailable
    expect(mockBrList).not.toHaveBeenCalled();
  });

  it('should return empty array when no work items exist', () => {
    mockBrList.mockImplementation(() => []);
    expect(getActiveWorkFromBeads()).toEqual([]);
  });

  it('should return empty array when brList throws', () => {
    mockBrList.mockImplementation(() => { throw new Error('br crashed'); });
    expect(getActiveWorkFromBeads()).toEqual([]);
  });

  it('should call brList with correct label filters', () => {
    mockBrList.mockImplementation(() => []);
    getActiveWorkFromBeads();

    expect(mockBrList).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ['note:artifact', 'kind:prd'],
        status: 'open',
        limit: 10,
      })
    );
  });
});

// ==========================
// getRecentFailuresFromBeads
// ==========================

describe('getRecentFailuresFromBeads', () => {
  beforeEach(resetMocks);

  it('should return failure patterns sorted by recency', () => {
    mockBrList.mockImplementation(() => FAILURE_ITEMS.slice(0, 3));

    const failures = getRecentFailuresFromBeads(3);

    expect(failures).toHaveLength(3);
    expect(failures[0]).toHaveProperty('id', 'F-001');
    expect(failures[0]).toHaveProperty('title', 'Timeout on large payloads');
    expect(failures[0]).toHaveProperty('labels');
  });

  it('should respect limit parameter', () => {
    mockBrList.mockImplementation(() => FAILURE_ITEMS.slice(0, 2));

    const failures = getRecentFailuresFromBeads(2);
    expect(failures).toHaveLength(2);

    expect(mockBrList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2 })
    );
  });

  it('should use default limit of 5', () => {
    mockBrList.mockImplementation(() => FAILURE_ITEMS);
    getRecentFailuresFromBeads();

    expect(mockBrList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 })
    );
  });

  it('should return empty array when beads is unavailable', () => {
    mockIsBeadsAvailable.mockImplementation(() => false);
    expect(getRecentFailuresFromBeads()).toEqual([]);
  });

  it('should return empty array on error', () => {
    mockBrList.mockImplementation(() => { throw new Error('fail'); });
    expect(getRecentFailuresFromBeads()).toEqual([]);
  });
});

// ==========================
// getPreferencesFromBeads
// ==========================

describe('getPreferencesFromBeads', () => {
  beforeEach(resetMocks);

  it('should return high-confidence preferences', () => {
    mockBrList.mockImplementation(() => PREFERENCE_ITEMS);

    const prefs = getPreferencesFromBeads(5);

    expect(prefs).toHaveLength(3);
    expect(prefs[0]).toHaveProperty('title', 'TypeScript over Python');
    expect(prefs[0]).toHaveProperty('id', 'P-001');
    expect(prefs[0]).toHaveProperty('labels');
  });

  it('should call brList with preference and confidence labels', () => {
    mockBrList.mockImplementation(() => []);
    getPreferencesFromBeads(5);

    expect(mockBrList).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ['kind:preference', 'confidence:high'],
        limit: 5,
      })
    );
  });

  it('should return empty array when beads is unavailable', () => {
    mockIsBeadsAvailable.mockImplementation(() => false);
    expect(getPreferencesFromBeads()).toEqual([]);
  });

  it('should return empty array on error', () => {
    mockBrList.mockImplementation(() => { throw new Error('fail'); });
    expect(getPreferencesFromBeads()).toEqual([]);
  });
});

// ==========================
// getRecentLearningsFromBeads
// ==========================

describe('getRecentLearningsFromBeads', () => {
  beforeEach(resetMocks);

  it('should return recent learning items', () => {
    mockBrList.mockImplementation(() => LEARNING_ITEMS);

    const learnings = getRecentLearningsFromBeads(3);

    expect(learnings).toHaveLength(3);
    expect(learnings[0]).toHaveProperty('title', 'Bun test mocking requires mock.module');
    expect(learnings[0]).toHaveProperty('id', 'L-001');
  });

  it('should call brList with learning labels and sort by created_at', () => {
    mockBrList.mockImplementation(() => []);
    getRecentLearningsFromBeads(3);

    expect(mockBrList).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ['kind:learning'],
        limit: 3,
        sort: 'created_at',
        reverse: true,
      })
    );
  });

  it('should return empty array when beads is unavailable', () => {
    mockIsBeadsAvailable.mockImplementation(() => false);
    expect(getRecentLearningsFromBeads()).toEqual([]);
  });

  it('should return empty array on error', () => {
    mockBrList.mockImplementation(() => { throw new Error('fail'); });
    expect(getRecentLearningsFromBeads()).toEqual([]);
  });
});

// ==========================
// assembleBeadsContext
// ==========================

describe('assembleBeadsContext', () => {
  beforeEach(resetMocks);

  it('should return formatted string under 2000 chars', () => {
    let callCount = 0;
    mockBrList.mockImplementation(() => {
      callCount++;
      // Calls are: work, failures, preferences, learnings
      if (callCount === 1) return WORK_ITEMS.filter(w => w.status === 'open');
      if (callCount === 2) return FAILURE_ITEMS.slice(0, 3);
      if (callCount === 3) return PREFERENCE_ITEMS;
      if (callCount === 4) return LEARNING_ITEMS;
      return [];
    });

    const ctx = assembleBeadsContext();

    expect(ctx).not.toBeNull();
    expect(ctx!.length).toBeLessThan(2000);
  });

  it('should include all sections when all data present', () => {
    let callCount = 0;
    mockBrList.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return WORK_ITEMS.filter(w => w.status === 'open');
      if (callCount === 2) return FAILURE_ITEMS.slice(0, 3);
      if (callCount === 3) return PREFERENCE_ITEMS;
      if (callCount === 4) return LEARNING_ITEMS;
      return [];
    });

    const ctx = assembleBeadsContext()!;

    expect(ctx).toContain('Active Work');
    expect(ctx).toContain('Failure Patterns');
    expect(ctx).toContain('Key Preferences');
    expect(ctx).toContain('Recent Learnings');
    expect(ctx).toContain('W-001');
    expect(ctx).toContain('F-001');
    expect(ctx).toContain('TypeScript over Python');
    expect(ctx).toContain('Bun test mocking requires mock.module');
  });

  it('should include beads header', () => {
    let callCount = 0;
    mockBrList.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [WORK_ITEMS[0]];
      return [];
    });

    const ctx = assembleBeadsContext()!;
    expect(ctx).toContain('## Beads Memory Context (auto-loaded)');
  });

  it('should return null when all queries return empty', () => {
    mockBrList.mockImplementation(() => []);
    expect(assembleBeadsContext()).toBeNull();
  });

  it('should return null (not empty string) when beads is unavailable', () => {
    mockIsBeadsAvailable.mockImplementation(() => false);
    const result = assembleBeadsContext();
    expect(result).toBeNull();
  });

  it('should include work item phases', () => {
    let callCount = 0;
    mockBrList.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return WORK_ITEMS.filter(w => w.status === 'open');
      return [];
    });

    const ctx = assembleBeadsContext()!;
    expect(ctx).toContain('phase: design');
    expect(ctx).toContain('phase: build');
  });

  it('should omit sections with no data', () => {
    let callCount = 0;
    mockBrList.mockImplementation(() => {
      callCount++;
      // Only work items, everything else empty
      if (callCount === 1) return [WORK_ITEMS[0]];
      return [];
    });

    const ctx = assembleBeadsContext()!;
    expect(ctx).toContain('Active Work');
    expect(ctx).not.toContain('Failure Patterns');
    expect(ctx).not.toContain('Key Preferences');
    expect(ctx).not.toContain('Recent Learnings');
  });
});

// ==========================
// detectDrift
// ==========================

describe('detectDrift', () => {
  let tmpDir: string;

  beforeEach(() => {
    resetMocks();
    tmpDir = mkdtempSync(join(tmpdir(), 'beads-drift-'));
  });

  // afterEach: clean up temp dirs
  // (bun:test doesn't guarantee afterEach ordering, but tmpdir cleanup is best-effort)

  it('should detect missing slugs (in filesystem but not beads)', () => {
    // Filesystem has 2 work dirs
    const workDir = join(tmpDir, 'MEMORY', 'WORK');
    mkdirSync(join(workDir, 'implement-auth'), { recursive: true });
    writeFileSync(join(workDir, 'implement-auth', 'PRD.md'), '# Auth');
    mkdirSync(join(workDir, 'build-dashboard'), { recursive: true });
    writeFileSync(join(workDir, 'build-dashboard', 'PRD.md'), '# Dashboard');

    // Beads only has 1 matching slug
    mockBrList.mockImplementation(() => [
      { id: 'W-001', title: 'Auth', labels: [], description: 'slug: implement-auth' },
    ]);

    const report = detectDrift(tmpDir)!;

    expect(report).not.toBeNull();
    expect(report.drifted).toBe(true);
    expect(report.missing).toContain('build-dashboard');
    expect(report.missing).not.toContain('implement-auth');
    expect(report.filesystemCount).toBe(2);
    expect(report.beadsCount).toBe(1);
  });

  it('should detect extra slugs (in beads but not filesystem)', () => {
    // No filesystem work dirs
    const workDir = join(tmpDir, 'MEMORY', 'WORK');
    mkdirSync(workDir, { recursive: true });

    // Beads has 2 slugs
    mockBrList.mockImplementation(() => [
      { id: 'W-001', title: 'Auth', labels: [], description: 'slug: implement-auth' },
      { id: 'W-002', title: 'Dashboard', labels: [], description: 'slug: build-dashboard' },
    ]);

    const report = detectDrift(tmpDir)!;

    expect(report.drifted).toBe(true);
    expect(report.extra).toContain('implement-auth');
    expect(report.extra).toContain('build-dashboard');
    expect(report.beadsCount).toBe(2);
    expect(report.filesystemCount).toBe(0);
  });

  it('should report no drift when in sync', () => {
    // Filesystem has same slugs as beads
    const workDir = join(tmpDir, 'MEMORY', 'WORK');
    mkdirSync(join(workDir, 'implement-auth'), { recursive: true });
    writeFileSync(join(workDir, 'implement-auth', 'PRD.md'), '# Auth');

    mockBrList.mockImplementation(() => [
      { id: 'W-001', title: 'Auth', labels: [], description: 'slug: implement-auth' },
    ]);

    const report = detectDrift(tmpDir)!;

    expect(report.drifted).toBe(false);
    expect(report.missing).toEqual([]);
    expect(report.extra).toEqual([]);
    expect(report.beadsCount).toBe(1);
    expect(report.filesystemCount).toBe(1);
  });

  it('should return null when beads is unavailable', () => {
    mockIsBeadsAvailable.mockImplementation(() => false);
    expect(detectDrift(tmpDir)).toBeNull();
  });

  it('should return null when brList throws', () => {
    mockBrList.mockImplementation(() => { throw new Error('crash'); });
    expect(detectDrift(tmpDir)).toBeNull();
  });

  it('should handle missing MEMORY/WORK directory gracefully', () => {
    // tmpDir exists but has no MEMORY/WORK
    mockBrList.mockImplementation(() => [
      { id: 'W-001', title: 'Auth', labels: [], description: 'slug: implement-auth' },
    ]);

    const report = detectDrift(tmpDir)!;

    expect(report.drifted).toBe(true);
    expect(report.filesystemCount).toBe(0);
    expect(report.extra).toContain('implement-auth');
  });

  it('should skip directories without PRD.md', () => {
    const workDir = join(tmpDir, 'MEMORY', 'WORK');
    mkdirSync(join(workDir, 'has-prd'), { recursive: true });
    writeFileSync(join(workDir, 'has-prd', 'PRD.md'), '# Yes');
    mkdirSync(join(workDir, 'no-prd'), { recursive: true });
    // no-prd directory exists but has no PRD.md

    mockBrList.mockImplementation(() => []);

    const report = detectDrift(tmpDir)!;

    expect(report.filesystemCount).toBe(1);
    expect(report.missing).toContain('has-prd');
    expect(report.missing).not.toContain('no-prd');
  });

  it('should handle beads items without slug in description', () => {
    mockBrList.mockImplementation(() => [
      { id: 'W-001', title: 'Auth', labels: [], description: 'no slug here' },
      { id: 'W-002', title: 'Dashboard', labels: [], description: 'slug: build-dashboard' },
    ]);

    const report = detectDrift(tmpDir)!;

    // Only the item with a parseable slug counts
    expect(report.beadsCount).toBe(1);
    expect(report.extra).toContain('build-dashboard');
  });
});

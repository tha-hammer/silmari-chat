/**
 * permanent-notes.test.ts — v4.2.0 Permanent Knowledge Tests
 *
 * TDD behaviors 1-3, 6 from Plan 02:
 * B1: Determine permanent-note eligibility
 * B2: Promote validated extract clusters
 * B3: Prevent promotion when human review is required
 * B6: Supersede permanent notes safely
 */

import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as beadsInit from './beads-init';

let mod: typeof import('./permanent-notes');
let execMock: ReturnType<typeof spyOn<typeof childProcess, 'execFileSync'>>;
let existsMock: ReturnType<typeof spyOn<typeof fs, 'existsSync'>>;
let mkdirMock: ReturnType<typeof spyOn<typeof fs, 'mkdirSync'>>;

let initialized = false;
let createCallCount = 0;

beforeEach(async () => {
  if (!initialized) {
    execMock = spyOn(childProcess, 'execFileSync') as any;
    existsMock = spyOn(fs, 'existsSync') as any;
    mkdirMock = spyOn(fs, 'mkdirSync') as any;
    mod = await import('./permanent-notes');
    initialized = true;
  }

  execMock.mockReset();
  existsMock.mockReset();
  mkdirMock.mockReset();
  createCallCount = 0;

  // Default: beads available, workspace ready
  existsMock.mockReturnValue(true);
  mkdirMock.mockReturnValue(undefined as any);
  execMock.mockImplementation(((cmd: any, args: any, _opts?: any) => {
    if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
    if (Array.isArray(args) && args[0] === 'create') {
      createCallCount++;
      return JSON.stringify({ id: `zk-perm-${createCallCount}` });
    }
    if (Array.isArray(args) && args[0] === 'list') {
      return JSON.stringify({ issues: [] });
    }
    if (Array.isArray(args) && args[0] === 'update') return '{}';
    if (Array.isArray(args) && args[0] === 'dep') return '{}';
    return '{}';
  }) as any);

  // Reset caches
  const beadsIndex = await import('./beads-index');
  beadsIndex.resetBeadsCache();
  beadsInit._resetWorkspaceCache();
});

// ---- Test Fixtures ----

function makeExtract(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    title: `Extract ${id}`,
    kind: 'learning',
    labels: ['note:extract', 'kind:learning'],
    description: `Provenance for ${id}`,
    confidence: 0.8,
    ...overrides,
  };
}

function makeValidCluster(overrides: Partial<any> = {}) {
  return {
    sources: [makeExtract('zk-1'), makeExtract('zk-2'), makeExtract('zk-3')],
    sharedKind: 'learning',
    sharedLabel: 'workflow:auth',
    hasContradictions: false,
    confidence: 0.8,
    ...overrides,
  };
}

// =========================================================================
// Behavior 1: Determine permanent-note eligibility
// =========================================================================

describe('isPermanentCandidate', () => {
  it('accepts validated extract clusters with high confidence', () => {
    const cluster = makeValidCluster();
    expect(mod.isPermanentCandidate(cluster)).toBe(true);
  });

  it('rejects single weak extracts', () => {
    const cluster = makeValidCluster({
      sources: [makeExtract('zk-1')],
    });
    expect(mod.isPermanentCandidate(cluster)).toBe(false);
  });

  it('rejects contradictory clusters', () => {
    const cluster = makeValidCluster({ hasContradictions: true });
    expect(mod.isPermanentCandidate(cluster)).toBe(false);
  });

  it('rejects clusters with missing provenance', () => {
    const cluster = makeValidCluster({
      sources: [
        makeExtract('zk-1'),
        makeExtract('zk-2', { description: '' }),
      ],
    });
    expect(mod.isPermanentCandidate(cluster)).toBe(false);
  });

  it('rejects low-confidence clusters', () => {
    const cluster = makeValidCluster({ confidence: 0.3 });
    expect(mod.isPermanentCandidate(cluster)).toBe(false);
  });
});

// =========================================================================
// Behavior 2: Promote validated extract clusters into permanent notes
// =========================================================================

describe('promotePermanentNote', () => {
  it('creates a note:permanent node grounded in source extracts', () => {
    const cluster = makeValidCluster();
    const result = mod.promotePermanentNote(cluster);

    expect(result.status).toBe('created');
    if (result.status === 'created') {
      expect(result.id).toStartWith('zk-perm-');
    }

    // Verify brCreate was called with note:permanent labels
    const createCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'create'
    );
    expect(createCalls.length).toBe(1);
    const args = createCalls[0][1] as string[];
    expect(args.some((a: string) => a.includes('note:permanent'))).toBe(true);
  });

  it('links all source extracts with derived-from edges', () => {
    const cluster = makeValidCluster();
    mod.promotePermanentNote(cluster);

    const depCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'dep' && c[1][1] === 'add'
    );
    // 3 sources → 3 dep add calls
    expect(depCalls.length).toBe(3);
    // Each should have 'derived-from' type
    for (const call of depCalls) {
      const args = call[1] as string[];
      expect(args).toContain('derived-from');
    }
  });

  it('sets notes body with provenance summary', () => {
    const cluster = makeValidCluster();
    mod.promotePermanentNote(cluster);

    const updateCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'update'
    );
    // Should have at least one update for notes
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const notesCall = updateCalls.find((c: any) => {
      const args = c[1] as string[];
      return args.includes('--notes');
    });
    expect(notesCall).toBeTruthy();
  });

  it('returns skipped when beads is unavailable', () => {
    execMock.mockImplementation((() => {
      throw new Error('not found');
    }) as any);

    const cluster = makeValidCluster();
    const result = mod.promotePermanentNote(cluster);
    expect(result.status).toBe('skipped');
  });
});

// =========================================================================
// Behavior 3: Prevent promotion when human review is required
// =========================================================================

describe('promotePermanentNote — review-needed', () => {
  it('returns review-needed instead of silently promoting contradictory clusters', () => {
    const cluster = makeValidCluster({ hasContradictions: true });
    const result = mod.promotePermanentNote(cluster);

    expect(result.status).toBe('review-needed');
    if (result.status === 'review-needed') {
      expect(result.reason).toContain('Contradictory');
    }
  });

  it('returns review-needed for clusters missing provenance', () => {
    const cluster = makeValidCluster({
      sources: [
        makeExtract('zk-1'),
        makeExtract('zk-2', { description: '' }),
      ],
      confidence: 0.8,
    });
    const result = mod.promotePermanentNote(cluster);
    expect(result.status).toBe('review-needed');
  });

  it('reason text is usable in operator logs', () => {
    const cluster = makeValidCluster({ hasContradictions: true });
    const result = mod.promotePermanentNote(cluster);
    if (result.status === 'review-needed') {
      expect(result.reason.length).toBeGreaterThan(10);
      expect(result.reason.length).toBeLessThan(500);
    }
  });
});

// =========================================================================
// Behavior 6: Supersede permanent notes safely
// =========================================================================

describe('promoteReplacement', () => {
  it('creates supersedes edge instead of overwriting existing permanent notes', () => {
    const oldNote = {
      id: 'zk-old-1',
      title: 'Old principle',
      labels: ['note:permanent'],
      sourceIds: ['zk-src-1'],
    };
    const newCluster = makeValidCluster();

    const result = mod.promoteReplacement(oldNote, newCluster);

    // Should be a successful replacement
    expect('newId' in result).toBe(true);
    if ('newId' in result) {
      expect(result.oldId).toBe('zk-old-1');

      // Check supersedes edge was created
      const depCalls = execMock.mock.calls.filter(
        (c: any) => Array.isArray(c[1]) && c[1][0] === 'dep' && c[1][1] === 'add'
      );
      const supersedesCall = depCalls.find((c: any) => {
        const args = c[1] as string[];
        return args.includes('supersedes');
      });
      expect(supersedesCall).toBeTruthy();
    }
  });

  it('old note remains queryable (no close/delete called)', () => {
    const oldNote = {
      id: 'zk-old-1',
      title: 'Old principle',
      labels: ['note:permanent'],
      sourceIds: ['zk-src-1'],
    };
    const newCluster = makeValidCluster();

    mod.promoteReplacement(oldNote, newCluster);

    // Verify no close calls on old note
    const closeCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'close'
    );
    expect(closeCalls.length).toBe(0);
  });

  it('returns review-needed if new cluster is invalid', () => {
    const oldNote = {
      id: 'zk-old-1',
      title: 'Old principle',
      labels: ['note:permanent'],
      sourceIds: ['zk-src-1'],
    };
    const badCluster = makeValidCluster({ hasContradictions: true });

    const result = mod.promoteReplacement(oldNote, badCluster);
    expect(result.status).toBe('review-needed');
  });
});

// =========================================================================
// gatherExtractClusters
// =========================================================================

describe('gatherExtractClusters', () => {
  it('groups extracts by shared kind and label', () => {
    execMock.mockImplementation(((cmd: any, args: any, _opts?: any) => {
      if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
      if (Array.isArray(args) && args[0] === 'list') {
        return JSON.stringify({
          issues: [
            { id: 'zk-1', title: 'Learn A', labels: ['note:extract', 'kind:learning', 'workflow:auth'], description: 'prov' },
            { id: 'zk-2', title: 'Learn B', labels: ['note:extract', 'kind:learning', 'workflow:auth'], description: 'prov' },
            { id: 'zk-3', title: 'Risk C', labels: ['note:extract', 'kind:risk'], description: 'prov' },
          ],
        });
      }
      return '{}';
    }) as any);

    const clusters = mod.gatherExtractClusters();
    // Should have 1 cluster (2 learnings with workflow:auth), risk has only 1 → skipped
    expect(clusters.length).toBe(1);
    expect(clusters[0].sharedKind).toBe('learning');
    expect(clusters[0].sources.length).toBe(2);
  });

  it('returns empty when beads unavailable', () => {
    execMock.mockImplementation((() => {
      throw new Error('not found');
    }) as any);

    const clusters = mod.gatherExtractClusters();
    expect(clusters).toEqual([]);
  });
});

// beads-index.test.ts -- Unit tests for beads adapter
//
// Strategy: mock child_process.execFileSync to verify correct CLI args
// are constructed and responses are parsed properly.

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as beadsInit from './beads-init';

// Dynamically import after mocks are set up
let mod: typeof import('./beads-index');

let execMock: ReturnType<typeof spyOn<typeof childProcess, 'execFileSync'>>;
let existsMock: ReturnType<typeof spyOn<typeof fs, 'existsSync'>>;
let mkdirMock: ReturnType<typeof spyOn<typeof fs, 'mkdirSync'>>;

/**
 * Helper: get only the execFileSync calls made since the mock was set up.
 * Filters to calls where first arg is 'br' (our binary).
 */
function getExecCalls(): any[][] {
  return execMock.mock.calls;
}

/** Get exec calls where the subcommand (args[0]) matches */
function findCalls(subcommand: string): any[][] {
  return getExecCalls().filter(
    (c: any) => Array.isArray(c[1]) && c[1][0] === subcommand
  );
}

/** Get the args array from the first call matching subcommand */
function findArgs(subcommand: string): string[] | null {
  const calls = findCalls(subcommand);
  return calls.length > 0 ? (calls[0][1] as string[]) : null;
}

// ---- Setup / Teardown ----

// Create spies once — mockRestore breaks ESM live bindings in bun
let initialized = false;

beforeEach(async () => {
  if (!initialized) {
    execMock = spyOn(childProcess, 'execFileSync') as any;
    existsMock = spyOn(fs, 'existsSync') as any;
    mkdirMock = spyOn(fs, 'mkdirSync') as any;
    mod = await import('./beads-index');
    initialized = true;
  }

  // Reset mock state (but don't restore original — preserves ESM binding)
  execMock.mockReset();
  existsMock.mockReset();
  mkdirMock.mockReset();

  // Default mock: version check succeeds, existsSync true, mkdirSync no-op
  existsMock.mockReturnValue(true);
  mkdirMock.mockReturnValue(undefined as any);
  execMock.mockImplementation(((cmd: any, args: any, _opts?: any) => {
    if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
    return '{}';
  }) as any);

  // Reset all caches
  mod.resetBeadsCache();
  beadsInit._resetWorkspaceCache();
});

// =========================================================================
// isBeadsAvailable
// =========================================================================

describe('isBeadsAvailable', () => {
  it('should return true when br binary is found', () => {
    expect(mod.isBeadsAvailable()).toBe(true);
  });

  it('should return false when br binary is not found', () => {
    execMock.mockImplementation((() => {
      throw new Error('ENOENT');
    }) as any);
    mod.resetBeadsCache();
    expect(mod.isBeadsAvailable()).toBe(false);
  });

  it('should cache result after first check', () => {
    mod.isBeadsAvailable();
    mod.isBeadsAvailable();
    mod.isBeadsAvailable();
    // Only one --version call despite 3 invocations
    const versionCalls = findCalls('--version');
    expect(versionCalls.length).toBe(1);
  });

  it('should allow cache reset via resetBeadsCache', () => {
    execMock.mockImplementation((() => {
      throw new Error('ENOENT');
    }) as any);
    expect(mod.isBeadsAvailable()).toBe(false);

    mod.resetBeadsCache();
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
      return '{}';
    }) as any);
    expect(mod.isBeadsAvailable()).toBe(true);
  });
});

// =========================================================================
// brCreate
// =========================================================================

describe('brCreate', () => {
  it('should execute br create with correct flags', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === 'create')
        return JSON.stringify({ id: 'zk-abc123' });
      return '{}';
    }) as any);

    const id = mod.brCreate({
      title: 'Test Issue',
      type: 'task',
      labels: 'note:extract,kind:criterion',
    });
    expect(id).toBe('zk-abc123');

    const args = findArgs('create')!;
    expect(args).toBeTruthy();
    expect(args).toContain('create');
    expect(args).toContain('Test Issue');
    expect(args).toContain('-t');
    expect(args).toContain('task');
    expect(args).toContain('--json');
    expect(args).toContain('--actor');
    expect(args).toContain('aai-hooks');
    expect(args).toContain('-l');
    expect(args).toContain('note:extract,kind:criterion');
  });

  it('should include -d flag when description provided', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === 'create')
        return JSON.stringify({ id: 'zk-desc1' });
      return '{}';
    }) as any);

    mod.brCreate({
      title: 'With Desc',
      type: 'task',
      labels: 'note:artifact',
      description: 'slug: my-slug',
    });

    const args = findArgs('create')!;
    expect(args).toContain('-d');
    expect(args).toContain('slug: my-slug');
  });

  it('should return null on br failure', () => {
    execMock.mockImplementation((() => {
      throw new Error('fail');
    }) as any);
    expect(mod.brCreate({ title: 'Fail', type: 'task', labels: '' })).toBeNull();
  });

  it('should return null on malformed JSON', () => {
    execMock.mockImplementation((() => 'not json at all') as any);
    expect(mod.brCreate({ title: 'Bad', type: 'task', labels: '' })).toBeNull();
  });

  it('should NOT include --notes flag (br create does not support it)', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === 'create')
        return JSON.stringify({ id: 'zk-nonotes' });
      return '{}';
    }) as any);

    mod.brCreate({ title: 'No Notes', type: 'task', labels: '' });
    const args = findArgs('create')!;
    expect(args).not.toContain('--notes');
  });
});

// =========================================================================
// brUpdate
// =========================================================================

describe('brUpdate', () => {
  it('should execute br update with correct flags', () => {
    const ok = mod.brUpdate('zk-123', {
      title: 'New Title',
      description: 'New desc',
      notes: 'session: abc',
      labels: 'note:artifact,kind:prd',
      status: 'closed',
    });
    expect(ok).toBe(true);

    const args = findArgs('update')!;
    expect(args).toContain('update');
    expect(args).toContain('zk-123');
    expect(args).toContain('--title');
    expect(args).toContain('New Title');
    expect(args).toContain('--description');
    expect(args).toContain('New desc');
    expect(args).toContain('--notes');
    expect(args).toContain('session: abc');
    expect(args).toContain('--set-labels');
    expect(args).toContain('note:artifact,kind:prd');
    expect(args).toContain('-s');
    expect(args).toContain('closed');
  });

  it('should return false on failure', () => {
    execMock.mockImplementation((() => { throw new Error('fail'); }) as any);
    expect(mod.brUpdate('zk-123', { title: 'Fail' })).toBe(false);
  });
});

// =========================================================================
// brList
// =========================================================================

describe('brList', () => {
  it('should use repeatable -l flags for AND logic', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === 'list')
        return JSON.stringify({ issues: [] });
      return '{}';
    }) as any);

    mod.brList({ labels: ['note:artifact', 'kind:prd'], limit: 5 });

    const args = findArgs('list')!;
    // Count -l flags: should be 2 (repeatable, not comma-separated)
    const lIndices = args.reduce((acc: number[], a: string, i: number) => {
      if (a === '-l') acc.push(i);
      return acc;
    }, []);
    expect(lIndices.length).toBe(2);
    expect(args[lIndices[0] + 1]).toBe('note:artifact');
    expect(args[lIndices[1] + 1]).toBe('kind:prd');
  });

  it('should include --desc-contains when provided', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === 'list')
        return JSON.stringify({ issues: [] });
      return '{}';
    }) as any);

    mod.brList({ descContains: 'my-slug', limit: 1 });

    const args = findArgs('list')!;
    expect(args).toContain('--desc-contains');
    expect(args).toContain('my-slug');
  });

  it('should return empty array on failure', () => {
    execMock.mockImplementation((() => { throw new Error('fail'); }) as any);
    expect(mod.brList({})).toEqual([]);
  });

  it('should parse issues from response', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === 'list')
        return JSON.stringify({
          issues: [
            { id: 'zk-1', title: 'First' },
            { id: 'zk-2', title: 'Second' },
          ],
        });
      return '{}';
    }) as any);

    const result = mod.brList({});
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('zk-1');
  });
});

// =========================================================================
// brFindBySlug
// =========================================================================

describe('brFindBySlug', () => {
  it('should find issue by slug in description', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === 'list')
        return JSON.stringify({
          issues: [{ id: 'zk-found1', title: 'Auth Review' }],
        });
      return '{}';
    }) as any);

    const id = mod.brFindBySlug('20260404-auth-review');
    expect(id).toBe('zk-found1');

    const args = findArgs('list')!;
    expect(args).toContain('--desc-contains');
    expect(args).toContain('20260404-auth-review');
    expect(args).toContain('--limit');
    expect(args).toContain('1');
  });

  it('should return null when no match found', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === 'list')
        return JSON.stringify({ issues: [] });
      return '{}';
    }) as any);
    expect(mod.brFindBySlug('nonexistent')).toBeNull();
  });

  it('should return null on error', () => {
    execMock.mockImplementation((() => { throw new Error('fail'); }) as any);
    expect(mod.brFindBySlug('anything')).toBeNull();
  });
});

// =========================================================================
// brSearchTerm
// =========================================================================

describe('brSearchTerm', () => {
  it('should execute br search with query', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (Array.isArray(args) && args[0] === 'search')
        return JSON.stringify({ issues: [{ id: 'zk-s1' }] });
      return '{}';
    }) as any);

    const results = mod.brSearchTerm('auth middleware', 10);
    expect(results).toHaveLength(1);

    const args = findArgs('search')!;
    expect(args).toContain('search');
    expect(args).toContain('auth middleware');
    expect(args).toContain('--limit');
    expect(args).toContain('10');
  });

  it('should return empty array on failure', () => {
    execMock.mockImplementation((() => { throw new Error('fail'); }) as any);
    expect(mod.brSearchTerm('fail')).toEqual([]);
  });
});

// =========================================================================
// brClose
// =========================================================================

describe('brClose', () => {
  it('should execute br close with reason', () => {
    expect(mod.brClose('zk-123', 'Criterion met')).toBe(true);

    const args = findArgs('close')!;
    expect(args).toContain('close');
    expect(args).toContain('zk-123');
    expect(args).toContain('-r');
    expect(args).toContain('Criterion met');
  });

  it('should return false on failure', () => {
    execMock.mockImplementation((() => { throw new Error('fail'); }) as any);
    expect(mod.brClose('zk-fail')).toBe(false);
  });
});

// =========================================================================
// brDepAdd
// =========================================================================

describe('brDepAdd', () => {
  it('should execute br dep add with type', () => {
    expect(mod.brDepAdd('zk-child', 'zk-parent', 'derived-from')).toBe(true);

    const args = findArgs('dep')!;
    expect(args).toContain('dep');
    expect(args).toContain('add');
    expect(args).toContain('zk-child');
    expect(args).toContain('zk-parent');
    expect(args).toContain('--type');
    expect(args).toContain('derived-from');
  });

  it('should return false on failure', () => {
    execMock.mockImplementation((() => { throw new Error('fail'); }) as any);
    expect(mod.brDepAdd('a', 'b', 'c')).toBe(false);
  });
});

// =========================================================================
// indexWorkItem
// =========================================================================

describe('indexWorkItem', () => {
  it('should create beads issue with correct labels from PRD frontmatter', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'list') return JSON.stringify({ issues: [] });
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-work1' });
      if (args[0] === 'update') return '{}';
      return '{}';
    }) as any);

    const fm = {
      slug: '20260404-auth-review',
      task: 'Add auth rate limiting',
      phase: 'build',
      effort: 'standard',
    };
    const result = mod.indexWorkItem(fm, '/path/to/PRD.md', 'session-uuid-123');
    expect(result).toBe('zk-work1');

    // Verify create was called with correct labels
    const args = findArgs('create')!;
    expect(args).toBeTruthy();
    expect(args).toContain('Add auth rate limiting');
    const labelIdx = args.indexOf('-l');
    expect(labelIdx).toBeGreaterThan(-1);
    const labelsStr = args[labelIdx + 1];
    expect(labelsStr).toContain('note:artifact');
    expect(labelsStr).toContain('kind:prd');
    expect(labelsStr).toContain('memory:work');
    expect(labelsStr).toContain('phase:build');
    expect(labelsStr).toContain('effort:standard');

    // Verify notes were set via brUpdate (not via create --notes)
    const updateCalls = findCalls('update');
    const notesUpdate = updateCalls.find(c => {
      const a = c[1] as string[];
      return a.includes('--notes');
    });
    expect(notesUpdate).toBeTruthy();
  });

  it('should update existing issue when slug matches (upsert)', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'list') {
        return JSON.stringify({
          issues: [{ id: 'zk-existing1', title: 'Old title' }],
        });
      }
      if (args[0] === 'update') return '{}';
      return '{}';
    }) as any);

    const fm = { slug: '20260404-auth-review', task: 'Updated task', phase: 'refine' };
    const result = mod.indexWorkItem(fm, '/path/to/PRD.md', 'sess-2');
    expect(result).toBe('zk-existing1');

    // Verify update was called, not create
    expect(findCalls('create').length).toBe(0);
    expect(findCalls('update').length).toBeGreaterThan(0);
  });

  it('should silently return null when br is unavailable', () => {
    execMock.mockImplementation((() => { throw new Error('ENOENT'); }) as any);
    mod.resetBeadsCache();
    const fm = { slug: 'test', task: 'Test' };
    const result = mod.indexWorkItem(fm, '/path');
    expect(result).toBeNull();
  });
});

// =========================================================================
// indexCriteriaFragments
// =========================================================================

describe('indexCriteriaFragments', () => {
  it('should create one beads issue per criterion', () => {
    let createCount = 0;
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') {
        createCount++;
        return JSON.stringify({ id: `zk-crit${createCount}` });
      }
      if (args[0] === 'close') return '{}';
      if (args[0] === 'dep') return '{}';
      return '{}';
    }) as any);

    const content = `## Criteria
- [x] ISC-001: Rate limiter middleware installed
- [x] ISC-002: Returns 429 on threshold
- [ ] ISC-003: Dashboard shows rate limit stats

## Implementation`;

    const ids = mod.indexCriteriaFragments('zk-parent123', content);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(['zk-crit1', 'zk-crit2', 'zk-crit3']);
  });

  it('should close checked criteria', () => {
    const closeIds: string[] = [];
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-c1' });
      if (args[0] === 'close') {
        closeIds.push(args[1]);
        return '{}';
      }
      if (args[0] === 'dep') return '{}';
      return '{}';
    }) as any);

    const content = `## Criteria
- [x] ISC-001: Rate limiter installed
- [ ] ISC-002: Dashboard stats

## Implementation`;

    mod.indexCriteriaFragments('zk-parent', content);
    // Only checked criterion should be closed
    expect(closeIds).toHaveLength(1);
  });

  it('should add derived-from edge to parent', () => {
    const depCalls: string[][] = [];
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-dep1' });
      if (args[0] === 'close') return '{}';
      if (args[0] === 'dep') {
        depCalls.push([...args]);
        return '{}';
      }
      return '{}';
    }) as any);

    const content = `## Criteria
- [x] ISC-001: Test criterion

## Implementation`;

    mod.indexCriteriaFragments('zk-parent99', content);
    expect(depCalls.length).toBe(1);
    expect(depCalls[0]).toContain('zk-dep1');
    expect(depCalls[0]).toContain('zk-parent99');
    expect(depCalls[0]).toContain('derived-from');
  });

  it('should return empty array when br unavailable', () => {
    execMock.mockImplementation((() => { throw new Error('ENOENT'); }) as any);
    mod.resetBeadsCache();
    expect(
      mod.indexCriteriaFragments('zk-x', '## Criteria\n- [x] ISC-001: Test\n\n## End')
    ).toEqual([]);
  });
});

// =========================================================================
// indexLearning
// =========================================================================

describe('indexLearning', () => {
  it('should create beads issue with learning labels', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'list') return JSON.stringify({ issues: [] });
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-learn1' });
      if (args[0] === 'dep') return '{}';
      return '{}';
    }) as any);

    const id = mod.indexLearning('ALGORITHM', 'Wrong approach to auth', 'auth-slug', 'sess-1');
    expect(id).toBe('zk-learn1');

    const args = findArgs('create')!;
    const labelIdx = args.indexOf('-l');
    const labels = args[labelIdx + 1];
    expect(labels).toContain('note:extract');
    expect(labels).toContain('kind:learning');
    expect(labels).toContain('memory:learning');
    expect(labels).toContain('learning:algorithm');
    expect(labels).toContain('source:claude-code');
  });

  it('should distinguish SYSTEM vs ALGORITHM category', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-sys1' });
      return '{}';
    }) as any);

    mod.indexLearning('SYSTEM', 'Hook crash on startup');

    const args = findArgs('create')!;
    const labelIdx = args.indexOf('-l');
    const labels = args[labelIdx + 1];
    expect(labels).toContain('learning:system');
    expect(labels).not.toContain('learning:algorithm');
  });

  it('should link to parent work item via caused-by edge', () => {
    let depArgs: string[] = [];
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-learn2' });
      if (args[0] === 'list') {
        return JSON.stringify({
          issues: [{ id: 'zk-work-parent' }],
        });
      }
      if (args[0] === 'dep') {
        depArgs = [...args];
        return '{}';
      }
      return '{}';
    }) as any);

    mod.indexLearning('ALGORITHM', 'Bad auth approach', 'auth-slug');
    expect(depArgs).toContain('zk-learn2');
    expect(depArgs).toContain('zk-work-parent');
    expect(depArgs).toContain('caused-by');
  });

  it('should silently return null when br unavailable', () => {
    execMock.mockImplementation((() => { throw new Error('ENOENT'); }) as any);
    mod.resetBeadsCache();
    expect(mod.indexLearning('SYSTEM', 'test')).toBeNull();
  });
});

// =========================================================================
// indexPreference
// =========================================================================

describe('indexPreference', () => {
  it('should create preference node with correct labels', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-pref1' });
      return '{}';
    }) as any);

    const id = mod.indexPreference('O', 'Prefers direct progress reporting', 'Daniel', 0.85);
    expect(id).toBe('zk-pref1');

    const args = findArgs('create')!;
    const labelIdx = args.indexOf('-l');
    const labels = args[labelIdx + 1];
    expect(labels).toContain('kind:preference');
    expect(labels).toContain('memory:relationship');
    expect(labels).toContain('confidence:high');
    expect(labels).toContain('entity:daniel');
  });

  it('should map confidence 0.5 to medium bucket', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-pref2' });
      return '{}';
    }) as any);

    mod.indexPreference('O', 'test', 'Daniel', 0.5);

    const args = findArgs('create')!;
    const labelIdx = args.indexOf('-l');
    const labels = args[labelIdx + 1];
    expect(labels).toContain('confidence:medium');
  });

  it('should map confidence 0.3 to low bucket', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-pref3' });
      return '{}';
    }) as any);

    mod.indexPreference('W', 'test', 'Daniel', 0.3);

    const args = findArgs('create')!;
    const labelIdx = args.indexOf('-l');
    const labels = args[labelIdx + 1];
    expect(labels).toContain('confidence:low');
  });

  it('should omit confidence label when not provided', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-pref4' });
      return '{}';
    }) as any);

    mod.indexPreference('B', 'test', 'Daniel');

    const args = findArgs('create')!;
    const labelIdx = args.indexOf('-l');
    const labels = args[labelIdx + 1];
    expect(labels).not.toContain('confidence:');
  });

  it('should silently return null when br unavailable', () => {
    execMock.mockImplementation((() => { throw new Error('ENOENT'); }) as any);
    mod.resetBeadsCache();
    expect(mod.indexPreference('O', 'test', 'Daniel', 0.9)).toBeNull();
  });
});

// =========================================================================
// indexSignal
// =========================================================================

describe('indexSignal', () => {
  it('should create failure-pattern for low ratings (<=4)', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'list') return JSON.stringify({ issues: [] });
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-sig1' });
      if (args[0] === 'dep') return '{}';
      return '{}';
    }) as any);

    const id = mod.indexSignal(3, 'negative', 'Frustrated with errors', 'sess-1');
    expect(id).toBe('zk-sig1');

    const args = findArgs('create')!;
    const labelIdx = args.indexOf('-l');
    const labels = args[labelIdx + 1];
    expect(labels).toContain('kind:failure-pattern');
    expect(labels).toContain('rating:low');
    expect(labels).toContain('memory:signal');
    expect(labels).toContain('source:claude-code');
  });

  it('should NOT create failure-pattern for high ratings (>=7)', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-sig2' });
      return '{}';
    }) as any);

    mod.indexSignal(8, 'positive', 'Great work', 'sess-1');

    const args = findArgs('create')!;
    const labelIdx = args.indexOf('-l');
    const labels = args[labelIdx + 1];
    expect(labels).not.toContain('kind:failure-pattern');
    expect(labels).toContain('rating:high');
  });

  it('should use medium bucket for ratings 5-6', () => {
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-sig3' });
      return '{}';
    }) as any);

    mod.indexSignal(5, 'neutral', 'Okay session');

    const args = findArgs('create')!;
    const labelIdx = args.indexOf('-l');
    const labels = args[labelIdx + 1];
    expect(labels).toContain('rating:medium');
    expect(labels).not.toContain('kind:failure-pattern');
  });

  it('should link low-rating signal to active work via caused-by', () => {
    let depArgs: string[] = [];
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-sig-low' });
      if (args[0] === 'list') {
        return JSON.stringify({
          issues: [{ id: 'zk-active-work' }],
        });
      }
      if (args[0] === 'dep') {
        depArgs = [...args];
        return '{}';
      }
      return '{}';
    }) as any);

    mod.indexSignal(2, 'negative', 'Bad session', 'sess-1', 'active-work-slug');
    expect(depArgs).toContain('zk-sig-low');
    expect(depArgs).toContain('zk-active-work');
    expect(depArgs).toContain('caused-by');
  });

  it('should NOT link high-rating signal to work', () => {
    let depCalled = false;
    execMock.mockImplementation(((cmd: any, args: any) => {
      if (!Array.isArray(args)) return '{}';
      if (args[0] === '--version') return 'br 0.1.0';
      if (args[0] === 'create') return JSON.stringify({ id: 'zk-sig-high' });
      if (args[0] === 'dep') {
        depCalled = true;
        return '{}';
      }
      return '{}';
    }) as any);

    mod.indexSignal(9, 'positive', 'Excellent', 'sess-1', 'some-slug');
    expect(depCalled).toBe(false);
  });

  it('should silently return null when br unavailable', () => {
    execMock.mockImplementation((() => { throw new Error('ENOENT'); }) as any);
    mod.resetBeadsCache();
    expect(mod.indexSignal(5, 'neutral', 'test')).toBeNull();
  });
});

// =========================================================================
// All functions: graceful degradation when br unavailable
// =========================================================================

describe('graceful degradation', () => {
  beforeEach(() => {
    execMock.mockImplementation((() => { throw new Error('ENOENT'); }) as any);
    mod.resetBeadsCache();
    beadsInit._resetWorkspaceCache();
  });

  it('brCreate returns null', () => {
    expect(mod.brCreate({ title: 'x', type: 'task', labels: '' })).toBeNull();
  });

  it('brUpdate returns false', () => {
    expect(mod.brUpdate('zk-1', { title: 'x' })).toBe(false);
  });

  it('brList returns empty array', () => {
    expect(mod.brList({})).toEqual([]);
  });

  it('brFindBySlug returns null', () => {
    expect(mod.brFindBySlug('x')).toBeNull();
  });

  it('brSearchTerm returns empty array', () => {
    expect(mod.brSearchTerm('x')).toEqual([]);
  });

  it('brClose returns false', () => {
    expect(mod.brClose('zk-1')).toBe(false);
  });

  it('brDepAdd returns false', () => {
    expect(mod.brDepAdd('a', 'b', 'c')).toBe(false);
  });

  it('indexWorkItem returns null', () => {
    expect(mod.indexWorkItem({ slug: 'x', task: 'x' }, '/path')).toBeNull();
  });

  it('indexCriteriaFragments returns empty array', () => {
    expect(
      mod.indexCriteriaFragments('zk-x', '## Criteria\n- [x] ISC-001: Test\n\n## End')
    ).toEqual([]);
  });

  it('indexLearning returns null', () => {
    expect(mod.indexLearning('SYSTEM', 'test')).toBeNull();
  });

  it('indexPreference returns null', () => {
    expect(mod.indexPreference('O', 'test', 'Daniel')).toBeNull();
  });

  it('indexSignal returns null', () => {
    expect(mod.indexSignal(5, 'neutral', 'test')).toBeNull();
  });
});

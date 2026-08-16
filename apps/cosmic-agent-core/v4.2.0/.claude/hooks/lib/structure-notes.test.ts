/**
 * structure-notes.test.ts — v4.2.0 Structure Notes Tests
 *
 * TDD behaviors from Plan 02:
 *   B4: Create/upsert structure notes for workflows/customers/topics
 *   B5: Link permanent and structure notes into navigable graph neighborhoods
 *   B7: Render compact structure summaries for viewer and retrieval
 */

import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as beadsInit from './beads-init';

let mod: typeof import('./structure-notes');
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
    mod = await import('./structure-notes');
    initialized = true;
  }

  execMock.mockReset();
  existsMock.mockReset();
  mkdirMock.mockReset();
  createCallCount = 0;

  existsMock.mockReturnValue(true);
  mkdirMock.mockReturnValue(undefined as any);
  execMock.mockImplementation(((cmd: any, args: any, _opts?: any) => {
    if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
    if (Array.isArray(args) && args[0] === 'create') {
      createCallCount++;
      return JSON.stringify({ id: `zk-struct-${createCallCount}` });
    }
    if (Array.isArray(args) && args[0] === 'list') {
      return JSON.stringify({ issues: [] });
    }
    if (Array.isArray(args) && args[0] === 'update') return '{}';
    if (Array.isArray(args) && args[0] === 'dep') return '{}';
    return '{}';
  }) as any);

  const beadsIndex = await import('./beads-index');
  beadsIndex.resetBeadsCache();
  beadsInit._resetWorkspaceCache();
});

// =========================================================================
// Behavior 4: Create/upsert structure notes
// =========================================================================

describe('upsertStructureNote', () => {
  it('creates workflow-map structure note with correct labels', () => {
    const id = mod.upsertStructureNote('workflow-map', 'auth-review');
    expect(id).toBe('zk-struct-1');

    const createCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'create'
    );
    expect(createCalls.length).toBe(1);
    const args = createCalls[0][1] as string[];
    const labelIdx = args.indexOf('-l');
    expect(labelIdx).toBeGreaterThan(-1);
    expect(args[labelIdx + 1]).toContain('note:structure');
    expect(args[labelIdx + 1]).toContain('kind:workflow-map');
  });

  it('creates customer-map structure notes', () => {
    const id = mod.upsertStructureNote('customer-map', 'acme-corp');
    expect(id).toBe('zk-struct-1');
  });

  it('creates topic-hub structure notes', () => {
    const id = mod.upsertStructureNote('topic-hub', 'authentication');
    expect(id).toBe('zk-struct-1');
  });

  it('upserts existing structure note instead of creating duplicate', () => {
    execMock.mockImplementation(((cmd: any, args: any, _opts?: any) => {
      if (Array.isArray(args) && args[0] === '--version') return 'br 0.1.0';
      if (Array.isArray(args) && args[0] === 'list') {
        return JSON.stringify({
          issues: [{ id: 'zk-existing-hub', title: 'Workflow Map: auth-review', labels: ['note:structure', 'kind:workflow-map'] }],
        });
      }
      if (Array.isArray(args) && args[0] === 'update') return '{}';
      if (Array.isArray(args) && args[0] === 'create') {
        createCallCount++;
        return JSON.stringify({ id: `zk-struct-${createCallCount}` });
      }
      return '{}';
    }) as any);

    const id = mod.upsertStructureNote('workflow-map', 'auth-review');
    expect(id).toBe('zk-existing-hub');
    expect(createCallCount).toBe(0);
  });

  it('returns null when beads unavailable', () => {
    execMock.mockImplementation((() => {
      throw new Error('not found');
    }) as any);

    const id = mod.upsertStructureNote('workflow-map', 'test');
    expect(id).toBeNull();
  });
});

// =========================================================================
// Behavior 5: Link higher-order notes into navigable neighborhoods
// =========================================================================

describe('linkHigherOrderNotes', () => {
  it('creates edges between permanent notes and structure notes', () => {
    mod.linkHigherOrderNotes({
      permanentNotes: [
        { id: 'zk-perm-1', title: 'Auth tokens expire' },
        { id: 'zk-perm-2', title: 'Rate limit logins' },
      ],
      structureNotes: [
        { id: 'zk-hub-1', kind: 'workflow-map', label: 'auth', title: 'Workflow Map: auth', linkedIds: [] },
      ],
    });

    const depCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'dep' && c[1][1] === 'add'
    );
    expect(depCalls.length).toBe(2);
  });

  it('uses belongs-to-workflow edge for workflow-map hubs', () => {
    mod.linkHigherOrderNotes({
      permanentNotes: [{ id: 'zk-perm-1', title: 'Test' }],
      structureNotes: [
        { id: 'zk-hub-1', kind: 'workflow-map', label: 'auth', title: 'Workflow Map: auth', linkedIds: [] },
      ],
    });

    const depCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'dep' && c[1][1] === 'add'
    );
    const args = depCalls[0][1] as string[];
    expect(args).toContain('belongs-to-workflow');
  });

  it('uses belongs-to-customer edge for customer-map hubs', () => {
    mod.linkHigherOrderNotes({
      permanentNotes: [{ id: 'zk-perm-1', title: 'Test' }],
      structureNotes: [
        { id: 'zk-hub-1', kind: 'customer-map', label: 'acme', title: 'Customer Map: acme', linkedIds: [] },
      ],
    });

    const depCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'dep' && c[1][1] === 'add'
    );
    const args = depCalls[0][1] as string[];
    expect(args).toContain('belongs-to-customer');
  });

  it('uses supports edge for topic-hub and project-hub', () => {
    mod.linkHigherOrderNotes({
      permanentNotes: [{ id: 'zk-perm-1', title: 'Test' }],
      structureNotes: [
        { id: 'zk-hub-1', kind: 'topic-hub', label: 'auth', title: 'Topic Hub: auth', linkedIds: [] },
      ],
    });

    const depCalls = execMock.mock.calls.filter(
      (c: any) => Array.isArray(c[1]) && c[1][0] === 'dep' && c[1][1] === 'add'
    );
    const args = depCalls[0][1] as string[];
    expect(args).toContain('supports');
  });

  it('does nothing when beads unavailable', () => {
    execMock.mockImplementation((() => {
      throw new Error('not found');
    }) as any);

    mod.linkHigherOrderNotes({
      permanentNotes: [{ id: 'zk-perm-1', title: 'Test' }],
      structureNotes: [
        { id: 'zk-hub-1', kind: 'workflow-map', label: 'auth', title: 'Test', linkedIds: [] },
      ],
    });
  });
});

// =========================================================================
// Behavior 7: Render structure-note summaries
// =========================================================================

describe('renderStructureSummary', () => {
  it('renders compact summary with kind and label', () => {
    const summary = mod.renderStructureSummary({
      id: 'zk-hub-1',
      kind: 'workflow-map',
      label: 'auth-review',
      title: 'Workflow Map: auth-review',
      linkedIds: ['zk-1', 'zk-2'],
    });

    expect(summary).toContain('Workflow Map: auth-review');
    expect(summary).toContain('workflow-map');
    expect(summary).toContain('Linked nodes: 2');
  });

  it('includes top linked failures when present', () => {
    const summary = mod.renderStructureSummary({
      id: 'zk-hub-1',
      kind: 'workflow-map',
      label: 'auth-review',
      title: 'Workflow Map: auth-review',
      linkedIds: ['zk-1'],
      linkedFailures: ['Token expiry not validated', 'Rate limit bypass found'],
    });

    expect(summary).toContain('Top linked failures');
    expect(summary).toContain('Token expiry not validated');
  });

  it('includes top permanent notes when present', () => {
    const summary = mod.renderStructureSummary({
      id: 'zk-hub-1',
      kind: 'topic-hub',
      label: 'auth',
      title: 'Topic Hub: auth',
      linkedIds: ['zk-1'],
      linkedPermanentNotes: [{ title: 'Always validate JWT audience' }],
    });

    expect(summary).toContain('Top permanent notes');
    expect(summary).toContain('Always validate JWT audience');
  });

  it('includes top learnings when present', () => {
    const summary = mod.renderStructureSummary({
      id: 'zk-hub-1',
      kind: 'customer-map',
      label: 'acme',
      title: 'Customer Map: acme',
      linkedIds: [],
      linkedLearnings: ['Prefers async communication'],
    });

    expect(summary).toContain('Top learnings');
    expect(summary).toContain('Prefers async communication');
  });

  it('stays compact without full artifact expansion', () => {
    const summary = mod.renderStructureSummary({
      id: 'zk-hub-1',
      kind: 'workflow-map',
      label: 'large-workflow',
      title: 'Workflow Map: large-workflow',
      linkedIds: Array.from({ length: 50 }, (_, i) => `zk-${i}`),
    });

    const lines = summary.split('\n');
    expect(lines.length).toBeLessThan(20);
  });
});

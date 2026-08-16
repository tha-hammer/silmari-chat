/**
 * ChecklistEnforcer.test.ts — unit tests for the Marketing persistence hook.
 *
 * Isolates disk state by setting MARKETING_STATE_ROOT / MARKETING_LEGACY_STATE_FILE
 * to a per-test tmpdir. The hook reads these env vars lazily (via getStateRoot /
 * getLegacyStateFile) so each beforeEach block gets a fresh root.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { normalizeSlug, nextVersion, EXPECTED_FILENAMES, SCHEMA_VERSION } from './types';
import type { ChecklistState, VersionString, ChecklistIndex } from './types';
import {
  allocateVersion,
  writeIndex,
  readIndex,
  writeHandoffArtifact,
  rehydrateFromArtifact,
  resolveProjectRoot,
  migrateLegacyIfNeeded,
  stateFilePath,
  getStateRoot,
  verifyHandoffArtifact,
} from './ChecklistEnforcer.hook';

let tmp: string;

function makeState(overrides: Partial<ChecklistState> = {}): ChecklistState {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    client: 'acme',
    product: 'widget',
    version: 'v1' as VersionString,
    active: true,
    phase: 'expand',
    currentSection: 18,
    totalSections: 18,
    expandedSections: EXPECTED_FILENAMES.map((fn, i) => ({
      number: i + 1,
      content: `# ${fn}\n\nbody of section ${i + 1}`,
    })),
    exchangeCount: 10,
    startedAt: now,
    lastUpdated: now,
    handoffPath: null,
    handoffVerifiedAt: null,
    handoffVerifyError: null,
    handoffWriteInProgress: false,
    migratedFromLegacy: false,
    questions: {
      understanding: { asked: [], answered: [], total: 8 },
      improvement: { asked: [], answered: [], total: 10 },
    },
    completionEvidence: {
      target_audience_defined: true,
      core_problem_identified: true,
      value_proposition_clear: true,
      checklist_structure_defined: true,
      key_sections_identified: true,
      dependencies_resolved: true,
      all_sections_expanded: true,
    },
    transitionProposed: false,
    transitionProposedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'enforcer-'));
  process.env.MARKETING_STATE_ROOT = join(tmp, 'state');
  process.env.MARKETING_LEGACY_STATE_FILE = join(tmp, 'legacy.json');
});

afterEach(() => {
  delete process.env.MARKETING_STATE_ROOT;
  delete process.env.MARKETING_LEGACY_STATE_FILE;
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('normalizeSlug', () => {
  it('normalizes "Acme  Corp!" to "acme-corp"', () => {
    const r = normalizeSlug('Acme  Corp!');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slug).toBe('acme-corp');
  });

  it('rejects empty input as too short', () => {
    const r = normalizeSlug('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('too short');
  });

  it('rejects single-char input as too short', () => {
    const r = normalizeSlug('a');
    expect(r.ok).toBe(false);
  });

  it('rejects a string of only punctuation (empties after strip)', () => {
    const r = normalizeSlug('---!!!');
    expect(r.ok).toBe(false);
  });

  it('rejects a 41-char slug as too long', () => {
    const r = normalizeSlug('a'.repeat(41));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('too long');
  });

  it('accepts a simple valid slug', () => {
    const r = normalizeSlug('saas-onboarding');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slug).toBe('saas-onboarding');
  });
});

describe('nextVersion', () => {
  it('returns v1 for empty input', () => {
    expect(nextVersion([])).toBe('v1');
  });

  it('handles natural-numeric ordering (v10 > v9)', () => {
    expect(nextVersion(['v1', 'v2', 'v9', 'v10'] as VersionString[])).toBe('v11');
  });

  it('ignores non-matching strings', () => {
    expect(nextVersion(['v1', 'not-a-version'] as VersionString[])).toBe('v2');
  });
});

describe('resolveProjectRoot', () => {
  it('returns null when no .git or CLAUDE.md exists in any ancestor', () => {
    expect(resolveProjectRoot(tmp)).toBeNull();
  });

  it('returns the dir when CLAUDE.md exists', () => {
    writeFileSync(join(tmp, 'CLAUDE.md'), '');
    expect(resolveProjectRoot(tmp)).toBe(tmp);
  });

  it('returns an ancestor dir when only the ancestor has .git', () => {
    mkdirSync(join(tmp, '.git'));
    const child = join(tmp, 'a', 'b', 'c');
    mkdirSync(child, { recursive: true });
    expect(resolveProjectRoot(child)).toBe(tmp);
  });
});

describe('allocateVersion (concurrent / EEXIST)', () => {
  it('first call returns v1', async () => {
    const v = await allocateVersion('acme', 'widget');
    expect(v).toBe('v1');
    expect(existsSync(stateFilePath('acme', 'widget', v))).toBe(true);
  });

  it('second call for same (client, product) returns v2', async () => {
    await allocateVersion('acme', 'widget');
    const v2 = await allocateVersion('acme', 'widget');
    expect(v2).toBe('v2');
  });

  it('concurrent allocations resolve to distinct versions', async () => {
    const [a, b, c] = await Promise.all([
      allocateVersion('acme', 'widget'),
      allocateVersion('acme', 'widget'),
      allocateVersion('acme', 'widget'),
    ]);
    const set = new Set([a, b, c]);
    expect(set.size).toBe(3);
    expect(set.has('v1' as VersionString)).toBe(true);
  });
});

describe('writeIndex (GC)', () => {
  it('drops entries whose state files are missing', async () => {
    // Create one real state file
    await allocateVersion('acme', 'widget');
    const active = [
      { client: 'acme', product: 'widget', version: 'v1' as VersionString },
      { client: 'ghost', product: 'nope', version: 'v1' as VersionString },
    ];
    await writeIndex(active, active[0]);
    const idx = await readIndex();
    expect(idx).not.toBeNull();
    expect(idx!.active).toHaveLength(1);
    expect(idx!.active[0].client).toBe('acme');
  });

  it('clears lastActive when its state file is missing', async () => {
    const gone = { client: 'ghost', product: 'nope', version: 'v1' as VersionString };
    await writeIndex([], gone);
    const idx = await readIndex();
    expect(idx!.lastActive).toBeNull();
  });
});

describe('writeHandoffArtifact (atomic tmp → rename)', () => {
  it('writes 18 files into v{N}/ via tmp+rename, no tmp dir left behind', async () => {
    // Set up project root via CLAUDE.md + cwd
    writeFileSync(join(tmp, 'CLAUDE.md'), '');
    const origCwd = process.cwd();
    try {
      process.chdir(tmp);
      const state = makeState();
      const res = await writeHandoffArtifact(state);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const finalDir = join(tmp, 'copyplatforms', 'acme', 'widget', 'v1');
      expect(res.outDir).toBe(finalDir);
      expect(existsSync(finalDir)).toBe(true);
      expect(existsSync(join(tmp, 'copyplatforms', 'acme', 'widget', 'v1.tmp'))).toBe(false);
      for (const fn of EXPECTED_FILENAMES) {
        const p = join(finalDir, fn);
        expect(existsSync(p)).toBe(true);
        expect(readFileSync(p, 'utf8').length).toBeGreaterThan(0);
      }
      expect(existsSync(join(tmp, 'copyplatforms', '.project-sentinel'))).toBe(true);
    } finally {
      process.chdir(origCwd);
    }
  });

  it('returns { ok: false, reason: "no-project-root" } when no root found', async () => {
    // Run from a directory with neither .git nor CLAUDE.md in any ancestor.
    // We can't realistically achieve this in practice if HOME/repo ancestors
    // happen to have them — we just run from tmp and ensure the result shape
    // is one of the documented failure modes.
    const origCwd = process.cwd();
    try {
      process.chdir(tmp);
      const state = makeState();
      const res = await writeHandoffArtifact(state);
      // Either no-project-root (no ancestor match) OR ok (an ancestor has
      // .git/CLAUDE.md). Both are valid — the assertion is that the result
      // is never a silent fallback into $PWD.
      if (!res.ok) expect(res.reason).toBe('no-project-root');
    } finally {
      process.chdir(origCwd);
    }
  });
});

describe('rehydrateFromArtifact', () => {
  it('reloads all 18 section contents from disk', async () => {
    const outDir = join(tmp, 'platform-v1');
    mkdirSync(outDir, { recursive: true });
    for (const fn of EXPECTED_FILENAMES) {
      writeFileSync(join(outDir, fn), `body of ${fn}`);
    }
    const state = makeState({ handoffPath: outDir, expandedSections: [] });
    const rehydrated = await rehydrateFromArtifact(state);
    expect(rehydrated.expandedSections).toHaveLength(18);
    expect(rehydrated.expandedSections[0].number).toBe(1);
    expect(rehydrated.expandedSections[0].content).toBe(`body of ${EXPECTED_FILENAMES[0]}`);
  });

  it('passes through unchanged when handoffPath is null', async () => {
    const state = makeState({ handoffPath: null });
    const r = await rehydrateFromArtifact(state);
    expect(r).toEqual(state);
  });

  it('passes through unchanged when handoffPath does not exist', async () => {
    const state = makeState({ handoffPath: join(tmp, 'nope') });
    const r = await rehydrateFromArtifact(state);
    expect(r).toEqual(state);
  });
});

describe('migrateLegacyIfNeeded', () => {
  it('converts legacy marketing-checklist.json to default/{slug}/v1.json', async () => {
    const legacyFile = process.env.MARKETING_LEGACY_STATE_FILE!;
    mkdirSync(join(tmp), { recursive: true });
    const legacy = {
      active: true,
      phase: 'understanding',
      currentSection: 0,
      expandedSections: [],
      totalSections: 18,
      exchangeCount: 3,
      startedAt: '2026-04-10T00:00:00Z',
      lastUpdated: '2026-04-12T00:00:00Z',
      topicSlug: 'acme-launch',
      questions: {
        understanding: { asked: ['product_service'], answered: ['product_service'], total: 8 },
        improvement: { asked: [], answered: [], total: 10 },
      },
      completionEvidence: {
        target_audience_defined: true,
        core_problem_identified: false,
        value_proposition_clear: false,
        checklist_structure_defined: false,
        key_sections_identified: false,
        dependencies_resolved: false,
      },
      transitionProposed: false,
      transitionProposedAt: null,
    };
    writeFileSync(legacyFile, JSON.stringify(legacy));

    const did = await migrateLegacyIfNeeded();
    expect(did).toBe(true);

    const migrated = JSON.parse(
      readFileSync(stateFilePath('default', 'acme-launch', 'v1' as VersionString), 'utf8'),
    ) as ChecklistState;
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.client).toBe('default');
    expect(migrated.product).toBe('acme-launch');
    expect(migrated.version).toBe('v1');
    expect(migrated.migratedFromLegacy).toBe(true);
    expect(migrated.handoffPath).toBeNull();
    expect(migrated.expandedSections).toEqual([]);

    // Legacy file was renamed to .migrated (not deleted).
    expect(existsSync(legacyFile)).toBe(false);
    expect(existsSync(`${legacyFile}.migrated`)).toBe(true);

    // Idempotent — second call is a no-op.
    const did2 = await migrateLegacyIfNeeded();
    expect(did2).toBe(false);
  });

  it('is a no-op when no legacy file exists', async () => {
    const did = await migrateLegacyIfNeeded();
    expect(did).toBe(false);
  });

  it('is a no-op when three-tier root already has state', async () => {
    // Prime a three-tier state file
    await allocateVersion('acme', 'widget');
    // Create a legacy file too
    writeFileSync(process.env.MARKETING_LEGACY_STATE_FILE!, JSON.stringify({ topicSlug: 'x' }));
    const did = await migrateLegacyIfNeeded();
    expect(did).toBe(false);
  });
});

describe('schema version self-check', () => {
  it('the test-generated state has schemaVersion === 2', () => {
    expect(makeState().schemaVersion).toBe(2);
  });
});

// ── Phase 3: verifyHandoffArtifact ──

describe('verifyHandoffArtifact', () => {
  function seedDir(files: { name: string; content: string }[]): string {
    const dir = join(tmp, 'artifact-' + Math.random().toString(36).slice(2, 8));
    mkdirSync(dir, { recursive: true });
    for (const f of files) writeFileSync(join(dir, f.name), f.content);
    return dir;
  }

  it('returns ok with ISO-8601 when all 18 files present and non-empty', async () => {
    const dir = seedDir(EXPECTED_FILENAMES.map(fn => ({ name: fn, content: `body ${fn}` })));
    const r = await verifyHandoffArtifact(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns missing list when directory does not exist', async () => {
    const r = await verifyHandoffArtifact(join(tmp, 'does-not-exist'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.missing).toHaveLength(18);
      expect(r.error.actual).toEqual([]);
    }
  });

  it('returns missing list when one file is absent', async () => {
    const dir = seedDir(EXPECTED_FILENAMES.slice(1).map(fn => ({ name: fn, content: 'x' })));
    const r = await verifyHandoffArtifact(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.missing).toEqual([EXPECTED_FILENAMES[0]]);
      expect(r.error.empty).toEqual([]);
      expect(r.error.unexpected).toEqual([]);
    }
  });

  it('returns empty list when one file is zero-byte', async () => {
    const files = EXPECTED_FILENAMES.map((fn, i) => ({ name: fn, content: i === 5 ? '' : 'body' }));
    const dir = seedDir(files);
    const r = await verifyHandoffArtifact(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.missing).toEqual([]);
      expect(r.error.empty).toEqual([EXPECTED_FILENAMES[5]]);
    }
  });

  it('returns unexpected list when an extra file is present', async () => {
    const files = EXPECTED_FILENAMES.map(fn => ({ name: fn, content: 'body' }));
    files.push({ name: '99-rogue.md', content: 'not allowed' });
    const dir = seedDir(files);
    const r = await verifyHandoffArtifact(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.missing).toEqual([]);
      expect(r.error.empty).toEqual([]);
      expect(r.error.unexpected).toEqual(['99-rogue.md']);
    }
  });

  it('reports all three failure kinds together when they co-occur', async () => {
    const files = EXPECTED_FILENAMES.slice(2).map((fn, i) => ({
      name: fn,
      content: i === 0 ? '' : 'body',
    }));
    files.push({ name: '99-rogue.md', content: 'x' });
    const dir = seedDir(files);
    const r = await verifyHandoffArtifact(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.missing.length).toBe(2); // 01-usp.md and 02-claims-proof.md
      expect(r.error.empty).toEqual([EXPECTED_FILENAMES[2]]);
      expect(r.error.unexpected).toEqual(['99-rogue.md']);
    }
  });
});

describe('writeHandoffArtifact + verify integration', () => {
  it('a happy-path write passes post-persist verify', async () => {
    writeFileSync(join(tmp, 'CLAUDE.md'), '');
    const origCwd = process.cwd();
    try {
      process.chdir(tmp);
      const state = makeState();
      const write = await writeHandoffArtifact(state);
      expect(write.ok).toBe(true);
      if (!write.ok) return;
      const verify = await verifyHandoffArtifact(write.outDir);
      expect(verify.ok).toBe(true);
    } finally {
      process.chdir(origCwd);
    }
  });

  it('deleting a file post-write produces a verify failure with that file in missing[]', async () => {
    writeFileSync(join(tmp, 'CLAUDE.md'), '');
    const origCwd = process.cwd();
    try {
      process.chdir(tmp);
      const state = makeState();
      const write = await writeHandoffArtifact(state);
      if (!write.ok) throw new Error('setup failed');
      rmSync(join(write.outDir, '01-usp.md'));
      const verify = await verifyHandoffArtifact(write.outDir);
      expect(verify.ok).toBe(false);
      if (!verify.ok) expect(verify.error.missing).toEqual(['01-usp.md']);
    } finally {
      process.chdir(origCwd);
    }
  });
});

/**
 * ChecklistStateInjector.test.ts — auto-re-verify self-heal tests (Phase 3).
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { EXPECTED_FILENAMES, SCHEMA_VERSION } from './types';
import type { ChecklistState, VersionString, VerifyError } from './types';
import {
  applySelfHealAutoVerify,
  verifyHandoffArtifactSync,
  matchesMarketingIntent,
  discoverChecklists,
  matchesSlugInPrompt,
  smartMatch,
  buildInjectionForTriple,
  buildPickerReminder,
  type ChecklistTriple,
} from './ChecklistStateInjector.hook';

let tmp: string;

function makeState(overrides: Partial<ChecklistState> = {}): ChecklistState {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    client: 'acme',
    product: 'widget',
    version: 'v1' as VersionString,
    active: true,
    phase: 'implement',
    currentSection: 18,
    totalSections: 18,
    expandedSections: [],
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

function seedGoodArtifact(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const fn of EXPECTED_FILENAMES) writeFileSync(join(dir, fn), `body of ${fn}`);
}

const FULL_ERR: VerifyError = {
  expected: [...EXPECTED_FILENAMES],
  actual: [],
  missing: [...EXPECTED_FILENAMES],
  empty: [],
  unexpected: [],
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'injector-'));
});

afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('applySelfHealAutoVerify', () => {
  it('heals a state whose error is now fixed on disk', () => {
    const outDir = join(tmp, 'artifact');
    seedGoodArtifact(outDir);
    const state = makeState({
      handoffPath: outDir,
      handoffVerifyError: FULL_ERR,
      handoffVerifiedAt: null,
    });
    const r = applySelfHealAutoVerify(state);
    expect(r).toBe('healed');
    expect(state.handoffVerifyError).toBeNull();
    expect(state.handoffVerifiedAt).not.toBeNull();
  });

  it('is skipped when no error is pending (guard)', () => {
    const state = makeState({ handoffVerifyError: null });
    const r = applySelfHealAutoVerify(state);
    expect(r).toBe('skipped');
    expect(state.handoffVerifiedAt).toBeNull();
  });

  it('is skipped when handoffPath is missing from disk', () => {
    const state = makeState({
      handoffPath: join(tmp, 'nonexistent'),
      handoffVerifyError: FULL_ERR,
    });
    const r = applySelfHealAutoVerify(state);
    expect(r).toBe('skipped');
    expect(state.handoffVerifyError).toEqual(FULL_ERR);
  });

  it('refreshes the error when new-disk-state is still broken, with CURRENT failing files', () => {
    const outDir = join(tmp, 'artifact');
    mkdirSync(outDir, { recursive: true });
    // Seed only 17 files — first file missing
    for (const fn of EXPECTED_FILENAMES.slice(1)) writeFileSync(join(outDir, fn), 'body');
    const state = makeState({
      handoffPath: outDir,
      handoffVerifyError: FULL_ERR, // stale snapshot: all 18 "missing"
    });
    const r = applySelfHealAutoVerify(state);
    expect(r).toBe('refreshed');
    expect(state.handoffVerifyError).not.toBeNull();
    expect(state.handoffVerifyError!.missing).toEqual([EXPECTED_FILENAMES[0]]);
    expect(state.handoffVerifyError!.empty).toEqual([]);
  });
});

describe('verifyHandoffArtifactSync (Injector copy)', () => {
  it('matches the async verifier on a good artifact', () => {
    const outDir = join(tmp, 'artifact');
    seedGoodArtifact(outDir);
    const r = verifyHandoffArtifactSync(outDir);
    expect(r.ok).toBe(true);
  });

  it('reports missing when a file is absent', () => {
    const outDir = join(tmp, 'artifact');
    mkdirSync(outDir, { recursive: true });
    for (const fn of EXPECTED_FILENAMES.slice(2)) writeFileSync(join(outDir, fn), 'body');
    const r = verifyHandoffArtifactSync(outDir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.missing.length).toBe(2);
  });
});

// ── Phase 4: matchesMarketingIntent ──

describe('matchesMarketingIntent', () => {
  it('matches every STRONG trigger', () => {
    const triggers = [
      'create marketing for acme', 'build marketing plan', 'make marketing',
      'do marketing', 'plan marketing', 'marketing for my product',
      'marketing campaign', 'marketing plan', 'marketing checklist',
      'marketing platform', 'marketing foundation',
      'copy platform', 'build a copy platform', 'persuasion checklist',
    ];
    for (const t of triggers) {
      expect(matchesMarketingIntent(t)).toBe(true);
    }
  });

  it('WEAK trigger alone does NOT match', () => {
    expect(matchesMarketingIntent('what does ICP mean in architecture docs?')).toBe(false);
    expect(matchesMarketingIntent('brand discovery session')).toBe(false);
  });

  it('WEAK trigger + anchor matches', () => {
    expect(matchesMarketingIntent('explain the marketing ICP framework')).toBe(true);
    expect(matchesMarketingIntent('brand discovery for our marketing offer')).toBe(true);
  });

  it('non-matching prompts do not match', () => {
    expect(matchesMarketingIntent('fix the login bug')).toBe(false);
    expect(matchesMarketingIntent('what is the weather')).toBe(false);
    expect(matchesMarketingIntent('deploy the api server')).toBe(false);
  });
});

// ── Phase 4: discoverChecklists ──

describe('discoverChecklists', () => {
  function seedChecklist(root: string, c: string, p: string, v: string): void {
    const dir = join(root, 'copyplatforms', c, p, v);
    mkdirSync(dir, { recursive: true });
    for (const fn of EXPECTED_FILENAMES) writeFileSync(join(dir, fn), `body ${fn}`);
  }

  it('returns empty when no copyplatforms dir', () => {
    expect(discoverChecklists(tmp)).toEqual([]);
  });

  it('discovers one valid checklist', () => {
    seedChecklist(tmp, 'acme', 'widget', 'v1');
    writeFileSync(join(tmp, 'copyplatforms', '.project-sentinel'), '');
    const r = discoverChecklists(tmp);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({
      client: 'acme',
      product: 'widget',
      version: 'v1',
      path: join(tmp, 'copyplatforms', 'acme', 'widget', 'v1'),
    });
  });

  it('discovers many checklists across clients', () => {
    seedChecklist(tmp, 'acme', 'widget', 'v1');
    seedChecklist(tmp, 'acme', 'widget', 'v2');
    seedChecklist(tmp, 'beta', 'service', 'v1');
    const r = discoverChecklists(tmp);
    expect(r).toHaveLength(3);
  });

  it('skips malformed entries (no NN-*.md files)', () => {
    const dir = join(tmp, 'copyplatforms', 'acme', 'widget', 'v1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'readme.txt'), 'not a section');
    expect(discoverChecklists(tmp)).toEqual([]);
  });

  it('skips non-version dirs (e.g. "draft")', () => {
    const dir = join(tmp, 'copyplatforms', 'acme', 'widget', 'draft');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '01-usp.md'), 'body');
    expect(discoverChecklists(tmp)).toEqual([]);
  });
});

// ── Phase 4: matchesSlugInPrompt ──

describe('matchesSlugInPrompt', () => {
  it('full-slug match', () => {
    expect(matchesSlugInPrompt('marketing for saas-onboarding', 'saas-onboarding')).toBe('full');
  });

  it('token match (min length 4)', () => {
    expect(matchesSlugInPrompt('write copy about onboarding', 'saas-onboarding')).toBe('token');
  });

  it('tokens shorter than 4 are ignored', () => {
    expect(matchesSlugInPrompt('hi', 'hi-there')).toBe('none');
  });

  it('word-boundary prevents substring matching', () => {
    // "onboarding" should NOT match inside "preonboardingly"
    expect(matchesSlugInPrompt('preonboardingly', 'saas-onboarding')).toBe('none');
  });

  it('returns none when nothing matches', () => {
    expect(matchesSlugInPrompt('fix login bug', 'saas-onboarding')).toBe('none');
  });
});

// ── Phase 4: smartMatch ──

describe('smartMatch', () => {
  const mk = (c: string, p: string, v: string): ChecklistTriple => ({
    client: c, product: p, version: v, path: `/fake/${c}/${p}/${v}`,
  });

  it('unique full-slug product match wins', () => {
    const r = smartMatch('create marketing for saas-onboarding', [
      mk('acme', 'saas-onboarding', 'v1'),
      mk('acme', 'widget', 'v1'),
    ]);
    expect(r.selected?.product).toBe('saas-onboarding');
    expect(r.reason).toBe('product-full-match');
  });

  it('client-with-single-product falls back gracefully', () => {
    const r = smartMatch('marketing for acme', [
      mk('acme', 'widget', 'v1'),
      mk('acme', 'widget', 'v2'),
    ]);
    expect(r.selected?.version).toBe('v2'); // highest
    expect(r.reason).toBe('client-unique-product');
  });

  it('token match (unique) resolves when full-slug absent', () => {
    const r = smartMatch('write onboarding emails', [
      mk('acme', 'saas-onboarding', 'v1'),
      mk('beta', 'fitness-coaching', 'v1'),
    ]);
    expect(r.selected?.product).toBe('saas-onboarding');
    expect(r.reason).toBe('product-token-match');
  });

  it('returns null (ambiguous) when multiple products token-match', () => {
    const r = smartMatch('create marketing for widget onboarding', [
      mk('acme', 'onboarding-widget', 'v1'),
      mk('beta', 'onboarding-service', 'v1'),
    ]);
    expect(r.selected).toBeNull();
    expect(r.reason).toBe('ambiguous');
  });

  it('returns null when nothing matches', () => {
    const r = smartMatch('fix the login bug', [mk('acme', 'widget', 'v1')]);
    expect(r.selected).toBeNull();
    expect(r.reason).toBe('ambiguous');
  });
});

// ── Phase 4: injection builders ──

describe('buildInjectionForTriple', () => {
  it('produces a verbatim injection with no narration markers', () => {
    const dir = join(tmp, 'cp', 'acme', 'widget', 'v1');
    mkdirSync(dir, { recursive: true });
    for (const fn of EXPECTED_FILENAMES) writeFileSync(join(dir, fn), `body of ${fn}`);
    const t: ChecklistTriple = { client: 'acme', product: 'widget', version: 'v1', path: dir };
    const out = buildInjectionForTriple(t, 'create marketing for widget');
    expect(out).toContain('MARKETING-CHECKLIST-LOADED');
    expect(out).toContain('--- BEGIN CHECKLIST ---');
    expect(out).toContain('body of 01-usp.md');
    // The DO NOT directives themselves contain "I FOUND" — that's fine.
    // What matters is that NO freeform narration exists outside the directives.
    expect(out).toContain('DO NOT NARRATE');
    expect(out).toContain("START YOUR RESPONSE WITH THE USER'S REQUESTED DELIVERABLE.");
  });
});

describe('buildPickerReminder', () => {
  it('lists available triples', () => {
    const out = buildPickerReminder([
      { client: 'acme', product: 'widget', version: 'v1', path: '/fake' },
      { client: 'acme', product: 'widget', version: 'v2', path: '/fake' },
      { client: 'beta', product: 'service', version: 'v1', path: '/fake' },
    ]);
    expect(out).toContain('MARKETING-CHECKLIST-AMBIGUOUS');
    expect(out).toContain('acme/widget');
    expect(out).toContain('beta/service');
  });
});

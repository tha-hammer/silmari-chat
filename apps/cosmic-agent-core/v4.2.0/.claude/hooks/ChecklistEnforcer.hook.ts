#!/usr/bin/env bun
/**
 * ChecklistEnforcer.hook.ts — Marketing skill post-response state tracking
 * (Schema v2: multi-tenant three-tier state + atomic handoff artifact)
 *
 * PURPOSE:
 *   Tracks what the LLM did AFTER each response — parses for phase transition
 *   markers, captures <SECTION_CONTENT##> bodies during Expand, scans for
 *   evidence that enumerated questions were asked/answered, and updates
 *   completion evidence flags. On <EXPANSION_COMPLETE>, writes the 18-file
 *   copy-platform artifact atomically to
 *     {project-root}/copyplatforms/{client}/{product}/{version}/
 *
 * TRIGGER: Stop (after each Claude response)
 *
 * INPUT: Standard Stop hook payload via stdin (session_id, transcript_path,
 *        last_assistant_message). Also reads the user's previous message from
 *        transcript to detect question answers.
 *
 * OUTPUT: None (silent tracking). Injection is handled by
 *         ChecklistStateInjector on the next UserPromptSubmit.
 *
 * SIDE EFFECTS (per session):
 *   reads/writes  ~/.claude/MEMORY/STATE/marketing-checklists/index.json
 *   reads/writes  ~/.claude/MEMORY/STATE/marketing-checklists/{c}/{p}/{v}.json
 *   writes        {project-root}/copyplatforms/{c}/{p}/{v}/*.md  (18 files)
 *   writes        {project-root}/copyplatforms/.project-sentinel
 *
 * VERIFY: stubbed in Phase 2 — Phase 3 adds verifyHandoffArtifact() integration.
 */

import { readHookInput } from './lib/hook-io';
import { readFileSync, existsSync } from 'fs';
import * as fs from 'fs/promises';
import { join, dirname, resolve as resolvePath } from 'path';
import { homedir } from 'os';
import {
  ChecklistState,
  ChecklistIndex,
  EXPECTED_FILENAMES,
  SCHEMA_VERSION,
  TOTAL_SECTIONS,
  VersionString,
  nextVersion,
  normalizeSlug,
  VERSION_RE,
} from './types';

// ── Paths ──
// Resolved lazily so tests can override via env (MARKETING_STATE_ROOT /
// MARKETING_LEGACY_STATE_FILE) without needing to evict the module from
// bun's import cache.

export function getStateRoot(): string {
  return process.env.MARKETING_STATE_ROOT
    || join(homedir(), '.claude', 'MEMORY', 'STATE', 'marketing-checklists');
}

export function getIndexPath(): string {
  return join(getStateRoot(), 'index.json');
}

export function getLegacyStateFile(): string {
  return process.env.MARKETING_LEGACY_STATE_FILE
    || join(homedir(), '.claude', 'MEMORY', 'STATE', 'marketing-checklist.json');
}

export function stateFilePath(c: string, p: string, v: VersionString): string {
  return join(getStateRoot(), c, p, `${v}.json`);
}

// STRICT: returns null when no .git / CLAUDE.md found in any ancestor.
// Callers handling writes MUST treat null as fatal — never silently fall back
// to $PWD (would scatter artifacts in arbitrary directories).
export function resolveProjectRoot(start: string = process.cwd()): string | null {
  let dir = resolvePath(start);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (existsSync(join(dir, 'CLAUDE.md'))) return dir;
    dir = dirname(dir);
  }
  return null;
}

// ── Transcript parsing ──

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(c => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') {
          const obj = c as any;
          if (obj.text) return obj.text;
          if (obj.content) return contentToText(obj.content);
        }
        return '';
      })
      .join(' ')
      .trim();
  }
  return '';
}

function getLastUserMessage(transcriptPath: string): string {
  try {
    const raw = readFileSync(transcriptPath, 'utf-8');
    const lines = raw.trim().split('\n');
    let lastUserMessage = '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as any;
        if (entry.type === 'user' && entry.message?.content) {
          const text = contentToText(entry.message.content);
          if (text) lastUserMessage = text;
        }
      } catch { /* skip */ }
    }
    return lastUserMessage;
  } catch {
    return '';
  }
}

// ── Question detection patterns ──
// Each question has keywords that indicate it was ASKED by the assistant,
// and keywords that indicate it was ANSWERED by the user. Intentionally broad:
// false positives are corrected by the human; false negatives stall the flow.

const UNDERSTANDING_PATTERNS: Record<string, { ask: RegExp[]; answer: RegExp[] }> = {
  product_service: {
    ask: [/what.{0,10}(product|service).{0,20}(marketing|selling|sell|offer)/i, /what are you (marketing|selling|offering)/i],
    answer: [/\b(we|i|our)\b.{0,50}(sell|offer|provide|make|build)/i, /our (product|service|company|business)/i],
  },
  ideal_client: {
    ask: [/who.{0,10}ideal (client|customer)/i, /describe your (target|ideal)/i],
    answer: [/our (ideal|typical|target) (client|customer|buyer)/i, /age \d+|years old|we work with/i],
  },
  audience_segments: {
    ask: [/3-5 (target )?audiences?/i, /who else/i, /audience segments?/i, /different (audiences?|segments?)/i],
    answer: [/(segment|audience) (\d|one|two|three)|another (group|audience)|multiple (groups|audiences)/i],
  },
  core_problems: {
    ask: [/what problems?/i, /trying now.{0,20}not working/i, /(pain|struggle)/i],
    answer: [/\b(struggle|problem|pain|hard|difficult|can'?t|unable)\b/i],
  },
  desired_outcome: {
    ask: [/what outcome|what (do they )?want/i, /after solving|dream result/i],
    answer: [/they want|the outcome|goal is|dream is|aspire/i],
  },
  proof_points: {
    ask: [/what proof/i, /case stud(y|ies)/i, /testimonials?/i, /results.{0,30}(show|prove)/i],
    answer: [/case stud|testimonial|result|proof|\d+%|clients? (who|have)/i],
  },
  differentiator: {
    ask: [/different from competitors?/i, /what makes (you|your|it) (different|unique)/i, /(usp|unique selling)/i],
    answer: [/unlike|unique|different because|we'?re the only/i],
  },
  cta_next_step: {
    ask: [/(immediate )?next step/i, /call to action|cta/i, /when they see your ad/i],
    answer: [/(click|book|schedule|sign up|opt in|download|call|buy)/i],
  },
};

const IMPROVEMENT_PATTERNS: Record<string, { ask: RegExp[]; answer: RegExp[] }> = {
  failed_solutions: {
    ask: [/trying now.{0,30}(problem|solve)/i, /why (don'?t|doesn'?t) (they|it) (like|work)/i, /failed solutions?/i],
    answer: [/tried (but|and|didn'?t)|failed|doesn'?t work|stopped working/i],
  },
  wont_give_up: {
    ask: [/not willing to give up/i, /won'?t (give up|sacrifice)/i],
    answer: [/not (willing|going) to|refuse to|won'?t/i],
  },
  anti_avatar: {
    ask: [/anti.?avatar|common enemy/i, /(who is )?this.{0,10}not for/i],
    answer: [/enemy|villain|not for|anti.?avatar|blame|fault of/i],
  },
  jealous_of: {
    ask: [/jealous of|compare themselves to/i],
    answer: [/jealous|envious|compare|wish (i|they)/i],
  },
  validation_from: {
    ask: [/validation|acceptance from/i, /trying to (impress|prove)/i],
    answer: [/validation|approval|acceptance|prove to|impress/i],
  },
  objections_beliefs: {
    ask: [/objections?|limiting beliefs?/i, /why wouldn'?t they buy/i],
    answer: [/objection|believe|think|fear|worry|afraid/i],
  },
  cant_fix_celebrate: {
    ask: [/can'?t fix.{0,20}celebrate/i, /turn.{0,20}(weakness|limitation)/i],
    answer: [/but we (can|do)|however|actually that'?s|beta|early/i],
  },
  market_problems: {
    ask: [/3 main problems in the market/i, /market problems?/i],
    answer: [/market problem|industry issue|common problem|three (problems|issues)/i],
  },
  ideal_self: {
    ask: [/ideal self/i, /what does success look like/i],
    answer: [/ideal self|success (is|looks|means)|dream (self|version)/i],
  },
  truth_behind_stuck: {
    ask: [/truth behind/i, /real reason.{0,10}stuck/i],
    answer: [/real reason|truth is|actually|the real|underneath/i],
  },
};

// ── Index IO ──

export async function readIndex(): Promise<ChecklistIndex | null> {
  if (!existsSync(getIndexPath())) return null;
  try {
    const raw = await fs.readFile(getIndexPath(), 'utf8');
    return JSON.parse(raw) as ChecklistIndex;
  } catch {
    return null;
  }
}

// Index GC: drop entries whose state file no longer exists.
export async function writeIndex(
  active: ChecklistIndex['active'],
  lastActive: ChecklistIndex['lastActive'],
): Promise<void> {
  const cleaned = active.filter(e =>
    existsSync(stateFilePath(e.client, e.product, e.version)),
  );
  let cleanedLast = lastActive;
  if (cleanedLast && !existsSync(stateFilePath(cleanedLast.client, cleanedLast.product, cleanedLast.version))) {
    cleanedLast = null;
  }
  const index: ChecklistIndex = {
    schemaVersion: SCHEMA_VERSION,
    active: cleaned,
    lastActive: cleanedLast,
  };
  await fs.mkdir(getStateRoot(), { recursive: true });
  await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2), 'utf8');
}

// ── Per-version state IO ──

function readState(c: string, p: string, v: VersionString): ChecklistState | null {
  const path = stateFilePath(c, p, v);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ChecklistState;
  } catch {
    return null;
  }
}

async function writeState(state: ChecklistState): Promise<void> {
  state.lastUpdated = new Date().toISOString();
  const path = stateFilePath(state.client, state.product, state.version);
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

// ── Version allocation (atomic via fs.open("wx") + EEXIST retry) ──

export async function allocateVersion(
  client: string,
  product: string,
): Promise<VersionString> {
  const parentDir = join(getStateRoot(), client, product);
  await fs.mkdir(parentDir, { recursive: true });
  const existing = (await fs.readdir(parentDir).catch(() => []))
    .filter(f => /^v\d+\.json$/.test(f))
    .map(f => f.replace(/\.json$/, '') as VersionString);
  let candidate = nextVersion(existing);
  for (let i = 0; i < 10; i++) {
    try {
      const fh = await fs.open(stateFilePath(client, product, candidate), 'wx');
      await fh.close();
      return candidate;
    } catch (e: any) {
      if (e?.code !== 'EEXIST') throw e;
      const n = parseInt(candidate.slice(1), 10);
      candidate = `v${n + 1}` as VersionString;
    }
  }
  throw new Error('allocateVersion: exhausted 10 retries');
}

// ── Handoff artifact write (atomic: v{N}.tmp → fs.rename) ──

type WriteArtifactResult =
  | { ok: true; outDir: string }
  | { ok: false; reason: 'no-project-root' | 'rename-failed'; detail?: string };

export async function writeHandoffArtifact(state: ChecklistState): Promise<WriteArtifactResult> {
  const projectRoot = resolveProjectRoot();
  if (projectRoot === null) return { ok: false, reason: 'no-project-root' };

  const base = join(projectRoot, 'copyplatforms', state.client, state.product);
  const finalDir = join(base, state.version);
  const tmpDir = join(base, `${state.version}.tmp`);

  if (existsSync(tmpDir)) await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  for (const fn of EXPECTED_FILENAMES) {
    const secNum = parseInt(fn.slice(0, 2), 10);
    const body = state.expandedSections.find(s => s.number === secNum)?.content ?? '';
    await fs.writeFile(join(tmpDir, fn), body, 'utf8');
  }

  try {
    await fs.rename(tmpDir, finalDir);
  } catch (e: any) {
    return { ok: false, reason: 'rename-failed', detail: e?.message };
  }

  const sentinel = join(projectRoot, 'copyplatforms', '.project-sentinel');
  if (!existsSync(sentinel)) await fs.writeFile(sentinel, '', 'utf8');

  return { ok: true, outDir: finalDir };
}

// ── Post-persist verify ──
// Deterministic check that the 18-file artifact is complete, non-empty, and
// contains no extras. Called immediately after writeHandoffArtifact's rename
// succeeds, and re-run by the Injector on UserPromptSubmit when the state's
// handoffVerifyError is non-null (self-healing).

export type VerifyResult =
  | { ok: true; verifiedAt: string }
  | { ok: false; error: import('./types').VerifyError };

export async function verifyHandoffArtifact(outDir: string): Promise<VerifyResult> {
  let actual: string[];
  try {
    actual = await fs.readdir(outDir);
  } catch {
    return {
      ok: false,
      error: {
        expected: [...EXPECTED_FILENAMES],
        actual: [],
        missing: [...EXPECTED_FILENAMES],
        empty: [],
        unexpected: [],
      },
    };
  }
  const actualSet = new Set(actual);
  const expectedSet = new Set<string>(EXPECTED_FILENAMES);
  const missing = EXPECTED_FILENAMES.filter(f => !actualSet.has(f));
  const unexpected = actual.filter(f => !expectedSet.has(f));
  const empty: string[] = [];
  for (const fn of EXPECTED_FILENAMES) {
    if (!actualSet.has(fn)) continue;
    const st = await fs.stat(join(outDir, fn));
    if (st.size === 0) empty.push(fn);
  }
  if (missing.length || empty.length || unexpected.length) {
    return {
      ok: false,
      error: { expected: [...EXPECTED_FILENAMES], actual, missing, empty, unexpected },
    };
  }
  return { ok: true, verifiedAt: new Date().toISOString() };
}

// ── Rehydrate expandedSections from disk (source of truth on resume) ──

export async function rehydrateFromArtifact(state: ChecklistState): Promise<ChecklistState> {
  if (!state.handoffPath || !existsSync(state.handoffPath)) return state;
  const sections: { number: number; content: string }[] = [];
  for (const fn of EXPECTED_FILENAMES) {
    const p = join(state.handoffPath, fn);
    if (!existsSync(p)) continue;
    const content = await fs.readFile(p, 'utf8');
    sections.push({ number: parseInt(fn.slice(0, 2), 10), content });
  }
  return { ...state, expandedSections: sections };
}

// ── Migration: legacy marketing-checklist.json → default/{slug}/v1.json ──

export async function migrateLegacyIfNeeded(): Promise<boolean> {
  const legacyFile = getLegacyStateFile();
  const root = getStateRoot();
  if (!existsSync(legacyFile)) return false;
  // Skip if three-tier already has any state file.
  if (existsSync(root)) {
    const entries = await fs.readdir(root).catch(() => []);
    const hasState = entries.some(e => !e.startsWith('.') && e !== 'index.json');
    if (hasState) return false;
  }

  let legacy: any;
  try {
    legacy = JSON.parse(await fs.readFile(legacyFile, 'utf8'));
  } catch {
    return false;
  }

  const legacySlug = typeof legacy.topicSlug === 'string' && legacy.topicSlug.length > 0
    ? legacy.topicSlug
    : 'legacy-checklist';
  const slugResult = normalizeSlug(legacySlug);
  const product = slugResult.ok ? slugResult.slug : 'legacy-checklist';
  const client = 'default';
  const version = 'v1' as VersionString;
  const now = new Date().toISOString();

  const newState: ChecklistState = {
    schemaVersion: SCHEMA_VERSION,
    client,
    product,
    version,
    active: legacy.active ?? false,
    phase: legacy.phase ?? 'understanding',
    currentSection: typeof legacy.currentSection === 'number' ? legacy.currentSection : 0,
    totalSections: TOTAL_SECTIONS,
    expandedSections: [],
    exchangeCount: typeof legacy.exchangeCount === 'number' ? legacy.exchangeCount : 0,
    startedAt: legacy.startedAt ?? now,
    lastUpdated: now,
    handoffPath: null,
    handoffVerifiedAt: null,
    handoffVerifyError: null,
    handoffWriteInProgress: false,
    migratedFromLegacy: true,
    questions: legacy.questions ?? {
      understanding: { asked: [], answered: [], total: 8 },
      improvement: { asked: [], answered: [], total: 10 },
    },
    completionEvidence: {
      target_audience_defined: legacy.completionEvidence?.target_audience_defined ?? false,
      core_problem_identified: legacy.completionEvidence?.core_problem_identified ?? false,
      value_proposition_clear: legacy.completionEvidence?.value_proposition_clear ?? false,
      checklist_structure_defined: legacy.completionEvidence?.checklist_structure_defined ?? false,
      key_sections_identified: legacy.completionEvidence?.key_sections_identified ?? false,
      dependencies_resolved: legacy.completionEvidence?.dependencies_resolved ?? false,
      all_sections_expanded: legacy.completionEvidence?.all_sections_expanded ?? false,
    },
    transitionProposed: legacy.transitionProposed ?? false,
    transitionProposedAt: legacy.transitionProposedAt ?? null,
  };

  await fs.mkdir(dirname(stateFilePath(client, product, version)), { recursive: true });
  await fs.writeFile(stateFilePath(client, product, version), JSON.stringify(newState, null, 2), 'utf8');
  await writeIndex([{ client, product, version }], { client, product, version });
  await fs.rename(legacyFile, `${legacyFile}.migrated`);
  return true;
}

// ── Stale tmp cleanup (every Stop event) ──

async function cleanupStaleTmpDirs(): Promise<void> {
  const projectRoot = resolveProjectRoot();
  if (projectRoot === null) return;
  const copyplatforms = join(projectRoot, 'copyplatforms');
  if (!existsSync(copyplatforms)) return;
  try {
    const clients = await fs.readdir(copyplatforms);
    for (const client of clients) {
      if (client.startsWith('.')) continue;
      const clientDir = join(copyplatforms, client);
      const cs = await fs.stat(clientDir).catch(() => null);
      if (!cs?.isDirectory()) continue;
      const products = await fs.readdir(clientDir).catch(() => []);
      for (const product of products) {
        const productDir = join(clientDir, product);
        const ps = await fs.stat(productDir).catch(() => null);
        if (!ps?.isDirectory()) continue;
        const entries = await fs.readdir(productDir).catch(() => []);
        for (const e of entries) {
          if (!/^v\d+\.tmp$/.test(e)) continue;
          const base = e.replace(/\.tmp$/, '') as VersionString;
          if (!VERSION_RE.test(base)) continue;
          const sp = stateFilePath(client, product, base);
          let inProgress = false;
          if (existsSync(sp)) {
            try {
              const st = JSON.parse(await fs.readFile(sp, 'utf8')) as ChecklistState;
              inProgress = st.handoffWriteInProgress === true;
            } catch { /* corrupt → treat as stale */ }
          }
          if (!inProgress) {
            await fs.rm(join(productDir, e), { recursive: true, force: true });
          }
        }
      }
    }
  } catch { /* best-effort cleanup, never block */ }
}

// ── Question tracking (unchanged) ──

function trackQuestionsAsked(
  assistantResponse: string,
  phase: 'understanding' | 'improvement',
  state: ChecklistState,
): boolean {
  const patterns = phase === 'understanding' ? UNDERSTANDING_PATTERNS : IMPROVEMENT_PATTERNS;
  const phaseQuestions = state.questions[phase];
  let changed = false;
  for (const [id, { ask }] of Object.entries(patterns)) {
    if (phaseQuestions.asked.includes(id)) continue;
    if (ask.some(p => p.test(assistantResponse))) {
      phaseQuestions.asked.push(id);
      changed = true;
    }
  }
  return changed;
}

function trackQuestionsAnswered(
  userMessage: string,
  phase: 'understanding' | 'improvement',
  state: ChecklistState,
): boolean {
  const patterns = phase === 'understanding' ? UNDERSTANDING_PATTERNS : IMPROVEMENT_PATTERNS;
  const phaseQuestions = state.questions[phase];
  let changed = false;
  for (const [id, { answer }] of Object.entries(patterns)) {
    if (!phaseQuestions.asked.includes(id)) continue;
    if (phaseQuestions.answered.includes(id)) continue;
    if (answer.some(p => p.test(userMessage))) {
      phaseQuestions.answered.push(id);
      changed = true;
    }
  }
  return changed;
}

// ── Evidence detection ──

function updateCompletionEvidence(
  assistantResponse: string,
  userMessage: string,
  state: ChecklistState,
): boolean {
  const evidence = state.completionEvidence;
  const combined = `${assistantResponse}\n${userMessage}`;
  let changed = false;

  if (!evidence.target_audience_defined) {
    if (/target audience|ideal (client|customer)|audience segment/i.test(combined) &&
        state.questions.understanding.answered.includes('ideal_client')) {
      evidence.target_audience_defined = true;
      changed = true;
    }
  }
  if (!evidence.core_problem_identified) {
    if (state.questions.understanding.answered.includes('core_problems')) {
      evidence.core_problem_identified = true;
      changed = true;
    }
  }
  if (!evidence.value_proposition_clear) {
    if (state.questions.understanding.answered.includes('differentiator') &&
        state.questions.understanding.answered.includes('desired_outcome')) {
      evidence.value_proposition_clear = true;
      changed = true;
    }
  }
  if (!evidence.checklist_structure_defined) {
    const sectionMatches = assistantResponse.match(/<SECTION_CONTENT\d+>/g) || [];
    if (sectionMatches.length >= 10) {
      evidence.checklist_structure_defined = true;
      changed = true;
    }
  }
  if (!evidence.key_sections_identified) {
    if (state.questions.improvement.answered.length >= 5) {
      evidence.key_sections_identified = true;
      changed = true;
    }
  }
  if (!evidence.dependencies_resolved) {
    if (state.questions.improvement.answered.length >= 8) {
      evidence.dependencies_resolved = true;
      changed = true;
    }
  }
  if (!evidence.all_sections_expanded) {
    if (state.expandedSections.length >= state.totalSections) {
      evidence.all_sections_expanded = true;
      changed = true;
    }
  }
  return changed;
}

// ── Section capture + phase transition ──
// <SECTION_CONTENT##>...</SECTION_CONTENT##> bodies are captured into
// state.expandedSections. Latest emission wins (refinement during Expand).

function captureSectionContent(response: string, state: ChecklistState): boolean {
  const re = /<SECTION_CONTENT(\d{2})>([\s\S]*?)<\/SECTION_CONTENT\1>/gi;
  let changed = false;
  let match: RegExpExecArray | null;
  while ((match = re.exec(response)) !== null) {
    const num = parseInt(match[1], 10);
    if (num < 1 || num > TOTAL_SECTIONS) continue;
    const content = match[2].trim();
    if (!content) continue;
    const idx = state.expandedSections.findIndex(s => s.number === num);
    if (idx >= 0) {
      if (state.expandedSections[idx].content !== content) {
        state.expandedSections[idx].content = content;
        changed = true;
      }
    } else {
      state.expandedSections.push({ number: num, content });
      changed = true;
    }
  }
  if (changed && state.expandedSections.length > 0) {
    state.currentSection = Math.max(...state.expandedSections.map(s => s.number)) + 1;
  }
  return changed;
}

function detectPhaseTransition(response: string, state: ChecklistState): boolean {
  let changed = false;
  if (response.includes('<UNDERSTANDING_COMPLETE>') && state.phase === 'understanding') {
    state.phase = 'improvement';
    state.transitionProposed = false;
    state.transitionProposedAt = null;
    changed = true;
  } else if (response.includes('<IMPROVEMENT_COMPLETE>') && state.phase === 'improvement') {
    state.phase = 'expand';
    state.currentSection = 1;
    state.transitionProposed = false;
    state.transitionProposedAt = null;
    changed = true;
  } else if (response.includes('<EXPANSION_COMPLETE>') && state.phase === 'expand') {
    state.phase = 'implement';
    state.transitionProposed = false;
    state.transitionProposedAt = null;
    changed = true;
  }
  return changed;
}

// ── Main ──

async function main(): Promise<void> {
  const input = await readHookInput();
  if (!input) { process.exit(0); }

  // One-shot migration (idempotent, fast no-op after first run).
  try {
    await migrateLegacyIfNeeded();
  } catch (err) {
    console.error('[ChecklistEnforcer] migration error:', err);
  }

  // Stale-tmp cleanup is best-effort; swallow errors.
  await cleanupStaleTmpDirs().catch(() => { /* ignore */ });

  const assistantResponse = input.last_assistant_message || '';

  // Wait 150ms for transcript to finish writing.
  await new Promise(resolve => setTimeout(resolve, 150));
  const userMessage = getLastUserMessage(input.transcript_path);

  const index = await readIndex();
  if (!index || !index.lastActive) { process.exit(0); }
  const { client, product, version } = index.lastActive;

  const state = readState(client, product, version);
  if (!state || !state.active) { process.exit(0); }

  state.exchangeCount++;

  if (state.phase === 'understanding' || state.phase === 'improvement') {
    trackQuestionsAsked(assistantResponse, state.phase, state);
    trackQuestionsAnswered(userMessage, state.phase, state);
  }

  captureSectionContent(assistantResponse, state);
  updateCompletionEvidence(assistantResponse, userMessage, state);

  const transitioned = detectPhaseTransition(assistantResponse, state);

  // <EXPANSION_COMPLETE> → atomic artifact write + post-persist verify.
  if (transitioned && state.phase === 'implement') {
    state.handoffWriteInProgress = true;
    await writeState(state);

    const result = await writeHandoffArtifact(state);
    state.handoffWriteInProgress = false;
    if (!result.ok) {
      state.handoffPath = null;
      state.handoffVerifiedAt = null;
      state.handoffVerifyError = {
        expected: [...EXPECTED_FILENAMES],
        actual: [],
        missing: [...EXPECTED_FILENAMES],
        empty: [],
        unexpected: [],
      };
    } else {
      state.handoffPath = result.outDir;
      const verify = await verifyHandoffArtifact(result.outDir);
      if (verify.ok) {
        state.handoffVerifiedAt = verify.verifiedAt;
        state.handoffVerifyError = null;
      } else {
        state.handoffVerifiedAt = null;
        state.handoffVerifyError = verify.error;
      }
    }
    await writeState(state);
    await writeIndex(index.active, index.lastActive);
    process.exit(0);
  }

  await writeState(state);
  await writeIndex(index.active, index.lastActive);
  process.exit(0);
}

// Only auto-run when invoked directly as a hook, not when imported by tests.
if (import.meta.main) {
  main().catch((err) => {
    console.error('[ChecklistEnforcer] Fatal:', err);
    process.exit(0);
  });
}

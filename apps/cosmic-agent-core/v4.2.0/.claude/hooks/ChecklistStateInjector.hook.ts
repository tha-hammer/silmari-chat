#!/usr/bin/env bun
/**
 * ChecklistStateInjector.hook.ts — Marketing skill state injection (pre-response)
 *
 * PURPOSE:
 *   Injects phase-specific constraints, unanswered questions, and transition
 *   proposals into the LLM's context BEFORE it generates a response. Proactive
 *   counterpart to ChecklistEnforcer (Stop hook).
 *
 * TRIGGER: UserPromptSubmit
 *
 * INPUT: UserPromptSubmit payload via stdin.
 *
 * OUTPUT: stdout <system-reminder> injection, or empty if not in a marketing
 *         workflow.
 *
 * SIDE EFFECTS:
 *   reads  ~/.claude/MEMORY/STATE/marketing-checklists/index.json
 *   reads  ~/.claude/MEMORY/STATE/marketing-checklists/{c}/{p}/{v}.json
 *   does NOT write state (that is ChecklistEnforcer's role).
 *
 * ACTIVATION (Phase 2): activates when index.json has `lastActive` and the
 * corresponding state file is `active: true`.
 *
 * VERIFY: Phase 3 adds auto-re-verify + handoff-verify-failed injection block.
 * BRANCH B (auto-inject on marketing-intent keywords): Phase 4.
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, resolve as resolvePath, dirname } from 'path';
import { homedir } from 'os';
import {
  ChecklistState,
  ChecklistIndex,
  EXPECTED_FILENAMES,
  VerifyError,
  VersionString,
} from './types';

function getStateRoot(): string {
  return process.env.MARKETING_STATE_ROOT
    || join(homedir(), '.claude', 'MEMORY', 'STATE', 'marketing-checklists');
}

function getIndexPath(): string {
  return join(getStateRoot(), 'index.json');
}

function stateFilePath(c: string, p: string, v: VersionString): string {
  return join(getStateRoot(), c, p, `${v}.json`);
}

// Enumerated question sets — must match StateDefinition.md
const UNDERSTANDING_QUESTIONS: Array<{ id: string; text: string }> = [
  { id: 'product_service', text: 'What product or service are you marketing?' },
  { id: 'ideal_client', text: 'Who is your ideal client? Describe them specifically.' },
  { id: 'audience_segments', text: 'Who ELSE could benefit? Help me identify 3-5 target audiences based on their "pain."' },
  { id: 'core_problems', text: 'What problems does your target market have? What are they trying now that isn\'t working?' },
  { id: 'desired_outcome', text: 'What outcome do they want? What does life look like after solving this?' },
  { id: 'proof_points', text: 'What proof do you have that your solution works? (results, case studies, testimonials)' },
  { id: 'differentiator', text: 'What makes your approach different from competitors?' },
  { id: 'cta_next_step', text: 'What\'s the immediate next step you want someone to take when they see your ad?' },
];

const IMPROVEMENT_QUESTIONS: Array<{ id: string; text: string }> = [
  { id: 'failed_solutions', text: 'What are they trying now to solve the problem? Why don\'t they like those solutions? Why aren\'t they working?' },
  { id: 'wont_give_up', text: 'What are they NOT willing to give up to solve their problem? (e.g., "won\'t spend hours at the gym")' },
  { id: 'anti_avatar', text: 'Who is the anti-avatar or common enemy? (e.g., big pharma, "guru" competitors, the establishment)' },
  { id: 'jealous_of', text: 'Who are they jealous of? Who do they compare themselves to?' },
  { id: 'validation_from', text: 'Who are they trying to get validation or acceptance from? (peers, family, industry)' },
  { id: 'objections_beliefs', text: 'What are their objections and limiting beliefs? Why wouldn\'t they buy?' },
  { id: 'cant_fix_celebrate', text: 'What can\'t you fix, that you can celebrate? (e.g., "product is new" → "beta launch = 1-on-1 support")' },
  { id: 'market_problems', text: 'What are the 3 main problems in the market right now?' },
  { id: 'ideal_self', text: 'Who is their ideal self? What does "success" look like to them personally?' },
  { id: 'truth_behind_stuck', text: 'What\'s the TRUTH behind the REAL REASON they\'re stuck? (not what they say — what\'s actually happening)' },
];

const SECTION_NAMES: Record<number, string> = {
  1: 'USP', 2: 'Claims & Proof', 3: 'Target Audience', 4: 'Mechanism',
  5: 'Why³', 6: 'Appeal', 7: 'Features/Benefits', 8: 'Promise',
  9: 'Hook', 10: 'Headlines', 11: 'Big Four', 12: 'Pain Points',
  13: 'Vision', 14: 'USP Iteration 1', 15: 'USP Iteration 2',
  16: 'USP Iteration 3', 17: 'USP Iteration 4', 18: 'USP Iteration 5',
};

async function readStdinWithTimeout(timeoutMs = 500): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), timeoutMs);
    process.stdin.on('data', (chunk) => { data += chunk.toString(); });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(data); });
  });
}

function readIndex(): ChecklistIndex | null {
  const path = getIndexPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ChecklistIndex;
  } catch {
    return null;
  }
}

function readState(c: string, p: string, v: VersionString): ChecklistState | null {
  const path = stateFilePath(c, p, v);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ChecklistState;
  } catch {
    return null;
  }
}

function writeStateSync(state: ChecklistState): void {
  state.lastUpdated = new Date().toISOString();
  const path = stateFilePath(state.client, state.product, state.version);
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf8');
}

// Self-healing re-verify. Runs synchronously (using fs.statSync / readdirSync
// on the 18 files) so the injector can stay a simple one-shot hook. Only fires
// when state.handoffVerifyError is non-null; guard prevents per-prompt re-verify
// once the artifact is clean.
type VerifyResult =
  | { ok: true; verifiedAt: string }
  | { ok: false; error: VerifyError };

export function verifyHandoffArtifactSync(outDir: string): VerifyResult {
  let actual: string[];
  try {
    actual = readdirSync(outDir);
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
    const st = statSync(join(outDir, fn));
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

function getUnansweredQuestions(
  phase: 'understanding' | 'improvement',
  state: ChecklistState,
): Array<{ id: string; text: string }> {
  const set = phase === 'understanding' ? UNDERSTANDING_QUESTIONS : IMPROVEMENT_QUESTIONS;
  const answered = state.questions?.[phase]?.answered || [];
  return set.filter(q => !answered.includes(q.id));
}

function checkTransitionReadiness(state: ChecklistState): {
  ready: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const evidence = state.completionEvidence || ({} as ChecklistState['completionEvidence']);

  if (state.phase === 'understanding') {
    const minExchanges = state.exchangeCount >= 3;
    const allAnswered = (state.questions?.understanding?.answered?.length || 0) >= UNDERSTANDING_QUESTIONS.length;
    const evidenceOk = evidence.target_audience_defined &&
                       evidence.core_problem_identified &&
                       evidence.value_proposition_clear;
    if (minExchanges) reasons.push(`${state.exchangeCount} exchanges completed (minimum: 3)`);
    if (allAnswered) reasons.push(`${UNDERSTANDING_QUESTIONS.length}/${UNDERSTANDING_QUESTIONS.length} questions asked and answered`);
    if (evidenceOk) reasons.push('Evidence: target audience defined, core problem identified, value proposition clear');
    return { ready: minExchanges && allAnswered && evidenceOk, reasons };
  }

  if (state.phase === 'improvement') {
    const minExchanges = state.exchangeCount >= 4;
    const allAnswered = (state.questions?.improvement?.answered?.length || 0) >= IMPROVEMENT_QUESTIONS.length;
    const evidenceOk = evidence.checklist_structure_defined &&
                       evidence.key_sections_identified &&
                       evidence.dependencies_resolved;
    if (minExchanges) reasons.push(`${state.exchangeCount} exchanges completed (minimum: 4)`);
    if (allAnswered) reasons.push(`${IMPROVEMENT_QUESTIONS.length}/${IMPROVEMENT_QUESTIONS.length} questions asked and answered`);
    if (evidenceOk) reasons.push('Evidence: checklist structure defined, key sections identified, dependencies resolved');
    return { ready: minExchanges && allAnswered && evidenceOk, reasons };
  }

  if (state.phase === 'expand') {
    const ready = state.expandedSections.length >= state.totalSections;
    if (ready) reasons.push(`All ${state.totalSections} sections expanded`);
    return { ready, reasons };
  }

  return { ready: false, reasons: [] };
}

function buildInjection(state: ChecklistState): string {
  const lines: string[] = [];

  lines.push('<system-reminder>');
  lines.push('MARKETING COPY PLATFORM — Active');
  lines.push(`Phase: ${state.phase.toUpperCase()} | Exchange: ${state.exchangeCount}`);
  lines.push(`Triple: ${state.client}/${state.product}/${state.version}`);
  lines.push('');

  if (state.phase === 'understanding' || state.phase === 'improvement') {
    lines.push('CRITICAL CONSTRAINTS:');
    lines.push('- Ask questions ONLY. Do NOT generate marketing content, copy, or creative text.');
    lines.push('- The LLM NEVER generates foundational information. All content comes from the user.');
    lines.push('- Ask 2-3 questions per exchange. Do not overwhelm the user.');
    lines.push('');

    const unanswered = getUnansweredQuestions(state.phase, state);
    if (unanswered.length > 0) {
      const phaseSet = state.phase === 'understanding' ? UNDERSTANDING_QUESTIONS : IMPROVEMENT_QUESTIONS;
      const answered = state.questions?.[state.phase]?.answered || [];
      lines.push(`QUESTION PROGRESS: ${answered.length}/${phaseSet.length} answered`);
      lines.push('');
      lines.push('NEXT QUESTIONS TO ASK (pick 2-3 for this turn):');
      unanswered.slice(0, 5).forEach((q, idx) => {
        lines.push(`  ${idx + 1}. [${q.id}] ${q.text}`);
      });
      if (unanswered.length > 5) {
        lines.push(`  ... and ${unanswered.length - 5} more`);
      }
      lines.push('');
    } else {
      lines.push('All enumerated questions have been answered.');
      lines.push('');
    }
  }

  if (state.phase === 'expand') {
    const remaining = state.totalSections - state.expandedSections.length;
    const currentName = SECTION_NAMES[state.currentSection] || `Section ${state.currentSection}`;
    lines.push('EXPAND PHASE STATUS:');
    lines.push(`- Current section: ${state.currentSection}/${state.totalSections} (${currentName})`);
    lines.push(`- Expanded: ${state.expandedSections.length}/${state.totalSections}`);
    lines.push(`- Remaining: ${remaining}`);
    lines.push('');
    lines.push('CRITICAL CONSTRAINTS:');
    lines.push('- Use the actual checklist content. Do not assume or speculate.');
    lines.push(`- Read: CopyPlatformSections/${String(state.currentSection).padStart(2, '0')}-*.md for the current framework.`);
    lines.push('- Process sections sequentially — do not skip ahead.');
    lines.push('- Emit the <SECTION_CONTENT##>…</SECTION_CONTENT##> block verbatim for each section; latest emission overwrites in state.');
    lines.push('');
  }

  if (state.phase === 'implement') {
    lines.push('IMPLEMENT PHASE:');
    lines.push('- You are now writing actual marketing copy.');
    lines.push('- All copy MUST be grounded in the expanded checklist.');
    lines.push('- Apply AIDA at every level (fractal: headline, ad, page, offer, funnel).');
    lines.push('- Address the 10 Agreements in long-form copy.');
    lines.push('- User directs format (email, ad, landing page, etc.) — follow their lead.');
    if (state.handoffPath) {
      lines.push(`- Verified artifact: ${state.handoffPath}`);
    }
    lines.push('');
  }

  if (state.handoffVerifyError) {
    const err = state.handoffVerifyError;
    lines.push(
      '=== HANDOFF VERIFY FAILED ===',
      `The copy-platform artifact at ${state.handoffPath ?? '(write failed)'} failed`,
      'verification. Details:',
      `  missing:    ${err.missing.join(', ') || '(none)'}`,
      `  empty:      ${err.empty.join(', ') || '(none)'}`,
      `  unexpected: ${err.unexpected.join(', ') || '(none)'}`,
      '',
      'Recovery options:',
      '  1. Fix the files manually and send any message — the hook will',
      '     auto-re-verify and silently clear this error on success.',
      '  2. Rerun the Expand phase to regenerate the artifact.',
      '  3. Start fresh for a new version with the Marketing skill.',
      '=============================',
      '',
    );
  }

  const readiness = checkTransitionReadiness(state);
  if (readiness.ready && (state.phase === 'understanding' || state.phase === 'improvement' || state.phase === 'expand')) {
    const nextPhase =
      state.phase === 'understanding' ? 'Improvement' :
      state.phase === 'improvement' ? 'Expand' :
      'Implement';
    const marker =
      state.phase === 'understanding' ? '<UNDERSTANDING_COMPLETE>' :
      state.phase === 'improvement' ? '<IMPROVEMENT_COMPLETE>' :
      '<EXPANSION_COMPLETE>';

    lines.push('=== TRANSITION PROPOSAL ===');
    lines.push(`The system detects that ${state.phase.toUpperCase()} phase requirements appear to be met:`);
    readiness.reasons.forEach(r => lines.push(`  - ${r}`));
    lines.push('');
    lines.push(`Review the checklist quality. If you agree the checklist is ready for the ${nextPhase} phase,`);
    lines.push(`emit ${marker} at the end of your response.`);
    lines.push(`If gaps remain, explain what's missing and continue the current phase.`);
    lines.push('===========================');
    lines.push('');
  }

  lines.push('</system-reminder>');
  return lines.join('\n');
}

// Self-healing auto-re-verify. Returns true when state was mutated (caller
// must persist), false when skipped (no error to clear). Runs ONLY when the
// previous Stop hook recorded a handoffVerifyError — guard prevents per-prompt
// re-verify on clean runs.
export function applySelfHealAutoVerify(state: ChecklistState): 'healed' | 'refreshed' | 'skipped' {
  if (!state.handoffVerifyError) return 'skipped';
  if (!state.handoffPath || !existsSync(state.handoffPath)) return 'skipped';
  const r = verifyHandoffArtifactSync(state.handoffPath);
  if (r.ok) {
    state.handoffVerifiedAt = r.verifiedAt;
    state.handoffVerifyError = null;
    return 'healed';
  }
  state.handoffVerifyError = r.error;
  return 'refreshed';
}

// ── Branch B: passive marketing-intent auto-inject ──

// STRICT project-root resolution (same as Enforcer).
function resolveProjectRoot(start: string = process.cwd()): string | null {
  let dir = resolvePath(start);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (existsSync(join(dir, 'CLAUDE.md'))) return dir;
    dir = dirname(dir);
  }
  return null;
}

// Two-tier trigger regex (review P-3).
const MARKETING_TRIGGERS_STRONG: ReadonlyArray<RegExp> = [
  /\bcreate marketing\b/i,
  /\bbuild marketing\b/i,
  /\bmake marketing\b/i,
  /\bdo marketing\b/i,
  /\bplan marketing\b/i,
  /\bmarketing for\b/i,
  /\bmarketing campaign\b/i,
  /\bmarketing plan\b/i,
  /\bmarketing checklist\b/i,
  /\bmarketing platform\b/i,
  /\bmarketing foundation\b/i,
  /\bcopy platform\b/i,
  /\bbuild a copy platform\b/i,
  /\bpersuasion checklist\b/i,
];

const MARKETING_TRIGGERS_WEAK: ReadonlyArray<RegExp> = [
  /\bICP\b/,
  /\bbrand discovery\b/i,
  /\bcampaign promise\b/i,
  /\bone belief statement\b/i,
  /\bobjection framework\b/i,
  /\bmarketing research\b/i,
  /\bcustomer research\b/i,
];

const WEAK_ANCHORS: ReadonlyArray<RegExp> = [
  /\bmarketing\b/i,
  /\bcopywriting\b/i,
  /\bcopy\b/i,
  /\boffer\b/i,
  /\bproduct\b/i,
  /\bclient\b/i,
  /\bcampaign\b/i,
];

export function matchesMarketingIntent(prompt: string): boolean {
  if (MARKETING_TRIGGERS_STRONG.some(t => t.test(prompt))) return true;
  const weakHit = MARKETING_TRIGGERS_WEAK.some(t => t.test(prompt));
  if (!weakHit) return false;
  return WEAK_ANCHORS.some(a => a.test(prompt));
}

// Discover checklists under {projectRoot}/copyplatforms/{c}/{p}/{v}/.
export interface ChecklistTriple {
  client: string;
  product: string;
  version: string;
  path: string;
}

export function discoverChecklists(projectRoot: string): ChecklistTriple[] {
  const base = join(projectRoot, 'copyplatforms');
  if (!existsSync(base)) return [];
  const results: ChecklistTriple[] = [];
  let clients: string[];
  try { clients = readdirSync(base); } catch { return []; }
  for (const client of clients) {
    if (client.startsWith('.')) continue;
    const clientDir = join(base, client);
    try { if (!statSync(clientDir).isDirectory()) continue; } catch { continue; }
    let products: string[];
    try { products = readdirSync(clientDir); } catch { continue; }
    for (const product of products) {
      const productDir = join(clientDir, product);
      try { if (!statSync(productDir).isDirectory()) continue; } catch { continue; }
      let versions: string[];
      try { versions = readdirSync(productDir); } catch { continue; }
      for (const version of versions) {
        if (!/^v\d+$/.test(version)) continue;
        const versionDir = join(productDir, version);
        try { if (!statSync(versionDir).isDirectory()) continue; } catch { continue; }
        let entries: string[];
        try { entries = readdirSync(versionDir); } catch { continue; }
        if (!entries.some(f => /^\d{2}-.*\.md$/.test(f))) continue;
        results.push({ client, product, version, path: versionDir });
      }
    }
  }
  return results;
}

// Smart-match: full-slug > token match (min length 4, word-boundary).
function tokensOf(slug: string): string[] {
  return slug.split('-').filter(t => t.length >= 4);
}

function wordBoundary(s: string): RegExp {
  return new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
}

export function matchesSlugInPrompt(prompt: string, slug: string): 'full' | 'token' | 'none' {
  if (wordBoundary(slug).test(prompt)) return 'full';
  for (const tok of tokensOf(slug)) {
    if (wordBoundary(tok).test(prompt)) return 'token';
  }
  return 'none';
}

function byVersionDesc(a: ChecklistTriple, b: ChecklistTriple): number {
  const na = parseInt(a.version.slice(1), 10);
  const nb = parseInt(b.version.slice(1), 10);
  return nb - na;
}

export function smartMatch(
  prompt: string,
  available: ChecklistTriple[],
): { selected: ChecklistTriple | null; reason: string } {
  const scored = available.map(c => ({
    c,
    productMatch: matchesSlugInPrompt(prompt, c.product),
    clientMatch: matchesSlugInPrompt(prompt, c.client),
  }));

  const fullProd = scored.filter(x => x.productMatch === 'full');
  if (fullProd.length === 1) return { selected: fullProd[0].c, reason: 'product-full-match' };
  if (fullProd.length > 1) {
    const byClient = fullProd.filter(x => x.clientMatch !== 'none');
    if (byClient.length === 1) return { selected: byClient[0].c, reason: 'cp-pair-full' };
    const uniqCp = new Set(fullProd.map(x => `${x.c.client}/${x.c.product}`));
    if (uniqCp.size === 1) {
      const sorted = fullProd.map(x => x.c).sort(byVersionDesc);
      return { selected: sorted[0], reason: 'product-full-highest-version' };
    }
  }

  const byClient = scored.filter(x => x.clientMatch !== 'none');
  const distinctProducts = new Set(byClient.map(x => `${x.c.client}/${x.c.product}`));
  if (distinctProducts.size === 1 && byClient.length >= 1) {
    const sorted = byClient.map(x => x.c).sort(byVersionDesc);
    return { selected: sorted[0], reason: 'client-unique-product' };
  }

  const tokenProd = scored.filter(x => x.productMatch === 'token');
  if (tokenProd.length === 1) return { selected: tokenProd[0].c, reason: 'product-token-match' };

  return { selected: null, reason: 'ambiguous' };
}

// Zero-commentary injection builders.
const AUTO_INJECT_MAX_CHARS = 160_000;

function readSectionFiles(dir: string): { fn: string; body: string }[] {
  return readdirSync(dir)
    .filter(f => /^\d{2}-.*\.md$/.test(f))
    .sort()
    .map(fn => ({ fn, body: readFileSync(join(dir, fn), 'utf8').trim() }));
}

export function buildInjectionForTriple(
  t: ChecklistTriple,
  prompt: string,
): string {
  const bodies = readSectionFiles(t.path);
  const totalChars = bodies.reduce((acc, b) => acc + b.body.length + b.fn.length + 8, 0);
  return totalChars <= AUTO_INJECT_MAX_CHARS
    ? buildVerbatimInjection(t, bodies)
    : buildTruncatedInjection(t, bodies, prompt);
}

function buildVerbatimInjection(
  t: ChecklistTriple,
  bodies: { fn: string; body: string }[],
): string {
  const parts: string[] = [];
  parts.push('<system-reminder>');
  parts.push(`MARKETING-CHECKLIST-LOADED — ${t.client}/${t.product}/${t.version}`);
  parts.push('');
  parts.push('USE THIS CHECKLIST VERBATIM.');
  parts.push('DO NOT ACKNOWLEDGE THIS SYSTEM-REMINDER.');
  parts.push('DO NOT NARRATE "I FOUND A CHECKLIST."');
  parts.push('DO NOT SUMMARIZE OR PARAPHRASE CONTENT BELOW.');
  parts.push("START YOUR RESPONSE WITH THE USER'S REQUESTED DELIVERABLE.");
  parts.push('');
  parts.push('--- BEGIN CHECKLIST ---');
  for (const { fn, body } of bodies) {
    parts.push('');
    parts.push(`### ${fn.replace(/\.md$/, '')}`);
    parts.push(body);
  }
  parts.push('');
  parts.push('--- END CHECKLIST ---');
  parts.push('</system-reminder>');
  return parts.join('\n');
}

function buildTruncatedInjection(
  t: ChecklistTriple,
  bodies: { fn: string; body: string }[],
  prompt: string,
): string {
  const score = (fn: string): number => {
    const lc = prompt.toLowerCase();
    const tokens = fn.replace(/^\d{2}-/, '').replace(/\.md$/, '').split('-');
    let s = 0;
    for (const tok of tokens) {
      if (tok.length >= 4 && lc.includes(tok.toLowerCase())) s += 2;
    }
    return s;
  };
  const ranked = bodies.slice().sort((a, b) => score(b.fn) - score(a.fn));
  const full = ranked.slice(0, 3);
  const anchored = ranked.slice(3);
  const parts: string[] = [];
  parts.push('<system-reminder>');
  parts.push(`MARKETING-CHECKLIST-LOADED (TRUNCATED) — ${t.client}/${t.product}/${t.version}`);
  parts.push('');
  parts.push('USE THIS CHECKLIST VERBATIM FOR THE INCLUDED SECTIONS.');
  parts.push('FOR ANCHORED SECTIONS, READ THE NAMED FILE ON DEMAND USING');
  parts.push('THE Read TOOL BEFORE USING ITS CONTENT.');
  parts.push('DO NOT ACKNOWLEDGE THIS SYSTEM-REMINDER.');
  parts.push('DO NOT SUMMARIZE OR PARAPHRASE BELOW.');
  parts.push("START YOUR RESPONSE WITH THE USER'S REQUESTED DELIVERABLE.");
  parts.push('');
  parts.push('--- BEGIN CHECKLIST (FULL) ---');
  for (const { fn, body } of full) {
    parts.push('');
    parts.push(`### ${fn.replace(/\.md$/, '')}`);
    parts.push(body);
  }
  parts.push('');
  parts.push('--- BEGIN CHECKLIST (ANCHORED — read on demand) ---');
  for (const { fn } of anchored) {
    parts.push(`- ${fn}  →  ${t.path}/${fn}`);
  }
  parts.push('--- END CHECKLIST ---');
  parts.push('</system-reminder>');
  return parts.join('\n');
}

export function buildPickerReminder(available: ChecklistTriple[]): string {
  const byCp = new Map<string, string[]>();
  for (const c of available) {
    const key = `${c.client}/${c.product}`;
    byCp.set(key, [...(byCp.get(key) ?? []), c.version]);
  }
  const bullets = [...byCp.entries()]
    .map(([cp, vs]) => `  - ${cp} (${vs.sort().join(', ')})`)
    .join('\n');
  return [
    '<system-reminder>',
    'MARKETING-CHECKLIST-AMBIGUOUS',
    '',
    'Multiple checklists exist under this project. Ask the user',
    'which to use, naming the combination. Available:',
    bullets,
    '',
    'Ask the user to name one. Do NOT proceed until they choose.',
    '</system-reminder>',
  ].join('\n');
}

// ── Main ──

async function main(): Promise<void> {
  const raw = await readStdinWithTimeout(300);
  let prompt = '';
  try {
    const payload = JSON.parse(raw);
    prompt = payload.prompt || payload.user_prompt || '';
  } catch { /* no prompt available — Branch A still works, Branch B will skip */ }

  // ── Branch A: active Marketing run (has precedence; A and B are mutually exclusive per review A-2).
  const index = readIndex();
  if (index?.lastActive) {
    const { client, product, version } = index.lastActive;
    const state = readState(client, product, version);
    if (state?.active) {
      const heal = applySelfHealAutoVerify(state);
      if (heal !== 'skipped') writeStateSync(state);
      console.log(buildInjection(state));
      process.exit(0);
    }
  }

  // ── Branch B: passive marketing-intent auto-inject.
  // Short-circuit gates in strict order:

  // (1) Kill switch.
  if (process.env.MARKETING_AUTOINJECT_DISABLED === '1') { process.exit(0); }

  // (2) No active state (already checked — falls through to here).

  // (3) Two-tier trigger regex.
  if (!matchesMarketingIntent(prompt)) { process.exit(0); }

  // (4) STRICT project-root.
  const root = resolveProjectRoot();
  if (root === null) { process.exit(0); }

  // (5) Project sentinel.
  const sentinel = join(root, 'copyplatforms', '.project-sentinel');
  if (!existsSync(sentinel)) { process.exit(0); }

  // (6) Discover and smart-match.
  const available = discoverChecklists(root);
  if (available.length === 0) { process.exit(0); }

  const match = smartMatch(prompt, available);
  if (match.selected) {
    console.log(buildInjectionForTriple(match.selected, prompt));
  } else {
    console.log(buildPickerReminder(available));
  }
  process.exit(0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('[ChecklistStateInjector] Fatal:', err);
    process.exit(0);
  });
}

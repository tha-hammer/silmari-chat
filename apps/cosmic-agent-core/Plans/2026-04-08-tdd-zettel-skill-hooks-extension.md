# Zettel Skill-Hooks Extension — TDD Plan

**Extends**: `Plans/2026-04-05-tdd-zettelkasten-hook-wiring.md` (behaviors 1–8)
**Adds**: behaviors 9–13 — universal zettel integration at the `Skill` tool boundary
**Date**: 2026-04-08
**Repo root**: `cosmic-agent-core`
**Hook dir**: `v4.2.0/.claude/hooks/`

---

## Overview

The base plan wires zettel into session/artifact/work-completion lifecycle events. It does **NOT** wire zettel into the `Skill` tool invocation boundary. Without that, every skill (Research, LifeOS, Investigation, Security, etc.) either needs its own prose-level `zettel recall`/`zettel save` bash blocks (~480 file edits across `v4.2.0/.claude/skills/` and `Packs/`), or silently bypasses memory entirely.

This extension closes that gap with **a single PreToolUse+PostToolUse pair matched on `Skill`**, driven by a per-skill memory-profile map. One source of truth, one diff, every skill gets recall-on-entry and save-on-exit automatically.

**Prior research**: `thoughts/searchable/shared/research/2026-04-08-zettel-integration-skills-tree.md`

---

## Current State Analysis

### Already in place (verified 2026-04-08)

| Component | Path | Status |
|---|---|---|
| `SkillGuard.hook.ts` | `hooks/SkillGuard.hook.ts:1-86` | PreToolUse(Skill), currently only blocks `keybindings-help` false positives. Clean single-responsibility; leave as-is. |
| `settings.json` PreToolUse(Skill) slot | `settings.json:123-131` | Already wired to `SkillGuard.hook.ts`. Matcher chain supports adding a second hook after it. |
| `settings.json` PostToolUse | `settings.json:133-161` | Has `AskUserQuestion`, `Write`, `Edit` matchers. **No `Skill` matcher yet** — clean slot. |
| `retrieval-modes.ts:323` | `hooks/lib/retrieval-modes.ts` | `assembleContextBundle(seed: RetrievalSeed): ContextBundle` — reusable, no CLI call needed. |
| `retrieval-modes.ts:289` | same | `retrieve(seed)` dispatcher routes to 5 modes (`deep-recall`, `exploratory`, `failure-aware`, `preference-aware`, `active-work`). |
| `event-bus.ts:57-65` | `hooks/lib/event-bus.ts` | Singleton with `_resetEventBus()` for tests; clean consumer registration pattern. |
| `domain-events.ts` | `hooks/lib/domain-events.ts:23-168` | 18 event types. **Zero `skill.*` events** — gap to fill. |
| `fragment-extractors.ts:489` | `hooks/lib/fragment-extractors.ts` | `indexFragments()` exported; reusable for skill-output fragments. |
| `beads-index.ts` | `hooks/lib/beads-index.ts` | Shells out to `br` / `zettel`; already does `indexWorkItem`, `indexCriteriaFragments`, etc. Same pattern fits skill fragments. |

### Key discoveries

- **`SkillGuard.hook.ts` input shape** (lines 38–44) already decodes `tool_input.skill` — the same JSON shape `SkillMemoryInject` will consume. No new parsing logic needed.
- **Hook chaining in settings.json**: a single matcher can list multiple `hooks[]` entries. Claude Code runs them in declared order. `SkillGuard` must run **first** (it can short-circuit with `decision:"block"` for `keybindings-help`); `SkillMemoryInject` runs **second** (only if not blocked).
- **PreToolUse `additionalContext` injection**: Claude Code PreToolUse hooks support emitting `{"hookSpecificOutput": {"additionalContext": "..."}}` to surface text to the model before the tool runs. This is the mechanism by which recall results reach the skill without touching SKILL.md.
- **`Packs/*/src/` never needs edits** under this plan. The hook lives in `v4.2.0/.claude/hooks/` which is the install target. `Packs/` is source distribution, not runtime.
- **The 47 skills become a data file, not 47 file edits**. `hooks/lib/skill-memory-profiles.ts` carries the per-skill recipe. Adding memory support to a new skill = one new entry in that file.

### Existing test patterns (from base plan §Existing Test Patterns)
- `bun:test` with `describe`/`it`/`expect`/`beforeEach`/`spyOn`
- Beads mocked via `spyOn(childProcess, 'execFileSync')` and `spyOn(fs, 'existsSync')`
- Event bus tested via `_resetEventBus()`
- Tests co-located (`foo.ts` → `foo.test.ts`)
- Run: `cd v4.2.0/.claude/hooks && bun test`

---

## Desired End State

All ~47 skills receive universal zettel integration without any edits to `skills/` or `Packs/`.

### Observable behaviors (added to base plan's 1–8)

9. `domain-events.ts` exports `SkillInvokedEvent` and `SkillCompletedEvent` types, added to `DomainEvent` union.
10. `hooks/lib/skill-memory-profiles.ts` exports a typed map from skill name → `SkillMemoryProfile | null`. Opt-out is explicit (`null` entry) not implicit (missing key).
11. `SkillMemoryInject.hook.ts` runs on `PreToolUse(Skill)` AFTER `SkillGuard`. For known skills: fetches context via `assembleContextBundle()` (or direct `zettel recall` for flat queries), emits `hookSpecificOutput.additionalContext` with `🧠 PRIOR MEMORY:` block, emits `skill.invoked` event. For unknown/opt-out skills: silent pass.
12. `SkillCompletionExtract.hook.ts` runs on `PostToolUse(Skill)`. Reads `tool_input.skill` + `tool_response`, looks up profile, extracts fragments, emits `skill.completed` event. A new consumer in `event-consumers.ts` receives `skill.completed` and persists beads via `beads-index.ts`.
13. `settings.json` registers both new hooks. A final E2E integration test drives a full `Skill("Research", "foo")` roundtrip through the hook chain and asserts recall context was injected AND a bead was persisted on completion.

---

## What We're NOT Doing (in this extension)

- **Editing any file under `v4.2.0/.claude/skills/` or `Packs/`.** That's the whole point.
- **Replacing `SkillGuard.hook.ts`.** It keeps its current single responsibility (blocking `keybindings-help` false positives).
- **Adding new zettel event types beyond `skill.invoked` / `skill.completed`.** The existing `artifact.updated`, `learning.captured`, `signal.captured`, `preference.captured` stay as-is; skill fragments route through `skill.completed` → consumer → those existing save paths.
- **Implementing base-plan behaviors 1–8.** Those are prerequisites; this extension assumes the base plan ships first or in parallel.
- **Changing `SKILL.md` frontmatter.** No `memory_profile:` field. The recipe lives in TypeScript.
- **Per-workflow granularity.** Profiles are per-skill, not per-workflow. A skill that needs mode-specific behavior can dispatch inside its profile's query-builder closure based on `tool_input.args`.
- **Touching the Algorithm prose.** `AAI/Algorithm/v3.7.0.md` keeps its inline `zettel recall`/`zettel save` blocks because it runs inside the primary agent outside the `Skill` tool boundary — hooks can't interpose there.

---

## Testing Strategy

Unchanged from base plan — `bun:test`, co-located tests, `spyOn` for CLI and fs. Two new mocking concerns:

- **Hook stdin simulation**: tests spawn the hook binary via `Bun.spawn` with stdin piped from a fixture JSON, and assert on stdout.
- **`retrieve()` / `assembleContextBundle()` mocking**: spy on the function from `retrieval-modes.ts` to return fixture bundles, since actual `br` / `zettel` calls are out of scope for unit tests.
- **Event bus**: `_resetEventBus()` before each test; assert consumer was invoked with correct payload.

---

## Behavior 9: Add `SkillInvokedEvent` and `SkillCompletedEvent` to `domain-events.ts`

### Test Specification

**Given**: `domain-events.ts` exports a `DomainEvent` union type
**When**: an event of `type: 'skill.invoked'` or `type: 'skill.completed'` is constructed
**Then**: TypeScript accepts it as a valid `DomainEvent`, and `event-bus.ts` routes it to registered consumers

**Edge cases**:
- `SkillCompletedEvent` with empty `output` string → event still valid
- `SkillInvokedEvent` with `profile: null` → event still valid (but no consumer action expected)

### TDD Cycle

**Red**: write `domain-events.test.ts` case asserting that `SkillInvokedEvent` and `SkillCompletedEvent` are members of the `DomainEvent` union. Also assert required fields: `skillName: string`, `args: string`, `timestamp: string`, plus `output: string` for `completed`. Expect compile failure.

**Green**: add two interfaces to `domain-events.ts` following the existing `ArtifactUpdatedEvent` pattern (lines 50–57):

```ts
export interface SkillInvokedEvent extends BaseEvent {
  type: 'skill.invoked';
  skillName: string;
  args: string;
  profileKey: string | null;  // null = opt-out/unknown
}

export interface SkillCompletedEvent extends BaseEvent {
  type: 'skill.completed';
  skillName: string;
  args: string;
  output: string;
  durationMs: number;
}
```

Add both to the `DomainEvent` union at line 168.

**Refactor**: none — these follow the existing pattern exactly.

### Success Criteria

**Automated**:
- `bun test hooks/lib/domain-events.test.ts` — new cases pass
- `bun run tsc --noEmit` — no type errors in dependent files

**Manual**: grep `domain-events.ts` confirms both interfaces exported and in union.

---

## Behavior 10: Create `skill-memory-profiles.ts`

### Test Specification

**Given**: `hooks/lib/skill-memory-profiles.ts` exports `getSkillProfile(name: string)`
**When**: called with a known skill (`Research`, `LifeOS`, `Investigation`, `Security`, `Thinking`, `ContentAnalysis`, `USMetrics`, `Copywriting`, `Utilities`, `Agents`, `Media`, `Scraping`)
**Then**: returns either a `SkillMemoryProfile` object (for opt-in skills) or `null` (for explicit opt-outs and unknown skills)

**Edge cases**:
- Case sensitivity: `getSkillProfile("research")` and `getSkillProfile("Research")` → both resolve to the Research profile (normalize to PascalCase input)
- Unknown skill name → `null` (not thrown)
- Explicit opt-out (e.g. `Scraping`, `Media`, `Agents`) → `null`
- Profile object has required fields: `recall: { limit, depth, mode }`, `save: { types[], hubKind, sourceTagPrefix, defaultStatus }`, `buildQuery(args: string): string`

### TDD Cycle

**Red**: write `skill-memory-profiles.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { getSkillProfile } from './skill-memory-profiles';

describe('skill-memory-profiles', () => {
  it('returns Research profile for known skill', () => {
    const p = getSkillProfile('Research');
    expect(p).not.toBeNull();
    expect(p?.recall.limit).toBe(5);
    expect(p?.recall.depth).toBe('connected');
    expect(p?.save.hubKind).toBe('topic-hub');
    expect(p?.save.sourceTagPrefix).toBe('research');
  });

  it('returns null for explicit opt-out (Scraping)', () => {
    expect(getSkillProfile('Scraping')).toBeNull();
  });

  it('returns null for unknown skill', () => {
    expect(getSkillProfile('NonExistent')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(getSkillProfile('research')).toEqual(getSkillProfile('Research'));
  });

  it('buildQuery extracts first 8 words from args', () => {
    const p = getSkillProfile('Research');
    expect(p?.buildQuery('investigate post-quantum crypto vendor landscape in Europe')).toContain('post-quantum');
  });
});
```

**Green**: create `hooks/lib/skill-memory-profiles.ts`:

```ts
import type { RetrievalMode } from './retrieval-modes';

export interface SkillMemoryProfile {
  recall: {
    limit: number;
    depth: 'flat' | 'connected' | 'deep';
    mode: RetrievalMode;
  };
  save: {
    types: Array<'fact' | 'learning' | 'signal' | 'preference' | 'episode' | 'artifact'>;
    hubKind: 'topic-hub' | 'project-hub' | 'workflow-map' | 'customer-map';
    sourceTagPrefix: string;
    defaultStatus: 'open' | 'in_progress';
  };
  buildQuery: (args: string) => string;
}

function firstNWords(s: string, n: number): string {
  return s.trim().split(/\s+/).slice(0, n).join(' ');
}

const PROFILES: Record<string, SkillMemoryProfile | null> = {
  Research: {
    recall: { limit: 5, depth: 'connected', mode: 'deep-recall' },
    save: { types: ['fact', 'learning', 'signal'], hubKind: 'topic-hub', sourceTagPrefix: 'research', defaultStatus: 'open' },
    buildQuery: (args) => firstNWords(args, 8),
  },
  Investigation: {
    recall: { limit: 8, depth: 'connected', mode: 'deep-recall' },
    save: { types: ['fact', 'signal'], hubKind: 'topic-hub', sourceTagPrefix: 'investigation', defaultStatus: 'open' },
    buildQuery: (args) => firstNWords(args, 8),
  },
  LifeOS: {
    recall: { limit: 5, depth: 'connected', mode: 'active-work' },
    save: { types: ['fact', 'preference'], hubKind: 'project-hub', sourceTagPrefix: 'LifeOS', defaultStatus: 'open' },
    buildQuery: (args) => firstNWords(args, 8),
  },
  Security: {
    recall: { limit: 3, depth: 'flat', mode: 'failure-aware' },
    save: { types: ['signal'], hubKind: 'topic-hub', sourceTagPrefix: 'security', defaultStatus: 'open' },
    buildQuery: (args) => firstNWords(args, 6),
  },
  Thinking: {
    recall: { limit: 5, depth: 'connected', mode: 'deep-recall' },
    save: { types: ['learning'], hubKind: 'topic-hub', sourceTagPrefix: 'thinking', defaultStatus: 'open' },
    buildQuery: (args) => firstNWords(args, 8),
  },
  ContentAnalysis: {
    recall: { limit: 3, depth: 'flat', mode: 'exploratory' },
    save: { types: ['learning', 'fact'], hubKind: 'topic-hub', sourceTagPrefix: 'content-analysis', defaultStatus: 'open' },
    buildQuery: (args) => firstNWords(args, 6),
  },
  USMetrics: {
    recall: { limit: 5, depth: 'connected', mode: 'deep-recall' },
    save: { types: ['fact'], hubKind: 'topic-hub', sourceTagPrefix: 'us-metrics', defaultStatus: 'open' },
    buildQuery: (args) => firstNWords(args, 6),
  },
  Copywriting: {
    recall: { limit: 5, depth: 'connected', mode: 'preference-aware' },
    save: { types: ['preference'], hubKind: 'topic-hub', sourceTagPrefix: 'copywriting', defaultStatus: 'open' },
    buildQuery: (args) => firstNWords(args, 6),
  },
  Utilities: {
    recall: { limit: 3, depth: 'flat', mode: 'active-work' },
    save: { types: ['fact'], hubKind: 'workflow-map', sourceTagPrefix: 'utilities', defaultStatus: 'open' },
    buildQuery: (args) => firstNWords(args, 6),
  },

  // Explicit opt-outs — no memory value
  Agents: null,
  Media: null,
  Scraping: null,
};

export function getSkillProfile(name: string): SkillMemoryProfile | null {
  if (!name) return null;
  // Case-insensitive lookup, preserve the canonical PascalCase key
  const canonical = Object.keys(PROFILES).find(
    (k) => k.toLowerCase() === name.toLowerCase()
  );
  if (!canonical) return null;
  return PROFILES[canonical] ?? null;
}

export function listKnownSkills(): string[] {
  return Object.keys(PROFILES);
}
```

**Refactor**: extract `buildQuery` into shared util if another hook needs it later; for now inline closures are fine.

### Success Criteria

**Automated**:
- `bun test hooks/lib/skill-memory-profiles.test.ts` — all 5 cases pass
- `bun run tsc --noEmit` — no type errors

**Manual**: `grep 'getSkillProfile' v4.2.0/.claude/hooks/` shows the function is importable; adding a new skill is visibly a one-line entry in `PROFILES`.

---

## Behavior 11: Create `SkillMemoryInject.hook.ts` — PreToolUse(Skill) recall injector

### Test Specification

**Given**: `SkillMemoryInject.hook.ts` is invoked on `PreToolUse(Skill)` with stdin JSON `{ tool_name: "Skill", tool_input: { skill: "Research", args: "investigate LLM agent market" } }`
**When**: the hook reads stdin, looks up the profile, calls `assembleContextBundle()` with a seed built from `buildQuery(args)`, and prints its output
**Then**: stdout contains a single JSON object with `hookSpecificOutput.additionalContext` containing a `🧠 PRIOR MEMORY:` block formatted with bead IDs and first 80 chars of each hit. An event `skill.invoked` is emitted to the event bus with the correct payload.

**Edge cases**:
- `getSkillProfile(skill)` returns `null` → hook exits 0 silently, no output (pass-through), but **still emits `skill.invoked` with `profileKey: null`** so downstream observers can count total invocations
- `assembleContextBundle()` throws → catch, log once to stderr, exit 0 (fail-open)
- `zettel status` unavailable (bundle returns empty) → emit `🧠 PRIOR MEMORY: none` in additionalContext
- Missing `tool_input.skill` → exit 0 silently
- Called in parallel with `SkillGuard` blocking — tests verify SkillGuard's `decision:"block"` suppresses injection via chain semantics (this is a settings.json ordering concern verified in Behavior 13, not in this unit test)

### TDD Cycle

**Red**: write `SkillMemoryInject.hook.test.ts`:

```ts
import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import * as retrieval from './lib/retrieval-modes';
import { _resetEventBus, getEventBus } from './lib/event-bus';

describe('SkillMemoryInject.hook', () => {
  beforeEach(() => { _resetEventBus(); });

  it('injects PRIOR MEMORY block for known skill', async () => {
    spyOn(retrieval, 'assembleContextBundle').mockReturnValue({
      items: [
        { id: 'br-abc', content: 'Prior research on LLM agents...', score: 0.9 },
      ],
      totalTokens: 40,
    } as any);

    const input = JSON.stringify({
      tool_name: 'Skill',
      tool_input: { skill: 'Research', args: 'investigate LLM agent market' },
    });

    const proc = Bun.spawn(['bun', 'hooks/SkillMemoryInject.hook.ts'], {
      stdin: new TextEncoder().encode(input),
      stdout: 'pipe',
    });
    const out = await new Response(proc.stdout).text();
    const parsed = JSON.parse(out);

    expect(parsed.hookSpecificOutput.additionalContext).toContain('🧠 PRIOR MEMORY');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('br-abc');
  });

  it('passes through silently for opt-out skill', async () => {
    const input = JSON.stringify({
      tool_name: 'Skill',
      tool_input: { skill: 'Scraping', args: 'scrape example.com' },
    });
    const proc = Bun.spawn(['bun', 'hooks/SkillMemoryInject.hook.ts'], {
      stdin: new TextEncoder().encode(input),
      stdout: 'pipe',
    });
    const out = await new Response(proc.stdout).text();
    expect(out.trim()).toBe('');
  });

  it('fails open on bundle error', async () => {
    spyOn(retrieval, 'assembleContextBundle').mockImplementation(() => {
      throw new Error('engine unreachable');
    });
    const input = JSON.stringify({
      tool_name: 'Skill',
      tool_input: { skill: 'Research', args: 'anything' },
    });
    const proc = Bun.spawn(['bun', 'hooks/SkillMemoryInject.hook.ts'], {
      stdin: new TextEncoder().encode(input),
      stdout: 'pipe',
    });
    expect(await proc.exited).toBe(0);
  });

  it('emits skill.invoked event with profileKey for known skill', async () => {
    const bus = getEventBus();
    const events: any[] = [];
    bus.subscribe('skill.invoked', (e) => { events.push(e); });
    // ... invoke hook ...
    // assert events[0].profileKey === 'Research'
  });
});
```

**Green**: create `hooks/SkillMemoryInject.hook.ts` modeled on `SkillGuard.hook.ts:46-86` for stdin parsing:

```ts
#!/usr/bin/env bun
/**
 * SkillMemoryInject.hook.ts — PreToolUse(Skill) zettel recall injector.
 *
 * Runs AFTER SkillGuard. For known skills with a memory profile, fetches
 * recall context via assembleContextBundle() and injects it as
 * hookSpecificOutput.additionalContext so the model sees prior memory
 * before the skill runs. Fail-open: any error degrades silently to no-op.
 */
import { assembleContextBundle } from './lib/retrieval-modes';
import { getEventBus } from './lib/event-bus';
import { getSkillProfile } from './lib/skill-memory-profiles';
import type { SkillInvokedEvent } from './lib/domain-events';

interface HookInput {
  tool_name: string;
  tool_input: { skill?: string; args?: string };
}

async function readStdin(timeout = 1000): Promise<string> {
  // same pattern as SkillGuard.hook.ts:46-54
}

function formatContextBlock(bundle: { items: Array<{ id: string; content: string }> }): string {
  if (!bundle.items.length) return '🧠 PRIOR MEMORY: none';
  const lines = bundle.items.map((i) => `  • ${i.id} — ${i.content.slice(0, 80)}`);
  return `🧠 PRIOR MEMORY:\n${lines.join('\n')}`;
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw) return process.exit(0);
    const data: HookInput = JSON.parse(raw);
    const skillName = (data.tool_input?.skill || '').trim();
    const args = (data.tool_input?.args || '').trim();
    if (!skillName) return process.exit(0);

    const profile = getSkillProfile(skillName);

    // Always emit the invoked event (even for profile=null, for counting)
    const bus = getEventBus();
    const event: SkillInvokedEvent = {
      type: 'skill.invoked',
      timestamp: new Date().toISOString(),
      skillName,
      args,
      profileKey: profile ? skillName : null,
    };
    bus.emit(event);

    if (!profile) return process.exit(0);  // opt-out, no injection

    const query = profile.buildQuery(args);
    const bundle = assembleContextBundle({
      query,
      mode: profile.recall.mode,
      limit: profile.recall.limit,
      depth: profile.recall.depth,
    } as any);

    const block = formatContextBlock(bundle as any);
    const output = {
      hookSpecificOutput: { additionalContext: block },
    };
    console.log(JSON.stringify(output));
    process.exit(0);
  } catch (err) {
    console.error(`SkillMemoryInject: ${(err as Error).message}`);
    process.exit(0);  // fail-open
  }
}
main();
```

**Refactor**:
- Extract `readStdin` into `hooks/lib/hook-io.ts` if not already there (it IS there — `grep hook-io.ts` in lib listing). Import from there instead of duplicating.
- Extract `formatContextBlock` into `hooks/lib/context-provenance.ts` where `attachProvenance` already lives.

### Success Criteria

**Automated**:
- `bun test hooks/SkillMemoryInject.hook.test.ts` — all 4 cases pass
- `bun run tsc --noEmit` — no type errors

**Manual**:
- Run `echo '{"tool_name":"Skill","tool_input":{"skill":"Research","args":"test query"}}' | bun hooks/SkillMemoryInject.hook.ts` and visually verify the JSON output contains `additionalContext` with `🧠 PRIOR MEMORY:`.
- Run the same with `"skill":"Scraping"` and verify stdout is empty.

---

## Behavior 12: Create `SkillCompletionExtract.hook.ts` — PostToolUse(Skill) save-on-exit

### Test Specification

**Given**: `SkillCompletionExtract.hook.ts` is invoked on `PostToolUse(Skill)` with stdin JSON `{ tool_name: "Skill", tool_input: { skill: "Research", args: "x" }, tool_response: "<skill output text>", tool_duration_ms: 4200 }`
**When**: the hook runs
**Then**: a `skill.completed` event is emitted with the correct payload. A new consumer `skillCompletionConsumer` registered in `event-consumers.ts` receives it and calls `indexFragments()` (from `fragment-extractors.ts`) to persist beads, tagged with `source: "${profile.sourceTagPrefix}-${timestamp}"`.

**Edge cases**:
- `getSkillProfile(skill)` returns `null` → event still emitted (for audit), but consumer short-circuits without indexing
- `tool_response` empty or not a string → event emitted with `output: ""`, consumer no-ops
- Fragment extraction throws → logged, not rethrown (fail-open)
- `beads-index` unavailable → already handled inside `indexFragments()` per base plan

### TDD Cycle

**Red**: write `SkillCompletionExtract.hook.test.ts`:

```ts
describe('SkillCompletionExtract.hook', () => {
  beforeEach(() => { _resetEventBus(); });

  it('emits skill.completed with profile payload', async () => {
    const bus = getEventBus();
    const events: any[] = [];
    bus.subscribe('skill.completed', (e) => events.push(e));

    const input = JSON.stringify({
      tool_name: 'Skill',
      tool_input: { skill: 'Research', args: 'x' },
      tool_response: 'Finding: LLM agent market grew 3x in 2025',
      tool_duration_ms: 4200,
    });
    // spawn hook, pipe input
    // ...
    expect(events).toHaveLength(1);
    expect(events[0].skillName).toBe('Research');
    expect(events[0].durationMs).toBe(4200);
  });

  it('opt-out skills still emit event but consumer no-ops', async () => {
    // verify event emitted for Scraping, but indexFragments spy NOT called
  });

  it('fails open on extraction error', async () => {
    // spy indexFragments to throw, assert hook exits 0
  });
});
```

And `event-consumers.test.ts` — add a case for `skillCompletionConsumer`:

```ts
it('skillCompletionConsumer indexes fragments for known skill', () => {
  const indexSpy = spyOn(fragmentExtractors, 'indexFragments');
  const event: SkillCompletedEvent = {
    type: 'skill.completed',
    timestamp: '...',
    skillName: 'Research',
    args: 'x',
    output: 'Finding: foo',
    durationMs: 100,
  };
  skillCompletionConsumer(event);
  expect(indexSpy).toHaveBeenCalledTimes(1);
  expect(indexSpy.mock.calls[0][0].source).toMatch(/^research-/);
});
```

**Green**:

1. Create `hooks/SkillCompletionExtract.hook.ts` — tiny hook that parses stdin, builds `SkillCompletedEvent`, emits via `getEventBus()`, exits 0.

2. Add `skillCompletionConsumer` in `hooks/lib/event-consumers.ts`:
```ts
export function skillCompletionConsumer(event: SkillCompletedEvent) {
  try {
    const profile = getSkillProfile(event.skillName);
    if (!profile || !event.output) return;
    const source = `${profile.save.sourceTagPrefix}-${event.timestamp.slice(0, 10)}`;
    indexFragments({
      source,
      content: event.output,
      types: profile.save.types,
      status: profile.save.defaultStatus,
    });
  } catch (err) {
    console.error(`skillCompletionConsumer: ${(err as Error).message}`);
  }
}
```

3. Register in `getEventBus()` auto-registration block (event-bus.ts:61-65):
```ts
bus.subscribe('skill.completed', skillCompletionConsumer);
```

**Refactor**: if `indexFragments` signature doesn't yet accept an arbitrary content blob (it may be PRD-specific), add a sibling `indexSkillOutput()` in `fragment-extractors.ts` that wraps the skill response as a synthetic fragment. Gate that decision on reading `fragment-extractors.ts:489` (the exported `indexFragments`) during Green phase.

### Success Criteria

**Automated**:
- `bun test hooks/SkillCompletionExtract.hook.test.ts`
- `bun test hooks/lib/event-consumers.test.ts` (new case)
- `bun run tsc --noEmit`

**Manual**:
- Invoke the hook with a fixture input and confirm a bead with `source: research-2026-04-08` appears via `zettel recall "research-2026-04-08" -l 1`.

---

## Behavior 13: Settings.json wiring + E2E integration test

### Test Specification

**Given**: `settings.json` hooks block is edited to:
- Append `SkillMemoryInject.hook.ts` to the existing `PreToolUse` `Skill` matcher's `hooks[]` (after `SkillGuard`)
- Add a new `PostToolUse` entry with `matcher: "Skill"` and `hooks: [SkillCompletionExtract.hook.ts]`

**When**: a full Skill invocation roundtrip is simulated

**Then**:
1. `SkillGuard` runs first, allows `Research` through
2. `SkillMemoryInject` runs second, emits `skill.invoked`, injects `additionalContext`
3. The skill "runs" (mocked — tool_response fixture)
4. `SkillCompletionExtract` runs, emits `skill.completed`
5. `skillCompletionConsumer` receives the event, calls `indexFragments()`

**Edge cases**:
- `keybindings-help` invocation: `SkillGuard` blocks with `decision:"block"`, `SkillMemoryInject` **does not run** (chain short-circuits on block). Verify by asserting `SkillMemoryInject` is not invoked when a blocking decision is returned.
- `SkillMemoryInject` itself throws: base plan's `SessionCleanup.hook.ts:81-139` failure-isolation pattern applies — hook exits 0, chain continues.

### TDD Cycle

**Red**: write `hooks/SkillHookChain.integration.test.ts`:

```ts
describe('Skill hook chain integration', () => {
  beforeEach(() => { _resetEventBus(); });

  it('full Research roundtrip injects recall and persists completion bead', async () => {
    // 1. spy assembleContextBundle to return fixture
    // 2. spy indexFragments to capture saved fragments
    // 3. simulate PreToolUse: invoke SkillGuard then SkillMemoryInject with Research input
    // 4. assert SkillGuard exit 0 (no block)
    // 5. assert SkillMemoryInject stdout contains additionalContext
    // 6. assert skill.invoked event received
    // 7. simulate PostToolUse: invoke SkillCompletionExtract with tool_response
    // 8. assert skill.completed event received
    // 9. assert indexFragments called with source starting with "research-"
  });

  it('keybindings-help: SkillGuard blocks, SkillMemoryInject does not emit', async () => {
    // 1. invoke SkillGuard with keybindings-help input → expect decision:"block"
    // 2. assert chain semantics: when hook returns block, subsequent hooks in chain do not execute
    //    (this is Claude Code harness behavior, not hook-internal — assert via documentation
    //     reference in README.md, and via sanity check that SkillMemoryInject is NOT called in settings chain)
  });

  it('unknown skill passes through all hooks with no side effects', async () => {
    // 1. SkillGuard → exit 0
    // 2. SkillMemoryInject → empty stdout (profile null)
    // 3. PostToolUse SkillCompletionExtract → emit event with profileKey null
    // 4. consumer → no indexFragments call
  });
});
```

**Green**: edit `v4.2.0/.claude/settings.json`:

```diff
       {
         "matcher": "Skill",
         "hooks": [
           {
             "type": "command",
             "command": "${AAI_DIR}/hooks/SkillGuard.hook.ts"
+          },
+          {
+            "type": "command",
+            "command": "${AAI_DIR}/hooks/SkillMemoryInject.hook.ts"
           }
         ]
       }
     ],
     "PostToolUse": [
       {
         "matcher": "AskUserQuestion",
         ...
+      },
+      {
+        "matcher": "Skill",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "${AAI_DIR}/hooks/SkillCompletionExtract.hook.ts"
+          }
+        ]
       }
     ],
```

**Refactor**: none — config change only.

### Success Criteria

**Automated**:
- `bun test hooks/SkillHookChain.integration.test.ts` — all 3 cases pass
- `bun run tsc --noEmit` — no type errors
- Base plan's integration test (Behavior 8) still passes — prove no regression

**Manual**:
1. Start a fresh Claude Code session in `cosmic-agent-core`
2. Invoke `Skill("Research", "investigate recent AI regulation")`
3. Observe in transcript: a `<system-reminder>` style block containing `🧠 PRIOR MEMORY:` injected before the Research skill's SKILL.md loads
4. After the skill completes, run `zettel recall "research-$(date -u +%Y-%m-%d)" -l 3` and confirm at least one bead with the expected `source` tag
5. Invoke `Skill("Scraping", "anything")` and confirm **no** recall injection (empty hook output) and **no** new bead

---

## Implementation Order

Strict dependency order (each blocks the next):

1. **Behavior 9** — add event types (trivial, unblocks 11 and 12)
2. **Behavior 10** — create `skill-memory-profiles.ts` (unblocks 11 and 12)
3. **Behavior 11** — `SkillMemoryInject.hook.ts`
4. **Behavior 12** — `SkillCompletionExtract.hook.ts` + consumer
5. **Behavior 13** — settings.json wiring + E2E test

All five behaviors can ship in a single PR since they compose into one feature. **Do NOT merge without the base plan's behaviors 1–8** — several of them (especially behavior 6 `assembleContextBundle` upgrade) are prerequisites for behavior 11.

---

## References

- Base plan: `Plans/2026-04-05-tdd-zettelkasten-hook-wiring.md`
- Hook-wiring summary: `v4.2.0/ZETTELKASTEN-HOOK-WIRING.md`
- Prior research: `thoughts/searchable/shared/research/2026-04-08-zettel-integration-skills-tree.md`
- Algorithm memory protocol: `v4.2.0/.claude/AAI/Algorithm/v3.7.0.md` §Memory Integration (lines 38–243)
- Existing PreToolUse(Skill) hook: `v4.2.0/.claude/hooks/SkillGuard.hook.ts:1-86`
- `retrieval-modes.ts:323` — `assembleContextBundle()`
- `domain-events.ts:168` — `DomainEvent` union (insertion point for new event types)
- `event-bus.ts:57-65` — consumer auto-registration pattern
- `settings.json:123-131` — current PreToolUse(Skill) slot
- `settings.json:133-161` — PostToolUse block (insertion point)
- `zettel` CLI reference: `v4.2.0/.claude/commands/zettel.md`

---

## Out of scope — follow-up work

The following are deliberately deferred and can be tracked as separate items:

1. **Per-workflow profiles** — if a skill needs different recall/save behavior per workflow (Research Quick vs Deep), the profile's `buildQuery` closure can dispatch on `args` content. Only implement if an actual skill demands it.
2. **Skill invocation metrics dashboard** — now that `skill.invoked` / `skill.completed` events exist, an observability consumer could tally invocations, durations, and bead yields. Out of scope for wiring, trivial to add later.
3. **Dynamic profile reload** — profiles are compiled into the hook binary; changing them requires a restart. Acceptable for v1. A JSON-file-backed profile store could come later if the map grows unwieldy.
4. **Backfill of existing Research skill prose blocks** — the Research skill's current inline `zettel` bash blocks in `Workflows/*.md` become redundant once this ships. Removing them is a separate cleanup PR and should be done AFTER this extension is verified in production to avoid regression during the transition.

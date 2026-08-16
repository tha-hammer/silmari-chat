---
date: 2026-04-08T16:05:00Z
researcher: maceo
git_commit: 79ba97c8d7ae62feceb025f0348bd30a4f26152a
branch: main
repository: cosmic-agent-core
topic: "How zettelkasten calls are inserted into the Pack and v4.2.0/.claude skills tree"
tags: [research, zettel, zettelkasten, skills, packs, memory-integration, algorithm, research-skill]
status: complete
last_updated: 2026-04-08
last_updated_by: maceo
---

```
┌────────────────────────────────────────────────────────────────┐
│  RESEARCH: Zettelkasten integration across the skills tree     │
│  Status: complete  │  Date: 2026-04-08  │  Commit: 79ba97c8    │
└────────────────────────────────────────────────────────────────┘
```

# Research: How to insert zettelkasten calls into the full Pack and v4.2.0/.claude skills tree

**Date**: 2026-04-08T16:05:00Z
**Researcher**: maceo
**Git Commit**: 79ba97c8d7ae62feceb025f0348bd30a4f26152a
**Branch**: main
**Repository**: cosmic-agent-core

## 📋 Research Question

How do we insert zettelkasten (`zettel` CLI) calls into the full Pack and `v4.2.0/.claude` skills tree (650+ markdown files across two parallel trees)? Study "the Algorithm" and the "Research" skill to understand the existing pattern, and consult the `zettel` CLI + `v4.2.0/.claude/lib` to verify mechanics.

## 🎯 Summary

Zettel integration in this repo is **prose-level injection into markdown procedure files**, not code-level wrapping. It follows a single canonical shape that already exists in two places:

1. **The Algorithm** (`v4.2.0/.claude/AAI/Algorithm/v3.7.0.md`) — defines the *protocol* (when to recall, when to save, how to classify, how to handle failure). It is the specification.
2. **The Research skill** (`v4.2.0/.claude/skills/Research/`) — the **first and currently only** skill-level implementation of the Algorithm's memory protocol. It was wired on 2026-04-08 (today) via edits to `SKILL.md` and the four Workflow files, plus a new `Workflows/Memory.md` that acts as the skill-local spec reference.

Two important facts shape the mass-edit approach:

- **There is no `v4.2.0/.claude/lib` zettel code.** The only `lib/` directory contains migration utilities. The `zettel` CLI is a standalone shell script at `~/.local/bin/zettel` that POSTs to the `cosmic-agent-memory` HTTP engine on `localhost:8787` (SSH tunnel to `ionos01`). Skills invoke it via plain `Bash` blocks — no TypeScript shim, no hook, no import.
- **There is a parallel, hook-based plan for the code layer** (`Plans/2026-04-05-tdd-zettelkasten-hook-wiring.md`). That plan wires zettel into the `hooks/` event bus (SessionStart, PostToolUse, SessionEnd, PreCompact). It is **complementary, not competing** — the hooks handle PRD/session events automatically, while the prose injection in skills/Workflows handles the *intent-specific* recall/save inside a skill's reasoning flow.

So the mass-edit task is: **take the Research skill's prose pattern and propagate it across the other 46 SKILL.md entry points and their ~159 Workflow files in both `v4.2.0/.claude/skills/` and `Packs/*/src/`.**

## 🗺️ Detailed Findings

### 1. The two parallel trees — and their relationship

| Tree | Role | SKILL.md count | Total .md |
|---|---|---|---|
| `v4.2.0/.claude/skills/` | Live install point (edited directly) | 47 | 651 |
| `Packs/*/src/` | Source-of-distribution mirror | 48 | 702 |

- **Not symlinks. Not identical.** `Packs/` is a diverged copy. Manual file comparisons show `Packs/Research/src/SKILL.md` (6581B, Apr 4) vs `v4.2.0/.claude/skills/Research/SKILL.md` (7376B, Apr 8) — the latter has the Memory Integration section added today.
- **Every workflow file in Research is bigger in v4.2.0** (e.g. `ExtensiveResearch.md`: 4757B in Packs vs 7741B in v4.2.0) because zettel blocks were appended.
- **`Packs/` currently has ZERO zettel references** per grep. Only the v4.2.0 Research skill has been wired.
- **Installer does NOT sync Packs → skills.** `install.sh` and `v4.2.0/.claude/AAI-Install/headless-install.ts` clone the repo to `~/.claude`; there is no rsync step from `Packs/` to `skills/`. Distribution to Packs is manual.

**Implication:** a mass-edit must write to **both trees** (or write to one and then back-port once stable). The canonical edit site is `v4.2.0/.claude/skills/` because that's what runs.

### 2. Directory hierarchy inside a skill

Uniform shape across both trees:

```
{Category}/
├── SKILL.md                    ← entry point with frontmatter (name, description)
├── Workflows/
│   ├── QuickResearch.md        ← phased procedure docs (1 per mode)
│   ├── StandardResearch.md
│   ├── ExtensiveResearch.md
│   ├── DeepInvestigation.md
│   └── Memory.md               ← NEW as of 2026-04-08 (skill-local zettel spec)
├── Templates/*.md              ← optional output templates
├── {SubSkill}/                 ← optional nested skills (Security/Recon, Research/ExtractWisdom)
│   └── SKILL.md
└── Patterns/                   ← Utilities/Fabric only: 309 Fabric prompt files
```

File counts by role in `v4.2.0/.claude/skills/`:

| Role | Count |
|---|---|
| `SKILL.md` entry points | 47 |
| `Workflows/*.md` | 159 |
| `Templates/*.md` | 6 |
| `Patterns/**` (Fabric) | 309 |
| `README.md` + supporting | 441 |
| **Total** | **651** |

**Frontmatter is uniform and minimal** — every SKILL.md has only `name:` and `description:`. There is **no existing `memory_integration:` or `zettel_type:` field** we can use as a filter. Any categorization must either be added (new frontmatter field) or inferred from skill identity.

### 3. The canonical pattern from the Algorithm (specification layer)

File: `v4.2.0/.claude/AAI/Algorithm/v3.7.0.md` §"Memory Integration (Zettel)" (lines ~38–122 and §"Card Lifecycle States" lines ~124–243).

The Algorithm defines **five integration points**, only the first two are mandatory:

| # | Phase | Kind | What it does |
|---|---|---|---|
| 1 | OBSERVE | **RECALL (mandatory)** | `zettel recall "{8-word task}" -l 5 -d connected` + a second `zettel recall --status in_progress -l 10 -d connected` for the resumption handshake |
| 2 | LEARN | **SAVE + DIFF + LINK (mandatory)** | Pre-reflection `zettel recall "{domain keywords}" -l 10`; classify each reflection as Novel / Restatement / Reinforcement / Clean; save novel only, `zettel link` restatements to existing beads; promote to hubs on 3+ recurrences |
| 3 | THINK | RECALL-first per-risk (optional) | `zettel recall "{risk keywords}" -l 3 -d flat` for every premortem item; promote hits into new ISCs |
| 4 | EXECUTE | SAVE non-obvious decisions (optional) | `zettel save "{decision} (reason: {why})" -t fact -S "algorithm-{slug}-execute"` |
| 5 | VERIFY | SAVE surprises (optional) | `zettel save "{finding}" -t signal -S "algorithm-{slug}-verify"` |

**Failure handling (universal):** if `zettel status` returns `available:false` OR any call fails, note once in PRD `## Decisions` and continue. *Never block work on memory unavailability.*

**Card lifecycle states (critical to get right on saves):**
- `open` — default for almost all saves
- `in_progress` — ONLY when explicitly starting a focused session (this drives the resumption hook)
- `blocked` — only with explicit `--blocked-by` edges to stub cards
- `closed` — ONLY on explicit user instruction (destructive of resume signal)

**Save-side verb inference table** (Algorithm v3.7.0.md lines ~214–220):
| User verb | Status |
|---|---|
| "I'm working on" / "let's research" | `in_progress` |
| "I'm done with" / "finished" | `closed` |
| "blocked on" / "need X first" | `blocked` (+ stub flow) |
| anything else | `open` |

### 4. The canonical pattern from the Research skill (implementation layer)

This is the copy-paste template for the other 46 skills. The Research skill has **four workflow modes** (Quick, Standard, Extensive, Deep), each with its own memory profile, all cross-referencing a single `Memory.md` spec file in the skill's `Workflows/` directory.

#### 4.1 Pre-flight check — identical in every workflow

```bash
zettel status >/dev/null 2>&1 || export RESEARCH_SKIP_MEMORY=1
[ -z "$RESEARCH_SKIP_MEMORY" ] && zettel recall "{topic keywords}" -l N -d MODE
```

On failure: log once (`⚠️ Memory unavailable — research running without zettel integration`), skip both RECALL and SAVE for the rest of the run.

#### 4.2 RECALL block — at entry, before work begins

Parameters vary by mode:

| Workflow | limit `-l` | depth `-d` | Where | SAVE? |
|---|---|---|---|---|
| QuickResearch | 3 | flat | Step 0, pre-agent | ❌ (too lightweight) |
| StandardResearch | 5 | connected | Step 0, pre-query-crafting | ✅ Step 6 |
| ExtensiveResearch | 8 | connected | Pre-Step, pre-angle-generation | ✅ Step 6 |
| DeepInvestigation | 10 global + 3 per-entity | connected | Step 0a + Step 4a | ✅ Steps 1, 4, 5 |

Result surface format (uniform):
```
🧠 PRIOR RESEARCH:
  • {br-id} ({source-tag}, {time-ago}) — {first 80 chars}
```
Zero results → `🧠 PRIOR RESEARCH: none`.

#### 4.3 SAVE block — at exit, with dedup-via-recall

The save sequence is **ordered** (hub → landscape → entities → findings → summary) and uses `zettel link` to express relationships:

```bash
# 1. Idempotent hub
HUB_ID=$(zettel hub topic-hub "research-{topic-slug}" | jq -r '.id')

# 2. Landscape (fact)
LANDSCAPE_ID=$(zettel save "{synthesis}" -t fact \
  -S "research-{topic-slug}-landscape" --status open | jq -r '.id')

# 3. Per-entity profiles (Extensive/Deep)
ENTITY_ID=$(zettel save "{profile}" -t fact \
  -S "research-{topic-slug}-entity-{slug}" --status open | jq -r '.id')
zettel link "$ENTITY_ID" "$LANDSCAPE_ID" discovered-from

# 4. Surprising findings — dedup before save
zettel recall "{finding keywords}" -l 3 -d flat
# If hit: zettel link {new} {existing} relates-to
# Else:   zettel save "{finding}" -t signal -S "research-{topic-slug}-finding"

# 5. Summary (learning)
SUMMARY_ID=$(zettel save "{summary}" -t learning \
  -S "research-{topic-slug}-summary" --status open | jq -r '.id')
zettel link "$SUMMARY_ID" "$LANDSCAPE_ID" discovered-from
```

**Source-tag format (canonical):** `{skill-slug}-{topic-slug}-{phase}` where phase ∈ `{landscape, entity-{name}, summary, finding, theme-{name}}`.

**Bead type discipline:**
| Type | Use |
|---|---|
| `fact` | Landscape, entity profiles, concrete knowledge |
| `learning` | Summary, strategic synthesis |
| `signal` | Surprising/contrarian findings |
| `preference` | User-revealed preferences |
| `episode` | A thing that happened |
| `artifact` | Reference to external resource |

**Dedup strategy (lightweight):** there is no separate `diff` command — dedup is just "recall first, then link-or-save." The engine also auto-interlinks via Jaccard similarity on save, so manual edges are only needed for explicit semantic relationships.

#### 4.4 The Memory.md spec file — a new pattern

`v4.2.0/.claude/skills/Research/Workflows/Memory.md` (221 lines, created 2026-04-08) is the **skill-local specification** the workflows reference. Structure:

- Conventions table (scope, source-tag format, type discipline)
- Integration Point 1 — RECALL at entry (lines 57–90)
- Integration Point 2 — SAVE at exit (lines 93–158)
- Integration Point 3 — per-entity RECALL for Deep mode (lines 161–175)
- Failure handling (lines 179–192)
- Per-mode integration matrix (lines 197–207)

Workflows cite it via a one-liner:
```markdown
**Run BEFORE launching agents.** See `Memory.md` for the full spec.
```

This is significant for the mass-edit: **each skill gets its own `Workflows/Memory.md` spec + workflow-local copy-paste RECALL/SAVE blocks.** The repetition is intentional — workflows must be self-contained so a skill invocation doesn't require reading the spec file first.

#### 4.5 SKILL.md-level hook

`v4.2.0/.claude/skills/Research/SKILL.md` adds a top-level section:
```markdown
## MANDATORY: Memory Integration (Zettel)

**READ:** `Workflows/Memory.md` — Zettelkasten integration spec for the Research skill.

**Every research workflow MUST run a `zettel recall` BEFORE launching agents**...
Quick mode is recall-only (too lightweight to justify writes).
```

This is the minimal SKILL.md-level contract — it tells the primary agent the skill opts into memory and points at the spec.

### 5. The `zettel` CLI surface (what skills actually call)

Verified via `zettel --help` and `v4.2.0/.claude/commands/zettel.md` (107 lines, read in full).

| Subcommand | Shape | Used by Research skill? |
|---|---|---|
| `save <content>` | `-t type -s scope -S source --status {open\|in_progress\|blocked\|closed} --blocked-by <id> --kind stub --fork --root` | ✅ |
| `recall <query>` | `-l limit -d {flat\|connected\|deep} -s scope --status ...` | ✅ |
| `promote <id>` | `--to <status> --reason <text> --force` | ❌ (explicit user action) |
| `status` | `-s scope` → `{available, scope}` | ✅ (pre-flight) |
| `link <from> <to> <type>` | e.g. `discovered-from`, `relates-to`, `derived-from` | ✅ |
| `hub <kind> <label>` | kinds: `workflow-map`, `customer-map`, `topic-hub`, `project-hub` | ✅ |
| `consolidate` | Runs extract→cluster→promote→hub pipeline | ❌ (cron/manual) |
| `query [mode]` | `-w workSlug -t topic` | ❌ (hooks only) |
| `forget <id>` | Close a bead | ❌ |
| `trace <id>` | Find beads referencing this id | ❌ |
| `register [show\|hubs]` | Show top-level index of hubs | ❌ |
| `raw <METHOD> <path>` | Escape hatch | ❌ |

Network: engine at `http://localhost:8787`, ~50-100ms per call over SSH tunnel. **Don't batch dozens of saves in tight loops** (documented constraint in commands/zettel.md:107).

### 6. The hook-wiring plan — complementary, not competing

File: `Plans/2026-04-05-tdd-zettelkasten-hook-wiring.md` (1025 lines). This plan wires zettel into the TypeScript **hook layer** (not skills), via the event bus:

- `LoadContext.hook.ts:507-577` — upgrade to `assembleContextBundle()` on SessionStart
- `PRDSync.hook.ts` (PostToolUse on Write/Edit of PRD.md) — trigger `indexWorkItem()` + `indexCriteriaFragments()`
- `event-bus.ts:57-65` — singleton consumer registration for fragments, permanent notes, structure notes
- `SessionCleanup.hook.ts:81-139,197-231` — fix `currentWork` scope bug, emit `work.completed`
- New `PreCompact.hook.ts` — preserve active-work context at compaction boundary
- 8-behavior TDD suite (Red-Green-Refactor), bun test framework

**Division of labor:**
| Layer | Handles | How |
|---|---|---|
| Hooks (TypeScript) | PRD edits, session lifecycle events, context bundling, structure notes | Event bus + consumers, auto-fires |
| Skills/Workflows (prose) | Intent-specific recall (domain query) and save (domain findings) | `zettel` CLI in `bash` blocks, agent-invoked |
| Algorithm (prose) | Cross-cutting protocol (OBSERVE/LEARN/THINK handshake, card lifecycle) | `zettel` CLI in bash blocks, primary-agent-invoked |

The three layers operate on the same beads graph but at different time granularities. The skills-tree mass-edit is independent of the hook-wiring TDD plan — **both need to ship.**

### 7. Current zettel footprint across the repo

Grep for `zettel` in `v4.2.0/.claude/skills/`:
- `Research/SKILL.md` (mandatory integration section, ~Apr 8)
- `Research/Workflows/Memory.md` (NEW, 221 lines, Apr 8)
- `Research/Workflows/QuickResearch.md`
- `Research/Workflows/StandardResearch.md`
- `Research/Workflows/ExtensiveResearch.md`
- `Research/Workflows/DeepInvestigation.md`

Grep for `zettel` in `Packs/`: **zero hits.** Packs is untouched source state.

Other zettel references in the repo:
- `v4.2.0/.claude/commands/zettel.md` (the `/zettel` slash command spec)
- `v4.2.0/.claude/AAI/Algorithm/v3.7.0.md` (the Algorithm's §Memory Integration)
- `v4.2.0/ZETTELKASTEN-HOOK-WIRING.md` (90-line companion to the TDD plan)
- `Plans/2026-04-05-tdd-zettelkasten-hook-wiring.md` (1025-line canonical hook plan)
- `thoughts/searchable/shared/plans/2026-04-06-ENG-XXXX-tdd-zettelkasten-hook-wiring.md` (349-line thoughts copy)

### 8. Skill categorization — what would vs wouldn't benefit from zettel

No existing metadata supports filtering. Inferring from the 11 top-level skill categories and their semantics:

| Skill | Recommended profile | Reasoning (from skill description alone) |
|---|---|---|
| Research | full recall + save (hub/landscape/entities/findings/summary) | Already done — template source |
| Investigation | full recall + save | OSINT cases are long-running, entity-centric, benefits from entity profiles + hub |
| LifeOS | full recall + save (project-hub kind) | Life OS is explicitly a memory substrate; projects = long-running topics |
| Security | recall + save signals | Recon targets/findings are recurring; signal type fits vulns |
| ContentAnalysis | recall (optional) + save learnings | Wisdom extraction produces reusable insights |
| USMetrics | recall + save facts | Indicator snapshots are durable facts |
| Thinking | recall per-risk + save learnings | Parallel to Algorithm THINK phase |
| Copywriting | optional recall of voice/preferences + save preferences | User voice evolves; preference type fits |
| Media | light recall (style preferences) | Artifacts not typically recalled |
| Scraping | minimal | Raw scrape output is not memory-worthy |
| Agents | minimal | Agent composition is ephemeral |
| Utilities | per-sub-skill decision | Heterogeneous bag (CLI/Docs/Fabric/Cloudflare/etc.) — has to be decided per sub-skill |

These are **inferences from description text**, not from any codified metadata. The mass-edit plan will need to either codify these as a mapping table or introduce a new `memory_profile:` frontmatter field.

## 🗂️ Code References

- `v4.2.0/.claude/AAI/Algorithm/v3.7.0.md:38-122` — Memory Integration section (the canonical protocol)
- `v4.2.0/.claude/AAI/Algorithm/v3.7.0.md:124-243` — Card lifecycle states + resumption handshake
- `v4.2.0/.claude/skills/Research/SKILL.md` — MANDATORY Memory Integration section (skill-level opt-in)
- `v4.2.0/.claude/skills/Research/Workflows/Memory.md:1-221` — the skill-local zettel spec (template for other skills)
- `v4.2.0/.claude/skills/Research/Workflows/Memory.md:57-90` — RECALL spec
- `v4.2.0/.claude/skills/Research/Workflows/Memory.md:93-158` — SAVE spec (5-step order)
- `v4.2.0/.claude/skills/Research/Workflows/Memory.md:161-175` — per-entity RECALL
- `v4.2.0/.claude/skills/Research/Workflows/Memory.md:179-192` — failure handling
- `v4.2.0/.claude/skills/Research/Workflows/Memory.md:197-207` — per-mode integration matrix
- `v4.2.0/.claude/skills/Research/Workflows/StandardResearch.md:28-32` — copy-paste RECALL block
- `v4.2.0/.claude/skills/Research/Workflows/StandardResearch.md:119-135` — copy-paste SAVE block
- `v4.2.0/.claude/skills/Research/Workflows/ExtensiveResearch.md:29-30` — Pre-Step RECALL
- `v4.2.0/.claude/skills/Research/Workflows/ExtensiveResearch.md:166-201` — SAVE block with per-theme facts + dedup
- `v4.2.0/.claude/skills/Research/Workflows/DeepInvestigation.md:56-61` — Step 0a global RECALL + state detection
- `v4.2.0/.claude/skills/Research/Workflows/DeepInvestigation.md:271-277` — Step 4a per-entity recall
- `v4.2.0/.claude/skills/Research/Workflows/DeepInvestigation.md:199-207` — landscape SAVE
- `v4.2.0/.claude/skills/Research/Workflows/DeepInvestigation.md:320-328` — entities SAVE
- `v4.2.0/.claude/skills/Research/Workflows/DeepInvestigation.md:371-377` — summary SAVE
- `v4.2.0/.claude/skills/Research/Workflows/QuickResearch.md:19-20` — minimal RECALL (no SAVE)
- `v4.2.0/.claude/commands/zettel.md:1-107` — `/zettel` slash command spec + verb inference tables
- `v4.2.0/.claude/AAI-Install/headless-install.ts` — installer pipeline (git clone, no Packs→skills sync)
- `Plans/2026-04-05-tdd-zettelkasten-hook-wiring.md:1-1025` — the complementary hook-layer TDD plan

## 🏗️ Architecture Documentation

**Three zettel touchpoint layers, one beads graph:**

```
┌──────────────────────────────────────────────────────────────┐
│                   cosmic-agent-memory engine                 │
│                    (ionos01 :8787, HTTP API)                 │
└────────────────────▲─────────────▲─────────────▲─────────────┘
                     │             │             │
          via ~/.local/bin/zettel shell CLI
                     │             │             │
       ┌─────────────┴──┐  ┌───────┴────┐  ┌─────┴────────────┐
       │  Algorithm     │  │  Skills &  │  │  Hooks layer     │
       │  (v3.7.0.md)   │  │  Workflows │  │  (TypeScript)    │
       │                │  │  (prose)   │  │                  │
       │ OBSERVE recall │  │ per-skill  │  │ SessionStart     │
       │ LEARN save     │  │ recall+save│  │ PostToolUse PRD  │
       │ THINK risks    │  │ per-mode   │  │ SessionEnd       │
       │ EXECUTE facts  │  │ dedup-link │  │ PreCompact       │
       │ VERIFY signals │  │ Memory.md  │  │ event-bus        │
       └────────────────┘  └────────────┘  └──────────────────┘
           primary agent      skills agents      auto-fire hooks
           (mandatory §1,§2)  (Research is        (TDD plan:
                               currently only     8 behaviors,
                               implementer)       not yet shipped)
```

**Uniformity pattern:**
- All three layers use the **same CLI** (`zettel ...`) — no import, no shim.
- All three layers **fail open** (pre-flight `zettel status` → skip on unavailable).
- All three layers use the **same source-tag convention**: `{layer}-{slug}-{phase}` (e.g. `algorithm-{slug}-learn`, `research-{topic}-landscape`, `hook-session-end`).
- All three layers **respect the same card lifecycle states** (`open` default, `in_progress` only for explicit focus, `blocked` only with stubs, `closed` only on explicit instruction).

**Mass-edit anatomy** (what a single skill's wiring looks like):

```
skills/{Category}/
├── SKILL.md                          EDIT: add "## MANDATORY: Memory Integration" section
├── Workflows/
│   ├── Memory.md                     CREATE: skill-local spec (copy of Research/Memory.md, retargeted)
│   ├── {Mode1}.md                    EDIT: prepend RECALL block, append SAVE block
│   ├── {Mode2}.md                    EDIT: prepend RECALL block, append SAVE block
│   └── ...
└── {SubSkill}/
    ├── SKILL.md                      EDIT: same MANDATORY section (if sub-skill opts in)
    └── Workflows/                    EDIT: same pattern
```

Per-skill cost: 1 SKILL.md edit + 1 Memory.md creation + N Workflow edits (N ≈ 3-5 typically, 1-2 for smaller skills). For 46 remaining skills ≈ 46 + 46 + ~150 = **~240 file touches on the `v4.2.0/.claude/skills/` tree**, plus the same on `Packs/*/src/` if kept in sync.

## 📚 Historical Context (from thoughts/)

- `thoughts/searchable/shared/plans/2026-04-06-ENG-XXXX-tdd-zettelkasten-hook-wiring.md` — 349-line companion to the main 1025-line hook-wiring plan in `Plans/`. Covers the same 8 TDD behaviors at a higher level.
- `Plans/2026-04-05-tdd-zettelkasten-hook-wiring.md` — canonical TDD hook-wiring plan (1025 lines, 8 behaviors, bun test, Red-Green-Refactor). **Scope is hooks layer, not skills tree.**
- `v4.2.0/ZETTELKASTEN-HOOK-WIRING.md` — 90-line architectural summary of the hook-wiring plan.
- `MEMORY/MEMORY.md` (user's auto-memory) references an "AAI-to-Pi Port" project with TDD plan across 10 phases — separate workstream.

## 🔗 Related Research

No prior research documents exist under `thoughts/searchable/shared/research/` (directory created by this research).

## ❓ Open Questions

1. **Does the user want a new `memory_profile:` frontmatter field in SKILL.md** to codify the recall-and-save / recall-only / skip decision per skill, or is a standalone mapping table (script-driven) preferred?
2. **Sync policy between `v4.2.0/.claude/skills/` and `Packs/*/src/`** — should the mass-edit write to both trees simultaneously, or write to `v4.2.0` first, stabilize, then back-port to `Packs/`?
3. **Per-sub-skill granularity for `Utilities/`** — Utilities is heterogeneous (CLI, Docs, Fabric, Cloudflare, Browser, Evals, Delegation…). Each sub-skill likely needs its own memory-profile decision. Is that done now or deferred?
4. **Fabric Patterns** (309 files) — these are Fabric AI prompts, not workflows. They almost certainly should NOT get zettel wiring, but we should confirm they are excluded from the mass-edit scope.
5. **Interaction with the hook-wiring TDD plan** — should the skills-tree mass-edit wait for the hook plan to ship, or proceed in parallel? The two layers are independent but touch the same beads graph.
6. **Source-tag discipline across skills** — is `{skill-slug}-{topic-slug}-{phase}` the canonical format to enforce, or should each skill define its own tag schema in its `Memory.md`?
7. **Card scope per skill** — Research uses default scope (`primary`, via `$ZETTEL_SCOPE`). Should skills like LifeOS use a different scope (`LifeOS`) to partition the graph, or keep everything in one scope and rely on source-tag filtering?

---

✅ **Research complete.** The pattern is well-defined at both the Algorithm (spec) and Research skill (reference implementation) layers. The next step is a mass-edit plan that replicates the Research pattern across the remaining 46 skills in both trees, with a per-skill memory-profile decision and a strategy for keeping `Packs/` and `v4.2.0/.claude/skills/` in sync.

# cosmic-agent-core — How to Read This Distribution

## What This Is

`cosmic-agent-core` is the **deployable AAI (Agent Assistant Infrastructure) distribution** for the Cosmic Agent Stack. It ships the `.claude/` payload that gets installed into a project (or a user's home) so that any Claude Code session — interactive, headless, or driven by `cc-agent-ui` — knows how to behave: which mode to enter, which capabilities to scan, which skills to invoke, and where to record memory.

It is not "a list of prompts" and it is not "an MCP server." It is **the operating system for an AAI session**: a system prompt (`CLAUDE.md`), an algorithm definition (`v4.2.0/.claude/AAI/Algorithm/v3.7.0.md`), a hook/permission/env configuration (`v4.2.0/.claude/AAI/THEHOOKSYSTEM.md`), and a tree of installable **Skills** organized into **Packs**, each of which can declare **Workflows**, **Tools**, **Templates**, and **Patterns**.

It pairs with two sibling apps in this monorepo:

- **`cc-agent-ui/`** — runtime orchestration (Node + React) that consumes the `@anthropic-ai/claude-agent-sdk` and renders subagent / tool / chat output.

---

## The Problem This Solves

Out of the box, an LLM session has three failure modes:

1. **Capability blindness** — the model doesn't know which skills, agents, or MCP tools are available, so it improvises text instead of invoking real tools.
2. **Format drift** — without a mandatory output structure, the same task gets answered ten different ways and verification becomes impossible.
3. **Memory amnesia** — sessions don't recall prior decisions, learnings, or in-progress work; every conversation starts from zero.

`cosmic-agent-core` solves all three by shipping:

1. A **Capability Registry** (25 capabilities, Sections A–F) the session is required to audit before doing work — see `v4.2.0/.claude/AAI/Algorithm/v3.7.0.md`.
2. A **Mandatory Output Format** with three execution modes (COMMAND / NATIVE / ALGORITHM) plus MINIMAL — see `v4.2.0/.claude/AAI/Algorithm/v3.7.0.md`.
3. A **Memory Protocol** wired to the `zettel` CLI on `http://localhost:8787`, embedded into NATIVE mode and the full Algorithm — see `v4.2.0/.claude/AAI/Algorithm/v3.7.0.md` lines 56–118.

Combine those three with a typed UI surface (BAML in `silmari-genui`) and the result is an agent system whose output you can verify, route, and render — instead of one whose output you have to babysit.

---

## The Architecture

Three concentric layers, deployed together as one `.claude/` tree:

```
v4.2.0/.claude/AAI/Algorithm/v3.7.0.md     Layer 1: THE SYSTEM PROMPT
                             Always loaded at session start. Defines modes
                             (COMMAND / NATIVE / ALGORITHM / MINIMAL),
                             mandatory output format, context routing
                             targets. The session's GPS.

v4.2.0/.claude/AAI/SKILL.md  Layer 2: THE ALGORITHM
                             Defines the AAI Algorithm v3.7.0 (7 phases:
                             Observe → Think → Plan → Build → Execute →
                             Verify → Learn) and the 25-capability registry.
                             Loaded on demand for non-trivial work.

v4.2.0/.claude/skills/<...>  Layer 3: THE SKILLS
                             Pack → Skill → Workflow → Tools / Templates /
                             Patterns. Each Skill's SKILL.md is its own
                             entry point: triggers, voice notification,
                             workflow routing table.
```

**Why three layers and not one mega-prompt?** Token economy. A skill-invocation that needs `LifeOS/Workflows/WriteReport.md` should not also be loading the AAI Algorithm phase definitions or the Fabric pattern library. Each layer narrows the funnel.

---

## How to Read This Distribution

### Step 1 — Understand the version + install boundary

Read `INSTALL.md`. It delegates to `server-deploy/README.md` as the **single source of truth** for the unified Cosmic Agent Stack install (AAI v4.2.0 + cosmic-agent-memory engine + `cc-agent-ui` on port 3001). The legacy Deno `agent-ui` on port 8080 is superseded.

### Step 2 — Walk the deployed payload

Open `v4.2.0/.claude/`. Notice the three sibling artifacts that ship together:

- `CLAUDE.md` (8.5 KB) — the system prompt.
- `CLAUDE.md.template` (4.1 KB) — the tokenized version used by the installer.
- `settings.json` (40 KB) — hooks, permissions, env vars.

These three are installed into a target project's `.claude/` (or into `~/.claude/`) as a unit. Versioning lives at the `v4.2.0/` directory boundary; previous releases sit alongside (e.g. `v4.1.0/`).

### Step 3 — Read the algorithm

`v4.2.0/.claude/AAI/SKILL.md` is the canonical AAI definition. Skim:

- §**Response Depth Selection** — FULL / ITERATION / MINIMAL.
- §**Capability Registry** — 25 capabilities across six sections (Foundation, Thinking, Agents, Collaboration, Execution, Verification).
- §**The Seven Mandatory Phases** — Observe / Think / Plan / Build / Execute / Verify / Learn, each with its own voice notification and gate.

### Step 4 — Walk one Skill

Pick `v4.2.0/.claude/skills/LifeOS/`. Read `SKILL.md` first. Notice:

- Frontmatter `name` and `description` (the `description` is the trigger string the model matches against).
- A **Workflow Routing table** that maps trigger phrases to `Workflows/<Name>.md` files.
- A mandatory voice-notification block executed before any work.

Then look at `LifeOS/Workflows/WriteReport.md` to see how a workflow consumes typed JSON artifacts (`findings.json | narrative.json | recommendations.json | roadmap.json | methodology.json`) and renders them through `LifeOS/ReportTemplate/`.

### Step 5 — See where typed UI plugs in

`silmari-genui` (sibling app) is the BAML-typed render surface for skill/workflow output. Its v0 demo wraps the `/Marketing` skill's `copy-platform` workflow through the 7 AAI phases, with EXECUTE iterating 18 sections from `SAI/skills/Marketing/CopyPlatformSections/`. That demo is the prototype for the pattern: **Skill → Workflow → BAML schema → React layout.**

### Step 6 — See where runtime orchestration plugs in

`cc-agent-ui` (sibling app) consumes `@anthropic-ai/claude-agent-sdk@0.2.59`. Its server (`cc-agent-ui/server/claude-sdk.js`) manages sessions and tool approvals; its client (`cc-agent-ui/src/components/chat/tools/components/SubagentContainer.tsx:51`) renders subagent execution trees. Subagent sessions are detected by `parentUuid` in `cc-agent-ui/server/projects.js`.

---

## Key Concepts

### Pack → Skill → Workflow → (Tools / Templates / Patterns / Database)

This is the canonical filesystem shape. Every level below is concrete and exists in `v4.2.0/.claude/skills/` today:

| Level | Path shape | What it contains |
|-------|------------|------------------|
| **Pack** | `skills/<Pack>/` | Top-level grouping. Currently installed: `LifeOS/`, `Media/`, `Utilities/`. |
| **Skill** | `skills/<Pack>/<Skill>/SKILL.md` | YAML frontmatter (`name`, `description`-as-triggers), voice protocol, workflow routing table, examples, context-detection rules. |
| **Workflow** | `skills/<Pack>/<Skill>/Workflows/<Name>.md` | A **single-purpose** orchestration of one or more skill steps. Examples: `LifeOS/Workflows/WriteReport.md`, `Utilities/Documents/Workflows/ConsultingReport.md`. |
| **Tools** | `skills/<Pack>/<Skill>/Tools/*.ts` | TypeScript helpers the workflow calls. Example: `LifeOS/Tools/UpdateTelos.ts`. |
| **Templates** | `skills/<Pack>/<Skill>/{DashboardTemplate,ReportTemplate}/{Components,App,Lib}/` | Scaffolded artifacts the workflow renders into. Example: `LifeOS/ReportTemplate/`. |
| **Patterns** | `skills/<Pack>/<Skill>/Patterns/<pattern>/` | Long-tail prompt library. Example: `Utilities/Fabric/Patterns/t_*` (32 patterns observed: `t_red_team_thinking`, `t_check_dunning_kruger`, `t_year_in_review`, …). |
| **Database** | `skills/<Pack>/<Skill>/Database/` | Skill-specific data. Example: `Utilities/Aphorisms/Database/`. |

A **workflow is one or more skills with a single purpose.** That definition is enforced structurally — a `Workflow` lives inside exactly one `Skill`, has exactly one purpose statement, and consumes/produces typed artifacts.

### Modes — COMMAND / NATIVE / ALGORITHM / MINIMAL

`v4.2.0/.claude/AAI/Algorithm/v3.7.0.md` enforces one classification per response:

| Mode | When | Characteristic |
|------|------|----------------|
| **COMMAND** | Slash commands (`cw9_*`, `create_tdd_plan`, `*_handoff`, etc.) | Structured header + content + change/verify lines. |
| **NATIVE** | Single-step tasks under ~2 minutes | Same shape + condensed `zettel` memory protocol (`🧠 PRIOR MEMORY` / `💾 SAVED`). |
| **ALGORITHM** | Multi-step / complex / debugging / building | Loads `AAI/Algorithm/v3.7.0.md` and runs all 7 phases. |
| **MINIMAL** | Greetings, ratings, acknowledgments | Header + summary + voice. |

The mode header is the **first** output token. Freeform output is forbidden.

### The 25-Capability Registry

`AAI/SKILL.md:79-103` enumerates the registry across six sections:

- **A — Foundation**: Task tools, AskUserQuestion, Claude Code SDK, Skills (the registry is itself capability #4).
- **B — Thinking & Analysis**: IterativeDepth, FirstPrinciples, BeCreative, PlanMode, WorldThreatModelHarness.
- **C — Agents**: Algorithm Agents, Engineer Agents, Architect Agents, Research, Custom Agents.
- **D — Collaboration**: Council, RedTeam, Agent Teams (Swarm).
- **E — Execution**: Parallelization, Creative Branching, Git Branching, Evals, Browser.
- **F — Verification**: Test Runner, Static Analysis, CLI Probes.

Every non-trivial task **walks the full registry** in OBSERVE and assigns USE / DECLINE / N/A with reasons. Listing without invoking is a "red line violation" — every USE must produce a real `Skill` or `Task` tool call.

### Memory Protocol (NATIVE mode)

NATIVE mode embeds a condensed zettel cycle:

1. Pre-flight: `zettel status` against `localhost:8787`; on failure set `NATIVE_SKIP_MEMORY=1` and continue.
2. RECALL when the task names a known concept / project / file / error or is an iteration; `zettel recall "..." -l 3 -d flat`.
3. SAVE when the user says "remember", a non-obvious decision was made, a surprising finding emerged, or a preference was expressed. Tag types: `fact | signal | preference | learning`.
4. Dedup before save via `zettel recall` lookup; `zettel link` instead of duplicating.
5. Card lifecycle states: `open` (default) | `in_progress` (explicit) | `blocked` (escalate to ALGORITHM) | `closed` (only on explicit user instruction).

ALGORITHM mode inherits the same protocol in fuller form — see `AAI/Algorithm/v3.7.0.md` (referenced by `CLAUDE.md:123`, not inspected in this README pass).

---

## Key Findings (from the 2026-05-09 reframe research)

1. **`v4.2.0/.claude/` is the canonical AAI 4.2.0 payload.** It ships `CLAUDE.md` (system prompt), `AAI/SKILL.md` (algorithm + 25-capability registry), `skills/` (installed packs: LifeOS, Media, Utilities), and `settings.json` (40 KB hooks/permissions/env). This is the unit of release; everything else in `apps/cosmic-agent-core/` is either planning (`Plans/`), helper scripts (`scripts/`), or in-tree thoughts.
2. **Pack → Skill → Workflow → Tools/Templates/Patterns is the canonical filesystem shape.** Skills declare triggers and a Workflow Routing table in `SKILL.md` frontmatter; workflows are `Workflows/<Name>.md` files producing typed JSON artifacts. Concrete precedent: `LifeOS/Workflows/WriteReport.md` already pipelines `findings.json | narrative.json | recommendations.json | roadmap.json | methodology.json` → `lib/report-data.ts` in a generated report template.
3. **`silmari-genui`'s existing parts already match the user-stated "skill+workflow management surface" role piece-by-piece** — BAML schemas for the typed contract; `useGenerativeUI` for skill invocation + queue; pre-authored layouts via `selectLayout(schemaId)` for the render; `intent-store` + `flags.amendment` for user-edits-back-into-prompt; `Fallback`/`StreamFallback` for the LLM-output-doesn't-match-UI case; `TelemetryBoundary` for skill-render audit. What it does **not** do today is generalize beyond the single hard-wired Marketing/copy-platform demo.
4. **Orchestration is split across two halves.** Prompt-side lives in `cosmic-agent-core/v4.2.0/.claude/AAI/Algorithm/v3.7.0.md` + `AAI/SKILL.md`. Runtime-side lives in `cc-agent-ui/server/claude-sdk.js` (Agent SDK 0.2.59). Subagent rendering already exists at `cc-agent-ui/src/components/chat/tools/components/SubagentContainer.tsx:51`. There is no current code path connecting `silmari-genui`'s React tree to the SDK's session stream.

Full research: [`thoughts/searchable/shared/research/2026-05-09-09-33-silmari-genui-orchestration-skill-split.md`](../../thoughts/searchable/shared/research/2026-05-09-09-33-silmari-genui-orchestration-skill-split.md).

---

## Directory Structure

```
apps/cosmic-agent-core/
├── README.md                         ← You are here
├── INSTALL.md                        ← Delegates to server-deploy/README.md
│
├── Plans/                            ← Distribution-level plans
│   └── 2026-04-08-tdd-zettel-skill-hooks-extension.md
│
├── scripts/                          ← Operator scripts
│   ├── bulk-transcribe-youtube-videos
│   ├── kc-baker-pipeline
│   └── kc-baker-pipeline-v2
│
├── thoughts/                         ← In-tree research / decisions
│
└── v4.2.0/                           ← Current release
    └── .claude/                      ← INSTALLED payload (deploys as a unit)
        │
        ├── CLAUDE.md                 ← Layer 1: System prompt (8.5 KB)
        ├── CLAUDE.md.template        ← Tokenized variant for installer (4.1 KB)
        ├── settings.json             ← Hooks / permissions / env (40 KB)
        │
        ├── AAI/                      ← Layer 2: Algorithm + routing
        │   ├── README.md
        │   ├── SKILL.md              ← AAI definition + 25-capability registry
        │   ├── CONTEXT_ROUTING.md    ← Where to load specialized context
        │   ├── PAISYSTEMARCHITECTURE.md
        │   └── USER/                 ← USER-scoped customizations
        │
        ├── AAI-Install/              ← Install-time bootstrap
        │   └── engine/
        │
        └── skills/                   ← Layer 3: Installed Packs
            │
            ├── LifeOS/
            │   ├── SKILL.md          ← Trigger + workflow routing table
            │   ├── Tools/            ← TypeScript helpers
            │   │   └── UpdateTelos.ts
            │   ├── Workflows/        ← Single-purpose pipelines
            │   │   ├── CreateNarrativePoints.md
            │   │   ├── InterviewExtraction.md
            │   │   ├── Update.md
            │   │   └── WriteReport.md
            │   ├── DashboardTemplate/
            │   │   ├── App/          (api/, add-file/)
            │   │   ├── Components/
            │   │   └── Lib/
            │   └── ReportTemplate/
            │       ├── App/
            │       ├── Components/
            │       └── Lib/
            │
            ├── Media/
            │   └── Art/
            │       └── Workflows/
            │
            └── Utilities/
                ├── Aphorisms/
                │   ├── SKILL.md
                │   ├── Database/
                │   └── Workflows/
                ├── Documents/
                │   └── Workflows/
                │       └── ConsultingReport.md
                ├── Fabric/
                │   └── Patterns/      ← 32+ t_*-prefixed pattern dirs
                │       ├── t_red_team_thinking/
                │       ├── t_check_dunning_kruger/
                │       ├── t_year_in_review/
                │       └── … (29 more)
                └── PAIUpgrade/
                    ├── SKILL.md
                    └── Workflows/
```

### Sibling apps in this monorepo

```
apps/
├── cosmic-agent-core/                ← THIS distribution (system prompt, skills, hooks)
├── cc-agent-ui/                      ← Runtime: Agent SDK + React UI on :3001
│   └── server/claude-sdk.js          ← @anthropic-ai/claude-agent-sdk@0.2.59
├── silmari-genui/                    ← Typed render: Next.js + BAML on :3030
│   ├── baml_src/                     ← BAML schemas (clients, blocks, workflows)
│   └── src/                          ← React layouts, intent-store, registry, telemetry
└── … (cosmic-video, silmari, etc.)

engine/                               ← Zettelkasten memory engine
mcp/                                  ← MCP server (zettel_* tools, zettel:// resources)
```

---

## Who This Is For

- **Operators** running the Cosmic Agent Stack who need to know what gets installed where, and how to add or update a Skill.
- **Skill / Workflow authors** writing new `SKILL.md` + `Workflows/*.md` files and wanting to follow the canonical Pack → Skill → Workflow → Tools/Templates/Patterns shape.
- **UI / front-end engineers** wiring `silmari-genui` (or any other surface) to render typed skill/workflow output and looking for the contract boundaries (BAML schemas, intent-store, registry, telemetry).
- **Runtime engineers** integrating `cc-agent-ui` (or another Agent SDK consumer) and needing to know what session-prompt + memory-protocol assumptions come from this distribution.
- **Researchers** mapping how orchestration (system prompt + SDK) relates to skills (filesystem capability tree) before proposing changes.

The architecture composes: ship `cosmic-agent-core` as the OS, run `cc-agent-ui` as the orchestrator, render through `silmari-genui` as the typed UI. Each piece has a single responsibility and a documented seam.

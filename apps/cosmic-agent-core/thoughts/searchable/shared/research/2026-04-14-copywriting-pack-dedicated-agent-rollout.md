---
date: 2026-04-14T10:13:23-04:00
researcher: maceo
git_commit: 79ba97c8d7ae62feceb025f0348bd30a4f26152a
branch: main
repository: cosmic-agent-core
topic: "Copywriting Pack dedicated-agent rollout — current state of Packs, primary installer, Marketing skill, cross-skill patterns, and deployed state on vultr01"
tags: [research, codebase, copywriting, marketing, installer, packs, aai-install, vultr01]
status: complete
last_updated: 2026-04-14
last_updated_by: maceo
last_updated_note: "Added user-provided answers to all 5 open questions + follow-up hook/handoff research"
---

# Research: Copywriting Pack Dedicated-Agent Rollout — Current-State Documentation

**Date:** 2026-04-14T10:13:23-04:00
**Researcher:** maceo
**Git Commit:** 79ba97c8d7ae62feceb025f0348bd30a4f26152a
**Branch:** main
**Repository:** cosmic-agent-core

---

## Research Question

Document the current state of the cosmic-agent-core codebase as it relates to the Copywriting Pack dedicated-agent rollout plan: what exists in `Packs/Copywriting/`, how the primary installer at `v4.2.0/.claude/` deploys skills, how the Marketing skill (the Q&A-driven producer of the checklist) is currently structured, what cross-skill patterns already exist, and what is actually deployed on the reference VM `ssh vultr01`.

Per the `research_codebase` skill rule: this document describes **what is**, not what should be. Implementation decisions belong in a separate plan document.

---

## 📚 Summary

| Area | What exists today |
|---|---|
| **Packs/Copywriting/** | Complete pack (INSTALL.md, VERIFY.md, README.md, `src/SKILL.md`, 3 Workflows, 6 Templates). Templates reference "the checklist" abstractly but no on-disk location is defined. No `install.sh`, no `examples/`, no `CHECKLIST_CONVENTION.md`. |
| **v4.2.0/.claude/skills/Copywriting/** | ⚠️ Does NOT exist. Only Marketing and 11 other skills are bundled with the primary installer. |
| **Primary installer** | Pure `git clone`/`git pull` model. No rsync. Skills auto-discovered by presence of `SKILL.md`. Target: `~/.claude/skills/`. No skill-level install hooks. |
| **Marketing skill (v4.2.0)** | 18-file `CopyPlatformSections/` framework (templates, not filled), state machine persists to `~/.claude/MEMORY/STATE/marketing-checklist.json`, per-section persistence via `zettel save`. No on-disk "filled 18 sections" artifact. |
| **Cross-skill patterns** | No existing project-root resolution (no `.git`/CLAUDE.md ancestor walk anywhere). Cross-file loads via explicit `**Read:** ../Templates/X.md` narrative instructions. Uniform `~/.claude/AAI/USER/SKILLCUSTOMIZATIONS/{SkillName}/PREFERENCES.md` customization pattern across 7 skills. |
| **vultr01 deployed state** | cc-agent-ui runs as `root` from `/root/Dev/cosmic-agent-memory/cc-agent-ui`. `/root/.claude/skills/copywriting/` (lowercase) mirrors the local `Packs/Copywriting/src/`. `/root/.claude/skills/Marketing/` has the full 18-file CopyPlatformSections. No `copyplatforms/` directory exists anywhere under `/root/`. No filled checklist file found. |

---

## 🎯 Detailed Findings

### 1. Packs/Copywriting/ — Current Pack Structure

**Location:** `/home/maceo/Dev/cosmic-agent-core/Packs/Copywriting/`

#### Top-level files

| File | Lines | Role |
|---|---|---|
| `INSTALL.md` | 232 | Wizard-style AI-agent install guide. Uses AskUserQuestion, TodoWrite, Bash, Read/Write. Contains Phase-1 system analysis, user-choice phase, backup-if-needed, install, success messaging. |
| `VERIFY.md` | 93 | Post-install verifier. Bash checks for presence of 11 required files (SKILL.md, 3 workflows, 5 templates). Expected: 11 pass / 0 fail. |
| `README.md` | 72 | Metadata + narrative overview. YAML frontmatter: `pack-id: cosmicmarketing-copywriting-v1.0.0`, `version 1.0.0`, `author: cosmicmarketing`. Describes 4-phase platform builder, prospect-as-hero, 80/20 pain-solution ratio, fractal copy. |

#### `src/SKILL.md` (79 lines)

- YAML frontmatter: `name: Copywriting`, long trigger-word description
- Mandatory voice notification block (`curl localhost:8888/notify`) at skill invocation
- Customization check: `~/.claude/AAI/USER/SKILLCUSTOMIZATIONS/Copywriting/PREFERENCES.md`
- 4-way workflow routing table: copy platform / sales story / content writer / non-sales story
- Key principles: prospect-as-hero, 80/20 pain-solution, fractal AIDA, no-vagueness, checklist-first

#### `src/Workflows/` — 3 files

**`CopyPlatform.md` (185 lines)** — 4 phases:
1. **Understanding** (min 3 exchanges) — 8 initial sections via Q&A, XML marker output (`<SECTION_CONTENT01>…<SECTION_CONTENT08>`, `<QUESTIONS>`, `<NEXT_STEP>`)
2. **Building** (min 4 exchanges) — dependency resolution (circular Appeal↔Hook; linear USP→Promise→Hook→Headlines)
3. **Expanding** (min 5 exchanges) — all 18 sections expanded, references `../Templates/CopyPlatformSections.md`
4. **Implementing** (min 2 exchanges) — hands off to `ContentWriter.md`

Templates loaded: `../Templates/CopyPlatformSections.md`, `../Templates/AIDAFramework.md`, `../Templates/TenAgreements.md` (CopyPlatform.md:5).
**No on-disk checklist path defined.** No project-root resolution logic.

**`SalesStory.md` (172 lines)** — 4 phases:
1. 7-question heuristic (sequential, gating)
2. Story construction (3-part test, 5T framework, Motivation, Cut-to-the-chase)
3. Structure selection (references `../Templates/StoryStructures.md` — 9 structures)
4. Emotional dashboard (21-emotion framework from `../Templates/EmotionalTriggers.md`)

No checklist persistence or project-root logic.

**`ContentWriter.md` (153 lines)** — 4 content-type routes (LinkedIn, Sales Message, Email Sequence, Blog Article). Prereq: completed copy platform (but does NOT specify where to read it from — assumes user context). Templates: `../Templates/AIDAFramework.md`, `../Templates/EmotionalTriggers.md` (ContentWriter.md:5-7).

#### `src/Templates/` — 6 files

| File | Lines | What it describes | References "the checklist"? |
|---|---|---|---|
| `CoreFrameworks.md` | 77 | Fractal AIDA, Emotional-Logical Balance per stage, Ad-specific guidelines | No — foundational frameworks |
| `AIDAFramework.md` | 119 | AIDA at sentence/paragraph/section/full-piece, awareness-level adaptation (Schwartz) | No |
| `StoryStructures.md` | 182 | 9 proven structures (Rags-to-Riches … Dragon and the City), 5T, Cut-to-Chase | No |
| `CopyPlatformSections.md` | 438 (longest) | All 18 section specs with expansion guidance, constraints | **Yes — every section uses phrases like "use the actual checklist content", "ground in the checklist", "from the checklist". No file path specified.** |
| `EmotionalTriggers.md` | 116 | 7 primary triggers, 5 secondary, 21-emotion dashboard, emotional arc | No |
| `TenAgreements.md` | 81 | 10 beliefs prospect must hold; agreement-mapping table by content type | No (but applies across all sections) |

**Code reference:** `Packs/Copywriting/src/Templates/CopyPlatformSections.md:6-16` — explicit "read CoreFrameworks.md first" plus the "actual checklist content" language.

---

### 2. Primary Installer — v4.2.0/.claude/

**Bootstrap:** `/home/maceo/Dev/cosmic-agent-core/v4.2.0/.claude/install.sh` (bash, ensures Bun, hands off to TS installer).

**Engine:** `/home/maceo/Dev/cosmic-agent-core/v4.2.0/.claude/AAI-Install/` (TypeScript).

#### Skill discovery — directory scan, `SKILL.md` marker

- `AAI-Install/engine/actions.ts:672-673`:
  ```ts
  const skillCount = countDirs(join(paiDir, "skills"), (name) =>
    existsSync(join(paiDir, "skills", name, "SKILL.md")));
  ```
- No manifest, registry, or hardcoded list. Any subdirectory of `skills/` containing a `SKILL.md` is a valid skill.

#### Deployment — git, not rsync

- Fresh install: `git clone` at `actions.ts:528-531`
- Upgrade: `git pull origin main` at `actions.ts:511`
- Fallback bootstrap: `git init && git remote add origin && git fetch && git checkout -b main origin/main` at `actions.ts:539`
- **No rsync anywhere in the install pipeline.**

#### Symlink usage (narrow)

- Legacy user-context migration: `actions.ts:234` (old `skills/AAI/USER/` → canonical `AAI/USER/`)
- `.env` linking: `actions.ts:731-745`
- **Not used for skill deployment.** Skills are cloned as regular files.

#### Target paths

- Skills: `~/.claude/skills/` (from `actions.ts:503` resolving `paiDir || join(homedir(), ".claude")`)
- Config: `~/.config/AAI/` (`actions.ts:589`)

#### Install hooks

- **None at the skill level.** No pre/post-install per skill.
- Repo-level hooks counted at `actions.ts:674` (`countFiles(join(paiDir, "hooks"), ".ts")`), but these are global, not skill-specific.

#### Automatic pickup

- **Yes, fully automatic** for any new skill directory with a `SKILL.md` file. No registration needed.

---

### 3. Marketing Skill — v4.2.0/.claude/skills/Marketing/

**Path:** `/home/maceo/Dev/cosmic-agent-core/v4.2.0/.claude/skills/Marketing/`

#### Purpose and trigger words

- `SKILL.md:8-14` — owns "marketing" in all forms: "create/build/make marketing", "marketing for [X]", "copy platform", "persuasion checklist", "customer research", "ICP", "brand discovery", "campaign promise", "one belief statement", "objection framework"
- `SKILL.md:60-64` — **Q&A-vs-content rule (CRITICAL):** "The LLM NEVER generates foundational information… ALL foundational content MUST come from the user." This is exactly the constraint enforced by the active `MARKETING COPY PLATFORM` UserPromptSubmit hook visible in session reminders.
- `SKILL.md:26` — explicit handoff to the Copywriting skill for final writing: "Hand off by telling the user: 'Your copy platform is complete. To write actual copy pieces, invoke the copywriting skill…'"

#### State persistence — in-memory + state file, NOT on-disk 18 files

- **State file:** `~/.claude/MEMORY/STATE/marketing-checklist.json` (`StateDefinition.md:237`)
- **Structure** (`StateDefinition.md:238-273`):
  ```json
  {
    "active": true,
    "phase": "understanding|improvement|expand|implement",
    "currentSection": 0, "totalSections": 18,
    "expandedSections": [], "exchangeCount": 0,
    "startedAt": "…", "lastUpdated": "…", "topicSlug": "…",
    "questions": { "understanding": {…U1-U8…}, "improvement": {…I1-I10…} },
    "completionEvidence": {…6 booleans…},
    "transitionProposed": false, "transitionProposedAt": null
  }
  ```
- **Per-section saves via Zettelkasten:** `zettel save "..." -S "marketing-{topic-slug}-expand-{section-id}"` (`CopyPlatform.md:213-217, 268-273, 351-356`).
- **No filled 18-section artifact is written to disk** at any known path. Sections are generated in-memory, emitted via markers (`<SECTION_N_EXPANSION_COMPLETE>`), then persisted only to zettel memory + state file.

#### 18-file CopyPlatformSections structure

**All 18 filenames confirmed** at `v4.2.0/.claude/skills/Marketing/CopyPlatformSections/`:

```
01-usp.md                      10-headlines.md
02-claims-proof.md             11-big-four.md
03-target-audience.md          12-pain-list.md
04-mechanism.md                13-vision-list.md
05-why-cubed.md                14-usp-iteration-1.md
06-appeal.md                   15-usp-iteration-2.md
07-features-benefits.md        16-usp-iteration-3.md
08-promise.md                  17-usp-iteration-4.md
09-hook.md                     18-usp-iteration-5.md
```

Each file is a **framework template** (methodology, key components, instructions for applying framework to user content), NOT a filled example. Example: `10-headlines.md:34-40` lists "Key Components of a Strong Headline" as guidance; `11-big-four.md:36-39` lists "What can you bring out in your offer" as prompts.

Section dependencies are listed inside each file (e.g. `07-features-benefits.md:5` depends on USP, Target Audience, Appeal).

#### Prompts and personas

- `Prompts/SystemPrompts.md:7-42` — Understanding persona (expert strategist, 3-review-questions method)
- `Prompts/SystemPrompts.md:60-80` — Improvement persona
- `Prompts/SystemPrompts.md:84-110` — Expand persona (expert + copywriting expert, applies 18 frameworks sequentially)
- `Prompts/SystemPrompts.md:114-116` — Implement persona (AI copywriter, sales psychologist)
- `Prompts/SystemPrompts.md:120-166` — AIDA methodology applied at all phases; 10 Agreements reference at lines 136-149

#### Completion detection

State-machine-driven. Per `StateDefinition.md:279-340`:

- `ChecklistEnforcer` Stop hook detects evidence
- `ChecklistStateInjector` UserPromptSubmit hook proposes transition
- LLM confirms via marker: `<UNDERSTANDING_COMPLETE>`, `<IMPROVEMENT_COMPLETE>`, `<EXPANSION_COMPLETE>`, `<SECTION_N_EXPANSION_COMPLETE>`
- Stop hook detects marker, updates state file, advances phase

---

### 4. Cross-Skill Patterns

#### 4.1 Project-root resolution — NO existing pattern

**Finding:** No skill in the repository currently implements ancestor-walking (`.git` / `CLAUDE.md` search) or reads `$PWD` to resolve a "project root."

All skills use absolute paths with `~` expansion:

- `Packs/Research/src/SKILL.md:151` — `~/.claude/MEMORY/RESEARCH/{YYYY-MM}/{YYYY-MM-DD}_{topic-slug}/`
- `v4.2.0/.claude/skills/Marketing/Workflows/CopyPlatform.md:44-80` — `~/.claude/MEMORY/STATE/marketing-checklist.json`
- `v4.2.0/.claude/skills/Research/Workflows/DeepInvestigation.md:38-88` — `~/.claude/MEMORY/RESEARCH/{…}` and `~/.claude/MEMORY/STATE/current-work.json`

#### 4.2 Cross-file dependencies — explicit narrative `**Read:**` instructions

Representative patterns:

| File | Pattern |
|---|---|
| `Packs/Copywriting/src/Workflows/CopyPlatform.md:5` | `**Read before executing:** ../Templates/CopyPlatformSections.md, ../Templates/AIDAFramework.md, ../Templates/TenAgreements.md` |
| `v4.2.0/.claude/skills/Marketing/Workflows/CopyPlatform.md:85-88` | `**Read:** Prompts/SystemPrompts.md § Understanding Phase` + sibling reads |
| `Packs/Copywriting/src/Workflows/ContentWriter.md:5-7` | `**Prerequisites:** A completed copy platform checklist from CopyPlatform.md.` + `**Read before executing:** ../Templates/AIDAFramework.md, ../Templates/EmotionalTriggers.md` |
| `Packs/Copywriting/src/Workflows/SalesStory.md:5,111` | `**Read before executing:** ../Templates/StoryStructures.md, ../Templates/EmotionalTriggers.md` and later: "All 9 structures are in ../Templates/StoryStructures.md" |
| `v4.2.0/.claude/skills/Research/Workflows/DeepInvestigation.md:96` | `**Select domain template pack:** Read Templates/{domain}.md based on user's topic.` |
| `Packs/Research/src/Workflows/MarketingResearch.md:7-11` | `read ~/.claude/AAI/SKILL.md` |

**Pattern consolidation:** file loads are always `**Read:** [relative-or-expanded-path]` markdown instructions, with section refs via § notation. No YAML imports, no frontmatter-based loading.

#### 4.3 Skill customizations — uniform pattern across 7 skills

All skills reference: `~/.claude/AAI/USER/SKILLCUSTOMIZATIONS/{SkillName}/PREFERENCES.md`

| Skill | SKILL.md citation |
|---|---|
| Copywriting | `Packs/Copywriting/src/SKILL.md:27-30` |
| Marketing | `v4.2.0/.claude/skills/Marketing/SKILL.md:30-33` |
| Research | `Packs/Research/src/SKILL.md:21-24` |
| RedTeam | `Packs/Thinking/src/RedTeam/SKILL.md:8-11` |
| FirstPrinciples | `Packs/Thinking/src/FirstPrinciples/SKILL.md:8-11` |
| Council | `Packs/Thinking/src/Council/SKILL.md:8-11` |
| IterativeDepth | `Packs/Thinking/src/IterativeDepth/SKILL.md:8-11` |

Documented as standard at `Packs/Thinking/README.md:211`.

---

### 5. Deployed State on vultr01

#### cc-agent-ui service

**Unit:** `/etc/systemd/system/cc-agent-ui.service`

- `User=root`
- `WorkingDirectory=/root/Dev/cosmic-agent-memory/cc-agent-ui`
- `Environment=HOST=127.0.0.1`, `Environment=SERVER_PORT=3001`, `Environment=CONTEXT_WINDOW=160000`, `Environment=VITE_CONTEXT_WINDOW=160000`
- `ExecStart=/usr/bin/node server/index.js`
- Logs: `/var/log/cc-agent-ui.log`

#### /root/.claude/skills/ — 13 present

```
Agents                  Marketing           (linuxuser-owned, 5 subdirs)
ContentAnalysis         Media
Investigation           Research            (linuxuser-owned)
Scraping                Security
LifeOS                   Thinking
USMetrics               Utilities
copywriting             (lowercase, linuxuser-owned)
```

- **`copywriting/` (lowercase) exists** and mirrors `Packs/Copywriting/src/`: `SKILL.md` (4428 bytes, identical to local), `Templates/`, `Workflows/`.
- **`Copywriting/` (capital C) does NOT exist.** INSTALL.md implies the capital-C name; current install deviates.
- `Marketing/` present with all 18 `CopyPlatformSections/*.md` files matching v4.2.0 naming.

#### Client artifacts

- `find /root -type d -name 'copyplatforms' 2>/dev/null` → empty
- `find /root -maxdepth 5 -name 'checklist*.md' 2>/dev/null` → empty
- **No filled checklist currently exists on disk anywhere under `/root`.**

#### Git state — /root/Dev/cosmic-agent-memory

- Commit: `6fef0ab84c187b610714e78f88472ac496ee3d8f`
- Branch: `main`
- Diverges from local `main` (`79ba97c8…`). (Expected — local is developer workstation.)

---

## 📊 Architecture Documentation (as found)

### Two skill-distribution patterns in active use

1. **Bundled with primary installer.** Skill lives at `v4.2.0/.claude/skills/{Name}/` with `SKILL.md`. Deployed via git clone by the AAI installer. Auto-discovered by directory scan. 12 skills use this today (Agents, ContentAnalysis, Investigation, Marketing, Media, Research, Scraping, Security, LifeOS, Thinking, USMetrics, Utilities).

2. **Standalone pack.** Skill lives at `Packs/{Name}/src/{SKILL.md,Workflows,Templates}` with sibling meta-files (INSTALL.md, VERIFY.md, README.md). Installed via AI-wizard (Claude Code reads INSTALL.md and performs user-driven install). Three packs use this today: Copywriting, Research, Thinking (plus others at `Packs/`: Agents, ContentAnalysis, ContextSearch, Investigation, Media, Scraping, Security, LifeOS, USMetrics, Utilities).

**Packs/Copywriting/ is pack-only** — it has no sibling in `v4.2.0/.claude/skills/Copywriting/`. Running the primary installer today does NOT deploy Copywriting.

**Marketing is installer-only** — no `Packs/Marketing/` exists.

### Checklist data flow (current)

```
Marketing skill (Q&A)
  ├── writes state: ~/.claude/MEMORY/STATE/marketing-checklist.json
  ├── emits markers: <SECTION_N_EXPANSION_COMPLETE>
  ├── saves per-section: zettel save -S "marketing-{slug}-expand-{section-id}"
  └── hands off to Copywriting skill (verbal handoff per SKILL.md:26)
         │
         └── Copywriting skill
               ├── templates reference "the checklist" abstractly
               ├── no read of state file or zettel memory documented
               └── assumes user context contains the platform
```

### Customization pattern (uniform)

```
~/.claude/AAI/USER/SKILLCUSTOMIZATIONS/{SkillName}/PREFERENCES.md
```

7 skills check this path at the top of SKILL.md and load overrides if present.

---

## 📎 Code References

- `Packs/Copywriting/src/SKILL.md:27-30` — customization path check
- `Packs/Copywriting/src/Workflows/CopyPlatform.md:5` — template reads
- `Packs/Copywriting/src/Workflows/ContentWriter.md:5-7` — prereq + template reads
- `Packs/Copywriting/src/Templates/CopyPlatformSections.md:6-16` — "read CoreFrameworks.md first" + checklist references
- `v4.2.0/.claude/skills/Marketing/SKILL.md:8-14` — trigger words
- `v4.2.0/.claude/skills/Marketing/SKILL.md:26` — handoff to Copywriting
- `v4.2.0/.claude/skills/Marketing/SKILL.md:60-64` — Q&A-vs-content rule
- `v4.2.0/.claude/skills/Marketing/StateDefinition.md:237-273` — state file + structure
- `v4.2.0/.claude/skills/Marketing/StateDefinition.md:279-340` — transition model
- `v4.2.0/.claude/skills/Marketing/Workflows/CopyPlatform.md:213-217, 268-273, 351-356` — zettel persistence
- `v4.2.0/.claude/AAI-Install/engine/actions.ts:234` — legacy symlink
- `v4.2.0/.claude/AAI-Install/engine/actions.ts:503` — paiDir resolution
- `v4.2.0/.claude/AAI-Install/engine/actions.ts:528-539` — git clone/pull/init
- `v4.2.0/.claude/AAI-Install/engine/actions.ts:589` — config dir
- `v4.2.0/.claude/AAI-Install/engine/actions.ts:672-673` — skill discovery by SKILL.md presence
- `v4.2.0/.claude/AAI-Install/engine/actions.ts:731-745` — .env symlinks
- `v4.2.0/.claude/AAI-Install/engine/actions.ts:674` — hooks counting (repo-level only)
- `Packs/Thinking/README.md:211` — customization pattern documented

---

## Historical Context (from thoughts/)

- `thoughts/searchable/shared/research/2026-04-08-zettel-integration-skills-tree.md` — prior research on Zettelkasten integration across skills tree. Likely relevant to the observation that Marketing persists to zettel memory rather than on-disk files. Not read in depth this session.

No beads issues existed at research time (`bd list --status=open` → "No issues found").

---

## 🔗 Related Research

- `thoughts/searchable/shared/plans/2026-04-06-ENG-XXXX-tdd-zettelkasten-hook-wiring.md` — TDD plan for Zettelkasten hook wiring (not read this session; potentially relevant given Marketing's zettel persistence pattern).

---

## ❓ Open Questions

These are questions the research surfaced but did not resolve — they inform plan decisions, not current-state documentation:

1. **How does Copywriting currently receive the Marketing checklist at runtime?** Templates reference "the checklist" with no file path. The current working assumption is "user pastes it into context" or "both skills run in the same session and state is inherited from memory." Worth verifying before designing a new on-disk convention.

2. **Is `~/.claude/MEMORY/STATE/marketing-checklist.json` multi-offer-aware?** It has a single `topicSlug` field — unclear whether running Marketing twice for two different offers overwrites the file or keys on slug. Relevant if we want multi-offer support per client.

3. **What is the lifecycle of the `/root/.claude/skills/copywriting/` (lowercase) directory on vultr01?** Ownership is `linuxuser:linuxuser` but modified recently (Apr 11) — likely not deployed by the root-user systemd service. Provenance unclear from on-disk state alone.

4. **Do any existing workflows rely on `ChecklistEnforcer` / `ChecklistStateInjector` hooks being present?** These hooks are referenced in `StateDefinition.md:279-340` but not located in this research. If Copywriting begins reading the Marketing state file directly, does that bypass or complement these hooks?

5. **Does Marketing or any existing skill write any on-disk artifact the user could hand to Copywriting today?** Research surfaced state-file + zettel persistence but no consolidated 18-section file on disk. If absent by design, any new "project-local checklist directory" convention is a net-new pattern, not a migration.

---

## Follow-up Research 2026-04-14 — User-Provided Answers + Hook Deep Dive

All 5 open questions resolved. The user provided answers; an additional research pass located and documented the two Marketing hooks referenced in `StateDefinition.md:279-340`.

### Answers to open questions

**Q1 — How does Copywriting currently receive the Marketing checklist?**
**Answer:** User pastes the checklist into the Copywriting skill's conversation context.
- **Confirmation in code:** `Packs/Copywriting/` contains no search hits for "paste" or "clipboard"; `v4.2.0/.claude/skills/Marketing/` likewise has zero hits. No on-disk artifact is produced at `<EXPANSION_COMPLETE>` (see Q5 below). The contract is implicit and manual: the user copies text from the Marketing session and pastes it into the Copywriting session.

**Q2 — Is `~/.claude/MEMORY/STATE/marketing-checklist.json` multi-offer-aware?**
**Answer:** No. Multi-offer implementation is needed.
- **Current behavior** (`StateDefinition.md:235-273`): single monolithic file at fixed path. Only one active checklist at a time. `topicSlug` is metadata, not a directory key.
- **Parallel runs** (`CopyPlatform.md:44-76`): a second Marketing invocation prompts "resume or start fresh." "Start fresh" overwrites the previous state; no archival.
- **On completion** (`CopyPlatform.md:358`): state marked `"active": false` at the same path; no rename, no move.
- **Zettel side is multi-keyed:** per-phase saves use `source: marketing-{topic-slug}-{phase}` (`CopyPlatform.md:173-175`), so memory is multi-offer-capable even though the state file is not.

**Q3 — What is the lifecycle of `/root/.claude/skills/copywriting/` (lowercase) on vultr01?**
**Answer:** Lifecycle is the life of the user. Clients run in isolated environments — each client gets their own VPS or container, no shared hosting.
- **Implication:** No cross-client coordination concerns. The lowercase `/root/.claude/skills/copywriting/` is simply that user's install; Capital-C is not required for correctness.
- **Case-mismatch resolution:** Rename to capital-C to align with `INSTALL.md`, or accept both — a per-client decision, not a platform-level concern.

**Q4 — Do `ChecklistEnforcer` / `ChecklistStateInjector` hooks need to know about a new location?**
**Answer:** Frame shift — "Marketing" is primarily a **research workflow** (Q&A-based customer/offer research that builds the checklist). Copywriting is the actual **copy production workflow**. The current naming "Marketing" vs. "Copywriting" may be a mis-match; the research→produce split is the real architecture.
- **Implication for hooks:** The hooks are tightly coupled to the research-phase state machine (`marketing-checklist.json`, phase markers `<UNDERSTANDING_COMPLETE>` etc.). They do not need to reach into Copywriting territory — they belong fully to the research/build side.
- **Implication for naming:** Future rename candidate. Not in scope for current plan.

**Q5 — Marketing skill should produce a robust handoff checklist. Current state of the skill + hooks:**

**Hook inventory:**

| Hook | Path | Lines | Event | Role |
|---|---|---|---|---|
| `ChecklistEnforcer` | `v4.2.0/.claude/hooks/ChecklistEnforcer.hook.ts` | 447 | `Stop` (post-response) | Parses assistant output for phase-transition markers, tracks asked/answered enumerated questions via regex, advances phase + updates `completionEvidence` flags, writes back to `marketing-checklist.json`. |
| `ChecklistStateInjector` | `v4.2.0/.claude/hooks/ChecklistStateInjector.hook.ts` | 275 | `UserPromptSubmit` (pre-response) | Reads state file, injects `<system-reminder>` block with current phase constraints, unanswered-question list, and transition-readiness proposal into LLM context. Empty output when state file absent/inactive. |

The `MARKETING COPY PLATFORM — Active / Phase: IMPROVEMENT / Exchange: N` reminders appearing in every user message throughout this session are produced by `ChecklistStateInjector.hook.ts` lines 163-255.

**Hook inputs/outputs:**

- `ChecklistEnforcer`: reads stdin (`session_id`, `transcript_path`, `hook_event_name`, `last_assistant_message`) + `marketing-checklist.json`. Writes `marketing-checklist.json` (`ChecklistEnforcer.hook.ts:104,437`). Detects markers `<UNDERSTANDING_COMPLETE>` (`:363`), `<IMPROVEMENT_COMPLETE>` (`:368`), `<EXPANSION_COMPLETE>` (`:374`), `<SECTION_N_EXPANSION_COMPLETE>` (`:382-393`).
- `ChecklistStateInjector`: reads stdin + `marketing-checklist.json` (`:260,262`). Writes stdout `<system-reminder>` block (`:268`). Transition readiness (`:123-161`) requires: Understanding — min 3 exchanges + all 8 questions answered + 3 evidence flags; Improvement — min 4 exchanges + all 10 questions answered + 3 evidence flags; Expand — all 18 sections expanded.

**Handoff artifact — what exists today:**

The Marketing skill produces **no robust handoff artifact**. At `<EXPANSION_COMPLETE>`:
- No consolidated 18-section document is written to disk.
- No single response block dumps all sections together.
- No instruction tells the user "your checklist is at path X."
- No clipboard-copy or paste contract is mentioned anywhere (`Marketing/**` zero hits for "paste"/"clipboard"; `Packs/Copywriting/**` same).
- The 18 expanded sections exist only in (a) conversation history and (b) the state file's `expandedSections[]` array and per-section zettel cards (`source: marketing-{slug}-expand-{section-id}`, `CopyPlatform.md:213-217`).

**Handoff instruction language** (`v4.2.0/.claude/skills/Marketing/SKILL.md:26`):
> "After Marketing completes its 4-phase copy platform build, the user may want ACTUAL copy written (emails, ads, landing pages, headlines, sales stories). That is the `copywriting` skill's job. Hand off by telling the user: 'Your copy platform is complete. To write actual copy pieces, invoke the copywriting skill with your specific format request (email / ad / landing page / etc.).' The `copywriting` skill handles writing; the Marketing skill handles building the foundation."

**References to "copywriting" inside Marketing skill files** (full enumeration):
- `Marketing/SKILL.md:26` — delegation handoff (quoted above)
- `Marketing/SKILL.md:62` — "the LLM only applies copywriting frameworks to user-provided content" (Q&A-vs-content rule, not handoff)
- `Marketing/Prompts/SystemPrompts.md:62` — "You are an expert copywriting strategist" (persona, not handoff)
- `Marketing/Workflows/CopyPlatform.md:389` — references Research skill; no "copywriting" term directly

**State-file multi-offer posture** (mirror of Q2):
- `marketing-checklist.json` schema (`StateDefinition.md:235-273`): 1 active checklist max.
- `topicSlug` captured but not used as directory/filename key.
- `active: false` on implement-phase end (`CopyPlatform.md:358`); file remains at fixed path.
- Zettel side IS multi-keyed via `source: marketing-{topic-slug}-{phase}` — memory preserves every run even though state does not.

### Additional code references

- `v4.2.0/.claude/hooks/ChecklistEnforcer.hook.ts:115-148` — UNDERSTANDING_PATTERNS (8 questions)
- `v4.2.0/.claude/hooks/ChecklistEnforcer.hook.ts:150-191` — IMPROVEMENT_PATTERNS (10 questions)
- `v4.2.0/.claude/hooks/ChecklistEnforcer.hook.ts:271-290` — answer detection
- `v4.2.0/.claude/hooks/ChecklistEnforcer.hook.ts:294-356` — evidence-flag detection
- `v4.2.0/.claude/hooks/ChecklistEnforcer.hook.ts:360-396` — phase transition detection
- `v4.2.0/.claude/hooks/ChecklistStateInjector.hook.ts:63-85` — enumerated question sets injected
- `v4.2.0/.claude/hooks/ChecklistStateInjector.hook.ts:123-161` — transition-readiness check
- `v4.2.0/.claude/hooks/ChecklistStateInjector.hook.ts:163-255` — system-reminder construction
- `v4.2.0/.claude/hooks/ChecklistStateInjector.hook.ts:172-202` — "Ask questions ONLY" constraint for Understanding/Improvement phases

### Updated architecture picture

```
Research/Build side (current "Marketing" skill)
  ├── Hooks read+write: ~/.claude/MEMORY/STATE/marketing-checklist.json
  │     (single-offer, monolithic, not archived)
  ├── Per-section zettel saves: source="marketing-{slug}-expand-{N}"
  │     (multi-offer capable via slug)
  ├── Handoff: verbal ("invoke copywriting skill"), no artifact
  └── Gap: no robust checklist document produced
                │
                │  User manually copies from conversation + pastes
                ▼
Production side (Copywriting skill)
  ├── Templates reference "the checklist" abstractly
  ├── No read of state file or zettel memory
  └── Assumes user-pasted content in context
```

### Implications for the plan (not recommendations — observations)

- The user's stated goal "Marketing skill should produce a robust checklist to hand to Copywriting" is a gap in the current system, not a tweak.
- Multi-offer support is a genuine feature gap — the state file architecture needs a directory structure (or per-slug filenames) to support it.
- "Marketing" naming reflects the skill's current identity but the user's framing (research → produce) suggests a future rename is worth tracking separately.
- The two hooks already own every lifecycle event of the research/build phase (marker detection, state mutation, system-reminder injection). Any handoff-artifact production would most naturally hook off `<EXPANSION_COMPLETE>` in `ChecklistEnforcer.hook.ts:374`.
- Client environments are isolated (per-VPS or per-container), so global paths like `~/.claude/MEMORY/STATE/` are safe for client-side state — the multi-offer dimension is within a single user, not across users.

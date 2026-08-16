---
date: 2026-08-14T18:33:39-04:00
researcher: maceo
git_commit: d713477caf10a75dc1c64cbf9b18cdbbe7e37c0c
branch: main
repository: silmari-chat
topic: "AAI package seams — Algorithm v3.7.0, skills/, AAI/Tools/, hooks, CLI-First entry points, and CONTEXT_ROUTING.md"
tags: [research, codebase, claude-code, aai, algorithm, hooks, skills, cli-first, zettel, cosmic-agent-core]
status: complete
last_updated: 2026-08-14
last_updated_by: maceo
---

# Research: AAI package seams — Algorithm v3.7.0, skills/, AAI/Tools/, hooks, CLI-First entry points, and CONTEXT_ROUTING.md

**Date**: 2026-08-14T18:33:39-04:00
**Researcher**: maceo
**Git Commit**: `d713477caf10a75dc1c64cbf9b18cdbbe7e37c0c`
**Branch**: `main`
**Repository**: silmari-chat

## Research Question

A second, focused research pass on the seams among six specific AAI subsystems in the package at `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/`, building on the first research pass (which covered the package broadly): `AAI/Algorithm/v3.7.0.md` (which loads like a skill via `CLAUDE.md`), `skills/`, `AAI/Tools/`, `AAI/THEHOOKSYSTEM.md`, `AAI/TOOLS.md`, `AAI/THEDELEGATIONSYSTEM.md`, `AAI/SKILLSYSTEM.md`, `AAI/CONTEXT_ROUTING.md`, `AAI/CLIFIRSTARCHITECTURE.md`, and `AAI/CLI.md`. Specifically: how CLAUDE.md references/loads the Algorithm file and what triggers it; how Algorithm invokes/relies on Tools, Skills, Hooks, and Delegation; what CLI.md and CLIFIRSTARCHITECTURE.md require structurally; and how CONTEXT_ROUTING.md ties into what CLAUDE.md loads — all in service of documenting what's needed to make this work if copied into the `silmari-chat` repo.

**Scope note (carried over from the first pass):** the user's live `~/.claude/SAI` framework is a separate, unrelated system and is not the AAI port target — see the [first research document](thoughts/shared/research/2026-08-13-10-00-cosmic-agent-core-aai-integration-seams.md) for the full SAI/AAI/PAI disambiguation. This document covers only the AAI package.

## Summary

This pass documents six specific AAI subsystems and the concrete, checkable seams among them. The consistent pattern already flagged in the first pass — documentation and shipped code have drifted apart in specific, checkable ways — is confirmed here with substantially more density, and one entirely new subsystem surfaces: a real, separately-deployed "zettel" memory service that Algorithm v3.7.0 depends on but that lives outside `.claude/` entirely.

`CLAUDE.md` loads `AAI/Algorithm/v3.7.0.md` via a hardcoded literal path (`CLAUDE.md:58,123`) rather than through the versioned `LATEST` pointer file that a separate build tool (`BuildCLAUDE.ts`) uses to regenerate `CLAUDE.md` itself — two independent paths to the same version number that only stay consistent if someone re-runs the build tool. The Algorithm's own "Context Recovery" instructions point at `MEMORY/STATE/work.json`, a file this shipped package never creates (only `MEMORY/README.md` exists). Its PRD-write/hook-sync contract is, notably, one of the few places doc and code agree exactly: `PRDSync.hook.ts` is registered on every `Write`/`Edit` at the `settings.json` level and self-filters internally to `PRD.md` files under `MEMORY/WORK/` — precisely matching Algorithm v3.7.0.md's description.

`AAI/Tools/` contains 42 top-level files, of which only 7 (plus `algorithm.ts`, documented separately in `CLI.md`) are documented anywhere — the other 35 (~83%) form undocumented Banner, Wisdom, Pipeline, and Transcript clusters, plus a second, entirely separate `pai.ts` distinct from the documented CLI entry point. `skills/` (53 `SKILL.md` files) violates its own `SKILLSYSTEM.md` flat-2-level-max rule in five concrete places and carries the mandated `## Examples` heading on only 23 of 53 skills. `THEHOOKSYSTEM.md` states three mutually inconsistent hook counts (20, 22, 15) against a ground truth of 24 files on disk, and documents an active `AlgorithmTab.hook.ts` that doesn't exist and isn't registered anywhere. The two `PreToolUse` guard hooks differ in real enforcement power — `AgentExecutionGuard.hook.ts` only ever warns, while `SkillGuard.hook.ts` genuinely blocks via a `decision:block` payload.

The Algorithm's "zettel" memory protocol is real, deployed infrastructure — an HTTP/MCP service on port 8787 living one level up in the parent `cosmic-agent-memory` monorepo — but it is never cross-referenced anywhere with the file-based `MEMORY/` tree documented elsewhere in the package, and it is itself mid-migration to a newer MCP-tool interface that cites an Algorithm version (`v3.9.0`) not present in this package (only `v3.5.0` and `v3.7.0` exist). Finally, `CLI.md` documents a `pai pipeline` command and a `runner.v2.ts` dependency that the actual `pai.ts` neither implements nor imports — it uses the older `runner.ts`, whose action-name resolution convention (`<name>.action.ts`) doesn't even match the on-disk `action.ts` file-naming pattern used by every real action. `CONTEXT_ROUTING.md` is confirmed, at the code level, to be a purely manual reference table that `LoadContext.hook.ts`'s automatic SessionStart injection never reads — and its own table repeats the AAI-vs-PAI filename mismatch found in the first pass, now confirmed from two further independent citations.

## Detailed Findings

### 1. Algorithm v3.7.0 — how CLAUDE.md loads it, and what it assumes exists

`CLAUDE.md:123` issues the load instruction verbatim: "Use the Read tool to load `AAI/Algorithm/v3.7.0.md`", and this resolves correctly against `.claude/AAI/Algorithm/`, which holds three entries: `v3.7.0.md`, an older `v3.5.0.md`, and a `LATEST` pointer file whose sole content is `v3.7.0`.

The version string is hardcoded directly in the two places that actually gate which file gets loaded — `CLAUDE.md:58` (the NATIVE-mode zettel cross-reference) and `CLAUDE.md:123` (the ALGORITHM-mode load instruction) — rather than being resolved through `LATEST`. A separate, parallel build/tooling layer *does* consult `LATEST`: `AAI/README.md:82` documents `CLAUDE.md` itself as generated from `CLAUDE.md.template` + `settings.json` + `AAI/Algorithm/LATEST`; `AAI/Tools/BuildCLAUDE.ts:7` reads `LATEST` and `BuildCLAUDE.ts:29` falls back to a hardcoded `v3.7.0` default if it's missing; `AAI-Install/README.md:216,242,282` and `skills/Utilities/PAIUpgrade/Workflows/AlgorithmUpgrade.md:71` describe the same `LATEST`-driven flow. `CLAUDE.md`'s own load instruction and the regeneration tool that's supposed to keep `CLAUDE.md` in sync are therefore two independent paths to the same version number, consistent only as long as someone re-runs `BuildCLAUDE.ts` (or hand-edits `CLAUDE.md`) whenever `LATEST` changes.

Algorithm/v3.7.0.md's "Context Recovery" section (lines 653-659) treats `~/.claude/MEMORY/STATE/work.json` as an existing registry of all sessions, and its "PRD as System of Record" section (245-256) assumes `~/.claude/AAI/PRDFORMAT.md` for the full spec. Of these two dependencies, only `AAI/PRDFORMAT.md` exists on disk; `MEMORY/STATE/` does not exist at all — a recursive glob of `MEMORY/**` returns only `MEMORY/README.md`. `AAI/THENOTIFICATIONSYSTEM.md:294` independently references a sibling path, `${AAI_DIR}/MEMORY/STATE/events.jsonl`, which is equally absent. The Algorithm's own "how to recover context after compaction" instructions point at a registry file this shipped package never creates.

The hook that Algorithm v3.7.0.md names as its write/sync counterpart, `PRDSync.hook.ts`, behaves exactly as the Algorithm doc describes: it fires on every `Write`/`Edit` (`settings.json:143-160` registers it against both matchers with no path filter), then self-filters internally at `PRDSync.hook.ts:34-35` (`if (!filePath.includes('MEMORY/WORK/') || !filePath.endsWith('PRD.md')) return;`) to only act on `PRD.md` paths under `MEMORY/WORK/`. This is the concrete mechanism behind Algorithm/v3.7.0.md:245-256's claim that "hooks never write to PRD.md — they only read it": the filter guarantees it only *touches* `PRD.md` paths, and even then only reads frontmatter/criteria to sync into `work.json` — a file that, per the paragraph above, has no corresponding directory structure created anywhere in this package.

Algorithm/v3.7.0.md's phase-transition voice curls are explicitly synchronous and unbackgrounded ("direct, synchronous calls. Do not send to background", `v3.7.0.md:34`) — the opposite convention from every other notification pattern in the package. `AAI/THENOTIFICATIONSYSTEM.md:15-21,73-77,126-130,164` all document and justify backgrounded (`&`, `> /dev/null 2>&1`) curls specifically so they don't block execution. `THENOTIFICATIONSYSTEM.md:86-98` is the one section that acknowledges the Algorithm's curls are different in origin ("defined in CLAUDE.md, not hooks") but never states or reconciles the synchronous-vs-backgrounded split — that distinction exists only inside `Algorithm/v3.7.0.md` itself.

### 2. AAI/Tools/ — the actual file population versus what's documented

`AAI/Tools/` has 42 top-level files plus a fully separate nested Vite/React/TypeScript project (`pipeline-monitor-ui/`, 17 files with its own `package.json`/`vite.config.ts`/`tsconfig` chain). Of the 42 top-level files, exactly 8 are documented anywhere — the 6 tools in `TOOLS.md` (`Inference.ts`, `RemoveBg.ts`, `AddBg.ts`, `GetTranscript.ts`, `extract-transcript.py`, `YouTubeApi.ts`) plus `algorithm.ts`, documented separately in `CLI.md`. The remaining 35 files (~83%) have no reference in either doc: a Banner cluster (`NeofetchBanner.ts`, `BannerNeofetch.ts`, `Banner.ts`, `BannerRetro.ts`, `BannerMatrix.ts`, `BannerTokyo.ts`, `BannerPrototypes.ts`), a Wisdom cluster (`WisdomFrameUpdater.ts`, `WisdomCrossFrameSynthesizer.ts`, `WisdomDomainClassifier.ts`), a Pipeline cluster (`PipelineOrchestrator.ts`, `PipelineMonitor.ts`, plus the whole `pipeline-monitor-ui/` app), a second transcript cluster (`ExtractTranscript.ts`, `TranscriptParser.ts`, `SplitAndTranscribe.ts`) entirely distinct from the documented `GetTranscript.ts`/`extract-transcript.py` pair, and a long tail of standalone files including `BuildCLAUDE.ts` (the tool that regenerates `CLAUDE.md`, per §1), `SessionHarvester.ts`, `SessionProgress.ts`, `FailureCapture.ts`, `LearningPatternSynthesis.ts`, `IntegrityMaintenance.ts`, `OpinionTracker.ts`, `AlgorithmPhaseReport.ts`, `GetCounts.ts`, `ActivityParser.ts`, `SecretScan.ts`, `LoadSkillConfig.ts`, `RebuildPAI.ts`, `RelationshipReflect.ts`, `PAILogo.ts`, `FeatureRegistry.ts`, `PreviewMarkdown.ts`, and a second, entirely separate `pai.ts` at `AAI/Tools/pai.ts` — distinct from the documented `AAI/ACTIONS/pai.ts` CLI entry point (see §6).

`Inference.ts` (225 lines) is the shared dependency tying `Tools/` to the hook system (see §1, §4): its exported `inference()` function (line 65) uses per-level model/timeout config (`fast`→haiku/15s, `standard`→sonnet/30s, `smart`→opus/90s, lines 56-60) exactly matching `TOOLS.md`'s table, and it genuinely shells out to a local `claude` binary (`spawn('claude', args, ...)`, line 91) with `ANTHROPIC_API_KEY` and `CLAUDECODE` explicitly deleted from the child environment (lines 72-77) — confirming the doc's "subscription, not API key" claim at the implementation level, and explaining why nested `claude` invocations inside hooks don't trip Claude Code's own nested-session guard.

`algorithm.ts` (1327 content lines) has exactly one non-builtin import, and it reaches outside `Tools/` entirely: `import { generatePRDTemplate } from "../../hooks/lib/prd-template"` (line 44), resolving to `.claude/hooks/lib/prd-template.ts`. This is the single concrete code-level link between the Algorithm CLI and the hooks/ directory tree — everything else in `algorithm.ts` is self-contained. Its CLI flags match `CLI.md`'s documented set exactly (`-m`/`-p`/`-n`/`-a`) plus two undocumented flags (`-t`/`--title`, `-e`/`--effort`) scoped to a `new` subcommand that `CLI.md` doesn't mention at all.

`Tools/` has no conventional `package.json`/`bun.lock`/`node_modules` of its own; the one dependency manifest present, `Transcribe-package.json` (declaring `openai` and `whisper-node-ts`), belongs to the undocumented `ExtractTranscript.ts`/`SplitAndTranscribe.ts` cluster, not to the documented Python `extract-transcript.py` tool.

### 3. skills/ — structural compliance against SKILLSYSTEM.md's own mandatory rules

53 `SKILL.md` files exist. `SKILLSYSTEM.md`'s rules were checked against all of them where the available tooling permitted verification.

**`Tools/` mandatory-even-if-empty rule**: only 12 of 53 skill directories have a *non-empty* `Tools/` (a floor — an empty-but-compliant `Tools/` is indistinguishable from an absent one) — `LifeOS`, `USMetrics`, `Agents`, `compliance_review`, `Media/Art`, `Media/Remotion`, `Utilities/PAIUpgrade`, `Utilities/Evals`, `Utilities/AudioEditor`, `Utilities/Prompting`, `Security/Recon`, `Security/AnnualReports`. The other 41 (7 category routers + 34 leaf skills, including `Utilities/Delegation`, all six `Thinking/*` leaves, both Investigation leaves, all four `Utilities/Documents` sub-skills, and both differently-cased Copywriting directories) show zero files under `Tools/`.

**Flat 2-level-max rule** (`SKILLSYSTEM.md` forbids anything deeper than `skills/Category/SkillName/SubDir/`): five confirmed violation clusters — `skills/Security/WebAssessment/Workflows/{bug-bounty,ffuf,osint,webapp,pentest}/*.md` (15 files, 5 sub-subdirectories under `Workflows/`); `skills/Utilities/Documents/{Docx,Pptx}/Ooxml/Scripts/*.py` (double-nested, and these sub-skills each also carry a same-level `Scripts/` dir named neither `Workflows/` nor `Tools/`); `skills/Utilities/Prompting/Templates/Data/*.yaml`; `skills/compliance_review/Tools/lib/*.ts` (nested one level inside the one directory `SKILLSYSTEM.md` says must stay flat); `skills/Media/Art/Tools/node_modules/...` (a vendored dependency tree 5+ levels deep, 3876+ files).

**Forbidden directory names** (`Resources/`, `Docs/`, `Guides/`, `Context/`, `backups/`): zero hits for all five across the entire `skills/` tree — full compliance confirmed. Several *other* non-`Workflows/`/non-`Tools/` directories exist at skill roots that fall outside this explicit ban but also outside the doc's "only `Workflows/` and `Tools/` are ALLOWED" statement: `Utilities/Aphorisms/Database/`, `Utilities/Browser/{Recipes,Stories}/`, `Security/Recon/Data/`, `Utilities/Evals/Data/`, `Agents/Data/`, and the four `Utilities/Documents` sub-skill directories themselves.

**`## Examples` section** (`SKILLSYSTEM.md`: required for every skill): 23 of 53 have the literal heading, 30 lack it. Two skills (`Security/Recon:411`, `Utilities/Aphorisms:244`) have the content in spirit under a differently-worded `## Usage Examples` heading rather than the exact mandated text — a near-miss rather than a clean pass or fail.

### 4. Hook system — connective tissue to Algorithm, Delegation, and Skills, and its own internal drift

`THEHOOKSYSTEM.md` states three different hook counts for what should be the same population: "20 hooks running in production" (line 9), "22 hooks total" (line 1088, Quick Reference Card), and "15 hooks emitting 22 event types" (line 1326, footer). Ground truth — a non-recursive glob of `hooks/*.hook.ts` — returns 24 files (`SetQuestionTab`, `DocIntegrity`, `LastResponseCache`, `UpdateCounts`, `SecurityValidator`, `SessionAutoName`, `PRDSync`, `RatingCapture`, `LoadContext`, `Doctor`, `RelationshipMemory`, `QuestionAnswered`, `KittyEnvPersist`, `UpdateTabTitle`, `BudgetCheck`, `VoiceCompletion`, `ChecklistStateInjector`, `ResponseTabReset`, `SessionCleanup`, `SkillGuard`, `ChecklistEnforcer`, `IntegrityCheck`, `WorkCompletionLearning`, `AgentExecutionGuard`). None of the three documented numbers matches the 24 on disk, and the document doesn't reconcile the three numbers with each other either.

`AlgorithmTab.hook.ts` is the clearest single instance of doc/code drift: `THEHOOKSYSTEM.md` describes it as an active Stop hook in two separate places — a JSON code sample at lines 184-195 (Stop array line 191) with implementation prose at 215-216 ("Reads work.json, finds most recently updated active session, sets tab title"), and the Quick Reference Card at lines 1106-1111 under "STOP (5 hooks):" — yet the file does not exist among the 24 on-disk hooks and is absent from every entry in `settings.json`'s hooks block. Its documented behavior (reading `work.json`) also ties back to §1's finding that no `MEMORY/STATE/work.json` exists in this package at all.

The two `PreToolUse` "guard" hooks differ meaningfully in enforcement power, which matters for how the Delegation and Skills systems are actually constrained. `AgentExecutionGuard.hook.ts` (matcher `Task`, `settings.json:114-121`) — the hook standing between the Delegation system's Task-tool routing and actual execution — has no code path that can block a `Task` call: every branch (fast-agent pass conditions at lines 62-82: `run_in_background===true`, `subagent_type` in `FAST_AGENT_TYPES=['Explore']`, `model` in `FAST_MODELS=['haiku']`, or a `## Scope ... Timing: FAST` prompt-regex match; and the violation branch at 87-102, which only injects an advisory system-reminder) terminates in `process.exit(0)`. By contrast, `SkillGuard.hook.ts` (matcher `Skill`, `settings.json:123-130`) genuinely blocks: its single-entry `BLOCKED_SKILLS = ['keybindings-help']` (line 36) check emits `{"decision":"block",...}` (lines 69-73), the mechanism that actually prevents the Skill invocation — the one hook in the reviewed set that can stop an in-flight tool call rather than merely annotate it. Both hooks were Semgrep-verified against their exact defining symbols (`FAST_AGENT_TYPES`, `BLOCKED_SKILLS`) at the cited lines.

`PRDSync.hook.ts`'s matcher/filter split (`settings.json` registers it broadly on `Write`+`Edit`; the hook body self-filters to `MEMORY/WORK/*/PRD.md` at `PRDSync.hook.ts:34-35`, Semgrep-verified) is the mechanical implementation of Algorithm/v3.7.0.md's "AI writes, hooks only read/sync" contract described in §1 — the one place in this whole cross-cutting research where documentation and the hook's actual behavior agree precisely, in contrast to most of the other doc/code pairs surveyed.

### 5. Zettel memory system — real external infrastructure, disconnected from the documented MEMORY/ tree

Algorithm v3.7.0.md's zettel protocol (recall/save/link/hub verbs against `~/.local/bin/zettel`, talking to "the cosmic-agent-memory engine" at `http://localhost:8787`) is not aspirational prose — it has a real backing service, living entirely outside `.claude/`, one level up in the parent `cosmic-agent-memory` monorepo: `engine/` (core logic), `web/server.ts` (the HTTP API on port 8787), `mcp/server.ts` (a stdio MCP server whose tool surface matches the `mcp__silmari__zk_*` MCP tools available in this session), `harness/` (install + adapters), and `integration/hooks/{wire-fragments,wire-consolidation,wire-structure-notes,wire-retrieval}.ts` — the exact modules that `.claude/hooks/IntegrityCheck.hook.ts` and `.claude/hooks/LoadContext.hook.ts` dynamically `import()` via the cross-repo-relative path flagged in the first research pass. A Docker/s6 service definition (`docker-s6/s6-rc.d/cosmic-agent-memory/run`, `PORT=8787`) confirms this as a genuinely deployed, first-party service, alongside three dedicated docs (`docs/zettel-*.md`) and a `thoughts/` planning history in the parent monorepo recording at least one live production incident against it (broken `/cards`/`/v1/memory` routes, dated 2026-08-12).

This zettel/engine system and the file-based `MEMORY/` tree documented in `AAI/MEMORYSYSTEM.md` are never cross-referenced as related anywhere in the package — a grep for "zettel" against `AAI/MEMORYSYSTEM.md` and `AAI/THEDELEGATIONSYSTEM.md` returns zero hits in both. "zettel" itself appears in 15 files beyond `Algorithm/v3.7.0.md`: `commands/zettel.md` (the slash-command reference/dispatch doc, no implementation inside `.claude/`), `commands/compose_reel.md`, `CLAUDE.md` (a ~60-line "NATIVE Mode Memory (Zettel) — Condensed" section at lines 56-118), `skills/Research/Workflows/Memory.md`, `skills/Marketing/Workflows/{Memory.md, Memory.md.deprecated, CopyPlatform.md}`, `skills/Marketing/SKILL.md`, `skills/Marketing/tests/swap-verify.test.ts`, three `skills/InContextPipeline/pipelines/compose-reel/` files, and six files under `hooks/`/`hooks/lib/` labeled "Zettelkasten Layer" implementing a local EventBus/StructureNote system on top of `beads`.

A further complication: two Marketing-skill files (`skills/Marketing/Workflows/Memory.md` and its `.deprecated` sibling) flag an in-flight migration from the zettel CLI to the `mcp__silmari__zk_*` MCP tools, attributing the change to "Algorithm v3.9.0" — a version that does not exist anywhere in this package (`AAI/Algorithm/` contains only `v3.5.0` and `v3.7.0`, with `LATEST=v3.7.0`). Several files marked as migrated still contain live, unconverted zettel CLI calls — this package is mid-transition between two memory-access conventions with no version boundary that actually exists in the shipped Algorithm directory to anchor the cutover.

### 6. CLI-First entry points and CONTEXT_ROUTING.md's actual (non-)wiring to session start

Both `CLI.md`-documented entry points exist exactly where documented (`AAI/Tools/algorithm.ts`, `AAI/ACTIONS/pai.ts`), and `pai.ts`'s `action`/`actions`/`pipelines`/`info` grammar and `--mode`/`--input`/`--verbose` flags match `CLI.md` closely (`pai.ts:47-75`). But two specific `CLI.md` claims don't hold against the actual code: `pai pipeline <name>` (`CLI.md:218,220-221`) is a hard stub in `pai.ts:175-184` that always prints "Pipeline execution not yet implemented" and exits 1; and `pai info <name>`, documented (and self-documented in `pai.ts`'s own `--help` text) as covering "action/pipeline details," only ever resolves via `loadAction()` in the actual implementation (`pai.ts:198-223`) — there is no pipeline branch at all.

`CLI.md:267-271` documents `AAI/ACTIONS/lib/runner.v2.ts` as the shared low-level engine "that the pai CLI and pipeline runner both use" — but `pai.ts:35` (Semgrep-verified) actually imports `runAction`/`listActions` from `./lib/runner` (the older `runner.ts`, not `runner.v2.ts`), and never touches `runner.v2.ts` anywhere. That older runner's action-resolution logic (`runner.ts:30-32`, Semgrep-verified: `loadAction()` appends `.action.ts` to a name) doesn't match the on-disk convention either — every real action directory contains a file literally named `action.ts` (e.g. `A_EXAMPLE_SUMMARIZE/action.ts`), not `<name>.action.ts`. `pai.ts`'s own top-of-file JSDoc examples additionally use a slash-namespaced naming style (`parse/topic`) that matches neither `CLI.md`'s documented flat `A_`-prefixed names nor the on-disk action directories, both of which agree with each other but not with `pai.ts`'s own internal docstring.

`CONTEXT_ROUTING.md` is confirmed, at the code level, to be a purely manual reference — `hooks/LoadContext.hook.ts` (602 lines, read in full) never reads or references it anywhere in its source. `LoadContext.hook.ts`'s own header comment (lines 4-9) states its actual scope explicitly: "Core context ... is now in CLAUDE.md and loaded natively ... This hook injects DYNAMIC context only" — meaning SessionStart automation covers `loadAtStartup.files`, `AAI/USER/OPINIONS.md`, `MEMORY/RELATIONSHIP/` notes, a learning-readback digest, `MEMORY/WORK/`+`session-names.json` active-work summaries, and the same zettel/beads-context wire-retrieval import discussed in §5 (confirmed via targeted read at lines 507-509 and 519-529: `wireContextRetrieval`/`readWorkContext`, falling back to `assembleBeadsContext`) — but never `CONTEXT_ROUTING.md`'s routing table, which remains something the agent reads on demand per `CLAUDE.md`'s own instruction, matching `AAI/README.md:76`'s framing that documentation beyond the auto-loaded set "loads on-demand based on the routing table in CLAUDE.md."

`CONTEXT_ROUTING.md`'s own table independently reproduces the AAI-vs-PAI naming mismatch found in the first research pass, now from two additional citations: `CONTEXT_ROUTING.md:10` references `AAI/AAISYSTEMARCHITECTURE.md` and `CONTEXT_ROUTING.md:14` references `AAI/AAIAGENTSYSTEM.md`, both resolved against the same `~/.claude/`-relative base established by the table's own working entry at line 9 (`AAI/README.md`, confirmed to exist). Neither `AAISYSTEMARCHITECTURE.md` nor `AAIAGENTSYSTEM.md` exists under those names anywhere in the package — only `PAISYSTEMARCHITECTURE.md` and `PAIAGENTSYSTEM.md` do. A fourth independent citation of the same drift: `CLIFIRSTARCHITECTURE.md:591-593`'s own "Related Documentation" section links to the same non-existent `AAI/AAISYSTEMARCHITECTURE.md` name.

## Code References

- `CLAUDE.md:58,123` — hardcoded `AAI/Algorithm/v3.7.0.md` load references, not resolved via `LATEST`
- `AAI/Algorithm/LATEST:1` — version pointer file, content `v3.7.0`
- `AAI/Algorithm/v3.7.0.md:1` — Algorithm doc header confirming filename/version match
- `AAI/README.md:82` — CLAUDE.md documented as generated from CLAUDE.md.template + settings.json + AAI/Algorithm/LATEST
- `AAI/Tools/BuildCLAUDE.ts:7,29` — reads LATEST, hardcoded `v3.7.0` fallback default if missing
- `AAI/Algorithm/v3.7.0.md:653-659` — Context Recovery section referencing nonexistent `MEMORY/STATE/work.json`
- `AAI/PRDFORMAT.md` — exists, referenced by Algorithm v3.7.0.md's PRD section
- `AAI/THENOTIFICATIONSYSTEM.md:294` — references nonexistent `${AAI_DIR}/MEMORY/STATE/events.jsonl`
- `AAI/Algorithm/v3.7.0.md:245-256` — "PRD as System of Record" AI-writes/hooks-only-read contract
- `hooks/PRDSync.hook.ts:34-35` — in-hook filter requiring path to include `MEMORY/WORK/` and end in `PRD.md` (Semgrep-verified, symbol `filePath`)
- `hooks/PRDSync.hook.ts:73-76` — `.finally()` emitting `{"continue": true}` for non-matching Write/Edit calls
- `settings.json:143-151,152-160` — PRDSync.hook.ts registered on unfiltered `Write` and `Edit` matchers
- `AAI/Algorithm/v3.7.0.md:23,34` — synchronous, non-backgrounded voice curl instruction (explicit contrast to rest of package)
- `AAI/THENOTIFICATIONSYSTEM.md:15-21,73-77,126-130,164` — backgrounded curl pattern and rationale, not reconciled with Algorithm's synchronous convention
- `AAI/THENOTIFICATIONSYSTEM.md:86-98` — acknowledges Algorithm curls are "not hooks" but doesn't discuss the sync/background split
- `AAI/Tools/Inference.ts:65` — exported `inference()` function signature (Semgrep-verified)
- `AAI/Tools/Inference.ts:56-60` — LEVEL_CONFIG (fast/standard/smart model+timeout)
- `AAI/Tools/Inference.ts:91` — `spawn('claude', args, ...)` confirming subscription-based CLI shellout (Semgrep-verified)
- `AAI/Tools/Inference.ts:72-77` — deletes `ANTHROPIC_API_KEY` and `CLAUDECODE` from child env
- `AAI/Tools/Inference.ts:96-98` — user prompt piped via stdin to avoid ARG_MAX
- `AAI/Tools/algorithm.ts:44` — sole non-builtin import reaching into `../../hooks/lib/prd-template` (Semgrep-verified, symbol `generatePRDTemplate`)
- `AAI/Tools/algorithm.ts:161-172` — CLI flags including undocumented `-t`/`--title`, `-e`/`--effort` (`new` subcommand only)
- `AAI/Tools/algorithm.ts:1470` — top-level module entry point (not a wrapped `main()`)
- `AAI/Tools/Transcribe-package.json` — undocumented dependency manifest (openai, whisper-node-ts) tied to `ExtractTranscript.ts`/`SplitAndTranscribe.ts`
- `AAI/TOOLS.md` — documents only 7 of 42 `AAI/Tools/` top-level files
- `AAI/CLI.md:16,189` — documents `algorithm.ts` and `pai.ts` entry-point locations
- `skills/` — 53 `SKILL.md` files total; 12/53 have a non-empty `Tools/` subdirectory
- `AAI/SKILLSYSTEM.md:691-751,875-877` — flat 2-level-max rule and mandatory-Tools/-even-if-empty rule
- `skills/Security/WebAssessment/Workflows/{bug-bounty,ffuf,osint,webapp,pentest}/` — flat-structure violation, 15 files across 5 sub-subdirectories
- `skills/Utilities/Documents/{Docx,Pptx}/Ooxml/Scripts/` — flat-structure violation, double-nested
- `skills/compliance_review/Tools/lib/` — nesting inside the one directory required to stay flat
- `skills/Media/Art/Tools/node_modules/` — vendored dependency tree, 5+ levels deep, 3876+ files
- `skills/Security/Recon/SKILL.md:411` — `## Usage Examples` heading instead of mandated `## Examples`
- `skills/Utilities/Aphorisms/SKILL.md:244` — same near-miss heading pattern
- `AAI/THEHOOKSYSTEM.md:9` — "20 hooks running in production"
- `AAI/THEHOOKSYSTEM.md:1088` — "22 hooks total" (Quick Reference Card)
- `AAI/THEHOOKSYSTEM.md:1326` — "15 hooks emitting 22 event types" (footer)
- `hooks/*.hook.ts` — 24 files on disk (ground truth, non-recursive glob)
- `AAI/THEHOOKSYSTEM.md:184-195` — Stop-hook JSON sample listing `AlgorithmTab.hook.ts` as active
- `AAI/THEHOOKSYSTEM.md:1106-1111` — Quick Reference Card listing `AlgorithmTab.hook.ts` under STOP (5 hooks)
- `settings.json` — hooks block contains zero references to "AlgorithmTab"
- `hooks/AgentExecutionGuard.hook.ts:36,39,62-102` — all code paths (pass and violation) terminate in `process.exit(0)`, never blocks (Semgrep-verified, symbol `FAST_AGENT_TYPES`)
- `settings.json:114-121` — AgentExecutionGuard registered on PreToolUse matcher `Task`
- `hooks/SkillGuard.hook.ts:36` — `BLOCKED_SKILLS=['keybindings-help']` (Semgrep-verified)
- `hooks/SkillGuard.hook.ts:69-73` — emits `{"decision":"block",...}` JSON, the enforced denial mechanism
- `settings.json:123-130` — SkillGuard registered on PreToolUse matcher `Skill`
- `CLAUDE.md:56-118` — "NATIVE Mode Memory (Zettel) — Condensed" section
- `commands/zettel.md` — slash-command prompt doc dispatching to external zettel CLI, no implementation inside `.claude/`
- `AAI/MEMORYSYSTEM.md` — zero references to "zettel" anywhere in the file
- `hooks/IntegrityCheck.hook.ts`, `hooks/LoadContext.hook.ts:508,519-529` — dynamic `import()` of `../../../../cosmic-agent-memory/integration/hooks/wire-retrieval` etc. (confirmed via targeted read: actual symbols `wireContextRetrieval`, `readWorkContext` at 507-509; fallback `assembleBeadsContext` at 522)
- `skills/Marketing/Workflows/Memory.md`, `Memory.md.deprecated` — cite "Algorithm v3.9.0" migration to `mcp__silmari__zk_*` tools; v3.9.0 does not exist in `AAI/Algorithm/`
- `AAI/CLI.md:218,220-221` — documents `pai pipeline <name>` as a working command
- `AAI/ACTIONS/pai.ts:175-184` — pipeline case is a stub, always prints "not yet implemented" and exits 1
- `AAI/ACTIONS/pai.ts:198-223` — "info" command only resolves via `loadAction()`, no pipeline branch
- `AAI/CLI.md:267-271` — documents `runner.v2.ts` as the shared engine used by `pai` CLI
- `AAI/ACTIONS/pai.ts:35` — actually imports from `./lib/runner` (`runner.ts`), never `runner.v2.ts` (Semgrep-verified, symbol `runAction`)
- `AAI/ACTIONS/lib/runner.ts:30-32` — `loadAction()` appends `.action.ts`, mismatching on-disk `action.ts` filenames (Semgrep-verified)
- `hooks/LoadContext.hook.ts:4-9` — header comment: hook injects DYNAMIC context only, core context loads natively via CLAUDE.md
- `AAI/README.md:76` — "all other documentation loads on-demand based on the routing table in CLAUDE.md"
- `AAI/CONTEXT_ROUTING.md:9,10,14` — `AAI/README.md` entry (exists) vs. `AAI/AAISYSTEMARCHITECTURE.md` and `AAI/AAIAGENTSYSTEM.md` entries (do not exist)
- `AAI/PAISYSTEMARCHITECTURE.md`, `AAI/PAIAGENTSYSTEM.md` — actual on-disk files matching the mismatched CONTEXT_ROUTING.md entries
- `AAI/CLIFIRSTARCHITECTURE.md:591-593` — fourth citation of the same non-existent `AAI/AAISYSTEMARCHITECTURE.md` reference

## Architecture Documentation

Citation-verification methodology used in this pass: a deterministic Semgrep structural pass (`bun SAI/skills/ResearchSemgrep/verify-citations.ts`) confirmed 9 of the code-level (`.ts`) citations above as exact structural matches against their cited symbol and line; the remaining ~50 citations, all to Markdown/JSON files, are outside that tool's supported-language set and were verified by direct `Read` — the 9 core AAI docs plus `CLAUDE.md` were read in full during this research pass, and every citation against them was checked against that already-loaded content.

Patterns observed as governing this package's own internal consistency (documented as-is, not evaluated): the CLI-First contract (every capability built first as a deterministic CLI tool, prose/skill layers only mapping intent to invocations) holds structurally for `algorithm.ts` and largely for `pai.ts`, with two confirmed exceptions (the `pai pipeline` stub, the `runner.ts`/`runner.v2.ts` mismatch); the flat 2-level `skills/` structure mandate is violated in five identifiable places out of 53 skills; and a recurring documentation-drift pattern — hook counts, `AlgorithmTab.hook.ts`, the `AAI`-vs-`PAI` filename mismatch (now confirmed from a total of four independent citation sites across two research passes), and the `CLI.md`/`pai.ts` command-grammar gaps — appears across every doc examined in this pass except `AAI/SKILLSYSTEM.md`'s core naming rules and the `PRDSync.hook.ts`/Algorithm PRD contract, both of which match their documentation exactly.

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-08-13-10-00-cosmic-agent-core-aai-integration-seams.md` — the first research pass on this package, covering the source inventory, hook registration contract, skills/agents/commands native-format contracts, memory/delegation/Fabric path-resolution seam, VoiceServer/AAI-Install external dependencies, the Actions/Pipelines/Flows ("Arbol") subsystem, and the live SAI/AAI/PAI disambiguation in `~/.claude/`. This second pass extends that inventory into the Algorithm execution contract, a full `AAI/Tools/` file audit, deeper `skills/` structural compliance checking, the hook system's internal count/AlgorithmTab drift, the newly-discovered zettel memory service, and the CLI-First/CONTEXT_ROUTING wiring — all six areas the first pass had not yet gone deep on.

## Related Research

- `thoughts/shared/research/2026-08-13-10-00-cosmic-agent-core-aai-integration-seams.md` — first-pass broad seam/contract mapping for the same AAI package.

No other file in `thoughts/searchable/shared/research/` addresses AAI, PAI, SAI, `cosmic-agent-core`, or the zettel memory system.

## Open Questions

None of the following block the seam-mapping answer above — they are follow-on questions the source material itself doesn't resolve:

- Whether the 35 undocumented `AAI/Tools/` files (Banner/Wisdom/Pipeline/Transcript clusters, `pai.ts`, etc.) are active, load-bearing code or retained-but-unused — nothing in `TOOLS.md`, `CLI.md`, or the files themselves states which.
- Whether the zettel-to-`mcp__silmari__zk_*` migration referenced by two Marketing-skill files against "Algorithm v3.9.0" is expected to land in this package's `AAI/Algorithm/` directory at some point, or whether `v3.9.0` belongs to a different, unrelated version lineage entirely.
- Whether `THEHOOKSYSTEM.md`'s three internally-inconsistent hook counts (20/22/15) and its documentation of the non-existent `AlgorithmTab.hook.ts` reflect a stale snapshot from an earlier package revision, or an aspirational/in-progress edit that was never reconciled with the shipped `hooks/` directory.

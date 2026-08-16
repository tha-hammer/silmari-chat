---
date: 2026-08-16T10:17:09-04:00
researcher: maceo
git_commit: 9d23b2fd703d2c6352e31f5974e0e692590371cd
branch: main
repository: silmari-chat
topic: "Updating AAI/Tools/Inference.ts to route multi-provider LLM calls (Gemini/Grok/Perplexity/etc.) through OpenRouter"
tags: [research, codebase, cosmic-agent-core, aai, inference, openrouter, research-skill, multi-provider]
status: complete
last_updated: 2026-08-16
last_updated_by: maceo
---

# Research: Updating Inference.ts to route multi-provider LLM calls through OpenRouter

**Date**: 2026-08-16T10:17:09-04:00
**Researcher**: maceo
**Git Commit**: 9d23b2fd703d2c6352e31f5974e0e692590371cd
**Branch**: main
**Repository**: silmari-chat

*Note: HEAD is 3 commits ahead of `origin/main` and not present on any remote branch, so file references below use local repo-relative paths rather than GitHub permalinks.*

## Research Question

`apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts` needs to route inference calls through OpenRouter so that the Research skill's Gemini/Grok/Perplexity sub-researchers (currently falsified — no `gemini`/`grok`/`perplexity`/`llm` CLI, no `GEMINI_API_KEY`/`XAI_API_KEY`, no direct `curl`/`wget`) can actually reach their named providers. Various other skills also call other LLM providers directly and would need to go through `Inference.ts` too. This research maps: (1) `Inference.ts`'s current implementation and full consumer contract, (2) exactly how each "researcher" persona is (or isn't) wired to its named provider today, (3) every other skill/tool that calls an external LLM provider directly, and (4) existing OpenRouter conventions elsewhere in this repository to stay consistent with.

## Summary

`AAI/Tools/Inference.ts` (255 lines) is the framework's designated single AI-calling gateway — `AAI/AISTEERINGRULES.md:48` states "never import `@anthropic-ai/sdk` directly," and `AAI/TOOLS.md`/`AAI/THEHOOKSYSTEM.md` document it as the canonical path. Today it does exactly one thing: it spawns the local `claude` CLI subprocess (`spawn('claude', args, ...)` at `Inference.ts:91`) with `--model haiku|sonnet|opus` per a `level: 'fast'|'standard'|'smart'` parameter, deliberately stripping `ANTHROPIC_API_KEY` from the child environment (`Inference.ts:72-77`) to force Claude subscription auth rather than API-key billing. It has 11 real consumers across hooks, tools, evals graders, and the ACTIONS runner — all of which pass only `systemPrompt`/`userPrompt`/`level`/`expectJson`/`timeout` and read only `success`/`output`/`parsed`/`error`/`latencyMs`/`level`. There is no provider-selection parameter of any kind today — `Inference.ts` can only ever reach Claude.

The Research skill's `GeminiResearcher` and `GrokResearcher` agent personas (`agents/GeminiResearcher.md`, `agents/GrokResearcher.md`) are pure persona/methodology prose — neither file, nor their loaded context files (`skills/Agents/GeminiResearcherContext.md`, `GrokResearcherContext.md`), name any concrete CLI, curl call, SDK import, or API key. They're spawned via `Task({subagent_type: "GeminiResearcher", ...})`, which launches a **Claude** subagent (running Opus, per the persona's own frontmatter `model: opus`) that merely role-plays "using Google Gemini" / "xAI Grok" — with only `Bash`, `WebFetch`, `WebSearch`, and `mcp__*` tools available, it has no way to actually reach Gemini or Grok, so in practice it falls back to Claude-side WebSearch. `PerplexityResearcher` is the one exception: its persona explicitly points at `skills/Research/Workflows/PerplexityResearch.md`, which has a real, working `fetch()` call to `api.perplexity.ai` (`PerplexityResearch.md:104-140`) — it is gated only on the `PERPLEXITY_API_KEY` env var being unset, exactly matching the reported issue. `GrokResearcher` has *zero* concrete invocation mechanism anywhere in the repo — no `XAI_API_KEY`/`GROK_API_KEY`, no `api.x.ai` reference, at all.

Elsewhere in the framework, real (working) provider integrations do exist, just not wired to the Research skill: a Simon-Willison-style `llm -m gemini-3-pro-preview` CLI is used extensively across `skills/Thinking/BeCreative/`, `skills/Security/`, and `skills/Utilities/Documents/` workflow docs; a direct Google `curl` call with `GEMINI_API_KEY` exists in `skills/Utilities/Parser/Workflows/BatchEntityExtractionGemini3.md`; the `@google/genai` and `openai` npm SDKs are real, installed dependencies used for image generation (`skills/Media/Art/Tools/Generate.ts`) and audio transcription (`AAI/Tools/ExtractTranscript.ts`, `SplitAndTranscribe.ts`) via `GOOGLE_API_KEY`/`OPENAI_API_KEY` — none of these route through `Inference.ts`. One file, `skills/Utilities/AudioEditor/Tools/Analyze.ts`, calls `api.anthropic.com/v1/messages` directly with a raw `ANTHROPIC_API_KEY`, actively bypassing the exact `Inference.ts`-only house rule this task is meant to reinforce.

This repository (LibreChat) already has a complete, first-class OpenRouter integration to stay consistent with: `Providers.OPENROUTER` in `packages/data-provider/src/schemas.ts`, base URL `https://openrouter.ai/api/v1` used consistently in `librechat.yaml`/`librechat.example.yaml`/BAML client files, and OpenRouter's native `vendor/model[:variant]` model-ID scheme (only `openai/*` and `meta-llama/*` examples exist in-repo so far — no `google/gemini-*`, `x-ai/grok-*`, or `perplexity/sonar-*` examples yet). One live inconsistency exists in the API-key env-var name: `OPENROUTER_KEY` (`.env.example`, `librechat.example.yaml`) vs. `OPENROUTER_API_KEY` (`librechat.yaml`, both BAML files). No prior `thoughts/` document discusses `Inference.ts`'s design, OpenRouter, or the Research skill's multi-provider architecture — this is undocumented territory except for one prior seams-audit doc that cites `Inference.ts`'s code in passing.

## Detailed Findings

### 1. `AAI/Tools/Inference.ts` — current implementation and documented contract

- Exports `inference(options: InferenceOptions): Promise<InferenceResult>` ([Inference.ts:65](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts#L65)) plus a CLI entrypoint gated by `import.meta.main` ([Inference.ts:195-254](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts#L195-L254)).
- `InferenceOptions`: `systemPrompt`, `userPrompt`, `level?`, `expectJson?`, `timeout?` ([Inference.ts:38-44](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts#L38-L44)). No provider-selection field exists.
- `InferenceResult`: `success`, `output`, `parsed?`, `error?`, `latencyMs`, `level` ([Inference.ts:46-53](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts#L46-L53)).
- `LEVEL_CONFIG` maps `fast|standard|smart` → `haiku|sonnet|opus` model names + default timeouts (15s/30s/90s) ([Inference.ts:56-60](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts#L56-L60)).
- Implementation: `spawn('claude', ['--print', '--model', config.model, '--tools', '', '--output-format', 'text', '--setting-sources', '', '--system-prompt', options.systemPrompt], { env, ... })` ([Inference.ts:79-94](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts#L79-L94)); the user prompt is piped via stdin to avoid `ARG_MAX` limits ([Inference.ts:96-98](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts#L96-L98)).
- The child environment deliberately deletes `ANTHROPIC_API_KEY` and `CLAUDECODE` before spawning ([Inference.ts:72-77](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts#L72-L77)) — comment: "force subscription auth" and avoid the nested-session guard.
- Documented contract lives in three places, and is byte-for-byte consistent with the actual interfaces:
  - `AAI/AISTEERINGRULES.md:48` — universal, force-loaded rule: *"AAI Inference Tool for AI calls. Use `bun Tools/Inference.ts fast\|standard\|smart`, never import `@anthropic-ai/sdk` directly."*
  - `AAI/TOOLS.md:11-71` — full CLI + programmatic usage docs, run-level table, "Technical Details: Uses Claude CLI with subscription (not API key)."
  - `AAI/THEHOOKSYSTEM.md:150-171, 1137-1140, 1208-1247` — per-hook usage notes and a shared-library reference block; its "Used by" list (`THEHOOKSYSTEM.md:1247`) is stale — it names only 3 of the tool's 11 actual consumers.
  - One documentation inconsistency: `THEHOOKSYSTEM.md:170` and `hooks/handlers/DocCrossRefIntegrity.ts:7,21-23,548-549` both claim `level: 'fast'` where the actual call sites use `level: 'standard'` — pre-existing drift, unrelated to this task.
- No test file exists for `Inference.ts` (`find . -iname "*inference*test*"` → no results).

### 2. Consumers of `Inference.ts` — the contract that must not break

11 real consumers found (8 static imports, 1 dynamic `import()`, 1 subprocess spawn of the CLI):

| Consumer | Import/spawn site | Options passed | Result fields read | Level |
|---|---|---|---|---|
| `hooks/UpdateTabTitle.hook.ts` | [:31](apps/cosmic-agent-core/v4.2.0/.claude/hooks/UpdateTabTitle.hook.ts#L31) | systemPrompt, userPrompt, timeout, level | success, output | fast |
| `hooks/SessionAutoName.hook.ts` | [:41](apps/cosmic-agent-core/v4.2.0/.claude/hooks/SessionAutoName.hook.ts#L41) | systemPrompt, userPrompt, level, timeout | success, output | standard (run in a detached background subprocess — [SessionAutoName.hook.ts:485-493](apps/cosmic-agent-core/v4.2.0/.claude/hooks/SessionAutoName.hook.ts#L485-L493) — because "Inference spawns a claude subprocess (5-15s) — blocks prompt processing") |
| `hooks/RatingCapture.hook.ts` | [:33](apps/cosmic-agent-core/v4.2.0/.claude/hooks/RatingCapture.hook.ts#L33) | systemPrompt, userPrompt, expectJson, timeout, level | success, parsed | fast |
| `hooks/handlers/DocCrossRefIntegrity.ts` | [:39](apps/cosmic-agent-core/v4.2.0/.claude/hooks/handlers/DocCrossRefIntegrity.ts#L39) | systemPrompt, userPrompt, level, expectJson, timeout | success, error, parsed | standard |
| `AAI/Tools/FailureCapture.ts` | [:30](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/FailureCapture.ts#L30) | systemPrompt, userPrompt, level, timeout | success, output | fast |
| `AAI/Tools/IntegrityMaintenance.ts` | [:24](apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/IntegrityMaintenance.ts#L24) | systemPrompt, userPrompt, level, expectJson, timeout | success, error, parsed, output (fallback) | fast |
| `skills/Utilities/Evals/Graders/ModelBased/LLMRubric.ts` | [:8](apps/cosmic-agent-core/v4.2.0/.claude/skills/Utilities/Evals/Graders/ModelBased/LLMRubric.ts#L8) | systemPrompt, userPrompt, level, timeout | success, output | mapped from `judge_model`, default standard |
| `skills/Utilities/Evals/Graders/ModelBased/NaturalLanguageAssert.ts` | [:8](apps/cosmic-agent-core/v4.2.0/.claude/skills/Utilities/Evals/Graders/ModelBased/NaturalLanguageAssert.ts#L8) | same shape | success, output | same map, default standard |
| `skills/Utilities/Evals/Graders/ModelBased/PairwiseComparison.ts` | [:8](apps/cosmic-agent-core/v4.2.0/.claude/skills/Utilities/Evals/Graders/ModelBased/PairwiseComparison.ts#L8) | same shape (called twice, for bias cancellation) | success, output | same map, default standard |
| `AAI/ACTIONS/lib/runner.v2.ts` | dynamic `import()` [:33-35](apps/cosmic-agent-core/v4.2.0/.claude/AAI/ACTIONS/lib/runner.v2.ts#L33-L35) | userPrompt, systemPrompt, level, expectJson, **maxTokens** | success, output, parsed, **usage** | fast default |
| `skills/LifeOS/DashboardTemplate/App/api/chat/route.ts` | subprocess spawn [:33](apps/cosmic-agent-core/v4.2.0/.claude/skills/LifeOS/DashboardTemplate/App/api/chat/route.ts#L33) (`spawn('bun', ['run', '.../Inference.ts', '--level', 'fast', systemPrompt, message])`) | CLI flags, not TS options | raw stdout/stderr/exit code | fast (hardcoded) |

**Pre-existing contract mismatch** (unrelated to this task, but relevant to preserving backward compatibility): `AAI/ACTIONS/lib/runner.v2.ts:46` forwards a `maxTokens` field and `runner.v2.ts:56` reads a `result.usage` field — neither exists on `InferenceOptions`/`InferenceResult` today. Because the module is loaded via untyped dynamic `import()` ([runner.v2.ts:33-36](apps/cosmic-agent-core/v4.2.0/.claude/AAI/ACTIONS/lib/runner.v2.ts#L33-L36)), this isn't caught by the type checker; at runtime `maxTokens` is silently ignored and `result.usage` is always `undefined`. The consumer's own declared shape lives in `AAI/ACTIONS/lib/types.v2.ts:58-73` (`LLMOptions.maxTokens`, `LLMResponse.usage: { input, output }`).

### 3. The Research skill's provider roster — where each "researcher" actually points

The Research skill (`skills/Research/SKILL.md`) routes user requests to workflow docs (`Workflows/QuickResearch.md`, `StandardResearch.md`, `ExtensiveResearch.md`, `DeepInvestigation.md`) that spawn researcher personas via `Task({subagent_type: "<X>Researcher", ...})` — e.g. [StandardResearch.md:34-45](apps/cosmic-agent-core/v4.2.0/.claude/skills/Research/Workflows/StandardResearch.md#L34-L45), [ExtensiveResearch.md:40-55](apps/cosmic-agent-core/v4.2.0/.claude/skills/Research/Workflows/ExtensiveResearch.md#L40-L55). Each `subagent_type` resolves to a persona file in `agents/*.md` with its own frontmatter `model: opus` — meaning **every one of these "researchers" is actually a Claude Opus subagent wearing a persona**, per the general delegation mechanism documented in `AAI/THEDELEGATIONSYSTEM.md:36-45` (`Task({..., model: "opus"})` spawns a Claude-model subagent; the `model` field always names a Claude tier, never a foreign provider).

| Persona | Agent file | Context file | Concrete invocation mechanism named? |
|---|---|---|---|
| `ClaudeResearcher` | `agents/ClaudeResearcher.md` | `skills/Agents/ClaudeResearcherContext.md` | Yes — Claude's own `WebSearch` tool (native, no key needed). Working as designed. |
| `PerplexityResearcher` | `agents/PerplexityResearcher.md` (`:143,168-177`) | `skills/Agents/PerplexityResearcherContext.md` (`:71-84`) | Yes — explicitly names `skills/Research/Workflows/PerplexityResearch.md` as "PRIMARY research tool." That file has a real `fetch()` call (see §4) gated only on an unset `PERPLEXITY_API_KEY`. |
| `GeminiResearcher` | `agents/GeminiResearcher.md` (`:168`) | `skills/Agents/GeminiResearcherContext.md` (`:72`) | **No.** Only prose: "Google Gemini Multi-Perspective Research" methodology. No CLI, curl, SDK, or API key referenced anywhere in either file. Tools available to the persona are `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `mcp__*` ([GeminiResearcher.md:18-29](apps/cosmic-agent-core/v4.2.0/.claude/agents/GeminiResearcher.md#L18-L29)) — none of which reach Gemini specifically, so the subagent can only fall back to Claude-side `WebSearch`. |
| `GrokResearcher` | `agents/GrokResearcher.md` (`:174`) | `skills/Agents/GrokResearcherContext.md` (`:72`) | **No.** Same pattern — prose-only "xAI Grok Social Media Research" methodology. `XAI_API_KEY`/`GROK_API_KEY`/`api.x.ai` — zero matches anywhere in the `.claude` tree. This persona has no working backing mechanism at all in this codebase. |
| `CodexResearcher` | `agents/CodexResearcher.md` (`:180,183-185`) | `skills/Agents/CodexResearcherContext.md` (`:63,76-84`) | Yes — `codex exec --sandbox danger-full-access --model o3\|gpt-5-codex\|gpt-4 "..."`. A real CLI command, no other call sites found. Not mentioned in the reported issue text (which named gemini/grok/perplexity/llm specifically), so its runtime availability is unverified by this research. |

`GeminiResearcher`/`GrokResearcher`/`PerplexityResearcher` are also reused as sub-agents outside the Research skill itself — in `skills/Investigation/OSINT/Workflows/*.md` (PeopleLookup, CompanyDueDiligence, DomainLookup, OrganizationLookup, CompanyLookup, EntityLookup, DiscoverOSINTSources, Methodology), and `PerplexityResearcher` specifically fills the "Researcher" seat in the Council skill's debate system (`skills/Thinking/Council/CouncilMembers.md:31`, `Workflows/Debate.md:196`). Fixing the provider-routing gap in `Inference.ts` would therefore also fix these downstream call sites without further changes, since they all go through the same `Task(subagent_type: "...Researcher")` → persona → (today, nothing) chain.

### 4. Other skills/tools calling external LLM providers directly (bypassing `Inference.ts`)

**Gemini — real mechanisms exist, but not wired to the Research skill:**
- `llm -m gemini-3-pro-preview "..."` (Simon Willison's `llm` CLI) used extensively in [skills/Thinking/BeCreative/Workflows/TechnicalCreativityGemini3.md](apps/cosmic-agent-core/v4.2.0/.claude/skills/Thinking/BeCreative/Workflows/TechnicalCreativityGemini3.md) (11 call sites), [skills/Security/WebAssessment/Workflows/VulnerabilityAnalysisGemini3.md](apps/cosmic-agent-core/v4.2.0/.claude/skills/Security/WebAssessment/Workflows/VulnerabilityAnalysisGemini3.md) (12 sites), [skills/Security/Recon/Workflows/AnalyzeScanResultsGemini3.md](apps/cosmic-agent-core/v4.2.0/.claude/skills/Security/Recon/Workflows/AnalyzeScanResultsGemini3.md) (11 sites, one invoked from inside a Bun `` $`llm ...` `` shell template at `:967`, and one sibling call at `:1069` dispatching to `claude-sonnet-4.5` via the same `llm` CLI — confirming it's a general multi-model dispatcher), [skills/Utilities/Documents/Workflows/ProcessLargePdfGemini3.md](apps/cosmic-agent-core/v4.2.0/.claude/skills/Utilities/Documents/Workflows/ProcessLargePdfGemini3.md) (9 sites), and [skills/Utilities/Parser/Workflows/BatchEntityExtractionGemini3.md:244,637](apps/cosmic-agent-core/v4.2.0/.claude/skills/Utilities/Parser/Workflows/BatchEntityExtractionGemini3.md#L244). Per the reported issue text ("no ... llm CLI exists"), this binary is not actually present in the verified runtime environment, despite being referenced across five skill directories.
- Direct Google curl: `skills/Utilities/Parser/Workflows/BatchEntityExtractionGemini3.md:247-249` — `curl https://generativelanguage.googleapis.com/v1/models/gemini-3-pro:generateContent -H "x-goog-api-key: $GEMINI_API_KEY"`.
- Real, working, installed-dependency SDK usage for **image generation** (not text inference): `skills/Media/Art/Tools/Generate.ts:17` (`import { GoogleGenAI } from "@google/genai"`), using `GOOGLE_API_KEY` (`:611-613`) and model `gemini-3-pro-image-preview` (`:650`); `@google/genai` is a real dependency in `skills/Media/Art/Tools/package.json:11`.
- Broken/stub: `skills/Utilities/Parser/Lib/parser.ts:88-90,173-183` — `analyzeWithGemini()` is a literal no-op stub (`console.log('[Placeholder: would analyze with Gemini]')`); `skills/Utilities/Parser/README.md:220` has an open TODO ("Implement actual Gemini integration") confirming this.
- Broken/aspirational: `skills/Utilities/Evals/Workflows/CompareModels.md` references `gemini-1.5-pro`/`gpt-4o` via `EvalServer/cli-run.ts`, which does not exist anywhere in the repo.

**Grok/xAI:** No concrete mechanism anywhere in the repo, in any form — CLI, curl, SDK, or env var. `GrokResearcher.md`/`GrokResearcherContext.md` are the only references, and both are prose-only.

**Perplexity:** One real mechanism — `skills/Research/Workflows/PerplexityResearch.md:43-140` (`fetch()` to `api.perplexity.ai`, gated by `PERPLEXITY_API_KEY`). No other call sites found; all other Perplexity references are `Task(subagent_type: "PerplexityResearcher")` spawns that route through this one file.

**OpenAI (non-Codex) — real, installed, bypasses `Inference.ts`:**
- `AAI/Tools/ExtractTranscript.ts:18,175,177,233-246` and `AAI/Tools/SplitAndTranscribe.ts:12,96-98,116,175-180` — `import OpenAI from "openai"`, Whisper transcription (`openai.audio.transcriptions.create({model: "whisper-1"})`), require `OPENAI_API_KEY`.
- `skills/Media/Art/Tools/Generate.ts:16,271,577-586` — `openai.images.generate({...})` for `gpt-image-1`, requires `OPENAI_API_KEY`. `openai` is a real dependency (`skills/Media/Art/Tools/package.json:12`, `"^6.18.0"`).
- These are audio-transcription and image-generation calls, not text chat completion — a different shape than what `Inference.ts`'s `systemPrompt`/`userPrompt` → text contract naturally supports (see Open Questions).

**Direct Anthropic API bypass (violates the existing "always go through `Inference.ts`" house rule):**
- `skills/Utilities/AudioEditor/Tools/Analyze.ts:82-86,236-254` — direct `fetch("https://api.anthropic.com/v1/messages", {headers: {"x-api-key": apiKey, "anthropic-version": "2023-06-01"}, body: {model: "claude-sonnet-4-20250514", ...}})` using a raw `ANTHROPIC_API_KEY`. This is a real, working call that fully bypasses both `Inference.ts` and the subscription-auth design it deliberately enforces (`Inference.ts:72,76` explicitly deletes `ANTHROPIC_API_KEY` from the child env "to force subscription auth"). It directly contradicts `AAI/AISTEERINGRULES.md:48`.
- `hooks/handlers/UpdateCounts.ts:191,205-211` and `statusline-command.sh:345-353` also call `api.anthropic.com` directly, but for usage/cost telemetry (reusing the subscription's own OAuth token, or a separate `ANTHROPIC_ADMIN_API_KEY`) — not content-generation inference, a different category from the above.
- `AAI/ACTIONS.md`/`AAI/ACTIONS/README.md` document a separate deployed Cloudflare Workers system (`createCloudflareAnthropicLLM(env.ANTHROPIC_API_KEY)`) using a raw API key — but its implementation files (`shared/anthropic.ts`, `action-worker.ts`) do not exist anywhere in this checkout; it's architecture documentation for an external system, not code present here.

**Ruled out (checked, no AI-provider call found):** `skills/Utilities/PAIUpgrade/Tools/Anthropic.ts` (rule-based recommendation logic despite the filename), `skills/Utilities/Fabric/**` (only incidental prose mentions of "grok"/"Gemini" as plain English or illustrative Fabric-pattern text), `skills/ContentAnalysis/**`, `AAI/ACTIONS/*/action.ts` (all concrete action files), and the rest of `hooks/**`.

### 5. Existing OpenRouter conventions elsewhere in this repository

LibreChat (this repo, outside `apps/cosmic-agent-core/`) already has a complete, first-class OpenRouter integration:

- **Provider enum & schema**: `Providers.OPENROUTER = 'openrouter'` ([packages/data-provider/src/schemas.ts:42](packages/data-provider/src/schemas.ts#L42), also `:54,340`), with a dedicated `openRouterSchema` (`:1459-1462`) that extends the base OpenAI-compatible schema with `promptCache`/`promptCacheTtl` fields other custom providers don't get.
- **Base URL**: consistently `https://openrouter.ai/api/v1` — `librechat.yaml:8`, `librechat.example.yaml:668`, `baml_src/ns_host/turn.baml:49`, `packages/api/baml_src/ns_host/clients.baml:53` (via `BAML_OPENROUTER_BASE_URL`).
- **API-key env var — inconsistent in-repo**: `OPENROUTER_KEY` (`.env.example:298`, `librechat.example.yaml:667`) vs. `OPENROUTER_API_KEY` (`librechat.yaml:7`, `baml_src/ns_host/turn.baml:48`, `packages/api/baml_src/ns_host/clients.baml:52`).
- **Model-ID scheme**: OpenRouter's native `vendor/model[:variant]` form — `'openai/gpt-oss-20b:free'` (`librechat.yaml:11,14`), `'meta-llama/llama-3-70b-instruct'` (`librechat.example.yaml:672,675`), `"openai/gpt-oss-120b"`/`"openai/gpt-oss-20b"` (BAML files). No `google/gemini-*`, `x-ai/grok-*`, or `perplexity/sonar-*` model IDs exist anywhere in this repo yet — those would be new territory. `baml_src/ns_host/turn.baml:41` has an explicit comment warning not to use `"openrouter/free"` as a model id (it's a router alias, not a real model).
- **Backend integration beyond YAML**: `packages/data-provider/src/parameterSettings.ts:1176,1225-1227` (param-settings/columns), `packages/data-provider/src/parsers.ts:2382,2392` (`KnownEndpoints.openrouter`, included in model-list auto-fetch), `packages/api/src/endpoints/config/providers.ts:26,45,63-64,218-233` (`isKnownCustomProvider()`, case-insensitive name normalization), `api/server/services/Config/loadCustomConfig.js:23-63` (`OPENROUTER_PROMPT_CACHE_DEFAULT`, `includesOpenRouter()` helper).
- **No reusable TS/JS client wrapper** exists outside the BAML DSL's declarative `client OpenRouter { provider openai; base_url ...; api_key ... }` blocks.

### 6. API-key / environment-variable conventions used elsewhere in AAI

Other AAI tools that need external API keys document them the same way — a single line in `AAI/TOOLS.md` plus a value in `${AAI_DIR}/.env`, e.g. `RemoveBg.ts`: *"Environment Variables: `REMOVEBG_API_KEY` - Required for background removal (from `${AAI_DIR}/.env`)"* ([AAI/TOOLS.md:91-92](apps/cosmic-agent-core/v4.2.0/.claude/AAI/TOOLS.md#L91-L92)). This is the established local pattern a new `OPENROUTER_API_KEY` (or similar) would follow within the AAI tree, separate from this outer repo's own `.env`/`librechat.yaml` conventions documented in §5.

## Code References

- `apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/Inference.ts:36-254` — the tool itself: types, `LEVEL_CONFIG`, `inference()`, CLI entrypoint
- `apps/cosmic-agent-core/v4.2.0/.claude/AAI/AISTEERINGRULES.md:48` — "never import `@anthropic-ai/sdk` directly" house rule
- `apps/cosmic-agent-core/v4.2.0/.claude/AAI/TOOLS.md:11-71` — documented CLI + programmatic contract
- `apps/cosmic-agent-core/v4.2.0/.claude/AAI/THEHOOKSYSTEM.md:150-171,1137-1140,1208-1247` — per-hook usage + shared-library reference
- `apps/cosmic-agent-core/v4.2.0/.claude/AAI/THEDELEGATIONSYSTEM.md:36-45,100` — confirms `Task(subagent_type, model)` always spawns a Claude-model subagent; "For research specifically: use the Research skill, which has dedicated researcher agents (ClaudeResearcher, GeminiResearcher, etc.)"
- `apps/cosmic-agent-core/v4.2.0/.claude/agents/GeminiResearcher.md`, `GrokResearcher.md`, `PerplexityResearcher.md`, `ClaudeResearcher.md`, `CodexResearcher.md` — the five researcher personas
- `apps/cosmic-agent-core/v4.2.0/.claude/skills/Agents/GeminiResearcherContext.md`, `GrokResearcherContext.md`, `PerplexityResearcherContext.md` — loaded context files
- `apps/cosmic-agent-core/v4.2.0/.claude/skills/Research/SKILL.md`, `Workflows/QuickResearch.md`, `StandardResearch.md`, `ExtensiveResearch.md`, `DeepInvestigation.md` — routing + `Task()` spawn sites
- `apps/cosmic-agent-core/v4.2.0/.claude/skills/Research/Workflows/PerplexityResearch.md:43-140` — the one real, working provider `fetch()` call
- `apps/cosmic-agent-core/v4.2.0/.claude/skills/Thinking/BeCreative/Workflows/TechnicalCreativityGemini3.md` — `llm -m gemini-3-pro-preview` CLI usage pattern (11 sites)
- `apps/cosmic-agent-core/v4.2.0/.claude/skills/Utilities/Parser/Workflows/BatchEntityExtractionGemini3.md:244-249,637` — `llm` CLI + direct Google curl
- `apps/cosmic-agent-core/v4.2.0/.claude/skills/Utilities/Parser/Lib/parser.ts:88-90,173-183` — stubbed `analyzeWithGemini()`
- `apps/cosmic-agent-core/v4.2.0/.claude/skills/Media/Art/Tools/Generate.ts:16-17,271,577-586,611-613,650` — real `@google/genai` + `openai` SDK usage for image generation
- `apps/cosmic-agent-core/v4.2.0/.claude/AAI/Tools/ExtractTranscript.ts:18,175,177,233-246`, `SplitAndTranscribe.ts:12,96-98,116,175-180` — real `openai` SDK usage for Whisper transcription
- `apps/cosmic-agent-core/v4.2.0/.claude/skills/Utilities/AudioEditor/Tools/Analyze.ts:82-86,236-254` — direct `api.anthropic.com` bypass
- `apps/cosmic-agent-core/v4.2.0/.claude/AAI/ACTIONS/lib/runner.v2.ts:32-56`, `AAI/ACTIONS/lib/types.v2.ts:58-73` — `maxTokens`/`usage` contract mismatch
- `librechat.yaml:5-45`, `librechat.example.yaml:544-569,663-678` — this repo's live OpenRouter (and BAML/OpenRouter) endpoint config
- `packages/data-provider/src/schemas.ts:42,54,340,1459-1462` — `Providers.OPENROUTER` + `openRouterSchema`
- `packages/api/src/endpoints/config/providers.ts:26,45,63-64,218-233` — OpenRouter custom-provider recognition
- `api/server/services/Config/loadCustomConfig.js:23-63` — `includesOpenRouter()`, prompt-cache defaulting
- `.env.example:298` — `OPENROUTER_KEY`

## Architecture Documentation

- **Skills-as-Containers**: skills are self-contained directories with `SKILL.md` routing to a `Workflows/` subdirectory (`skills/Research/MigrationNotes.md:115-121` documents this pattern explicitly, including the 2025-10-31 migration that produced today's `Workflows/` layout).
- **Persona-over-subagent model**: `Task(subagent_type: "<Name>", model: "haiku"|"sonnet"|"opus")` is the only spawning primitive (`AAI/THEDELEGATIONSYSTEM.md:36-45`); every "researcher" is a Claude subagent loaded with a persona file (`agents/*.md`) and a context file (`skills/Agents/*Context.md`). The persona's frontmatter `model:` field selects which Claude tier runs it — it never selects a non-Claude provider. Reaching an actual third-party provider requires the persona to execute a concrete tool call (Bash CLI, WebFetch/curl, or an SDK import) — prose describing "using Gemini" in the persona/context file has no effect unless backed by such a call.
- **`Inference.ts` as the sole sanctioned AI-calling gateway**: stated as a universal, force-loaded steering rule (`AAI/AISTEERINGRULES.md:48`), but enforcement is doc-only — nothing prevents a skill from importing a provider SDK directly, and at least one file (`skills/Utilities/AudioEditor/Tools/Analyze.ts`) does so for Claude itself, and several others (`ExtractTranscript.ts`, `SplitAndTranscribe.ts`, `Generate.ts`, the Gemini `llm`/curl workflows) do so for other providers.
- **API-key convention**: single-purpose external-API tools document their required env var in `AAI/TOOLS.md` and expect it in `${AAI_DIR}/.env` (e.g. `REMOVEBG_API_KEY` for `RemoveBg.ts`).

## Workflow Closure Map

**Behavior mapped**: a user's research request reaches the `PerplexityResearcher` persona and produces a citation-backed answer — the one Research-skill provider path with an end-to-end, resolvable production chain today. (`GeminiResearcher`/`GrokResearcher` are documented as a structural negative-evidence finding alongside this map, not mapped as a JSON chain, because no resolvable driver symbol exists for either — see below.)

**Chain** (current state, as verified by direct Read of every node):

1. **Entrypoint / seed point** — `skills/Research/Workflows/PerplexityResearch.md:47-53`: `const apiKey = process.env.PERPLEXITY_API_KEY; if (!apiKey) { console.error(...); process.exit(2); }`. This is also how the script documents its own standalone invocation (`PerplexityResearch.md:9-12`: `bun ${SAI_DIR}/skills/Research/Workflows/PerplexityResearch.md "your research question"`), and it's the node the requested Inference.ts/OpenRouter change would touch (`adds_or_changes: true`).
2. **Provider call** — `sonarSearch()`, `skills/Research/Workflows/PerplexityResearch.md:104-140`: `fetch('https://api.perplexity.ai/chat/completions', {headers: {Authorization: 'Bearer ' + apiKey}, body: {model: 'sonar-pro', messages: [...], return_citations: true}})`. This fetch call is the concrete site a future OpenRouter-routed call would replace (`adds_or_changes: true`).
3. **Observable** — `skills/Research/Workflows/PerplexityResearch.md:158-187`: per-query `console.log(r.content)` + aggregated, deduped citation list printed to stdout. There is no persisted store; the "read" is the script's captured stdout (a stateless CLI, not a queryable API).

All three edges are synchronous within a single script execution (no queue/scheduler/outbox involved) — `is_async: false` throughout.

**Upstream production registration** (documented but not included as JSON nodes, because it is LLM-orchestrated and not mechanically drivable by a deterministic test harness): `skills/Research/SKILL.md` routes a user's "research"/"do research" phrase → `Workflows/{Quick,Standard,Extensive}Research.md` → `Task({subagent_type: "PerplexityResearcher", ...})` ([StandardResearch.md:40-44](apps/cosmic-agent-core/v4.2.0/.claude/skills/Research/Workflows/StandardResearch.md#L40-L44)) → `agents/PerplexityResearcher.md:170-171` names `PerplexityResearch.md` as its "PRIMARY research tool" → the deterministic chain above begins.

**Negative evidence (Gemini/Grok — production-called but unmounted)**:
- `Task(subagent_type: "GeminiResearcher"/"GrokResearcher")` call sites are real and production-registered (`StandardResearch.md:41,42`, `ExtensiveResearch.md:47-49,52-54`, multiple OSINT workflow files) — the **entrypoint half** of the chain exists.
- The **provider-call half** does not: `grep` for `XAI_API_KEY`, `GROK_API_KEY`, `api.x.ai`, or any Gemini-reaching call inside `agents/GeminiResearcher.md`/`GrokResearcher.md` or their context files returns nothing. No driver function resolves. Verdict: **not found** — the edge from "persona dispatch" to "provider call" is structurally absent for both personas, consistent with the reported "FALSIFIED" verdict.
- No test of any kind exercises the Perplexity, Gemini, or Grok researcher paths (`find . -iname "*inference*test*"`, `*PerplexityResearch*test*"` → no results).

### ClosureMap (structured — derive() input)

```json
{
  "behavior": "A Research-skill request answered via PerplexityResearcher returns a citation-backed result to the user",
  "git_commit": "9d23b2fd703d2c6352e31f5974e0e692590371cd",
  "repo": "/home/maceo/Dev/silmari-chat",
  "nodes": [
    { "id": "perplexity_key_gate", "module": "skills/Research/Workflows/PerplexityResearch.md:47-53", "is_entrypoint": true, "adds_or_changes": true, "read_path": null, "seedable_store": "process.env.PERPLEXITY_API_KEY" },
    { "id": "sonar_search_fetch", "module": "skills/Research/Workflows/PerplexityResearch.md:104-140 (sonarSearch())", "is_entrypoint": false, "adds_or_changes": true, "read_path": null, "seedable_store": null },
    { "id": "aggregate_stdout_output", "module": "skills/Research/Workflows/PerplexityResearch.md:158-187", "is_entrypoint": false, "adds_or_changes": false, "read_path": "captured stdout of the script (console.log of per-query content + aggregated citations)", "seedable_store": null }
  ],
  "edges": [
    { "is_async": false, "cross_boundary": true, "driver": null },
    { "is_async": false, "cross_boundary": true, "driver": null }
  ]
}
```

`highest_new_connector`: `perplexity_key_gate` (the topmost node this task would touch — it's both the production entrypoint for standalone script execution and the first place OpenRouter routing would need to be introduced).

### Closure adapter (staged proposal — `2026-08-16-10-17-cosmic-agent-core-inference-openrouter-provider-routing.closure-adapter.py`)

```python
"""Closure adapter (STAGED PROPOSAL — not wired into the repo).
Derived from the ClosureMap for: PerplexityResearcher request -> citation-backed result.
Pin: 9d23b2fd703d2c6352e31f5974e0e692590371cd.
Promote into /home/maceo/Dev/silmari-chat and complete each TODO(promote) before use.
Speaks the 7-op contract apps/closure-oracle already talks to (mock_adapter.py).
"""
import http.server, json, sys
ASYNC_EDGES = []                                   # this chain has no queue/scheduler edges
CONNECTOR = {}
SINK = []                                           # Phase-0 /seed_sink target (aggregate stdout)

def handle(op, p):
    if op == "/reset":        SINK.clear(); return {"ok": True}
    if op == "/set_connector": CONNECTOR[p["edge"]] = p["enabled"]; return {"ok": True}
    if op == "/seed_sink":     SINK.append(p["value"]); return {"ok": True}
    if op == "/seed":
        # TODO(promote): set process.env.PERPLEXITY_API_KEY = p["data"]
        #                (skills/Research/Workflows/PerplexityResearch.md:47)
        return {"ok": True}
    if op == "/trigger":
        # TODO(promote): run `bun skills/Research/Workflows/PerplexityResearch.md p["args"]["question"]`
        #                as a subprocess and capture stdout into SINK
        #                (skills/Research/Workflows/PerplexityResearch.md:9-12, 146-192)
        return {"ok": True}
    if op == "/drive":
        return {"ok": True}                          # no async edges to drive
    if op == "/observe":
        # TODO(promote): return the captured subprocess stdout from /trigger
        #                (skills/Research/Workflows/PerplexityResearch.md:158-187)
        return {"ok": True, "value": json.dumps(SINK)}
    return {"ok": False, "error": "unknown op"}

class Hn(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        out = json.dumps(handle(self.path, json.loads(self.rfile.read(n) or "{}"))).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Hn).serve_forever()
```

No equivalent adapter is staged for Gemini/Grok — there is no resolvable trigger or observe symbol to name (the map would be a single unmounted entrypoint node with no downstream edge, i.e. no trigger→observe seam).

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-08-14-18-33-cosmic-agent-core-aai-algorithm-skills-hooks-cli-seams.md` — the only prior document that mentions `Inference.ts` by name. It's a broader "AAI package seams" audit (Algorithm v3.7.0, skills/, AAI/Tools/, hooks, CLI-First entry points) that cites `Inference.ts`'s `inference()` signature, `LEVEL_CONFIG`, the `spawn('claude', ...)` shellout, and the `ANTHROPIC_API_KEY`/`CLAUDECODE` env stripping as code references within that larger survey — it does not discuss provider routing or OpenRouter.
- `thoughts/shared/research/2026-08-13-10-00-cosmic-agent-core-aai-integration-seams.md` and `2026-08-15-22-10-shipping-aai-agent-infrastructure-with-claude-agent-sdk-provider.md` — adjacent AAI-integration research; neither touches `Inference.ts`, the Research skill, or LLM routing.
- `thoughts/shared/handoffs/general/2026-08-16_07-53-54_vultr-deploy-complete-clerk-auth-next.md` — confirms the full AAI `.claude` framework (22 hooks, 17 skills) is baked into the Docker image used by the Claude Agent SDK provider; also flags an unrotated API-key leak (unrelated to this task, noted here only because it turned up in the same search).
- **No document anywhere in `thoughts/`** discusses OpenRouter integration plans, the Research skill's Gemini/Grok/Perplexity/Codex sub-researcher architecture, or a prior "falsified" finding about these sub-researchers — this is undocumented territory.

## Related Research

- `thoughts/shared/research/2026-08-14-18-33-cosmic-agent-core-aai-algorithm-skills-hooks-cli-seams.md`

## Open Questions

- **Env var naming**: this repo already has a live inconsistency between `OPENROUTER_KEY` and `OPENROUTER_API_KEY` for the outer LibreChat OpenRouter integration (§5). A new `Inference.ts` OpenRouter path will need to pick one — worth deciding whether to match the app-level convention or follow AAI's own `${AAI_DIR}/.env` + `TOOLS.md`-documented single-var pattern (§6), since they're separate config surfaces today.
- **Scope of "various skills which call other LLM providers"**: does this include the non-text-completion integrations found here — Whisper audio transcription (`ExtractTranscript.ts`, `SplitAndTranscribe.ts`) and image generation (`Generate.ts`)? `Inference.ts`'s current contract is strictly `systemPrompt`/`userPrompt` → text, which doesn't naturally cover audio-in or image-out calls.
- **`CodexResearcher`**: the reported issue names gemini/grok/perplexity/llm specifically, not `codex`. Whether the `codex` CLI is actually present in the target runtime (and thus whether `CodexResearcher` needs the same fix) is unverified by this research.
- **Direct-Anthropic-API bypass**: `skills/Utilities/AudioEditor/Tools/Analyze.ts` calls `api.anthropic.com` directly with a raw `ANTHROPIC_API_KEY`, contradicting the same house rule this task reinforces. Whether that file is in scope for this change or a separate follow-up is unresolved.
- **Pre-existing `maxTokens`/`usage` contract gap** in `AAI/ACTIONS/lib/runner.v2.ts` (§2): unrelated to OpenRouter, but any interface change to `InferenceOptions`/`InferenceResult` is a natural point to decide whether to also close this gap.
- No open beads issue currently references `Inference.ts`, OpenRouter, or the Research skill's provider routing (`bd list --status=open` was checked; the two `inference`-adjacent issues, `AF-1f56` and `AF-enki`, are about `Providers.CLAUDE_AGENT_SDK` in the main LibreChat app — a different "inference" concept entirely, unrelated to AAI's `Inference.ts` tool).

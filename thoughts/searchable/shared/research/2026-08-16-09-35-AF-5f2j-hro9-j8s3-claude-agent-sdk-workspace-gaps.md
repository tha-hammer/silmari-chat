---
date: 2026-08-16T09:35:57-04:00
researcher: tha-hammer
git_commit: 31460c975fce7ded9f1de4aeb8c74022a6796391
branch: main
repository: silmari-chat
topic: "AF-5f2j / AF-hro9 / AF-j8s3 — Claude Agent SDK multi-tenant AAI seeding, Bash path-extractor export, and production-wiring integration test"
tags: [research, codebase, claude-agent-sdk, multi-tenant, workspace-policy-hook, aai, silmari-chat-agents]
status: complete
last_updated: 2026-08-16
last_updated_by: tha-hammer
---

# Research: AF-5f2j / AF-hro9 / AF-j8s3 — Claude Agent SDK workspace/multi-tenant gaps

**Date**: 2026-08-16T09:35:57-04:00
**Researcher**: tha-hammer
**Git Commit**: 31460c975fce7ded9f1de4aeb8c74022a6796391 (silmari-chat)
**Branch**: main
**Repository**: silmari-chat

> **Two-repo scope note.** All three beads center on `ChatClaudeAgentSDK` and its
> hook system, whose source lives in a sibling repository, **not** this one:
> `/home/maceo/Dev/silmari-chat-agents` (git remote `tha-hammer/silmari-chat-agents`,
> pulled into this repo as the `@librechat/agents` npm dependency, pinned in
> `packages/api/package.json` at commit `0713b9a1badf947d5216e0cb3850b7eba00f3ea1`).
> `silmari-chat` (this repo) is the **consumer**: it wires that library's hooks
> into `packages/api/src/endpoints/custom/initialize.ts` and `packages/api/src/agents/*`.
>
> **Live-edit caveat.** At research time, `silmari-chat-agents`'s working tree had
> six modified/untracked files directly relevant to these three beads (`git status`
> confirmed `M src/hooks/{index,createWorkspacePolicyHook}.ts`,
> `M src/llm/claudeAgentSdk/{ChatClaudeAgentSDK,types}.ts`, plus two new test files
> and the design/review docs cited below) — i.e. **AF-5f2j and part of AF-hro9 were
> being actively implemented, uncommitted, while this research ran.** Re-reads of
> the same files during this pass returned different content moments apart. Every
> finding below reflects the last-observed state of each file (captured via direct
> `Read` after the fan-out, not from the first pass of sub-agent findings, several
> of which were already stale by the time they returned). Because this state is
> **uncommitted** in a repo pulled by commit hash, it will not reproduce from a
> fresh clone at `0713b9a1b` — treat the "current state" sections below as a
> snapshot, not a citation of durable history.

## Research Question
Research the codebase for beads issues AF-5f2j, AF-hro9, and AF-j8s3 (Claude Agent SDK multi-tenant workspace/AAI-seeding, Bash path-extractor export, and production-wiring integration test) to establish what exists today, ahead of `create_tdd_plan`.

## Summary

All three beads trace to one design document —
`silmari-chat-agents/thoughts/searchable/shared/plans/2026-08-16-claude-agent-sdk-multitenant-workspace-design.md`
(and its `-REVIEW.md`) — which answers four questions about the Claude Agent SDK
provider's multi-tenant/workspace posture. **This design doc does not exist
anywhere in the `silmari-chat` repo** (confirmed: not on disk, not in git
history, not untracked) even though the bead descriptions cite it under a
`silmari-chat`-shaped path; it lives in `silmari-chat-agents`'s own
`thoughts/`. This is worth flagging as its own finding, independent of the
three beads' content.

**AF-5f2j** (P1, bug — seed AAI into `multiTenant:true`'s per-tenant config dir,
stop hardcoding `settingSources: []`): the fix is **fully specified** in the
design doc and, as of this research pass, **appears substantially implemented
in `silmari-chat-agents`'s uncommitted working tree** — `ClaudeAgentSDKClientOptions`
now has an `aaiTemplateDir?: string` field, `perTenantConfigDir()` now seeds via
atomic copy-to-temp-then-`renameSync`, and the `query()` call site now sets
`settingSources: ['user', 'project', 'local']` instead of `[]`. However, **no
production code path in either repo currently sets `clientOptions.multiTenant
= true`** — `initializeClaudeAgentSdk()` (the only place `silmari-chat` builds
this provider's `clientOptions`) never includes `multiTenant` in its returned
`llmConfig`. The fix is real but currently unreachable in production; the
deployed system today relies on a *different*, already-safe mechanism (a
single shared `CLAUDE_CONFIG_DIR=/home/node/.claude` baked into the Docker
image at build time, confirmed shipped on `main` via commits `b1c36081b` /
`e1d42f524` / `31460c975`).

**AF-hro9** (P2, task — export `extractCompileCheckPaths` so `silmari-chat`
can gate the Claude Agent SDK's built-in `Bash` tool by path): **half done**.
`silmari-chat-agents`'s `src/hooks/index.ts` now exports
`extractCompileCheckPaths` (uncommitted). But the consumer side —
`CLAUDE_AGENT_SDK_PATH_EXTRACTORS` in `silmari-chat`'s
`packages/api/src/endpoints/custom/initialize.ts` — still has **no `Bash`
key** as of this research pass; a `Bash` tool call from this endpoint is
today gated only by tool-*name* policy (`createToolPolicyHook`), not by path.

**AF-j8s3** (P2, task — integration test proving the composed workspace-policy
hook survives production wiring end-to-end): **not started.** Both existing
test files (`__tests__/initialize.claudeAgentSdk.test.ts`,
`claude-agent-sdk-workspace-hook.spec.ts`) call
`buildClaudeAgentSdkPreToolUseHook` directly with hand-built/mocked
`toolPolicyHook`s; neither invokes `initializeClaudeAgentSdk` or
`initializeCustom`. The production wiring itself (`initializeClaudeAgentSdk`
→ `setAgentRuntimeOptions` → `agents/run.ts`'s `Object.assign(llmConfig,
runtimeOptions)` merge) is real and was independently traced end-to-end in
this research (see Detailed Findings, AF-j8s3) — it is currently confirmed
only by code-reading, not by any automated test.

## Detailed Findings

### AF-5f2j — `multiTenant: true` must seed AAI, not hardcode `settingSources: []`

**The bug as filed.** `ChatClaudeAgentSDK`'s `multiTenant: true` path sets two
things at the `queryFn()` call site
([ChatClaudeAgentSDK.ts:419-421 as cited by the design doc](https://github.com) — file:
`/home/maceo/Dev/silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts`):
`settingSources: []` and an `env` built by `multiTenantEnv()`, which points
`CLAUDE_CONFIG_DIR` at `perTenantConfigDir(resolvedCwd)` — a directory that
was, prior to this session's in-flight work, created **empty**
(`mkdirSync` only, no copy). Per the SDK's own `sdk.d.ts` JSDoc on
`Options.settingSources` (quoted verbatim in the design doc): *"Pass `[]` to
disable filesystem settings (SDK isolation mode). Must include `'project'`
to load CLAUDE.md files."* — so even a correctly-seeded directory would still
fail to load `CLAUDE.md` (and by extension the AAI skills/hooks/agents that
depend on it) under the old `settingSources: []`.

**Current state of the fix (uncommitted, `silmari-chat-agents`).** Direct
reads of the working tree during this research show:

- `ClaudeAgentSDKClientOptions` (`src/llm/claudeAgentSdk/types.ts:41-122`) now
  declares `aaiTemplateDir?: string` (`types.ts:90`), documented (`types.ts:76-89`)
  as "Absolute path to a directory whose contents are copied into a tenant's
  `CLAUDE_CONFIG_DIR` the first time it's created (AF-5f2j) ... Only consulted
  when `multiTenant` is `true`. Default resolution when unset: `/home/node/.claude`
  if that path exists on disk, else `perTenantConfigDir()` throws."
- `resolveAaiTemplateDir(aaiTemplateDir)` (`ChatClaudeAgentSDK.ts:176-190`)
  implements exactly that: explicit `aaiTemplateDir` wins; else
  `DEFAULT_AAI_TEMPLATE_DIR = '/home/node/.claude'` (`ChatClaudeAgentSDK.ts:165`)
  if `existsSync`; else throws a descriptive error naming both remediation
  paths ("Set `clientOptions.aaiTemplateDir` explicitly ... or leave
  `multiTenant` off").
- `perTenantConfigDir(resolvedCwd, aaiTemplateDir)` (`ChatClaudeAgentSDK.ts:220-247`)
  now seeds atomically: `mkdtempSync` a sibling temp dir under the same
  parent (`.tmp-seed-<random>`), `cpSync(templateDir, tmpDir, {recursive:
  true})`, then `renameSync(tmpDir, finalDir)` inside a `try`; a losing
  concurrent racer catches the rename failure and cleans up its own temp dir
  with `rmSync` rather than leaking it (`ChatClaudeAgentSDK.ts:237-245`).
  `existsSync(finalDir)` short-circuits on every call after the first
  (`ChatClaudeAgentSDK.ts:230-232`) — idempotent by construction, no lock
  primitive introduced.
- `multiTenantEnv(resolvedCwd, aaiTemplateDir)` (`ChatClaudeAgentSDK.ts:294-306`)
  now takes and forwards `aaiTemplateDir` into `perTenantConfigDir` (`:304`).
- The `query()` call site now reads `settingSources: ['user', 'project',
  'local']` (`ChatClaudeAgentSDK.ts:513`, inside the `multiTenant`-gated
  spread), matching the design doc's Q4 decision — the "drop vs. explicit
  array" question the plan review flagged as unresolved has been pinned to
  the explicit form.
- `ChatClaudeAgentSDK`'s own `readonly aaiTemplateDir?: string` instance
  field exists (`ChatClaudeAgentSDK.ts:342`), i.e. the constructor now
  copies this field from `fields` like every other client option.

**What is still not true.** No production code path sets
`clientOptions.multiTenant = true`. Traced via `initializeModel`
(`silmari-chat-agents/src/llm/init.ts:18-31`) ← `Graph.ts:2400-2406`'s
`clientOptions: agentContext.clientOptions` ← `AgentContext.fromConfig`
(`AgentContext.ts:59-97`) ← `AgentInputs.clientOptions` built in
`silmari-chat`'s `agents/run.ts` (`buildAgentInput`, `run.ts:1262-1269` +
`:1407-1409` merge) ← `llmConfig` returned by `initializeClaudeAgentSdk`
(`initialize.ts:390`): `{ cwd, workspace: { root: cwd, additionalRoots } }`
— **no `multiTenant` key anywhere in this literal.** The only place
`multiTenant: true` is set anywhere in either repo is
`silmari-chat-agents`'s own test file,
`src/llm/claudeAgentSdk/__tests__/ChatClaudeAgentSDK.workspace.test.ts`
(constructs `new ChatClaudeAgentSDK({ multiTenant: true, aaiTemplateDir: ...
})` directly, bypassing `initializeModel`/`getChatModelClass` entirely). This
matches `AF-j59p`'s own tracked notes ("clientOptions.multiTenant not set"
listed as still-open) — wiring `multiTenant: true` into
`initializeClaudeAgentSdk`'s returned `llmConfig` is explicitly **out of
scope** for AF-5f2j itself and tracked separately under `AF-j59p`/`AF-1f56`.

**Why the current (non-multiTenant) production setup is safe in the
meantime.** `silmari-chat`'s `Dockerfile` bakes the full AAI framework into
every container's image at build time —
`COPY --chown=node:node apps/cosmic-agent-core/v4.2.0/.claude /home/node/.claude`
(`Dockerfile:98`) with `ENV CLAUDE_CONFIG_DIR=/home/node/.claude`
(`Dockerfile:107`), plus `RUN find /home/node/.claude -type d -exec chmod
o+w {} +` (`Dockerfile:106`) so the arbitrary runtime uid Compose assigns can
still create session-transcript subdirectories. Confirmed shipped on `main`
via `git log -- Dockerfile apps/cosmic-agent-core`: `b1c36081b`, `e1d42f524`,
`31460c975`. Every tenant sharing this one `CLAUDE_CONFIG_DIR` still gets a
correctly-namespaced session store, because the `claude` CLI namespaces
transcripts under `<config-dir>/projects/<encoded-cwd>/` internally, and
`cwd` is unique per user (`uploads/<req.user.id>`) — this is the design
doc's own stated reason the current shared setup is "safe in the meantime,"
not an accident.

**Compute-once pattern check (relevant to the concurrency question the plan
review raised).** The only existing "compute once" pattern in
`silmari-chat-agents` is `loadRealQuery()` (`ChatClaudeAgentSDK.ts:75-81`)
and `loadSandboxRuntime()` (`LocalExecutionEngine.ts:204,330-336`) — both
**module-level, per-process singleton promises** (`let xPromise; x ??=
import(...)`), not keyed by tenant or any argument. Neither fits
per-tenant-keyed seeding; the shipped fix instead reuses filesystem
atomicity (`renameSync`) rather than adding a new lock/cache primitive,
exactly as the design doc's Q4 section states.

### AF-hro9 — export a Bash path-extractor for `createWorkspacePolicyHook`

**The gap as filed.** `createWorkspacePolicyHook`'s default `pathExtractors`
(`src/hooks/createWorkspacePolicyHook.ts:182-194`) cover this repo's own
local-engine tool names (`read_file`, `write_file`, `edit_file`,
`grep_search`, `glob_search`, `list_directory`, `compile_check`) — not
Claude's built-in tool names. `silmari-chat`'s own
`CLAUDE_AGENT_SDK_PATH_EXTRACTORS` (`initialize.ts:267-278`) separately maps
`Read`/`Write`/`Edit`/`NotebookEdit`/`Grep`/`Glob`, but has **no `Bash`
entry** — confirmed absent both by direct grep of `initialize.ts` (only
comment-text mentions of "Bash," no object key) and by an existing test
(`claude-agent-sdk-workspace-hook.spec.ts:44-46`) that asserts
`CLAUDE_AGENT_SDK_PATH_EXTRACTORS.Bash === undefined`, labeling it "a
documented, tracked gap." Until AF-hro9's second half lands, a Claude Agent
SDK `Bash` call from this endpoint is gated only by
`createToolPolicyHook`'s tool-*name* policy — a command like `cat
/etc/passwd` succeeds today if `Bash` is an allowed tool name, regardless of
`cwd`.

**Why not just re-derive the regex.** `createWorkspacePolicyHook.ts`'s own
`compile_check` extractor, `extractCompileCheckPaths`
(`createWorkspacePolicyHook.ts:169-176`, regex at `:144-147`), already
required three separate correctness fixes, each with an inline comment
citing its review ticket:
- **P1 #26** (`:110-127`): the original extractor was a no-op stub `() =>
  []`, so `compile_check`'s policy silently allowed everything.
- **P1 #31** (`:128-134`): the regex initially only matched unquoted path
  tokens, so `cat "/etc/passwd"` bypassed it; fixed by adding optional
  `["']?` around the captured group.
- **P2 #35** (`:136-143`): parent-traversal tokens (`../secrets.txt`)
  weren't matched at all, so `cat ../secrets` bypassed it; fixed by adding a
  `\.\.` alternation to the regex.

The function's own JSDoc (`:159-168`, tagged `AF-hro9`) states the export's
purpose explicitly: "hosts gating other tools that also take a raw command
string — e.g. Claude Agent SDK's built-in `Bash` tool ... can reuse this
regex-hardened extraction instead of re-deriving an equivalent one."

**Current state.** As of this research pass, `extractCompileCheckPaths` **is
exported** from `src/hooks/index.ts` (`:39-42`, uncommitted change alongside
AF-5f2j's edits) — `export { createWorkspacePolicyHook,
extractCompileCheckPaths } from './createWorkspacePolicyHook';`. The
export's name was **decided, unrenamed**, per the design doc's review: the
function's behavior ("regex-hardened path-token extraction ... on arbitrary
shell command strings") is already accurate to what it does beyond
`compile_check` specifically, and no downstream code depends on either name
yet, so renaming would only add churn. A new top-level test block,
`describe('extractCompileCheckPaths (public export, AF-hro9)', ...)`
(`createWorkspacePolicyHook.test.ts:413-430`, 3 tests), exercises the
function directly via the barrel import (`import { extractCompileCheckPaths}
from '../index'`).

**What is still missing.** `silmari-chat`'s `CLAUDE_AGENT_SDK_PATH_EXTRACTORS`
(`initialize.ts:267-278`) has **not** been updated to add a `Bash` key that
calls the now-exported `extractCompileCheckPaths`. Confirmed by direct
`grep -n "Bash" packages/api/src/endpoints/custom/initialize.ts`: all three
hits are comment prose describing the gap, none is an object key. The
consumer-side half of this bead — the part that actually closes the live
gap on this endpoint — remains open.

### AF-j8s3 — integration test proving the workspace-policy hook survives production wiring

**The gap as filed.** Two test files currently exercise the Claude Agent SDK
workspace-policy hook, and both stop short of the real entrypoint:

- `packages/api/src/endpoints/custom/__tests__/initialize.claudeAgentSdk.test.ts`
  — imports and calls `buildClaudeAgentSdkPreToolUseHook` directly
  (`:6`), using the **real** `createToolPolicyHook({mode:'bypass'})`
  (`:4,34`) plus real `mkdtemp`-created temp directories for the workspace
  boundary. 5 tests (`:29-92`).
- `packages/api/src/endpoints/custom/claude-agent-sdk-workspace-hook.spec.ts`
  — imports `CLAUDE_AGENT_SDK_PATH_EXTRACTORS` and
  `buildClaudeAgentSdkPreToolUseHook` (`:5`), using **hand-built mock**
  `toolPolicyHook` callbacks (`alwaysAllow`/`alwaysDeny`, `:20-24`) rather
  than the real tool-policy hook. 9 tests across two `describe` blocks
  (`:26-98`).

Neither file imports or calls `initializeClaudeAgentSdk` or `initializeCustom`
— confirmed by a repo-wide search: `initializeClaudeAgentSdk` is referenced
only inside `initialize.ts` itself (its own definition at `:365` and its
call site inside `initializeCustom` at `:516`), and
`packages/api/src/endpoints/custom/initialize.spec.ts` (the file that *does*
test `initializeCustom`'s other branches) contains no
`ClaudeAgentSdk`/`CLAUDE_AGENT_SDK` references at all.

**The production wiring these tests bypass (confirmed real, traced
end-to-end).** `initializeClaudeAgentSdk` (`initialize.ts:365-400`) returns
`runtimeOptions: { preToolUseHook }` (`:392`). `initializeCustom`
(`initialize.ts:488-677`) early-returns this directly when
`isClaudeAgentSdkEndpoint(endpointConfig)` (`:515-517`).
`packages/api/src/agents/initialize.ts`'s `initializeAgent` calls this as
`getOptions` (`agents/initialize.ts:1124-1129`) and, on the returned
`ClaudeAgentSdkInitializeResult` discriminator
(`isClaudeAgentSdkInitializeResult`, `types/endpoints.ts:131-134`), calls
`setAgentRuntimeOptions(initializedAgent, options.runtimeOptions)`
(`agents/initialize.ts:1572-1576`). `setAgentRuntimeOptions`
(`agents/runtime.ts:48-59`) attaches `runtimeOptions` onto `agent` via a
**non-enumerable, symbol-keyed** property (`Object.defineProperty` on
`RUNTIME_CARRIER`, a module-local `Symbol`) — deliberately invisible to a
plain object spread, exercised directly by
`agents/__tests__/runtime-carrier.test.ts:50-56`. Later,
`agents/run.ts`'s `createRun`/`buildAgentInput` reads it back via
`getAgentRuntimeOptions(agent)` and merges it into `llmConfig`:
`Object.assign(llmConfig, runtimeOptions)` (`run.ts:1407-1409`, guarded by
`if (runtimeOptions != null)` — a silent no-op if the carrier was lost, e.g.
by an intervening object-spread clone of `agent`). From there `llmConfig`
becomes `AgentInputs.clientOptions` (`run.ts:1419`), crosses into
`@librechat/agents` via `Run.create(runConfig)` (`run.ts:1695`), and reaches
a live `ChatClaudeAgentSDK` instance's `this.preToolUseHook` on the graph's
next model-turn (`Graph.ts:2400-2406` → `ChatClaudeAgentSDK.ts:274-290`).

**Assessment relative to the bead's acceptance criteria.** The design doc's
own review independently traced this exact chain and reached the same
conclusion the design doc states: *"the production wiring itself is real ...
but all 9 tests, plus the sibling `__tests__/initialize.claudeAgentSdk.test.ts`,
call `buildClaudeAgentSdkPreToolUseHook` directly with hand-built mocks and
never invoke `initializeClaudeAgentSdk` itself. No automated test currently
proves the composed hook survives that merge end-to-end; only code-reading
does."* This matches AF-j8s3's own acceptance criteria verbatim (a test that
calls `initializeClaudeAgentSdk`, retrieves `runtimeOptions.preToolUseHook`,
and asserts it denies an out-of-workspace `Read`). No such test exists in
either repo as of this research pass.

## Code References

**`silmari-chat` (this repo):**
- `Dockerfile:98` — `COPY --chown=node:node apps/cosmic-agent-core/v4.2.0/.claude /home/node/.claude`
- `Dockerfile:106-107` — permission fix (`chmod o+w` on directories) + `ENV CLAUDE_CONFIG_DIR=/home/node/.claude`
- `packages/api/src/endpoints/custom/initialize.ts:198-215` — `resolveClaudeAgentSdkWorkspace(req)`, cwd derivation + path-traversal guard
- `packages/api/src/endpoints/custom/initialize.ts:267-278` — `CLAUDE_AGENT_SDK_PATH_EXTRACTORS` (no `Bash` key)
- `packages/api/src/endpoints/custom/initialize.ts:302-321` — `buildClaudeAgentSdkPreToolUseHook` (exported)
- `packages/api/src/endpoints/custom/initialize.ts:365-400` — `initializeClaudeAgentSdk`
- `packages/api/src/endpoints/custom/initialize.ts:515-517` — `initializeCustom`'s dispatch to it
- `packages/api/src/endpoints/custom/__tests__/initialize.claudeAgentSdk.test.ts:29-92` — 5 tests, real `createToolPolicyHook`, calls the hook-builder directly
- `packages/api/src/endpoints/custom/claude-agent-sdk-workspace-hook.spec.ts:26-98` — 9 tests, mock `toolPolicyHook`s, asserts `Bash` is ungated (`:44-46`, `:80-87`)
- `packages/api/src/agents/initialize.ts:1572-1576` — `setAgentRuntimeOptions` call site
- `packages/api/src/agents/runtime.ts:31-64` — `RUNTIME_CARRIER` symbol, `setAgentRuntimeOptions`/`getAgentRuntimeOptions`
- `packages/api/src/agents/run.ts:1262-1269,1407-1409` — `llmConfig` construction and the runtime-options merge
- `packages/api/src/agents/__tests__/runtime-carrier.test.ts:50-56` — carrier invisibility-to-spread test
- `packages/api/src/types/endpoints.ts:102-134` — `ClaudeAgentSdkInitializeResult`, discriminators

**`silmari-chat-agents` (`@librechat/agents` source, sibling repo, uncommitted changes as noted):**
- `src/hooks/createWorkspacePolicyHook.ts:110-176` — `extractCompileCheckPaths` + its three inline bug-fix comments (P1 #26, P1 #31, P2 #35)
- `src/hooks/createWorkspacePolicyHook.ts:182-194` — `DEFAULT_EXTRACTORS` (local-engine tool names)
- `src/hooks/createWorkspacePolicyHook.ts:308-326` — extractor merge + unmapped-tool-name allow short-circuit
- `src/hooks/index.ts:39-42` — `extractCompileCheckPaths` export (uncommitted)
- `src/hooks/__tests__/createWorkspacePolicyHook.test.ts:413-430` — public-export test block (AF-hro9)
- `src/llm/claudeAgentSdk/types.ts:41-122` — `ClaudeAgentSDKClientOptions`, including `aaiTemplateDir?: string` (`:90`)
- `src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:75-81` — `loadRealQuery()` singleton-promise pattern
- `src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:157-247` — `DEFAULT_AAI_TEMPLATE_DIR`, `resolveAaiTemplateDir`, `perTenantConfigDir` (seeded, atomic-rename version)
- `src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:294-306` — `multiTenantEnv`
- `src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:342` — `readonly aaiTemplateDir?: string` instance field
- `src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:410-441` (approx., query-call assembly; `settingSources` at `:513` in the currently-observed working-tree state) — `queryFn()` call assembly
- `src/llm/claudeAgentSdk/hookAdapter.ts:26-134` — `toSdkPreToolUseHook`/`toSdkCanUseTool`, repo↔SDK hook-shape translation
- `src/llm/claudeAgentSdk/__tests__/ChatClaudeAgentSDK.workspace.test.ts` — only place either repo sets `multiTenant: true` today (test-only)
- `src/tools/local/LocalExecutionEngine.ts:227-260` — `getLocalCwd`/`getWorkspaceRoots`
- `src/llm/init.ts:18-31`, `src/llm/providers.ts:23-38` — `initializeModel`, provider→class registry
- `src/graphs/Graph.ts:1355-1397,2400-2406` — `AgentContext` construction, per-turn model instantiation

## Architecture Documentation

**Two-hook composition pattern (Q3/AF-hro9/AF-j8s3).** `silmari-chat`
composes exactly two `HookCallback<'PreToolUse'>` values into one before
handing it to the provider: a tool-*name* policy (`createToolPolicyHook`)
and a path/workspace-*boundary* policy (`createWorkspacePolicyHook`,
extended with Claude-native `pathExtractors`). The composition
(`buildClaudeAgentSdkPreToolUseHook`, `initialize.ts:302-321`) runs the
tool-policy hook first and short-circuits on `deny`; otherwise it defers to
the workspace hook. `ChatClaudeAgentSDK` itself accepts only a single
`preToolUseHook` field (`types.ts:112`) — composition is deliberately the
host's responsibility, not the provider's, per the field's own JSDoc
("no provider class has ever received `HookRegistry` access").

**`pathExtractors` unmapped-tool-name behavior.** Both
`createWorkspacePolicyHook`'s and `silmari-chat`'s extractor maps share the
same fallback: if `extractors[toolName]` is `undefined`, the hook
short-circuits straight to `{decision: 'allow'}`
(`createWorkspacePolicyHook.ts:315-316` / `:325-326` depending on version).
This is *why* AF-hro9 matters — an unmapped `Bash` doesn't fail closed, it
passes through open.

**Symbol-carrier pattern for "executable, request-only" config.**
`setAgentRuntimeOptions`/`getAgentRuntimeOptions` (`agents/runtime.ts`)
deliberately keep `preToolUseHook` off of `agent.model_parameters` (which is
persisted to documents/checkpoints) by attaching it to the in-memory `agent`
object via a non-enumerable `Symbol`-keyed property, merged into `llmConfig`
only at the "last possible moment" inside `createRun`/`buildAgentInput`
(`run.ts:1401-1409`, comment quoted verbatim). This is the same pattern used
for BAML's `functions: BamlFunctionSet` (`isBamlInitializeResult` branch,
`agents/initialize.ts:1572`).

**Multi-tenant AAI-seeding architecture, current vs. proposed.** Today, AAI
propagation is build-time and shared: the Docker image bakes one copy of
`apps/cosmic-agent-core/v4.2.0/.claude` to `/home/node/.claude`
(`Dockerfile:98,107`), and every tenant's `claude` subprocess points at that
same directory (`CLAUDE_CONFIG_DIR` unset by the provider in the
non-`multiTenant` path, so it inherits the image's `ENV`). AF-5f2j's fix
adds a second, opt-in mode: `multiTenant: true` + `aaiTemplateDir` causes a
**per-tenant runtime copy**, seeded once (first request for a given
`sha256(resolvedCwd)`) from the same baked image directory by default,
isolated into `tmpdir()/claude-agent-sdk-tenants/<hash>/`. The two modes are
mutually exclusive per-request (gated by `this.multiTenant`), and — per this
research — the per-tenant mode has no production caller yet.

## Historical Context (from thoughts/)

- `silmari-chat-agents/thoughts/searchable/shared/plans/2026-08-16-claude-agent-sdk-multitenant-workspace-design.md`
  — the design doc all three beads derive from (Q1-Q4, System Map with 8
  labeled seams S1-S8, full interface grammar). Read in full for this
  research; contents are reflected throughout the Detailed Findings above.
  **Lives in `silmari-chat-agents`, not `silmari-chat`**, despite being
  referenced from `silmari-chat`-tracked beads.
- `silmari-chat-agents/thoughts/searchable/shared/plans/2026-08-16-claude-agent-sdk-multitenant-workspace-design-REVIEW.md`
  — automated plan review; flagged the three gaps that became AF-5f2j's
  concurrency/interface/precondition findings and AF-j8s3's filing. Q1-Q3
  marked settled; Q4 marked "Needs Minor Revision" pending exactly the three
  items now closed in the amended design doc.
- `thoughts/searchable/shared/research/2026-08-13-10-00-cosmic-agent-core-aai-integration-seams.md`
  — earlier research (predates the Docker-baking decision) establishing that
  every AAI subsystem resolves paths off an `AAI_DIR` env var or hardcoded
  `~/.claude`/`$HOME/.claude` literals, never a project-relative path — the
  reason a per-tenant AAI seed must also control `$HOME`/`CLAUDE_CONFIG_DIR`
  for the copied tree to actually be found by AAI's own hooks, not just
  present on disk.
- `thoughts/searchable/shared/research/2026-08-14-18-33-cosmic-agent-core-aai-algorithm-skills-hooks-cli-seams.md`
  — companion research; confirms `CLAUDE.md` (and its hardcoded
  Algorithm-load instruction) is the single load-bearing entry point AAI
  hangs off, reinforcing why `settingSources: []` blocking `CLAUDE.md` is
  such a complete failure mode, not a partial one.
- `thoughts/searchable/shared/research/2026-08-15-22-10-shipping-aai-agent-infrastructure-with-claude-agent-sdk-provider.md`
  — the only `thoughts/` document in `silmari-chat` that references `AF-hro9`
  directly (located but not deep-read in this pass; topically adjacent to
  the design doc above).
- `thoughts/searchable/shared/plans/2026-08-15-vultr-nolme-docker-multitenant-deploy.md`
  and its `-REVIEW.md` — the (unrelated) infrastructure multi-tenancy plan
  (one Docker Compose project per client, on Vultr). Establishes that the
  app image is built once and distributed via `docker save`/`docker load`
  to every client container — i.e. anything baked into the image (AAI
  included) is shared across all clients from one image tag; only
  *runtime* env/secrets are per-client-isolated under this architecture.
  Contains no AAI- or Claude-Agent-SDK-specific content itself.
- `thoughts/searchable/shared/handoffs/general/2026-08-16_07-53-54_vultr-deploy-complete-clerk-auth-next.md`
  — most directly relevant handoff. Confirms (commit `b1c36081b`) the
  Docker-baked-AAI decision was a deliberate, user-approved trade-off made
  with full knowledge of the exposure (17 skills including
  security/OSINT/scraping, unscoped Bash/Write/WebFetch grants, 22
  auto-firing hooks, exposed to anonymous test-chat end users) — direct
  motivating context for why AF-hro9's Bash-path-gating work matters. Also
  states the Claude Agent SDK endpoint's "no conversation found" fixes were
  deployed but **explicitly unconfirmed by a live user retest** as of that
  handoff's timestamp — a caveat on any assumption that the endpoint is
  currently stable in production, independent of the three beads researched
  here.

## Related Research
- `thoughts/searchable/shared/research/2026-08-15-22-10-shipping-aai-agent-infrastructure-with-claude-agent-sdk-provider.md`

## Workflow Closure Map

Two distinct behaviors are in scope — (1) Claude-native built-in tool calls
(`Read`/`Write`/`Edit`/`NotebookEdit`/`Grep`/`Glob`/`Bash`) being
boundary-checked against the resolved workspace root before the SDK executes
them, and (2) `multiTenant: true` causing a fresh per-tenant `CLAUDE_CONFIG_DIR`
to be seeded with AAI content before the `claude` subprocess starts. They
are mapped separately below since they have different trigger points and,
per this research, different production-reachability status.

### Map 1 — PreToolUse workspace-boundary gating (AF-hro9 / AF-j8s3)

**Chain:** `initializeClaudeAgentSdk` (composes `CLAUDE_AGENT_SDK_PATH_EXTRACTORS`
+ `createToolPolicyHook` into one `preToolUseHook`) → returned closure invoked
directly with a tool-call fixture → allow/deny decision.

- **Producer**: `initialize.ts:267-278` (`CLAUDE_AGENT_SDK_PATH_EXTRACTORS`) +
  `initialize.ts:302-321` (`buildClaudeAgentSdkPreToolUseHook`), both inside
  `initializeClaudeAgentSdk` (`initialize.ts:365-400`).
- **Registration point**: `initializeCustom`'s `isClaudeAgentSdkEndpoint`
  dispatch (`initialize.ts:515-517`), itself registered as `getOptions` for
  custom-provider endpoints in `packages/api/src/endpoints/config/providers.ts`.
- **Consumer (downstream, already covered by other tests)**: `setAgentRuntimeOptions`
  (`agents/runtime.ts:48-59`) → `agents/run.ts:1407-1409` merge → `ChatClaudeAgentSDK`
  constructor (`ChatClaudeAgentSDK.ts:274-290`) → `hookAdapter.toSdkPreToolUseHook`
  (`hookAdapter.ts:67-108`) → SDK `queryFn()`'s `options.hooks.PreToolUse`.
- **Data contract**: `PreToolUseHookInput { toolName, toolInput, toolUseId,
  ... }` → `PreToolUseHookOutput { decision?: 'allow'|'deny'|'ask', reason?,
  ... }` (`src/hooks/types.ts`, both repos share this shape via the npm
  package boundary).
- **Runtime context carried across the edge**: none beyond the tool-call
  input itself and an `AbortSignal` — no auth/tenant context crosses this
  specific seam (auth already resolved upstream, at `resolveClaudeAgentSdkWorkspace`).
- **Error behavior**: an unmapped tool name in either extractor map
  short-circuits to `allow` (`createWorkspacePolicyHook.ts:315-316`/`:325-326`)
  — a silent, not a fail-closed, default. This is the exact shape of the
  `Bash` gap AF-hro9 closes for one specific tool name.
- **Tests exercising this edge**: `claude-agent-sdk-workspace-hook.spec.ts`
  (9 tests) and `__tests__/initialize.claudeAgentSdk.test.ts` (5 tests) both
  call `buildClaudeAgentSdkPreToolUseHook` directly, **bypassing**
  `initializeClaudeAgentSdk` — i.e. testing the composition, not the
  production entrypoint that builds it. **This is exactly AF-j8s3's gap.**
  No test today calls `initializeClaudeAgentSdk` itself.
- **Label** (closure-mapper vocabulary): `initializeClaudeAgentSdk` itself —
  **production-called** (confirmed live caller via `initializeCustom`'s
  dispatch, itself registered as `providers.ts`'s `getOptions`). The
  specific `Bash` path-extractor entry AF-hro9 would add — **not found**
  (does not exist yet in `CLAUDE_AGENT_SDK_PATH_EXTRACTORS`). The
  entrypoint-level integration test AF-j8s3 would add — **not found** (no
  test calls `initializeClaudeAgentSdk`).
- **Depth / highest_new_connector**: `initializeClaudeAgentSdk`'s
  `CLAUDE_AGENT_SDK_PATH_EXTRACTORS` map is the shallowest node either bead
  changes — AF-hro9 adds a key to it; AF-j8s3 adds no production node at all
  (pure test coverage), so its work targets this same node as its
  call-and-observe point.

### ClosureMap (structured — derive() input)

```json
{
  "behavior": "A Claude Agent SDK built-in tool call (Read/Write/Edit/NotebookEdit/Grep/Glob/Bash) is boundary-checked against the resolved per-user workspace root by a composed PreToolUse hook before the tool executes.",
  "git_commit": "31460c975fce7ded9f1de4aeb8c74022a6796391",
  "repo": "/home/maceo/Dev/silmari-chat",
  "nodes": [
    { "id": "init-claude-agent-sdk", "module": "packages/api/src/endpoints/custom/initialize.ts", "is_entrypoint": true, "adds_or_changes": true, "read_path": null, "seedable_store": "fixture ServerRequest (req.user.id)" },
    { "id": "composed-pretooluse-hook-decision", "module": "packages/api/src/endpoints/custom/initialize.ts", "is_entrypoint": false, "adds_or_changes": false, "read_path": "runtimeOptions.preToolUseHook (returned closure from buildClaudeAgentSdkPreToolUseHook, invoked directly with a tool-call fixture)", "seedable_store": null }
  ],
  "edges": [
    { "is_async": false, "cross_boundary": false, "driver": null }
  ]
}
```

Notes on this map: `init-claude-agent-sdk` is both the production entrypoint
(`initializeCustom`'s live dispatch target) and the node AF-hro9 changes
(adding a `Bash` key to `CLAUDE_AGENT_SDK_PATH_EXTRACTORS`, declared inside
this same function). The observable is deliberately the **returned hook
closure**, not a live SDK subprocess call — this matches AF-j8s3's own
acceptance criteria (call `initializeClaudeAgentSdk`, invoke the resulting
`runtimeOptions.preToolUseHook`, assert its decision) and the design
review's own recommendation. The deeper chain from there to a real `claude`
CLI subprocess (`setAgentRuntimeOptions` → `agents/run.ts` merge →
`ChatClaudeAgentSDK` → `hookAdapter` → `queryFn()`) is a separate,
already-independently-verified link (see Detailed Findings, AF-j8s3) and is
intentionally out of this map's scope, matching the bead's own acceptance
criteria's stated boundary.

### Closure adapter (staged proposal — `2026-08-16-09-35-AF-5f2j-hro9-j8s3-claude-agent-sdk-workspace-gaps.pretooluse-bash-gating.closure-adapter.py`)

```python
"""Closure adapter (STAGED PROPOSAL -- not wired into the repo).
Derived from the ClosureMap for: PreToolUse workspace-boundary gating (AF-hro9/AF-j8s3).
Pin: 31460c975fce7ded9f1de4aeb8c74022a6796391 (silmari-chat).
Promote into silmari-chat and complete each TODO(promote) before use.
Speaks the 7-op contract apps/closure-oracle already talks to (mock_adapter.py).
"""
import http.server, json, sys

ASYNC_EDGES = []                                    # this map's single edge is synchronous
CONNECTOR = {e: True for e in ASYNC_EDGES}
SINK = []                                            # Phase-0 /seed_sink target
LAST_HOOK = {"fn": None}                             # holds the returned preToolUseHook closure

def handle(op, p):
    if op == "/reset":
        SINK.clear()
        LAST_HOOK["fn"] = None
        CONNECTOR.update({e: True for e in ASYNC_EDGES})
        return {"ok": True}
    if op == "/set_connector":
        CONNECTOR[p["edge"]] = p["enabled"]
        return {"ok": True}
    if op == "/seed_sink":
        SINK.append(p["value"])
        return {"ok": True}
    if op == "/seed":
        # TODO(promote): construct a fixture ServerRequest with req.user.id set,
        # matching resolveClaudeAgentSdkWorkspace's contract
        #   (packages/api/src/endpoints/custom/initialize.ts:198-215)
        return {"ok": True}
    if op == "/trigger":
        # TODO(promote): call initializeClaudeAgentSdk({endpoint, req, endpointConfig,
        #   model_parameters, appConfig}) with the seeded fixture request
        #   (packages/api/src/endpoints/custom/initialize.ts:365-400);
        #   capture result.runtimeOptions.preToolUseHook into LAST_HOOK["fn"]
        return {"ok": True}
    if op == "/drive":
        # no async edges in this map -- no-op
        return {"ok": True}
    if op == "/observe":
        # TODO(promote): invoke LAST_HOOK["fn"](p["toolInput"], abortSignal) --
        #   e.g. {toolName: "Bash", toolInput: {command: "cat /etc/passwd"}} --
        #   and return its {decision, reason} as the observed value
        return {"ok": True, "value": json.dumps(SINK)}
    return {"ok": False, "error": "unknown op"}

class Hn(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        out = json.dumps(handle(self.path, json.loads(self.rfile.read(n) or "{}"))).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)
    def log_message(self, *a):
        pass

http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Hn).serve_forever()
```

### Map 2 — `multiTenant: true` per-tenant AAI seeding (AF-5f2j)

**Chain:** `ChatClaudeAgentSDK` constructed with `multiTenant: true` (+
optional `aaiTemplateDir`) → `perTenantConfigDir`/`resolveAaiTemplateDir`
seed the tenant's `CLAUDE_CONFIG_DIR` on first use → `query()` call assembles
`Options.env`/`Options.settingSources` from that seeded state.

- **Producer**: `ChatClaudeAgentSDK.ts:220-247` (`perTenantConfigDir`),
  `:176-190` (`resolveAaiTemplateDir`), `:294-306` (`multiTenantEnv`) — all
  `silmari-chat-agents`.
- **Registration point / entrypoint**: **none found in production.** The
  only place `multiTenant: true` is set in either repo is
  `ChatClaudeAgentSDK.workspace.test.ts` (a unit test), constructing the
  provider directly and bypassing `initializeModel`/`getChatModelClass`
  entirely. `initializeClaudeAgentSdk`'s returned `llmConfig`
  (`initialize.ts:390`) never includes a `multiTenant` key.
- **Data contract**: `ClaudeAgentSDKClientOptions.multiTenant?: boolean` +
  `.aaiTemplateDir?: string` (`types.ts:75,90`) → `Options.env`/`Options.settingSources`
  on the SDK's `Options` type (`sdk.d.ts`).
- **Runtime context carried across the edge**: `resolvedCwd` (the per-user
  workspace root, itself derived from `req.user.id` upstream) is the sole
  input to the tenant-hash derivation (`sha256(resolvedCwd).slice(0,16)`,
  `ChatClaudeAgentSDK.ts:224-229`) — no explicit tenant-id field exists or
  is needed.
- **Error behavior**: fail-loud by design — a missing/unset `aaiTemplateDir`
  with no default (`/home/node/.claude`) present throws synchronously from
  `resolveAaiTemplateDir` (`ChatClaudeAgentSDK.ts:183-189`), not a silent
  empty-directory fallback (the old, pre-fix behavior this replaces).
- **Tests exercising this edge**: `ChatClaudeAgentSDK.workspace.test.ts`'s
  `B16` scenario constructs with `aaiTemplateDir` set and asserts
  `settingSources` equals `['user','project','local']` — this is the only
  test coverage found, and it exercises the mechanism directly (constructor
  → seeded temp dir → assertion), never through any production dispatch
  path, because no such path exists yet.
- **Label**: **test-only.** Every node in this chain is reachable today only
  from `ChatClaudeAgentSDK.workspace.test.ts`; no production caller sets
  `multiTenant: true`.

### ClosureMap (structured — derive() input)

```json
{
  "behavior": "When multiTenant is true, ChatClaudeAgentSDK seeds a fresh per-tenant CLAUDE_CONFIG_DIR with the AAI template's contents (atomically, on first use) and sets settingSources so CLAUDE.md still loads from it.",
  "git_commit": "0713b9a1badf947d5216e0cb3850b7eba00f3ea1",
  "repo": "/home/maceo/Dev/silmari-chat-agents",
  "nodes": [
    { "id": "client-options-multitenant", "module": "src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts (constructor)", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": "ClaudeAgentSDKClientOptions (multiTenant, aaiTemplateDir, cwd fields)" },
    { "id": "per-tenant-config-dir-seed", "module": "src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts (perTenantConfigDir / resolveAaiTemplateDir / multiTenantEnv)", "is_entrypoint": false, "adds_or_changes": true, "read_path": null, "seedable_store": null },
    { "id": "query-options-settingsources-env", "module": "src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts (query() call assembly)", "is_entrypoint": false, "adds_or_changes": false, "read_path": "seeded CLAUDE_CONFIG_DIR directory contents + Options.settingSources/env passed to queryFn()", "seedable_store": null }
  ],
  "edges": [
    { "is_async": false, "cross_boundary": false, "driver": null },
    { "is_async": false, "cross_boundary": false, "driver": null }
  ]
}
```

**Important caveat this map surfaces honestly**: no node above has
`is_entrypoint: true`, because — per this research — no production code
path constructs `ChatClaudeAgentSDK` with `multiTenant: true`. There is
consequently no node satisfying `is_entrypoint && adds_or_changes`; the
nearest available trigger for a closure test today is the constructor
itself, called directly (as the existing unit test already does), not a
production HTTP entrypoint. This under-specification is intentional and
accurate, not an omission — an implementer wiring `multiTenant: true` into
`initializeClaudeAgentSdk`'s `llmConfig` (tracked separately, `AF-j59p`)
would add the missing entrypoint node.

### Closure adapter (staged proposal — `2026-08-16-09-35-AF-5f2j-hro9-j8s3-claude-agent-sdk-workspace-gaps.multitenant-aai-seeding.closure-adapter.py`)

```python
"""Closure adapter (STAGED PROPOSAL -- not wired into the repo).
Derived from the ClosureMap for: multiTenant AAI seeding (AF-5f2j).
Pin: 0713b9a1badf947d5216e0cb3850b7eba00f3ea1 (silmari-chat-agents).
Promote into silmari-chat-agents and complete each TODO(promote) before use.
NOTE: no production entrypoint exists for this chain yet (see caveat above) --
/trigger below calls the ChatClaudeAgentSDK constructor + a query() invocation
directly, matching the only reachable caller today (a unit test), not an
HTTP-triggered production path.
Speaks the 7-op contract apps/closure-oracle already talks to (mock_adapter.py).
"""
import http.server, json, sys

ASYNC_EDGES = []                                    # both edges in this map are synchronous
CONNECTOR = {e: True for e in ASYNC_EDGES}
SINK = []                                            # Phase-0 /seed_sink target
STATE = {"instance": None}

def handle(op, p):
    if op == "/reset":
        SINK.clear()
        STATE["instance"] = None
        CONNECTOR.update({e: True for e in ASYNC_EDGES})
        return {"ok": True}
    if op == "/set_connector":
        CONNECTOR[p["edge"]] = p["enabled"]
        return {"ok": True}
    if op == "/seed_sink":
        SINK.append(p["value"])
        return {"ok": True}
    if op == "/seed":
        # TODO(promote): stage p["data"] as ClaudeAgentSDKClientOptions --
        #   { multiTenant: true, aaiTemplateDir: <fixture dir>, cwd: <fixture cwd> }
        #   (src/llm/claudeAgentSdk/types.ts:41-122)
        return {"ok": True}
    if op == "/trigger":
        # TODO(promote): new ChatClaudeAgentSDK(seededOptions), then invoke a
        #   query()-triggering call (e.g. _streamResponseChunks) so
        #   perTenantConfigDir()/resolveAaiTemplateDir() actually run
        #   (src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:220-306,410-441)
        return {"ok": True}
    if op == "/drive":
        # no async edges in this map -- no-op
        return {"ok": True}
    if op == "/observe":
        # TODO(promote): read back the seeded tenant dir's contents
        #   (tmpdir()/claude-agent-sdk-tenants/<hash>/, e.g. CLAUDE.md presence)
        #   and the settingSources value passed into the captured queryFn() call
        return {"ok": True, "value": json.dumps(SINK)}
    return {"ok": False, "error": "unknown op"}

class Hn(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        out = json.dumps(handle(self.path, json.loads(self.rfile.read(n) or "{}"))).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)
    def log_message(self, *a):
        pass

http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Hn).serve_forever()
```

## Open Questions

- **Where does the design doc actually belong?** All three beads' `DESIGN`
  fields cite `thoughts/searchable/shared/plans/2026-08-16-claude-agent-sdk-multitenant-workspace-design.md`
  without a repo qualifier, but the file only exists in `silmari-chat-agents`.
  Since `AF-5f2j`/`AF-hro9` are themselves filed against `silmari-chat-agents`
  (per their bead metadata) this is likely intentional/correct, but `AF-j8s3`
  is filed against `silmari-chat` (its acceptance criteria names
  `silmari-chat`'s own spec file) while its `DESIGN` field points at the same
  `silmari-chat-agents`-only doc — worth confirming this cross-repo reference
  is intended before running `create_tdd_plan` against it.
- **Is AF-5f2j's in-flight implementation the final shape, or a WIP that will
  change again?** The working-tree state captured here (atomic
  temp-dir-then-rename seeding, `resolveAaiTemplateDir` fail-loud logic,
  `settingSources: ['user','project','local']`) matches the design doc's
  "actual fix" section closely, but it is uncommitted and was observed
  changing mid-research. A `create_tdd_plan`/implementation pass should
  re-verify current file state rather than trust this snapshot.
  Correspondingly, the concurrency-race **Property test** the design doc
  calls for ("regardless of request interleaving, `perTenantConfigDir()`
  never returns a path whose seeding is partially complete") does not yet
  appear to exist in `ChatClaudeAgentSDK.workspace.test.ts` based on the
  single `B16` scenario found — worth confirming directly before treating
  AF-5f2j as test-complete.
- **Does AF-5f2j need a companion bead for wiring `multiTenant: true` into
  production?** As documented above, the seeding mechanism has no caller.
  `AF-j59p`'s own notes already track "`clientOptions.multiTenant` not set"
  as open, separate from AF-5f2j — but it's worth confirming that's still
  the intended split before treating AF-5f2j as "done" once its own
  acceptance criteria (a fixture-based regression test) is met, since that
  test would necessarily construct `ChatClaudeAgentSDK` directly rather than
  through any production dispatch path.
- **AF-hro9's remaining scope**: does the bead's own acceptance criteria
  cover *both* halves (export from `silmari-chat-agents` *and* the
  `CLAUDE_AGENT_SDK_PATH_EXTRACTORS.Bash` wiring in `silmari-chat`), or was
  it filed narrowly against just the export? The bead's ACCEPTANCE CRITERIA
  text (`bd show AF-hro9`) explicitly names both, so this research treats
  both as in-scope and open until the `silmari-chat`-side wiring lands.

## Note on tool output (not part of the codebase findings above)

One `thoughts-analyzer` sub-agent's returned output began with a harness
warning: *"subagent output matched instruction-shaped pattern(s):
settings-json, permissions-allow-deny. Control tags below are neutralized."*
This most likely reflects that one of the source documents it read
(`2026-08-13-10-00-cosmic-agent-core-aai-integration-seams.md`) legitimately
documents `.claude/settings.json` hook-registration and
`permissions.allow` syntax as its subject matter — i.e. a plausible false
positive from a detector reacting to instruction-shaped *text being
described*, not an actual injected instruction. Flagging it here for
transparency rather than silently passing it through; nothing in that
sub-agent's substantive findings (reproduced in Historical Context above)
appeared to act on any embedded instruction.

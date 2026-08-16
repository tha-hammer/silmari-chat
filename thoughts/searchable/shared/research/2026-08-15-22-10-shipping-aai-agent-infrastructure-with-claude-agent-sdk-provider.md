---
date: 2026-08-15T22:10:00-04:00
researcher: maceo
git_commit: 79072aa6d447d508692f3a9e76dd26ec033df5f6
branch: main
repository: silmari-chat
topic: "Shipping the cosmic-agent-core (AAI) agent infrastructure alongside the Claude Agent SDK provider"
tags: [research, codebase, claude-code, aai, claude-agent-sdk, chatclaudeagentsdk, multi-tenant, cosmic-agent-core, settings-sources]
status: complete
last_updated: 2026-08-15
last_updated_by: maceo
---

# Research: Shipping the cosmic-agent-core (AAI) agent infrastructure alongside the Claude Agent SDK provider

## Research Question

We have an external "agent infrastructure" designed for Claude Code. We added the Claude SDK as an agent provider and need to also ship the agent infrastructure. The source repo is here: `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude`; the infrastructure is designed to install into the user's `~/.claude` directory.

This document covers: (1) what the source "agent infrastructure" package is and how it is designed to install, (2) how the Claude Agent SDK provider (`Providers.CLAUDE_AGENT_SDK`) is currently implemented and wired into `silmari-chat`, and (3) the concrete seam — Claude Agent SDK's `Options.settingSources`/`Options.env`/`CLAUDE_CONFIG_DIR` mechanism — that determines whether and how the two connect today.

## Summary

Two systems exist today, built independently, that have never been connected in code:

1. **The "agent infrastructure" package** — `cosmic-agent-core/v4.2.0/.claude/` (hereafter "the AAI package") — a full native Claude Code `.claude/` tree (`settings.json`, `hooks/`, `skills/`, `agents/`, `commands/`, plus AAI-specific `AAI/` reference docs and a `MEMORY/` tree) shipped with its own two-layer installer (`install.sh` bootstrap → `AAI-Install/main.ts` TypeScript engine). It is explicitly documented and built as a **single-user, single-machine, `~/.claude/`-only** install (`AAI-Install/README.md:322`: "Single-user — Installs to `~/.claude/` for the current user only"). This package was already the subject of two prior, exhaustive research passes in this repo (`thoughts/shared/research/2026-08-13-10-00-...` and `2026-08-14-18-33-...`, both linked in Related Research below) — this document does not re-derive those findings, only cites and extends them where they bear on the new question.

2. **The Claude Agent SDK provider** (`Providers.CLAUDE_AGENT_SDK`) — implemented in the sibling repo `silmari-chat-agents` (published as the `@librechat/agents` npm package, pinned into `silmari-chat` via a git-commit URL) as `ChatClaudeAgentSDK`, a LangChain-style chat model that spawns a local `claude` CLI subprocess per conversation turn on the **server**, via `@anthropic-ai/claude-agent-sdk`'s `query()` function. `silmari-chat` wires it in as a `librechat.yaml` custom endpoint (`provider: 'claudeAgentSdk'`) and, in `initializeClaudeAgentSdk()`, sets exactly two of the provider's ~11 configurable options: a per-user `cwd` (`uploads/<userId>`) and a `preToolUseHook` for tool-approval policy. Everything else — `multiTenant`, `workspace`, `settingSources`, `env`, `sessionStore`, `resume`, `maxTurns`, `postToolUseHook`, `hitlResolver` — is left unset.

**The seam that connects (or fails to connect) the two systems is `Options.settingSources`, a Claude Agent SDK option with three possible filesystem levels — `'user'` (global `~/.claude` or `$CLAUDE_CONFIG_DIR`), `'project'` (`<cwd>/.claude`), `'local'` (`<cwd>/.claude/settings.local.json`) — or `[]` to disable filesystem settings entirely ("SDK isolation mode," per the SDK's own type doc).** Because `silmari-chat`'s current wiring never sets `clientOptions.multiTenant: true`, the provider's `multiTenant !== true` branch is taken and `settingSources` is left **unset** — which makes the SDK load **all** sources, matching the `claude` CLI's own defaults. Concretely, and confirmed by exhaustive code-path tracing (no fs-write API anywhere in the provider's own directory populates any config-dir content):

- Nothing in either repo currently writes `settings.json`, `skills/`, `hooks/`, `agents/`, or `commands/` content into any location the subprocess would read from — not at the per-tenant `CLAUDE_CONFIG_DIR` path, not at `cwd`, not anywhere.
- If the AAI package's `.claude` tree were installed at the **server process's own `$HOME/.claude`** (or wherever a server-wide `CLAUDE_CONFIG_DIR` environment variable points) — e.g. by running `install.sh` on the deployment host, or baking the tree into the Docker image at build time — then, **because `env`/`CLAUDE_CONFIG_DIR` is also left unset today** (the subprocess simply inherits the server process's own `process.env` unmodified), **every conversation, across every tenant, would load the exact same shared 'user'-level AAI skills/hooks/agents/commands/CLAUDE.md** from that one global location. Note that `cwd` (which IS correctly per-user-scoped to `uploads/<userId>`) has no bearing on where the `'user'`-level settings source is read from — only a `'project'`-level source (`<cwd>/.claude`) would be per-tenant-isolated, and nothing today creates such a directory under any user's uploads folder.
- **`multiTenant: true` and "shipping the AAI infrastructure" are structurally exclusive in the current provider code**: the same conditional block (`ChatClaudeAgentSDK.ts:402-404`) that sets the per-tenant `CLAUDE_CONFIG_DIR` (the fix needed for the open session-continuity bug, `AF-hqp5`) *also* hardcodes `settingSources: []` in the same object literal — the SDK's own "isolation mode," which disables loading of **any** filesystem settings source, AAI or otherwise. Turning on `multiTenant` to fix per-tenant session isolation would, by the same code path, turn off any shipped AAI configuration.
- No Dockerfile, Compose file, or `.env.example` entry anywhere in `silmari-chat` installs the `claude` CLI binary or sets `CLAUDE_CONFIG_DIR` — deployment-host provisioning of the `claude` binary itself (confirmed separately via `AF-hqp5`'s notes: a live Vultr deployment reproduced the per-tenant-config-dir bug against a real `claude` CLI) is already an out-of-band, host-level step distinct from anything the application's own build artifacts do today.

No beads issue, plan, or handoff document found in either repo's `thoughts/` tree currently tracks "install/ship the AAI `.claude` package to the server" as a task — the closest related open work (`AF-j59p`, "Design: multi-tenant workspace/cwd scoping for the Claude Agent SDK endpoint") is scoped narrowly to path-traversal/filesystem-tool isolation, not to native-config provisioning, and does not mention the AAI package at all.

## Detailed Findings

### 1. The AAI package — recap of prior research, extended for this question

Two prior research passes in this repo's `thoughts/` tree already inventory the AAI package in full (source inventory, hook registration contract, skills/agents/commands native-format contracts, memory/delegation/Fabric path-resolution seams, Algorithm execution contract, `AAI/Tools/` file audit, and documentation-vs-code drift). Rather than repeat that content, this section cites and extends it with the two facts most load-bearing for "shipping":

- **Path resolution is home-relative, not project-relative, throughout the package.** Every AAI subsystem (hooks, `ComposeAgent.ts`, Fabric, Memory) resolves paths against an `AAI_DIR` env var (default `${HOME}/.claude`) or a hardcoded `~/.claude`/`$HOME/.claude` literal — no code path in the package resolves against a project directory or a per-tenant identifier (confirmed in `thoughts/shared/research/2026-08-13-10-00-...` §2/§5, re-confirmed by this pass's own reading of `install.sh`, below). This means "shipping" it as-is targets exactly one filesystem location per machine/container — it has no built-in notion of "one AAI tree per tenant."
- **The installer is a pure single-user bootstrap, not a packaging/distribution artifact.** `.claude/install.sh` (154 lines) is a bash preflight script — it checks/installs `curl`/`git`/`bun` (hard-requiring `curl` and `bun`, soft-requiring `git`), resolves its own real path (following symlinks, "so install.sh works from `~/.claude/` symlink," line 61), locates a sibling `AAI-Install/` directory, and `exec`s into `bun run "$INSTALLER_DIR/main.ts" --mode gui` (line 156) — handing off all actual payload deployment to a TypeScript engine outside this file. `install.sh` itself performs **zero** file copy/symlink/write operations against any `.claude` content — no `cp`, `cat >`, `jq`, or heredoc writes anywhere in the script (confirmed by full read). It accepts no target-directory argument and no CLI flags of its own.
  - The downstream TS engine (`AAI-Install/engine/`, not itself re-read in this pass — already covered by the first prior research doc's §7, "AAI-Install — not invoked at runtime [by the AAI package's own skills/hooks]") is documented (`AAI-Install/README.md:210-217`) to generate exactly four artifacts: `~/.claude/settings.json` (merged from a template, preserving hooks/statusline/spinner-verbs), `~/.config/AAI/.env`, `~/.claude/AAI/Algorithm/LATEST`, and a `~/.zshrc` shell-alias edit.
  - `AAI-Install/README.md:319-324` ("Known Limitations") states explicitly: **"Single-user — Installs to `~/.claude/` for the current user only"**, alongside "macOS and Linux only — Windows is not supported," "Internet connection required," and "Electron optional — If Electron fails to install, use `--mode web` as fallback."
- **No packaging/distribution artifact exists for the AAI package itself.** No `package.json` exists at `.claude/` root or at the `apps/cosmic-agent-core/` root (so no `bin`/`files`/`publishConfig`); no `.npmignore`; no `Dockerfile` anywhere under `apps/cosmic-agent-core/`; no tarball/archive/`npm publish` scripts (the only matches for those terms are unrelated prose inside skill-workflow markdown about *other* people's CLI-scaffolding tasks). The one real `package.json` in the tree (`AAI-Install/electron/package.json`) scopes only the Electron GUI wrapper. The parent `apps/cosmic-agent-core/README.md` frames the whole tree as "the deployable AAI (Agent Assistant Infrastructure) distribution... the `.claude/` payload that gets installed into a project (or a user's home)" — i.e. the installer machinery ships *inside* the same tree it installs, rather than being packaged as a separate distributable unit.

### 2. `ChatClaudeAgentSDK` — the provider's native-config seam

Source: `silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts` (pinned into `silmari-chat` at commit `2251771260c7c48c8790e510d5ab056c1b160ae1`).

**`Options.settingSources`** — the exact SDK-level lever that decides whether any `.claude` filesystem config (native skills, subagents, hooks, slash commands, `CLAUDE.md`, `settings.json`) is loaded by the spawned subprocess. Its type (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:7520` in `silmari-chat-agents`) is:

```ts
export declare type SettingSource = 'user' | 'project' | 'local';
```

and the option itself (`sdk.d.ts:1980-1989`):

> `'local' - Local settings (.claude/settings.local.json)`
> `When omitted, all sources are loaded (matches CLI defaults).`
> `Pass [] to disable filesystem settings (SDK isolation mode).`
> `Must include 'project' to load CLAUDE.md files.`
> `settingSources?: SettingSource[];`

`ChatClaudeAgentSDK.ts` sets this — and a paired `env` override — in exactly one place, gated on a single boolean:

```ts
// ChatClaudeAgentSDK.ts:402-404
...(this.multiTenant !== true
  ? {}
  : { settingSources: [], env: multiTenantEnv(resolvedCwd) }),
```

- **When `multiTenant !== true` (today's actual state in `silmari-chat`)**: neither `settingSources` nor `env` is set on `Options` at all. The SDK falls back to its own default — "all sources are loaded (matches CLI defaults)" — meaning the `'user'` level (`$CLAUDE_CONFIG_DIR` or `$HOME/.claude`), the `'project'` level (`<resolvedCwd>/.claude`), and the `'local'` level (`<resolvedCwd>/.claude/settings.local.json`) are **all** considered. `env` being unset means the subprocess inherits the **server process's own `process.env`** unmodified — so `CLAUDE_CONFIG_DIR`, if unset server-wide, falls through to the SDK's own default of `$HOME/.claude` (the server process's home directory, not any tenant-specific path).
- **When `multiTenant === true`**: `settingSources: []` — the SDK's own documented "SDK isolation mode," disabling **every** filesystem settings source — is set in the same object literal as a freshly-derived per-tenant `CLAUDE_CONFIG_DIR` (via `perTenantConfigDir()`/`multiTenantEnv()`, below). These two behaviors are inseparable in the current code: there is no way to get per-tenant `CLAUDE_CONFIG_DIR` isolation *without* also disabling all filesystem settings sources, and no way to load filesystem settings (AAI or otherwise) *while* multiTenant isolation is active.

**`perTenantConfigDir()`** (`ChatClaudeAgentSDK.ts:164-169`):

```ts
function perTenantConfigDir(resolvedCwd: string): string {
  const digest = createHash('sha256').update(resolvedCwd).digest('hex');
  const dir = join(tmpdir(), 'claude-agent-sdk-tenants', digest.slice(0, 16));
  mkdirSync(dir, { recursive: true });
  return dir;
}
```

Computes `/tmp/claude-agent-sdk-tenants/<16-hex-chars-of-sha256(resolvedCwd)>` and unconditionally `mkdirSync(dir, { recursive: true })`s it — this is the exact fix landed for `AF-hqp5` (previously this function computed the path but never created the directory, so a `claude` CLI subprocess had nowhere to persist its session transcript and a second-turn `--resume` always reported "no conversation found"). **`mkdirSync` only creates the empty directory node — no code anywhere in `src/llm/claudeAgentSdk/**` or `src/hooks/**` writes any file content into it** (confirmed via a repo-wide grep for `writeFileSync`/`copyFileSync`/`cpSync`; the only hits in the whole `silmari-chat-agents` `src/` tree are in unrelated test/script files, none touching `.claude` or config dirs).

**`multiTenantEnv()`** (`ChatClaudeAgentSDK.ts:199-209`):

```ts
function multiTenantEnv(resolvedCwd: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value != null) env[key] = value;
  }
  env.CLAUDE_CONFIG_DIR = perTenantConfigDir(resolvedCwd);
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  return env;
}
```

Spreads every defined `process.env` key first (required because the SDK's own `Options.env` JSDoc, `sdk.d.ts:1461-1479`, states it **replaces** the subprocess environment wholesale rather than merging — omitting the spread would silently drop `PATH`/`HOME`/credentials), then sets exactly `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.

**`ensureClaudeConfigDirExists()`** (`ChatClaudeAgentSDK.ts:188-191`), called unconditionally before *every* `query()` call regardless of `multiTenant`:

```ts
function ensureClaudeConfigDirExists(): void {
  const dir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  mkdirSync(dir, { recursive: true });
}
```

In the non-multi-tenant path, this is the **one place in the entire chain** where a `.claude`-shaped directory is guaranteed to exist before the subprocess spawns — but again, only as an empty directory node if it didn't already exist. If the AAI package had been installed there beforehand (by `install.sh` or an equivalent step run against the server's own filesystem/home directory), this call is a no-op against existing content; if not, it silently creates an empty directory that satisfies the SDK's own `'user'`-level lookup with nothing in it.

**`cwd`/`workspace` resolution** — reused directly from this repo's own local-execution-engine convention, `getLocalCwd`/`getWorkspaceRoots` (`silmari-chat-agents/src/tools/local/LocalExecutionEngine.ts:227-260`):

```ts
// LocalExecutionEngine.ts:227-229
export function getLocalCwd(config?: t.LocalExecutionConfig): string {
  return resolve(config?.workspace?.root ?? config?.cwd ?? process.cwd());
}
```

`ChatClaudeAgentSDK.resolvedCwd()`/`.additionalDirectories()` (`ChatClaudeAgentSDK.ts:276-285`) call these with `{ cwd: this.cwd, workspace: this.workspace }`, and the result is passed as `Options.cwd` (line 396) and `Options.additionalDirectories` (lines 399-401) on every `query()` call — this is the value that determines the `'project'`-level settings-source location (`<resolvedCwd>/.claude`), separately from the `'user'`-level `CLAUDE_CONFIG_DIR` seam above.

**`createWorkspacePolicyHook`** (`silmari-chat-agents/src/hooks/createWorkspacePolicyHook.ts`) — a different, path-boundary-enforcement hook, not wired into `ChatClaudeAgentSDK.ts` at all (confirmed: the only reference inside `src/llm/claudeAgentSdk/` is a JSDoc comment at `types.ts:92`, not an import or call). Its `DEFAULT_EXTRACTORS` (`createWorkspacePolicyHook.ts:173-184`) are keyed to this repo's own local-engine tool names (`read_file`, `write_file`, `edit_file`, `grep_search`, `glob_search`, `list_directory`, `compile_check`), not Claude's built-in tool names (`Read`, `Write`, `Edit`, `Grep`, `Glob`, `Bash`) — so even if a host wired it in without a custom `pathExtractors` override, it would silently no-op against every Claude-internal tool call (falls through to `{ decision: 'allow' }` at `createWorkspacePolicyHook.ts:314-316`). This is exactly the gap `AF-j59p` already flags as open design point (3).

**`ClaudeAgentSDKSessionResumeError`** (`errors.ts:52-68`) — thrown at `ChatClaudeAgentSDK.ts:364-374` before any `query()` call, if a thread's recorded session `cwd` differs from the currently-resolved `cwd`. Relevant here because `perTenantConfigDir` derives `CLAUDE_CONFIG_DIR` deterministically from `resolvedCwd` — so a scheme that changes a tenant's `cwd` (e.g. to add a per-tenant AAI-config-bearing `'project'`-level directory) between turns of the same thread would need to account for this guard.

### 3. `docs/providers/claude-agent-sdk.md` — the provider's own documented posture

Full file read (`silmari-chat-agents/docs/providers/claude-agent-sdk.md`, 282 lines, 10 numbered sections). Section 5, "Workspace, multi-tenancy, and the `env` gotcha" (lines 133–153), is the sole section addressing any of this, and states the same mechanism described in §2 above in prose:

> "`clientOptions.multiTenant: true` sets `Options.settingSources: []` and an `Options.env` derived from `process.env` plus a per-tenant `CLAUDE_CONFIG_DIR` (deterministically derived from the resolved `cwd`) and `CLAUDE_CODE_DISABLE_AUTO_MEMORY`." (lines 141–144)

**The document contains zero references to shipping, installing, or bootstrapping a `.claude` directory tree** — no mention anywhere in its 282 lines of `settings.json`, a `skills/` directory, a `hooks/` directory, an `agents/` (subagent-definition) directory, a `commands/` directory, or `CLAUDE.md` provisioning. Its §10 "Not implemented this phase (deferred, not dropped)" list — the document's own consolidated TODO — likewise never raises native-config shipping as a deferred item; the closest adjacent item is "Exposing this repo's local-coding-engine tools, programmatic tool calling, or subagent delegation via `createSdkMcpServer`" (§10), which is a *different* mechanism (in-process MCP tool exposure, not filesystem `.claude` config) that the doc does not equate with the AAI question at all.

Other documented caveats relevant to any future integration:
- §4: session continuity is **process-local** (a process-local `Map<threadId, SessionEntry>`) unless a host supplies `clientOptions.sessionStore`.
- §6: only one `preToolUseHook`/one `postToolUseHook` slot each — a host running more than one `PreToolUse`-style hook (e.g. this repo's own tool-policy hook *and* a hypothetical AAI-hook bridge) "must compose them into one callback yourself."
- §7 (flagged as "the most important limitation in this document"): this repo's own ask/respond HITL flow is structurally incompatible with the SDK's `canUseTool` model; with no `hitlResolver` configured, any tool call reaching `canUseTool` is denied by default.

### 4. `silmari-chat`'s current wiring — what's actually set today

`Providers.CLAUDE_AGENT_SDK` is wired as a **provider discriminator on a custom endpoint**, not a first-class `EModelEndpoint`.

**`librechat.yaml:47-64`** (only `librechat.yaml` has this entry — not present in `librechat.example.yaml` or the e2e config yamls):

```yaml
    # Claude Agent SDK: spawns a local `claude` CLI subprocess per turn. Auth is
    # the CLI's own subscription login on the host running the server, not an
    # API key -- this endpoint declares no apiKey/baseURL/headers. Each turn's
    # subprocess is scoped (via packages/api/src/endpoints/custom/initialize.ts's
    # resolveClaudeAgentSdkWorkspace) to uploads/<the requesting user's own id>,
    # the same per-user directory the app's file-upload strategy already uses --
    # no cross-user filesystem access. `models.default` is cosmetic: this
    # provider has no per-request model selection (ClaudeAgentSDKClientOptions
    # has no `model` field), so there is exactly one selectable entry.
    - name: 'Claude Agent SDK'
      provider: 'claudeAgentSdk'
      models:
        default: ['default']
        fetch: false
      customParams:
        defaultParamsEndpoint: 'claudeAgentSdk'
      modelDisplayLabel: 'Claude Agent SDK'
```

**`initializeClaudeAgentSdk`** (`packages/api/src/endpoints/custom/initialize.ts:239-271`) builds the `clientOptions` actually passed downstream:

- `resolveClaudeAgentSdkWorkspace(req)` (lines 192-209): requires `req.user.id`; computes `resolved = path.resolve(UPLOADS_ROOT, userId)`; guards against path traversal outside `UPLOADS_ROOT`; `fs.mkdirSync(resolved, { recursive: true })` lazily. Returned value becomes `cwd`.
- A `preToolUseHook`, built via `createToolPolicyHook(...)` from `@librechat/agents` — either the configured `toolApproval` policy or `{ mode: 'bypass' }` if HITL is disabled globally. **This is a different hook from `createWorkspacePolicyHook`** (§2) — this one governs tool-call approval/denial, not filesystem path boundaries.
- Returns `{ provider: Providers.CLAUDE_AGENT_SDK, llmConfig: { cwd }, runtimeOptions: { preToolUseHook }, endpointTokenConfig }`.
- The function's own doc comment (`initialize.ts:233-237`) states explicitly: `workspace` (`additionalDirectories`) "stays unset: this is a single-root scope, not a multi-root one."

**No other `ClaudeAgentSDKClientOptions` field is set anywhere in `packages/api/src` or `api/`** — confirmed by exhaustive grep across both trees: **zero** hits for `CLAUDE_CONFIG_DIR` anywhere in `silmari-chat`'s own source (it appears only inside the vendored `node_modules/@librechat/agents` doc comments describing what `multiTenant: true` would derive internally — a field this repo's `initializeClaudeAgentSdk` never sets); `workspace` appears only in the doc-comment stating it "stays unset"; no `.claude`-path reference of any kind related to this provider exists in either directory tree.

**Dispatch path**: `initializeCustom` (`initialize.ts:359-548`) special-cases `isClaudeAgentSdkEndpoint(endpointConfig)` (line 386-388) and returns early via `initializeClaudeAgentSdk`, *before* any API-key extraction, URL validation, or model-fetch logic runs — the same early-exit pattern used for the BAML provider. `packages/api/src/endpoints/config/providers.ts` is the actual registration/dispatch site: `Providers.CLAUDE_AGENT_SDK` is **not** map-driven (unlike `XAI`/`DEEPSEEK`/`MOONSHOT`/`OPENROUTER`) — it's handled via an explicit re-entry branch (`providers.ts:179-194`) required because summarization/title/activity-label resolution re-enter `getProviderConfig` with the runtime provider value rather than the endpoint's name.

**Runtime option carrying**: `runtimeOptions.preToolUseHook` never reaches `agent.model_parameters` (which is what gets persisted to Mongo) — it's attached to the in-memory agent object via a non-enumerable `Symbol` carrier (`packages/api/src/agents/runtime.ts:31,48-59`, invisible to `JSON.stringify`/BSON/spread) and merged onto `llmConfig` only at the last possible moment, immediately before the `Run`/`ChatClaudeAgentSDK` construction (`packages/api/src/agents/run.ts:1407-1410`). `cwd`, by contrast, flows the ordinary persisted `model_parameters` path.

**Config-schema enforcement** (`packages/data-provider/src/config.ts:2072-2154`, `claudeAgentSdkEndpointIssues`): forbids `apiKey`/`baseURL`/`headers`/`directEndpoint`/`addParams`/`dropParams`, forbids `models.fetch: true`, forbids `customParams.paramDefinitions` — consistent with "the `claude` CLI subprocess owns its own sampling/auth," and leaves no schema-level surface for a host operator to configure `.claude`-tree location via `librechat.yaml` even if they wanted to (there is no `cwd`/`workspace`/`multiTenant` field anywhere in the custom-endpoint YAML schema for this provider — those are wired purely in application code, not exposed to config).

**Deployment**: no Dockerfile (`Dockerfile`, `Dockerfile.multi`, `.devcontainer/Dockerfile`) anywhere in `silmari-chat` references `claude` or `CLAUDE_CONFIG_DIR`; no `.env.example` entry configures either. The `claude` CLI binary's presence on the deployment host is an out-of-band assumption today — consistent with `AF-hqp5`'s notes describing a separate live Vultr deployment ("nolme-test") used specifically to reproduce the per-tenant-config-dir bug against a real `claude` CLI.

### 5. Related open work (beads)

- **`AF-1f56`** (P2, epic): "Wire `Providers.CLAUDE_AGENT_SDK` into silmari-chat + live inference" — tracks getting the provider live end-to-end; does not mention shipping AAI/native `.claude` config.
- **`AF-hqp5`** (P1, bug, open): "`ChatClaudeAgentSDK`: `perTenantConfigDir()` never created `CLAUDE_CONFIG_DIR`" — the bug whose fix is described in §2 above (`mkdirSync` added). Notes state the fix is "Fixed and pushed: `silmari-chat-agents f00cae4`, `silmari-chat` pin bump `cae504a9b`" and that a redeploy for a live 2-turn smoke test was awaited as of the issue's last update — but the beads issue itself is still listed `OPEN` as of this research, and the pinned commit currently referenced by `silmari-chat`'s `package.json` files (`2251771260c7c48c8790e510d5ab056c1b160ae1`) is a *different* hash than the one the bug's notes cite (`cae504a9b`) — this discrepancy is unresolved by anything read in this pass and is flagged as an open question below.
- **`AF-j59p`** (P2, open): "Design: multi-tenant workspace/cwd scoping for the Claude Agent SDK endpoint" — the closest existing tracked work to this research question, but scoped specifically to filesystem-tool path isolation (`createWorkspacePolicyHook` pathExtractors, `cwd`/`workspace` derivation, `ChatClaudeAgentSDKSessionResumeError` interaction) — it does **not** mention the AAI package, `install.sh`, or shipping native skills/hooks/agents/commands anywhere in its description, design notes, or acceptance criteria (re-confirmed by direct read of the full issue text during this research pass).
- **`AF-enki`**/**`AF-nr1p`** (P3, open): live-inference test harness and first live-inference run — both blocked on `AF-hqp5`; neither touches native-config shipping.
- No beads issue in either repo's tracker (39 open issues in this database as of this research) has a title or description referencing "AAI," "cosmic-agent-core," "agent infrastructure," or "install.sh" in connection with the Claude Agent SDK provider.

### 6. The missing handoff doc — located in the sibling repo

The handoff referenced by `AF-1f56`'s description (`thoughts/searchable/shared/handoffs/general/2026-08-15_15-51-25_implement-claude-agent-sdk-provider-complete.md`) does **not** exist in `silmari-chat`'s own `thoughts/` tree — it lives in the sibling repo, `silmari-chat-agents/thoughts/searchable/shared/handoffs/general/2026-08-15_15-51-25_implement-claude-agent-sdk-provider-complete.md`, and was read in full for this research. Its "Action Items & Next Steps" (6 items, matching `AF-1f56`'s dependency list) cover: getting the provider code to `silmari-chat` (via `npm link`/`file:` override or a committed+pushed+re-pinned dependency), reading the provider doc before integrating, checking `silmari-chat`'s provider-registration pattern, wiring `Providers.CLAUDE_AGENT_SDK` into provider selection, adding a live-inference test harness, and deciding whether the first live test needs hook/HITL bridging. **None of the 6 action items mention the AAI package or shipping native `.claude` configuration** — this handoff's scope was entirely the mechanical wiring already traced in §4, not the question this research document addresses.

## Code References

- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/install.sh:1-156` — bootstrap installer; no file-copy/write of any kind; `exec`s into `AAI-Install/main.ts --mode gui`
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/install.sh:60-68` — symlink-resolution logic, explicitly for the `~/.claude/` symlink case
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI-Install/README.md:210-217` — the four artifacts the downstream TS engine (not `install.sh`) actually writes
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI-Install/README.md:319-324` — "Known Limitations," incl. "Single-user — Installs to `~/.claude/` for the current user only"
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/README.md:5,192,205` — frames the tree as "the `.claude/` payload that gets installed into a project (or a user's home)"
- `/home/maceo/Dev/silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:164-169` — `perTenantConfigDir()`
- `/home/maceo/Dev/silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:188-191` — `ensureClaudeConfigDirExists()`, called unconditionally pre-`query()`
- `/home/maceo/Dev/silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:199-209` — `multiTenantEnv()`
- `/home/maceo/Dev/silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:276-285` — `resolvedCwd()`/`additionalDirectories()`, calling `getLocalCwd`/`getWorkspaceRoots`
- `/home/maceo/Dev/silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:364-374` — `ClaudeAgentSDKSessionResumeError` guard
- `/home/maceo/Dev/silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:393-404` — `Options` construction; the `multiTenant`-gated `settingSources`/`env` block
- `/home/maceo/Dev/silmari-chat-agents/src/hooks/createWorkspacePolicyHook.ts:173-184` — `DEFAULT_EXTRACTORS`, keyed to local-engine tool names not Claude's built-ins
- `/home/maceo/Dev/silmari-chat-agents/src/tools/local/LocalExecutionEngine.ts:227-260` — `getLocalCwd`/`getWorkspaceRoots`
- `/home/maceo/Dev/silmari-chat-agents/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1980-1989,7520` — `Options.settingSources` semantics and the `SettingSource = 'user' | 'project' | 'local'` type
- `/home/maceo/Dev/silmari-chat-agents/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1461-1479` — `Options.env` replace-not-merge semantics
- `/home/maceo/Dev/silmari-chat-agents/docs/providers/claude-agent-sdk.md:133-153` — "Workspace, multi-tenancy, and the `env` gotcha"
- `/home/maceo/Dev/silmari-chat-agents/docs/providers/claude-agent-sdk.md:267-281` — §10, the provider's own consolidated deferred-work list (no AAI/native-config item)
- `/home/maceo/Dev/silmari-chat/librechat.yaml:47-64` — the sole `librechat.yaml` entry for this provider
- `/home/maceo/Dev/silmari-chat/packages/api/src/endpoints/custom/initialize.ts:171-209` — `resolveClaudeAgentSdkWorkspace`
- `/home/maceo/Dev/silmari-chat/packages/api/src/endpoints/custom/initialize.ts:233-271` — `initializeClaudeAgentSdk`
- `/home/maceo/Dev/silmari-chat/packages/api/src/endpoints/custom/initialize.ts:359-388` — `initializeCustom`'s early-exit dispatch to `initializeClaudeAgentSdk`
- `/home/maceo/Dev/silmari-chat/packages/api/src/endpoints/config/providers.ts:179-194` — the re-entry dispatch branch for `Providers.CLAUDE_AGENT_SDK`
- `/home/maceo/Dev/silmari-chat/packages/api/src/agents/runtime.ts:31,48-59` — `Symbol`-carried `runtimeOptions`, invisible to persistence
- `/home/maceo/Dev/silmari-chat/packages/api/src/agents/run.ts:1407-1410` — last-moment `Object.assign(llmConfig, runtimeOptions)` merge
- `/home/maceo/Dev/silmari-chat/packages/data-provider/src/config.ts:2051-2154` — `claudeAgentSdkEndpointIssues`, forbidding auth/URL/param-definition fields in `librechat.yaml`
- `/home/maceo/Dev/silmari-chat-agents/thoughts/searchable/shared/handoffs/general/2026-08-15_15-51-25_implement-claude-agent-sdk-provider-complete.md` — full implementation handoff (lives in the sibling repo, not `silmari-chat`)

## Architecture Documentation

Patterns observed governing each system's own internal consistency (documented as-is, not evaluated):

- **AAI package**: home-relative (`AAI_DIR`/`$HOME/.claude`) path resolution throughout; two-layer bootstrap-then-engine installer design; single-user/single-machine installation model with no per-tenant or per-project concept anywhere in the reviewed source.
- **Claude Agent SDK provider**: `Options.settingSources`/`Options.env` are the SDK's own native levers for filesystem-config visibility and subprocess-environment control; the provider wraps them behind exactly one boolean (`clientOptions.multiTenant`) that couples per-tenant `CLAUDE_CONFIG_DIR` isolation to *disabling* all filesystem settings sources in the same conditional; `cwd`/`workspace` resolution is deliberately reused from this repo's pre-existing local-execution-engine convention (`getLocalCwd`/`getWorkspaceRoots`) rather than reimplemented.
- **`silmari-chat`'s wiring convention**: custom-endpoint providers with non-standard auth/config models (BAML, Claude Agent SDK) are special-cased with an early-exit dispatch inside the generic `initializeCustom` flow, and register via an explicit re-entry branch in `getProviderConfig` rather than the standard provider-config map — the same pattern applies to both providers.

## Workflow Closure Map

This section maps the real, already-existing production chain for *"does the subprocess spawned by a Claude Agent SDK conversation turn load any native `.claude` filesystem configuration"* — a genuine input → effect → observable-result chain that exists in shipped code today (a message is sent, a subprocess is spawned, that subprocess resolves settings sources per real, traceable logic), even though no code currently populates the AAI content into any location that chain reads from.

**Chain (depth 0 → 3):**

| Depth | Node | Evidence | Label |
|---|---|---|---|
| 0 | `librechat.yaml` custom-endpoint config (`provider: 'claudeAgentSdk'`) loaded via `loadCustomConfig.js` | `librechat.yaml:47-64`; `normalizeClaudeAgentSdkEndpoint` call site, `api/server/services/Config/loadCustomConfig.js:180` | production-called (this is the live config the running server loads) |
| 1 | `initializeClaudeAgentSdk()` — resolves per-user `cwd`, builds `preToolUseHook`; does **not** set `multiTenant`/`env`/`settingSources` | `packages/api/src/endpoints/custom/initialize.ts:239-271` | production-called (dispatched from `initializeCustom`, `initialize.ts:386-388`, on every request routed to this endpoint) |
| 2 | `ChatClaudeAgentSDK._streamResponseChunks` — resolves `resolvedCwd`, takes the `multiTenant !== true` branch, constructs `Options` with `cwd` set, `settingSources`/`env` left unset | `silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts:357-404` | production-called (the sole caller of `queryFn`/`query()` in this provider) |
| 3 | `claude` CLI subprocess's own native settings-source resolution (`'user'`/`'project'`/`'local'`, per the SDK's own default-all-sources behavior) | `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1980-1989` (SDK-documented default behavior; the subprocess itself is external, closed-source CLI, not part of either repo) | cross-boundary — a real subprocess spawn (`Options.cwd`/`Options.env` passed at `ChatClaudeAgentSDK.ts:393-404`), not further instrumented from inside either repo |

**Where the chain is currently incomplete, with evidence (not prescription):**

- **At the SOURCE end**: no code anywhere in `silmari-chat` or `silmari-chat-agents` writes AAI (or any) `settings.json`/`skills/`/`hooks/`/`agents/`/`commands/` content into any location node 3 would read — confirmed by exhaustive grep for `writeFileSync`/`copyFileSync`/`cpSync` across both repos' `src/` trees relevant to this provider (§2), and by the AAI package's own installer being a manual, single-machine, human-run script with no CI/deploy/runtime invocation anywhere in either repo (per the two prior research passes' §7 finding, re-confirmed: "a grep of every file under `AAI/*.md` for `AAI-Install` returned zero cross-references").
- **At the OBSERVABLE end**: no code path anywhere in the provider surfaces to the host application *which* files/skills/hooks node 3 actually loaded or used — the provider's own documentation states this as a known limitation ("If you need visibility into what Claude did — which files it touched, which commands it ran — that is not exposed by this provider today," `docs/providers/claude-agent-sdk.md` §2, lines 70-73). There is therefore no verified, resolvable "read path" symbol to cite for what a test or a human could observe to confirm AAI content was actually loaded by a given conversation turn.

Per the mapping convention, an incomplete chain is described precisely rather than prescribed a fix — the gap above is the literal current state, not a recommendation.

### ClosureMap (structured — derive() input)

```json
{
  "behavior": "A Claude Agent SDK conversation turn's spawned `claude` CLI subprocess resolves and (potentially) loads native `.claude` filesystem configuration (settings/skills/hooks/agents/commands) from a settings source visible to the host.",
  "git_commit": "79072aa6d447d508692f3a9e76dd26ec033df5f6",
  "repo": "/home/maceo/Dev/silmari-chat",
  "nodes": [
    { "id": "librechat-yaml-config", "module": "config/loadCustomConfig", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": "librechat.yaml endpoints.custom[] (provider: 'claudeAgentSdk')" },
    { "id": "initializeClaudeAgentSdk", "module": "packages/api/src/endpoints/custom/initialize.ts", "is_entrypoint": true, "adds_or_changes": false, "read_path": null, "seedable_store": null },
    { "id": "ChatClaudeAgentSDK.streamResponseChunks", "module": "silmari-chat-agents/src/llm/claudeAgentSdk/ChatClaudeAgentSDK.ts", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": null },
    { "id": "claude-cli-settings-resolution", "module": "@anthropic-ai/claude-agent-sdk (external subprocess)", "is_entrypoint": false, "adds_or_changes": false, "read_path": null, "seedable_store": null }
  ],
  "edges": [
    { "is_async": false, "cross_boundary": false, "driver": null },
    { "is_async": false, "cross_boundary": false, "driver": null },
    { "is_async": false, "cross_boundary": true, "driver": null }
  ]
}
```

Notes on this map's honesty constraints: `read_path` on the OBSERVABLE (last) node is `null` because no host-visible symbol exists that reports which settings sources/skills/hooks a given turn's subprocess actually loaded (documented provider limitation, above) — naming one would be an unresolvable ("guard air") citation. `seedable_store` on the SOURCE (first) node names the real config surface (`librechat.yaml`'s custom-endpoint array) that is the closest thing to a seedable origin in this chain; no code seeds *AAI content* into anything downstream. The final edge is `cross_boundary: true` (subprocess spawn) but `is_async: false` — `query()` is awaited synchronously within the same call, not queued/replayed, so no `driver` is applicable.

### Closure adapter (staged proposal)

> No closure adapter — the map's OBSERVABLE node has no resolvable `read_path` (§ above: the provider itself documents that "which files it touched, which commands it ran" is "not exposed... today"). Without a real observe-side symbol, a staged adapter's `/observe` op would have no production function to name, which is the same "guard air" problem the citation-resolvability rule exists to prevent. If a future change adds host-visible tool-use/skill-use telemetry to `ChatClaudeAgentSDK` (the provider's own §10 lists "Forwarding intermediate `tool_use`/`tool_result` activity as host-visible progress events" as deferred, not implemented), an adapter naming that symbol would become possible.

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-08-13-10-00-cosmic-agent-core-aai-integration-seams.md` — first-pass, broad inventory of the AAI package (source tree, hook-registration contract, skills/agents/commands native-format contracts, memory/delegation/Fabric path-resolution seam, VoiceServer/AAI-Install external dependencies, Actions/Pipelines/Flows, live SAI/AAI/PAI disambiguation in `~/.claude/`). Its own "Open Questions" section already asked, unresolved: "whether `AAI-Install/`... and `VoiceServer/`... are intended to come along, versus only `AAI/`, `hooks/`, `skills/`, `agents/`, `commands/`, and root `settings.json`" — directly relevant to any future "ship it" decision, still open.
- `thoughts/shared/research/2026-08-14-18-33-cosmic-agent-core-aai-algorithm-skills-hooks-cli-seams.md` — second pass, deep dive on Algorithm v3.7.0's load contract, the full `AAI/Tools/` file population (only 8/42 documented), `skills/` structural-compliance audit against its own rules, hook-count/`AlgorithmTab.hook.ts` documentation drift, the separately-deployed "zettel" memory service, and CLI-First/`CONTEXT_ROUTING.md` wiring.
- `silmari-chat-agents/thoughts/searchable/shared/handoffs/general/2026-08-15_15-51-25_implement-claude-agent-sdk-provider-complete.md` — the provider's own implementation-complete handoff (lives in the sibling repo); its 6 action items are entirely about mechanical wiring/testing, not native-config shipping (§6 above).
- `silmari-chat-agents/thoughts/searchable/shared/plans/2026-08-15-12-14-tdd-providers-claude-agent-sdk-phase0.md` (+ its `-REVIEW.md` sibling) — the canonical TDD plan for the provider itself (all 27 behaviors B0–B26 + 5 closures A–E marked done per the handoff); not re-read in full for this pass, but is the origin of every behavior/test-name cited in §2 above (e.g. "B16," "B15," "B19").
- Two new, currently-untracked handoff docs in `silmari-chat`'s own tree (`2026-08-13_22-13-17_clerk-auth-merged-cosmic-ds-inprogress.md`, `2026-08-15_10-39-32_clerk-railway-fix-vultr-pivot.md`) were checked and confirmed **unrelated** — both cover Clerk auth/Cosmic-DS/Railway-Vultr topics, with zero mentions of AAI, cosmic-agent-core, or agent infrastructure.

## Related Research

- `thoughts/shared/research/2026-08-13-10-00-cosmic-agent-core-aai-integration-seams.md`
- `thoughts/shared/research/2026-08-14-18-33-cosmic-agent-core-aai-algorithm-skills-hooks-cli-seams.md`

## Open Questions

- **Commit-hash discrepancy on `AF-hqp5`**: the beads issue's notes state the `CLAUDE_CONFIG_DIR`-creation fix was shipped at `silmari-chat` pin `cae504a9b`, but the `@librechat/agents` git-dependency hash currently in `silmari-chat`'s `package.json` files is `2251771260c7c48c8790e510d5ab056c1b160ae1` (matching the *handoff* doc's stated pre-fix `HEAD`, not the bug-fix commit the issue describes as already pushed). Nothing read in this pass resolves whether the pin has since moved forward and this research simply captured an earlier state, or whether the fix commit is not yet actually reflected in `silmari-chat`'s installed dependency — this bears directly on whether the multi-tenant/`CLAUDE_CONFIG_DIR` code path described in §2 is even exercisable in the currently-pinned code today.
- **Scope of "the agent infrastructure" to ship**: as the first prior research pass already flagged and this pass reconfirms unresolved — whether "ship" means the full AAI tree (`AAI/`, `hooks/`, `skills/`, `agents/`, `commands/`, root `settings.json`) or a narrower subset (e.g. excluding `AAI-Install/`, confirmed dead weight at runtime, and `VoiceServer/`, confirmed macOS-only and fail-silent) — is not settled by anything in either the source package or any beads issue/handoff found.
- **Where a shipped tree would live, given the `multiTenant` exclusivity finding (§2/Summary)**: whether the intended target is (a) a single shared server-wide `$HOME/.claude` (works today with `multiTenant` unset, but gives every tenant identical shared config and does nothing for the open `AF-hqp5`/`AF-j59p` isolation concerns), (b) a per-tenant `'project'`-level `<uploads/userId>/.claude` directory (would require new code to populate it per-user, and would need `settingSources` to include `'project'` explicitly rather than being left unset or `[]`), or (c) something else — none of which is stated or decided anywhere in the source material reviewed.
- **Deployment-host provisioning of the `claude` CLI itself**: confirmed absent from every build artifact in `silmari-chat` (§4); whatever process installs it on a real deployment host (per `AF-hqp5`'s live-Vultr-deployment notes) was not located or described in any file reviewed in this pass — a natural companion step to "shipping the AAI infrastructure" if that installation step is ever formalized in this repo's own deploy tooling.

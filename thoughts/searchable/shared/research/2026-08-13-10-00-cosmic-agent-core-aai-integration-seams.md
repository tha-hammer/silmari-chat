---
date: 2026-08-13T10:00:34-04:00
researcher: maceo
git_commit: cc84c390a6debcf51e10f904ab6512630c48a056
branch: main
repository: silmari-chat
topic: "Seams, interfaces, and contracts for copying the cosmic-agent-core AAI package into this repo's .claude/"
tags: [research, codebase, claude-code, aai, hooks, skills, agents, settings-json, cosmic-agent-core]
status: complete
last_updated: 2026-08-13
last_updated_by: maceo
---

# Research: Seams, interfaces, and contracts for copying the cosmic-agent-core AAI package into this repo's `.claude/`

## Research Question

The user wants to use the agent infrastructure documented at `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI/DOCUMENTATIONINDEX.md` inside this repository (`silmari-chat`). That infrastructure is built on Claude Code SDK conventions. Assuming the code is copied into this repo, what are the seams, interfaces, and contracts that determine whether it works?

**Scope note:** This user's live, currently-active Claude Code framework at `~/.claude/SAI` is a *separate* system (a symlink into an independent git repo, `silmari-agent-memory/SAI`) and is explicitly **not** part of what's being ported — see `§9` and the note at the end of the Summary. This research documents it only as pre-existing environment context.

## Summary

The source package (`cosmic-agent-core/v4.2.0/.claude/`, hereafter "the AAI package") is a full `.claude/` tree: native Claude Code `settings.json`, `hooks/`, `skills/`, `agents/`, `commands/`, plus AAI-specific additions (`AAI/` reference docs, `MEMORY/`, `lib/`, and two standalone side-apps, `AAI-Install/` and `VoiceServer/`). It is internally CLI-first (every skill capability is a companion Bun/TypeScript script), uses Claude Code's native `hooks` block in `settings.json` for all lifecycle wiring, and layers a two-tier SYSTEM/USER override convention plus its own memory/PRD/delegation/notification systems on top of that native surface.

The target (`silmari-chat/.claude/`) is nearly empty today: one `settings.json` with a single `bd prime` `SessionStart` hook, one skill (`baml-core`), and no `agents/`, `commands/`, or `hooks/` directories. Critically, **the entire `.claude/` directory is git-ignored** (`.gitignore:141`, `/.claude/`) with no negation — nothing under it is tracked, so a copy-in would land as local, uncommitted state unless the ignore rule is changed.

The seams that matter, in order of how much they constrain a straight file-copy:

1. **Path resolution is home-relative, not project-relative.** Every AAI subsystem (hooks, `ComposeAgent.ts`, Fabric, Memory) resolves paths against an `AAI_DIR` env var (default `${HOME}/.claude`) or hardcoded `~/.claude`/`$HOME/.claude` literals. No code path found resolves against a project directory (`CLAUDE_PROJECT_DIR` or equivalent). Copying `AAI/` + `hooks/` + `skills/` into `silmari-chat/.claude/` would only "just work" if `AAI_DIR` is pointed at this repo's `.claude/`, or if the package is left pointed at `$HOME/.claude`.
2. **Two subagent/skill/command files disagree with each other on frontmatter shape**, and the shipped `agents/*.md` files use a non-native `permissions.allow` block (settings.json-style permission strings) instead of Claude Code's standard `tools:` field — see `§4`.
3. **Two of the five non-trivial Actions, and the entire "Arbol" cloud-execution story, depend on a sibling monorepo layout** (`apps/video-pipeline/...`) that doesn't exist outside `cosmic-agent-memory` — see `§8`.
4. **`VoiceServer` is a macOS-only local daemon** (`launchctl`, `afplay`, `osascript`) that several hooks call over HTTP; all call sites fail silently by design if it's absent, so this is safe-but-inert on this Linux machine unless replaced — see `§6`.
5. **`AAI-Install` is dead weight for the purposes of "make it work" — it is a one-time GUI/CLI installer never invoked at runtime by any skill or hook** — see `§7`.
6. **Hook registration is additive, not exclusive** — this repo's one existing `SessionStart → bd prime` hook and AAI's ~9 hooks across the same event names can coexist in the same `settings.json` array, but two independent "work tracking" systems (`bd`/beads here vs. AAI's PRD/`MEMORY/WORK` + `PRDSync`/`WorkCompletionLearning` hooks) would then run side by side unless reconciled — see `§10`.
7. **Internal documentation has known drift from the shipped code** — two architecture docs are named `PAISYSTEMARCHITECTURE.md`/`PAIAGENTSYSTEM.md` on disk but referenced internally as `AAISYSTEMARCHITECTURE.md`/`AAIAGENTSYSTEM.md`; `THEHOOKSYSTEM.md` and `THEFABRICSYSTEM.md` each describe at least one path or hook that doesn't match the live `settings.json`/filesystem — see `§2` and `§5`.

## Detailed Findings

### 1. Source package inventory

`/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/` contains:

| Directory | Contents |
|---|---|
| `AAI/` | 20 reference `.md` docs + `doc-dependencies.json`, plus `ACTIONS/`, `Algorithm/`, `FLOWS/`, `PIPELINES/`, `Tools/`, `USER/` |
| `AAI-Install/` | Standalone installer app: `cli/`, `electron/`, `engine/`, `public/`, `web/` |
| `agents/` | 14 subagent definition `.md` files |
| `commands/` | 2 slash-command `.md` files (`compose_reel.md`, `zettel.md`) |
| `hooks/` | ~28 `*.hook.ts` files + `handlers/`, `lib/` |
| `lib/` | shared library incl. `lib/migration/` |
| `MEMORY/` | one file, `MEMORY/README.md` (tree is created lazily) |
| `skills/` | 18 top-level categories, 53 `SKILL.md` files total (router + leaf pattern) |
| `VoiceServer/` | standalone Bun HTTP daemon + `menubar/` tray plugin |
| root | `CLAUDE.md`, `CLAUDE.md.template`, `settings.json` (native, `$schema` = `claude-code-settings.json`), `skills.json` (AAI-generated catalog, not native), `statusline-command.sh`, `install.sh` |

The package's own top level (`v4.2.0/`, outside `.claude/`) contains only `.aai-version` (`v4.2.0`) and `install-compose-reel.sh` (a narrow installer for one specific pipeline+command pair, unrelated to `AAI-Install/`/`VoiceServer/`).

### 2. Core architecture & CLI-first contract (`AAI/*.md`)

`AAI/PAISYSTEMARCHITECTURE.md` (549 lines) is the tier-1 "master" doc. It is referenced internally — including by `AAI/doc-dependencies.json:7,64,77` and `AAI/CONTEXT_ROUTING.md:10` — as `AAISYSTEMARCHITECTURE.md`, but the file on disk is named `PAISYSTEMARCHITECTURE.md` (confirmed: `ls .../AAI/ | grep -i SYSTEMARCHITECTURE` returns `PAISYSTEMARCHITECTURE.md`). The same mismatch applies to `PAIAGENTSYSTEM.md` vs. its internal name `AAIAGENTSYSTEM.md`. No file anywhere in the reviewed set is literally named `AAISYSTEMARCHITECTURE.md`.

Its defining structural contracts:
- **Canonical skill structure** (`PAISYSTEMARCHITECTURE.md:262-299`): `skills/SkillName/SKILL.md` (required) + `Tools/*.ts` + `*.help.md`, optional `Workflows/*.md`.
- **CLI-First / Deterministic Code / Prompts Wrap Code** (`PAISYSTEMARCHITECTURE.md:132-141,175-195`; fully elaborated in `AAI/CLIFIRSTARCHITECTURE.md:1-19,55-378`): every capability is built first as a deterministic, flag-driven Bun/TypeScript CLI tool; the prose/skill layer only maps user intent to CLI invocations and never reimplements logic.
- **Two-tier SYSTEM/USER extensibility** (`AAI/SYSTEM_USER_EXTENDABILITY.md:24-140`): a cascading lookup — USER path checked first (`AAI/USER/...`), falls back to SYSTEM path, else a hardcoded default/fail-open. USER *replaces*, never merges with, SYSTEM. Implemented via a `paiPath(...)` helper (`SYSTEM_USER_EXTENDABILITY.md:166-174,199-200`).
- **TitleCase vs `_ALLCAPS` naming** (`AAI/SKILLSYSTEM.md:19-80`): system/shareable skills are TitleCase; personal/private skills use an `_ALLCAPS` prefix and are excluded from any public-repo export.
- **Flat folder structure mandate** (`SKILLSYSTEM.md:691-783`): only `Workflows/` and `Tools/` subdirectories are permitted inside a skill; context/reference docs must sit in the skill root, never under `Resources/`/`Docs/`/`Guides/`.
- **CLI entry points**: `AAI/Tools/algorithm.ts` (`bun ~/.claude/AAI/Tools/algorithm.ts -m loop -p <PRD-path> -n 20`, `AAI/CLI.md:22-31`) and `AAI/ACTIONS/pai.ts` (`bun ~/.claude/AAI/ACTIONS/pai.ts action <name> --input '<json>'`, `CLI.md:216-222`).
- **`doc-dependencies.json`** (179 lines) is a machine-readable cross-reference-integrity manifest (tier-1/tier-2 docs, `integrity_rules` for naming/auth/worker-list consistency) — presumably consumed by a system-integrity-check tool referenced conceptually in `PAISYSTEMARCHITECTURE.md:490`.
- A full-text grep for `/home/`, `/Users/`, and the literal username across these 11 doc files returned **zero matches** — every path reference in the docs uses `~/.claude/...`, bare relative paths, or `${PROJECTS_DIR}`/`${AAI_DIR}`/`{PRINCIPAL.NAME}` placeholders. The docs themselves are portable; the drift is in the *code*, not the docs (see `§3`, `§5`).

### 3. Hook registration contract

Hooks are wired exclusively through the top-level `"hooks"` object in `.claude/settings.json` — there is no separate hook-registration file. The exact JSON shape (`settings.json:67-227`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "${AAI_DIR}/hooks/SecurityValidator.hook.ts" }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "${AAI_DIR}/hooks/KittyEnvPersist.hook.ts" },
          { "type": "command", "command": "${AAI_DIR}/hooks/LoadContext.hook.ts" },
          { "type": "command", "command": "bun ${AAI_DIR}/hooks/handlers/BuildCLAUDE.ts" }
        ]
      }
    ]
  }
}
```

`matcher` is optional (omitted = fires for the whole event); when present it's a literal tool name (`Bash`, `Edit`, `Write`, `Read`, `AskUserQuestion`, `Task`, `Skill`). Hooks in the same matcher-group array run sequentially. `command` values interpolate `${AAI_DIR}`, defined in `settings.json:3-10`'s `env` block as `"${HOME}/.claude"`.

Full event registry, live in this package's `settings.json`:

| Event | Matcher(s) | Hooks registered |
|---|---|---|
| `PreToolUse` | `Bash`, `Edit`, `Write`, `Read` | `SecurityValidator.hook.ts` |
| `PreToolUse` | `AskUserQuestion` | `SetQuestionTab.hook.ts` |
| `PreToolUse` | `Task` | `AgentExecutionGuard.hook.ts` |
| `PreToolUse` | `Skill` | `SkillGuard.hook.ts` |
| `PostToolUse` | `AskUserQuestion` | `QuestionAnswered.hook.ts` |
| `PostToolUse` | `Write`, `Edit` | `PRDSync.hook.ts` |
| `SessionEnd` | — | `WorkCompletionLearning`, `SessionCleanup`, `RelationshipMemory`, `UpdateCounts`, `IntegrityCheck` (5 hooks) |
| `UserPromptSubmit` | — | `RatingCapture`, `UpdateTabTitle`, `SessionAutoName`, `BudgetCheck` (4 hooks) |
| `SessionStart` | — | `KittyEnvPersist`, `LoadContext`, `bun .../handlers/BuildCLAUDE.ts` (3 entries) |
| `Stop` | — | `LastResponseCache`, `ResponseTabReset`, `VoiceCompletion`, `DocIntegrity` (4 hooks) |

`PreCompact` is a Claude-Code-supported event but has no entries here. Every hook script begins `#!/usr/bin/env bun`; several use Bun-only APIs (`Bun.stdin.stream()`, `Bun.sleepSync()`, `Bun.spawnSync`, `import.meta.main`) that would not run under plain Node. No `package.json`/`bunfig.toml` exists under `.claude/` or `.claude/hooks/` to pin a Bun version.

**Documented-vs-shipped drift confirmed by two independent sub-agents**: `AAI/THEHOOKSYSTEM.md:184-196` lists a fifth `Stop` hook, `AlgorithmTab.hook.ts`, that does not exist on disk under `hooks/` and is not registered in `settings.json`. Conversely, `BudgetCheck.hook.ts` (registered) and the `bun .../BuildCLAUDE.ts` `SessionStart` entry (registered) are absent from `THEHOOKSYSTEM.md`'s hook list. `hooks/Doctor.hook.ts`, `hooks/ChecklistEnforcer.hook.ts`, and `hooks/ChecklistStateInjector.hook.ts` exist on disk but are referenced by no `settings.json` entry at all.

**Cross-repo relative import assumption**: `hooks/LoadContext.hook.ts:508` and `hooks/IntegrityCheck.hook.ts:56,71,92` dynamically `import()` via a relative path that climbs four levels out of `.claude/` — `'../../../../cosmic-agent-memory/integration/hooks/wire-retrieval'` (and `wire-fragments`, `wire-consolidation`, `wire-structure-notes`) — which assumes the specific `cosmic-agent-memory/apps/cosmic-agent-core/vX.Y.Z/.claude/` monorepo layout, not a generic `~/.claude` (or project-local `.claude/`) install. Both call sites wrap the import in try/catch with a fallback (`LoadContext.hook.ts:519-529`, `IntegrityCheck.hook.ts:62-65`), so a missing target degrades rather than crashes.

External calls made from inside hooks:
- **Voice notification** (`http://localhost:8888/notify`) — three call sites, see `§6`.
- **`ntfy.sh` push** (`hooks/lib/notifications.ts:64-92`) — implemented but not called by any currently-registered hook.
- **Anthropic usage/cost API** (`https://api.anthropic.com/api/oauth/usage`, `.../cost_report`) — `hooks/handlers/UpdateCounts.ts:191-219`, reading a bearer token from macOS Keychain or `~/.claude/.credentials.json`.
- **Discord webhook** — configured in `settings.json:1020-1023` and documented, but no sender implementation exists in `hooks/lib/` reachable from a registered hook.
- **Kitty terminal remote control** — `hooks/lib/tab-setter.ts` shells out to `kitten @` against a Unix socket resolved from env vars or a per-session state file, falling back to `/tmp/kitty-${USER}`.
- **`br`/beads CLI** — `hooks/lib/beads-index.ts` shells out to a `br` binary via `execFileSync`, degrading gracefully if absent.

### 4. Skills / Agents / Commands: native-format contracts (as actually shipped)

**Skills** (`skills/`, 53 `SKILL.md` files): every file opens with a `---`-delimited YAML block. 51/53 use exactly two fields, `name` and `description`; the `description` field almost universally embeds a literal `USE WHEN <trigger phrases>` clause (50/53). Two outliers carry a third field — `compliance_review/SKILL.md:1-5` adds `allowed-tools: Grep, Glob, Read, Bash`, and `Utilities/Browser/SKILL.md:1-5` adds `version: 3.3.0`. Example (`skills/Agents/SKILL.md:1-4`):

```yaml
---
name: Agents
description: Compose CUSTOM agents from Base Traits + Voice + Specialization for specialized perspectives. USE WHEN create custom agents, spin up agents, specialized agents, agent personalities, available traits, list traits, agent voices, compose agent, load agent context, agent profile, spawn parallel agents, launch agents. NOT for agent teams/swarms (use Delegation skill → TeamCreate).
---
```

Most categories use a two-level router pattern: a category-root `SKILL.md` that's just a routing table, plus one `SKILL.md` per nested sub-skill (e.g. `ContentAnalysis/SKILL.md` routes to `ContentAnalysis/ExtractWisdom/SKILL.md`). Companion CLI scripts are pervasive: 1016 `.ts` files across `skills/`, invoked via `bun run`; several `Tools/` directories carry their own `package.json`/`bun.lock` (e.g. `skills/Agents/Tools/`).

**Agents** (`agents/`, 14 flat `.md` files): frontmatter fields observed, in order — `name`, `description`, `model`, optional `isolation`, `color`, optional `voiceId`/`voice` (prosody block), optional `persona`, optional `skills`, `permissions.allow`. This **diverges from Claude Code's native subagent contract**, which typically expresses tool access via a `tools:` field — here it's instead a `permissions.allow` array shaped exactly like `settings.json` permission-rule strings (`"Read(*)"`, `"WebFetch(domain:*)"`, `"mcp__*"`). Example (`agents/BrowserAgent.md:1-15`, the leanest of the 14):

```yaml
---
name: BrowserAgent
description: Parallel headless browser automation agent using Playwright CLI. ...
model: sonnet
color: cyan
skills:
  - Browser
permissions:
  allow:
    - "Bash"
    - "Read(*)"
    - "Write(*)"
    - "Glob(*)"
    - "Grep(*)"
---
```
Only `Architect.md` and `Engineer.md` set `isolation: worktree`; only `BrowserAgent.md`/`UIReviewer.md` use the `skills:` field.

**Commands** (`commands/`, only 2 files, and they **disagree with each other**):
- `commands/compose_reel.md:1-3` has frontmatter (`description` only) and uses the native `$ARGUMENTS` placeholder in prose (`compose_reel.md:16-19`).
- `commands/zettel.md` has **no frontmatter at all** (zero `---` lines in 107 lines) and instead parses arguments via ad-hoc prose framing ("The user typed `/zettel <args>`. Parse `<args>`:", `zettel.md:33`) rather than `$ARGUMENTS`.

**Root `.claude/settings.json`** is genuinely Claude-Code-native (`$schema: "https://json.schemastore.org/claude-code-settings.json"`), with native `permissions`, `hooks`, `statusLine`, `mcpServers` (only `{"cloudflare": {"url": "https://mcp.cloudflare.com/mcp"}}`; no `.mcp.json` exists anywhere in the package), plus many **non-native custom top-level keys** riding in the same file (`env`, `spinnerVerbs`, `plansDirectory`, `loadAtStartup`, `dynamicContext`, `daidentity`, `pai`, `techStack`, `notifications`, `counts`, etc.). `skills.json` (99 KB, `version: "4.2.0"`) is a custom AAI-generated skill catalog layered on top — Claude Code itself discovers skills natively by walking `skills/*/SKILL.md` and has no manifest requirement, so this file is informational/tooling-only, not part of the native contract.

### 5. Memory, Delegation, Fabric systems — path-resolution seam

**Memory** (`AAI/MEMORYSYSTEM.md`): documented as a single persistent tree rooted at `~/.claude/MEMORY/`, with `WORK/`, `LEARNING/`, `RESEARCH/`, `SECURITY/`, `STATE/`, `AAISYSTEMUPDATES/` subtrees, keyed by a `project` field on individual records rather than partitioned by directory — i.e. **one global store shared across all projects**, not a per-repo store. Format is direct file I/O (Markdown + JSONL + JSON), no database. The actually-shipped `MEMORY/README.md:5-11` lists a *different* subtree set (`LEARNING/`, `RELATIONSHIP/`, `STATE/`, `VOICE/`) than `MEMORYSYSTEM.md`'s doc (omits `WORK/`, `RESEARCH/`, `SECURITY/`, `AAISYSTEMUPDATES/`; adds `RELATIONSHIP/`, `VOICE/` — both confirmed live in hook code, e.g. `hooks/RelationshipMemory.hook.ts:211`).

**Central path resolution**: `hooks/lib/paths.ts:32-40` (`getPaiDir()`) resolves `AAI_DIR`, defaulting to `join(homedir(), '.claude')`; `getMemoryDir()` (`paths.ts:73-75`) is defined as `paiPath('MEMORY')` — i.e. `MEMORY` is assumed to be a **direct child of `AAI_DIR`**, not nested under an `AAI/` subfolder, and always resolved against `AAI_DIR`/`HOME`, never against a project working directory. Several hooks bypass this helper and re-derive the base dir inline instead (e.g. `hooks/RatingCapture.hook.ts:63`, `hooks/SessionCleanup.hook.ts:41`: `process.env.AAI_DIR || join(process.env.HOME!, '.claude')`). `hooks/lib/identity.ts:12-13` hardcodes `SETTINGS_PATH = join(process.env.HOME!, '.claude/settings.json')` and does **not** honor `AAI_DIR` at all. `skills/Agents/Tools/ComposeAgent.ts:36-40` hardcodes `${HOME}/.claude/...` paths directly rather than going through any env var. No `CLAUDE_PROJECT_DIR`-style variable was found anywhere in the memory/agent-composition/Fabric path-construction code reviewed.

**Delegation** (`AAI/THEDELEGATIONSYSTEM.md`): uses Claude Code's native `Task` tool. Two distinct mechanisms both route through it — (1) *custom agents*, composed at runtime by `skills/Agents/Tools/ComposeAgent.ts` from `skills/Agents/Data/Traits.yaml` + a Handlebars template, then launched as `Task(subagent_type="general-purpose", prompt=<composed prompt>)`; (2) *agent teams*, gated behind `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `settings.json`, using `TeamCreate`/`TaskCreate`/`SendMessage`. A `PreToolUse` hook matched on `Task` (`hooks/AgentExecutionGuard.hook.ts`) injects a non-blocking warning if a non-fast `Task` call omits `run_in_background: true`.

**Fabric** (`AAI/THEFABRICSYSTEM.md`): patterns are directories with a `system.md` prompt file. The doc states the path as `~/.claude/skills/Fabric/Patterns/` (`THEFABRICSYSTEM.md:10,18,88-91`), but the **actual on-disk and manifest location is one segment deeper**: `skills/Utilities/Fabric/Patterns/` — a directory glob for `skills/Fabric/*` returns nothing. Invocation is "native" (the agent reads `system.md` and applies it directly); the external `fabric` CLI binary is invoked only for YouTube transcript extraction and pattern-repo sync.

### 6. VoiceServer — local daemon dependency

`VoiceServer/server.ts` is a standalone Bun HTTP server (no own `package.json`; single-file script) listening on `PORT` env var, default **8888**. Endpoints: `POST /notify`, `POST /notify/personality`, `POST /pai`, `GET /health`. It resolves voice settings from `~/.claude/settings.json` → `daidentity.voices` and reads `ELEVENLABS_API_KEY` from `~/.env`.

Startup is **macOS-only**: `install.sh` writes a `com.pai.voice-server` LaunchAgent plist to `~/Library/LaunchAgents/`; playback uses `/usr/bin/afplay` and notifications use `/usr/bin/osascript` — neither exists on this Linux machine, and no non-macOS fallback path was found. `VoiceServer/menubar/` is an optional SwiftBar/BitBar tray plugin polling `http://localhost:8888/health` every 5s.

`AAI/TOOLS.md:196` states explicitly: "Voice server must be running." `AAI/THENOTIFICATIONSYSTEM.md` prescribes a backgrounded, output-redirected `curl` pattern (`curl -s ... > /dev/null 2>&1 &`) and states the design principle "Fail gracefully — Missing services don't cause errors" (`THENOTIFICATIONSYSTEM.md:303`). All three TypeScript call sites that hit `/notify` (`hooks/UpdateTabTitle.hook.ts:224-233`, `hooks/handlers/VoiceNotification.ts:105-111`, `hooks/handlers/DocCrossRefIntegrity.ts:361-372`) wrap the `fetch` in try/catch with a timeout (3-10s) and treat a down server as a silent no-op. **Independently confirmed in this environment**: `curl -m 2 http://localhost:8888/` returns connection-refused — nothing is currently listening on 8888 on this machine.

### 7. AAI-Install — not invoked at runtime

`.claude/AAI-Install/` is a standalone installer app (CLI wizard, Electron GUI wrapping a Bun web server on `127.0.0.1:1337`, and a `headless-install.ts` shim for CI/SSH) that bootstraps a fresh AAI install onto `~/.claude/` — writing `settings.json`, `~/.config/AAI/.env`, `AAI/Algorithm/LATEST`, and a shell alias. A grep of every file under `AAI/*.md` for `AAI-Install` returned **zero cross-references** — no skill, hook, or doc invokes this installer at runtime; it is run manually, once, by a human (`bash AAI-Install/install.sh`). If this package is copied into another repo, `AAI-Install/` (and its own Electron/`node_modules` footprint) has no bearing on whether the copied skills/hooks/agents function — it is not part of the live Claude Code config surface at all.

### 8. Actions / Pipelines / Flows ("Arbol") — largely unbacked by real infrastructure, partially non-portable

An Action is a directory `AAI/ACTIONS/<A_NAME>/` with `action.json` (manifest) + `action.ts` (default-exported `execute(input, ctx)`). Locally, `AAI/ACTIONS/lib/runner.v2.ts` (`bun lib/runner.v2.ts run A_NAME --input '{...}'`) dynamically imports and calls the action in-process, building real local capability implementations (`llm` via `AAI/Tools/Inference.ts`, `shell` via Bun's `$`, file I/O via `Bun.file`). Despite `runner.v2.ts` accepting a `mode: "local"|"cloud"` option, **the cloud branch is never taken** — local capabilities are constructed unconditionally. The only HTTP-dispatch-to-Cloudflare-Workers code found anywhere is in an older, separately-maintained `lib/runner.ts`, itself only partially wired (`ACTIONS/pai.ts:180-183`: "Pipeline execution not yet implemented").

No `wrangler.{toml,json,jsonc}` exists anywhere in the `cosmic-agent-memory` checkout. All documentation of the deployed/Cloudflare side points at `~/Projects/arbol/` (`ACTIONS.md:396`, `PIPELINES.md:256`, `FLOWS.md:440`), which does not exist on this machine. `AAI/FLOWS/` contains only a `README.md` — no `flow-index.json` registry (referenced at `FLOWS.md:93-108`) or `MEMORY/STATE/flow-state.json` exists anywhere; the Flow concept (Cloudflare `scheduled()`/`fetch()` handlers) exists only as prose/code samples in the docs.

**Non-portable cross-app imports**: four of the shipped Actions (`A_BRIDGE_LABELS`, `A_CASCADE_EXTRACT`, `A_CASCADE_INGEST`, `A_YT_ACQUIRE`) import `ActionContext`/`pipelineError`/`silmariStoreBinary` via relative paths that climb six levels to a **sibling application outside `.claude/AAI` entirely** — `/home/maceo/Dev/cosmic-agent-memory/apps/video-pipeline/reel/lib/...` — and shell out to scripts whose default paths are hardcoded to `${HOME}/Dev/cosmic-agent-memory/apps/video-pipeline/...`. These targets exist in the `cosmic-agent-memory` monorepo but have no equivalent in `silmari-chat`; the two simplest example actions (`A_EXAMPLE_FORMAT`, `A_EXAMPLE_SUMMARIZE`) use a separate, self-contained `ActionContext` type from the local `lib/types.v2.ts` and have no such dependency.

Documented (but not present-on-disk) deploy commands imply a Cloudflare account, `wrangler` CLI, and Worker secrets (`AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`) — e.g. `bash deploy.sh a-your-action`, `npx wrangler secret put AUTH_TOKEN --name arbol-a-your-action` (`ACTIONS.md:333-334`).

### 9. Live environment: SAI vs. AAI vs. PAI in `~/.claude/`

*(Context only — SAI is explicitly out of scope for porting; see the Research Question scope note.)*

`~/.claude/CLAUDE.md` (line 1: `# SAI 4.0.3 — Silmari Agent Infrastructure`) directs Claude Code to load `SAI/Algorithm/v4.1.0.md` on ALGORITHM-mode work. `~/.claude/SAI` is a **symlink** to `/home/maceo/Dev/silmari-agent-memory/SAI` — a fully separate, ~36,000-file git repository containing its own `Algorithm/`, `agents/`, `commands/`, `hooks/`, `skills/`, `MEMORY/`, `settings.json`, `.git`, `.beads`, `.dolt`. `~/.claude/settings.json`'s `env` block sets `SAI_DIR=/home/maceo/.claude` (i.e. resolves through the symlink) and every hook command in that file uses `${SAI_DIR}/hooks/...`.

By contrast, `~/.claude/AAI/` (13 files, all leftover VC-portfolio JSON snapshots under `AAI/USER/ACTIONS/`) and `~/.claude/PAI/` (1 file, `PAI/MEMORY/SKILLS/execution.jsonl`) are **near-empty residual data directories** — not competing framework installs, and not related to or derived from the packaged `cosmic-agent-core/v4.2.0/.claude/AAI/` (135 files) by symlink or copy; they simply predate or are unrelated to that package's layout. The live `~/.claude/skills/` (84 entries), `~/.claude/agents/` (6 entries: `codebase-analyzer.md`, `codebase-locator.md`, `codebase-pattern-finder.md`, `thoughts-analyzer.md`, `thoughts-locator.md`, `web-search-researcher.md`), and `~/.claude/commands/` (43 entries) are the native, currently-active Claude Code directories — separate again from `SAI/`'s own internal `agents/`/`commands/`/`skills/`.

### 10. Target repo landing zone (`silmari-chat/.claude/`)

Current contents, in full:

```
.claude/
├── scheduled_tasks.lock       (116B — {"sessionId":...,"pid":...})
├── settings.json              (217B, quoted below in full)
└── skills/
    └── baml-core/
        └── SKILL.md           (frontmatter: name + description only, no USE WHEN)
```

`settings.json` in full:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "command": "bd prime --hook-json", "type": "command" }
        ],
        "matcher": ""
      }
    ]
  }
}
```

`.claude/agents/`, `.claude/commands/`, `.claude/hooks/`, and `.mcp.json` are **all absent**. There is no `.claude/CLAUDE.md` (the root-level `/CLAUDE.md` is the only one, and it is a tracked, checked-in file — see below).

**Git tracking**: `.gitignore:141` is `/.claude/` — a blanket, unnegated rule. `git ls-files .claude/` returns nothing; `git check-ignore -v` confirms every current file under `.claude/` (including `settings.json` and `skills/baml-core/SKILL.md`) matches that rule. `.gitignore:156-157` separately (redundantly) lists `.claude/settings.local.json` and `.mcp.json`. By contrast, root `CLAUDE.md` **is tracked** despite also matching a `.gitignore:182` pattern — git's already-tracked-path behavior means that pattern has no practical effect on the committed file.

**Runtime environment**: root `package.json` declares `"packageManager": "npm@11.13.0"`, no `engines` field, `workspaces: ["api", "client", "packages/*"]`. `.nvmrc` = `24.16.0` (matches root `CLAUDE.md`'s stated Node version). A full parallel set of `b:*` npm-scripts already invokes `bun` directly (e.g. `"b:api": "... bun run api/server/index.js"`, `package.json:95`) alongside the npm-based scripts; a `bun.lock` (~1.1 MB) exists at repo root alongside `package-lock.json` (~1.6 MB). No `bun` references exist in `Dockerfile`, `Dockerfile.multi`, or any `.github/workflows/` file — bun is a local/script-level convention only, not part of the container build or CI. No `wrangler`/Cloudflare-Workers configuration exists anywhere in the repo (the only `cloudflare` matches are Turnstile, an AI-Gateway proxy URL pattern, and a CDN allowlist — none are Workers infra).

Root `CLAUDE.md:189` confirms `bd` (beads) as this repo's task-tracking convention, separate from and pre-dating any AAI/PAI/SAI concept — see `§10` cross-reference in the Summary regarding the two independent work-tracking systems.

## Code References

- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI/DOCUMENTATIONINDEX.md` — top-level doc routing table (the file named in the research request)
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI/PAISYSTEMARCHITECTURE.md:262-299,351-372,459-528` — canonical skill structure, memory layout, security/repo-separation rules
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI/SKILLSYSTEM.md:177-460,691-783,875-959` — required SKILL.md structure, flat-folder mandate, Tools/ contract
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI/CLIFIRSTARCHITECTURE.md:1-19,55-378` — CLI-first pattern definition
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI/SYSTEM_USER_EXTENDABILITY.md:24-140,197-218` — SYSTEM/USER cascading-lookup contract and worked example
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI/doc-dependencies.json:6-7,64,77` — naming mismatch source (`AAISYSTEMARCHITECTURE.md` referenced, `PAISYSTEMARCHITECTURE.md` on disk)
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/settings.json:3-10,67-249` — `env` block (`AAI_DIR` default) and full `hooks` registration block
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/hooks/lib/paths.ts:32-40,52-54,73-75` — `getPaiDir()`, `paiPath()`, `getMemoryDir()`
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/hooks/lib/identity.ts:12-13` — hardcoded `~/.claude/settings.json`, bypasses `AAI_DIR`
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/hooks/LoadContext.hook.ts:439-441,508,519-529` — subagent detection + non-portable relative import with fallback
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/hooks/handlers/VoiceNotification.ts:24-37,105-136` — voice-notify payload shape and fail-silent guard
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/skills/Agents/Tools/ComposeAgent.ts:36-40` — hardcoded `${HOME}/.claude/...` paths
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/agents/BrowserAgent.md:1-15` and `agents/Architect.md:1-30` — subagent frontmatter contract (`permissions.allow`, non-native)
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/commands/compose_reel.md:1-3,16-19` vs. `commands/zettel.md:1,33` — inconsistent slash-command frontmatter/argument conventions
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI/ACTIONS/lib/runner.v2.ts:93-124,151-192,237,247` — local-only action execution
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI/ACTIONS/A_YT_ACQUIRE/action.ts:2-6,45-46` — non-portable cross-app import + hardcoded sibling-repo path
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/VoiceServer/server.ts:1-41,580-588` — notify endpoint/port/payload
- `/home/maceo/Dev/cosmic-agent-memory/apps/cosmic-agent-core/v4.2.0/.claude/AAI-Install/README.md:1-3`, `AAI-Install/install.sh:1-166` — installer, confirmed uninvoked at runtime
- `/home/maceo/.claude/CLAUDE.md:1,56` — live SAI mode-header directive (out of scope, context only)
- `/home/maceo/.claude/settings.json:3-10,67-249` — live hook registry, `SAI_DIR`/`AAI_DIR` env vars
- `/home/maceo/Dev/silmari-chat/.claude/settings.json:1-13` — target repo's sole existing hook (`bd prime --hook-json`)
- `/home/maceo/Dev/silmari-chat/.claude/skills/baml-core/SKILL.md:1-4` — target repo's only existing skill's frontmatter
- `/home/maceo/Dev/silmari-chat/.gitignore:141,156-157` — blanket `.claude/` git-ignore rule
- `/home/maceo/Dev/silmari-chat/package.json:2-10,20,95-108,223` — package manager, workspaces, `b:*` bun-script convention
- `/home/maceo/Dev/silmari-chat/.nvmrc:1` — pinned Node `24.16.0`
- `/home/maceo/Dev/silmari-chat/CLAUDE.md:189` — beads/`bd` task-tracking convention

## Architecture Documentation

Patterns observed as governing the AAI package's own internal consistency (documented here as-is, not evaluated):

- **CLI-First / Deterministic Code / Prompts Wrap Code** — every capability is a flag-driven CLI tool first; prompting/workflow layers only map intent to CLI invocations (`CLIFIRSTARCHITECTURE.md`, `PAISYSTEMARCHITECTURE.md` principles 5/6/10).
- **Two-tier SYSTEM/USER extensibility** — cascading lookup, USER-replaces-SYSTEM semantics, implemented per-subsystem via a `paiPath()`-style helper (`SYSTEM_USER_EXTENDABILITY.md`).
- **TitleCase (shareable) vs. `_ALLCAPS` (private) naming** — applies to skill directories, workflow files, and the YAML `name:` field (`SKILLSYSTEM.md:19-80`).
- **PRD format v2.0** — the unit of work for "The Algorithm": 8 required YAML frontmatter fields, 4 body sections (`Context`/`Criteria`/`Decisions`/`Verification`), stored at `MEMORY/WORK/{slug}/PRD.md`; sole writer is the AI via Write/Edit, hooks only read for sync (`PRDFORMAT.md`).
- **Hook-mediated, file-based memory** — no database; direct `fs` read/write from Bun/TS hook scripts against a `MEMORY/` tree, mediated entirely by Claude Code's native hook events, not by any custom "memory tool" the agent calls directly.

## Historical Context (from thoughts/)

None found. A recursive case-insensitive search of `thoughts/` for `AAI` or `cosmic-agent` returned no matches — this is the first research pass on this topic in this repository.

## Related Research

None. No other file in `thoughts/searchable/shared/research/` addresses AAI, PAI, SAI, or `cosmic-agent-core`.

## Workflow Closure Map

Not applicable. This research maps static configuration contracts and file/path seams across two systems (a not-yet-copied package and this repo's `.claude/`) — it does not cover a single production behavior with an input → effect → observable-result chain that code in *this* repository adds or changes. (The AAI package's own hook chains — e.g. `SessionStart → LoadContext.hook.ts → context injection` — are real, traceable behavior chains, but they exist entirely within the *source* package and the *live SAI* system, neither of which this task modifies; nothing here is newly "added or changed" by this research.) No `ClosureMap` or closure-adapter scaffold is emitted.

## Open Questions

- **`AAI_DIR` target**: every path-resolution mechanism found (`paths.ts`, `ComposeAgent.ts`, `identity.ts`, inline `BASE_DIR` fallbacks in individual hooks) resolves against `AAI_DIR` (default `${HOME}/.claude`) or a hardcoded `~/.claude`/`$HOME/.claude` literal. Nothing in the reviewed source resolves against a project directory. Whether a copy into `silmari-chat/.claude/` would set `AAI_DIR` to this repo's `.claude/` path, or leave the package pointed at `$HOME/.claude` (with only the doc/skill files living in-repo), is not settled by anything in the source material.
- **Scope of the copy**: whether `AAI-Install/` (confirmed dead weight at runtime) and `VoiceServer/` (confirmed macOS-only, fails-silent) are intended to come along, versus only `AAI/`, `hooks/`, `skills/`, `agents/`, `commands/`, and root `settings.json`.
- **Actions/Pipelines/Flows**: whether the two video-pipeline-coupled Actions (and the broader Arbol/Cloudflare story, which has no real deployed infrastructure anywhere in this environment) are meant to be part of the port, given their hard dependency on a `cosmic-agent-memory/apps/video-pipeline` sibling that doesn't exist in `silmari-chat`.
- **`.gitignore:141`**: everything under `.claude/` in this repo is currently git-ignored with no exceptions — whether a copied-in AAI tree is meant to be committed (requiring a `.gitignore` change) or remain local-only per developer is unresolved.
- **Two parallel work-tracking systems**: this repo's `bd`/beads convention (root `CLAUDE.md:189`, the existing `SessionStart → bd prime` hook) and AAI's own PRD/`MEMORY/WORK`-based tracking (`PRDSync.hook.ts`, `WorkCompletionLearning.hook.ts`) are structurally independent; whether/how they'd need to be reconciled if both hook sets are registered simultaneously is not addressed by any source document.
- **Documentation drift**: `THEHOOKSYSTEM.md`/`THEFABRICSYSTEM.md` describe at least one hook and one path that don't match the shipped code (`§3`, `§5`) — whether the docs or the code are the intended source of truth for a fresh copy is not stated anywhere in the package itself.

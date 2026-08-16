# Plan Review Report: AF-3rfc Isolated a11y E2E Runtime

Reviewed plan: `thoughts/searchable/shared/plans/2026-08-16-AF-3rfc-a11y-e2e-isolated-runtime-settings.md` at commit `f7fd96a30`.

## Review Summary

| Category | Status | Findings |
|---|---|---:|
| Contracts | ❌ | 2 critical, 2 warnings |
| Interfaces | ⚠️ | 1 warning |
| Promises | ⚠️ | 2 warnings |
| Data models | ✅ | Not applicable; runtime-env JSON evidence is identified |
| APIs | ✅ | Not applicable; no production API changes |
| CodeCleanup gates | ❌ | 1 critical, 1 warning |

## Well-Defined Decisions

- Relative `page.goto('/')` navigation correctly delegates origin selection to inherited `use.baseURL`.
- `start-server.js`, `reuseExistingServer: false`, exact `testMatch: 'a11y.spec.ts'`, and an a11y-local channel-aware `projects` override jointly cover the bead's isolation, server-ownership, suite-membership, and setup/worker-channel promises.
- The RED `--list` probe is safe: it starts neither global setup nor `webServer`, and it already demonstrated 19 tests in 11 files under `[chromium]` without contacting port 3080.
- Production APIs, schemas, user documents, and auth-user cache invalidation are not involved.

## Critical Issues

### 1. The proposed environment cleanup silently changes existing a11y behavior

Phase 2 says to call `getLocalE2EEnv()` and delete the current literal `webServer.env` block. That is not behavior-preserving. Importing `mainConfig` has already assigned `getBaseE2EEnv()` to `process.env`; its defaults are `SESSION_EXPIRY=3600000` and `REFRESH_TOKEN_EXPIRY=3600000` (`e2e/setup/env.ts:122-124`). The current a11y specialization deliberately overrides those values to `60000` and `300000` (`e2e/playwright.config.a11y.ts:22-23`). Removing the block changes session semantics unrelated to AF-3rfc and contradicts the plan's narrow-scope promise.

Required amendment: preserve the existing `env` block byte-for-byte. Change only its surrounding server command/reuse fields. Do not add `getLocalE2EEnv()` in this bead.

### 2. The verification commands are not executable in this worktree as written

This worktree has no `node_modules`, `client/dist`, or `packages/data-provider/dist`. Plain `npx playwright ...` currently downloads/runs an unrelated Playwright and fails to resolve `@playwright/test`; a full server run also lacks built frontend/package artifacts. The plan must not claim an executable gate while omitting dependency/build preparation.

Required amendment: lock one concrete dependency route before Green validation. The available local route is the existing `/home/maceo/Dev/silmari-chat/node_modules`; use an explicit `PATH`/`NODE_PATH` (or another owner-approved non-destructive bootstrap), run `npm run e2e:prepare`, and record the exact command. The safe RED command that already worked used:

```bash
NODE_PATH=/home/maceo/Dev/silmari-chat/node_modules \
  E2E_BASE_URL=http://127.0.0.1:3339 \
  E2E_CHROMIUM_CHANNEL=chrome \
  /home/maceo/Dev/silmari-chat/node_modules/.bin/playwright \
  test --config=e2e/playwright.config.a11y.ts --list
```

Do not proceed to the full run until the current worktree's frontend/package build exists.

## Warnings and Exact Amendments

### Interface and import contract

The plan says to import `devices` "with `PlaywrightTestConfig`." Repository rules require standalone type imports. Specify `import { devices } from '@playwright/test'` and `import type { PlaywrightTestConfig } from '@playwright/test'`, then run the targeted import sorter. Preserve `dotenv` evaluation and the local `mainConfig` import.

### Exact command acceptance

The plan validates a direct headless Playwright invocation, while `npm run e2e:a11y` includes `e2e:prepare` and `--headed`. Add an exact-script gate using the installed `xvfb-run`, or explicitly state why the direct config command is the authoritative automated gate and record the exact script as a separately attempted environment result. Do not report the npm entrypoint green without executing it.

### Runtime-env evidence freshness

The default `e2e/specs/.test-results/runtime-env.json` can predate this run. Set a unique `E2E_RUNTIME_ENV_PATH` for validation and assert that newly-created file's `MONGO_URI` is loopback, uses neither 27017 nor 3080, and matches the startup log.

### A11y assertion failures versus harness completion

The plan requires four passing a11y tests. Keep that as the desired result, but distinguish harness acceptance from pre-existing auth/axe failures: the AF-3rfc gate is that exactly four intended tests execute against the isolated server/channel and memory Mongo. If an assertion fails after that chain is proven, capture it precisely and do not broaden this bead into UI/auth repair or falsely report the suite green.

### Source gates must have useful exit status

The negative `rg` command intentionally returns status 1 when clean. Write it as `! rg -n ...` (or explicitly inspect empty output) so automation treats the absence of forbidden strings as success. Use exact targeted commands for Prettier, ESLint, and import sorting rather than placeholders.

## Safety Promise Review

- Keep `reuseExistingServer: false`; otherwise Playwright may suppress the harness command and reuse the live listener currently on 3080.
- Never validate that setting by running against the default 3080 URL. Even an availability probe can contact that service. Prove it by config/source inspection or against a disposable server on another owned port.
- Check the alternate port is free immediately before startup. All browser/server commands must carry the same explicit `E2E_BASE_URL`.
- Force `E2E_USE_MEMORY_MONGO=true` in the evidence run. The implementation may retain shared `auto` semantics, but the proof must not depend on local 27017 state.

## CodeCleanup Plan-Hygiene Review

- No side-effecting or mutating control expressions are proposed; the conditional channel spread mirrors established code and is a pure selection.
- `rootPath`, `serverPath`, and `chromiumChannel` are appropriate named values.
- The `getLocalE2EEnv()` cleanup is unsafe here because it changes session-expiry behavior while solving an unrelated harness bug. Preserve the literal env contract and keep the diff reviewable in seconds.
- No nesting or maintainability-recovery work is needed beyond removing the obsolete `absolutePath` direct-server target.

## Suggested Plan Amendment

```diff
 Phase 2
- Import and call getLocalE2EEnv(), then delete the duplicated literal env block.
+ Preserve the existing webServer.env block and its SESSION_EXPIRY/REFRESH_TOKEN_EXPIRY values.
+ Add type-only PlaywrightTestConfig import and value-only devices import.
  Resolve rootPath/serverPath; command start-server.js; reuseExistingServer false.
  Add channel-aware projects and exact string testMatch.

 Phase 3
+ Bootstrap/build this worktree with one explicit dependency route before Playwright startup.
+ Set a unique E2E_RUNTIME_ENV_PATH and inspect only that newly-created file.
+ Add an exact npm-script/xvfb gate or document its concrete environment result.
+ Never run a default-URL reuse check against occupied port 3080.
~ Treat four passing tests as desired; separately record proven harness execution and any unrelated assertion failure.
```

## Approval Status

- [ ] Ready for implementation
- [ ] Needs minor revision
- [x] Needs major revision: resolve both critical issues before implementation


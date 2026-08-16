# AF-3rfc: Isolated a11y E2E Runtime Implementation Plan

## Overview

Make the accessibility Playwright suite use the same isolated runtime inputs and server harness as the supported E2E configs. The change keeps implementation ownership narrow to the a11y spec and a11y config, prevents checkout-directory names from broadening test selection, and proves the result on an alternate port without sending any request to the live service currently listening on port 3080.

## Current State Analysis

- `e2e/specs/a11y.spec.ts:7,15,30,38` navigates to the literal `http://localhost:3080/`, bypassing Playwright's configured `use.baseURL`.
- `e2e/playwright.config.a11y.ts:4,15` replaces the inherited `e2e/setup/start-server.js` command with direct execution of `api/server/index.js`, bypassing memory-Mongo provisioning and runtime-env publication.
- `e2e/playwright.config.a11y.ts:55` uses `testMatch: /a11y/`. Playwright applies this regular expression to absolute paths, so this checkout's `a11y-e2e-*` parent directory makes the config select 19 tests in 11 files, including `specs/real/*`, rather than the four a11y tests.
- `e2e/setup/authenticate.ts:9,52-55` honors `E2E_CHROMIUM_CHANNEL` for global setup, while the inherited worker project in `e2e/playwright.config.ts:45-49` does not. `e2e/playwright.config.mock.ts:22,140-146` and `e2e/playwright.config.real.ts:30,134-140` show the established worker-channel pattern.
- `e2e/playwright.config.ts:69` allows `reuseExistingServer: true`. Because port 3080 is currently listening, the a11y specialization must override reuse so an unset or incorrect isolated URL fails instead of silently testing the existing service.
- `e2e/setup/env.ts:37-46,100-125` already derives base URL, host, port, domains, generated secrets, and memory-Mongo mode through the imported `mainConfig`. The current a11y `webServer.env` block deliberately narrows `SESSION_EXPIRY` to `60000` and `REFRESH_TOKEN_EXPIRY` to `300000`; replacing it with `getLocalE2EEnv()` would silently change both to `3600000`.
- This worktree initially has no `node_modules` or built frontend/package output. A plain `npx playwright --list` failed to resolve `@playwright/test`, so Green validation requires an explicit `npm ci` and the repository's `e2e:prepare` build path.

## Desired End State

With `E2E_BASE_URL=http://127.0.0.1:43127`, `E2E_USE_MEMORY_MONGO=true`, and `E2E_CHROMIUM_CHANNEL=chrome`:

- Playwright lists exactly four tests from `e2e/specs/a11y.spec.ts`, all under project `[chrome]`.
- Global setup logs `using baseURL http://127.0.0.1:43127` and uses the same Chrome channel as workers.
- The web server command is `e2e/setup/start-server.js`, logs an ephemeral memory-Mongo URI, and writes that URI to the runtime-env file.
- Every a11y navigation resolves from Playwright's configured base URL; neither target source file contains a direct `localhost:3080` navigation or `api/server/index.js` command.
- The a11y config refuses to reuse an already-listening server. Nothing sends a request to the service currently listening on port 3080.

### Key Discoveries

- The codebase convention is relative navigation such as `page.goto('/')` in `e2e/specs/landing.spec.ts:5` and `e2e/specs/nav.spec.ts:5,13`; Playwright resolves it against `use.baseURL`.
- `e2e/playwright.config.local.ts:4-22` is the closest server-path pattern: resolve the repository root and launch `start-server.js`. Its `getLocalE2EEnv()` cleanup is not copied because the a11y config has distinct expiry values that this bead preserves.
- Playwright prepends `**/` to the string `testMatch: 'a11y.spec.ts'` before matching the full path. That filename-only glob cannot be broadened by a parent directory named `a11y`; the pre-change regular expression can.
- `E2E_USE_MEMORY_MONGO=true` is required for deterministic proof. The shared default `auto` mode deliberately reuses a reachable configured Mongo (`e2e/setup/start-server.js:126-140`).

## What We're NOT Doing

- Changing `DEFAULT_BASE_URL`; port 3080 remains the suite-wide fallback when no isolated URL is supplied.
- Modifying or probing the service listening on port 3080.
- Changing `e2e/setup/env.ts`, `e2e/setup/start-server.js`, or production server/database code.
- Repairing hardcoded URLs in `keys.spec.ts`, `messages.spec.ts`, `popup.spec.ts`, or `settings.spec.ts`; they are outside AF-3rfc.
- Changing the base/local Playwright configs' reuse or channel behavior. The a11y specialization will enforce its stricter acceptance contract locally.
- Changing the a11y config's existing `SESSION_EXPIRY=60000`, `REFRESH_TOKEN_EXPIRY=300000`, or any other `webServer.env` value.
- Adding a new test framework solely for config assertions; Playwright's safe `--list` mode and the isolated full run are the executable regression checks.

## Implementation Approach

Align only the stale URL, server-entrypoint, test-selection, reuse, and browser-channel seams while preserving the existing a11y environment block exactly. First preserve RED evidence with a server-free `--list` probe and source assertions. Then update relative navigation and the a11y config as one coherent harness change. Finally install exact locked dependencies, validate config selection before starting anything, and run the repository's exact headed a11y script under Xvfb on a confirmed-free alternate port with memory Mongo forced and server reuse disabled.

## Smallest Testable Behaviors

1. **Configured navigation** — Given an alternate `E2E_BASE_URL`, when Playwright loads the a11y spec, then all four navigations resolve against that configured origin and no source-level navigation names port 3080.
2. **Exact suite membership** — Given a checkout path containing `a11y`, when the a11y config is listed, then exactly the four `a11y.spec.ts` tests are selected and no real-provider spec is selected.
3. **Channel alignment** — Given `E2E_CHROMIUM_CHANNEL=chrome`, when global setup and test workers launch, then both use Chrome and `--list` labels the sole project `[chrome]`.
4. **Owned isolated harness** — Given a free alternate port and `E2E_USE_MEMORY_MONGO=true`, when the exact a11y script runs, then it launches `start-server.js`, refuses server reuse, publishes a fresh ephemeral Mongo URI, and never contacts port 3080.
5. **Environment preservation** — Given the current a11y specialization, when the config is changed, then its existing `webServer.env` entries and expiry values remain unchanged.

## Workflow Closure

No production workflow closure applies. AF-3rfc changes test-runner configuration only; there is no production source-of-truth write, asynchronous projector, or user-visible production read model. The blocking integration proof is the isolated Playwright run itself, which crosses the changed config-to-server and config-to-browser seams without mocking either span.

## Phase 1: Preserve RED Evidence and Safety Preconditions

### Overview

Record the current failure without starting global setup or a web server, and establish guardrails that keep the live port-3080 service untouched.

### Changes Required

No repository files change in this phase.

1. Confirm Node 24.16.0 and available Chrome.
2. Confirm port 43127 is free and port 3080 is listening using `ss`; do not use `curl`, Playwright, or any other request against 3080.
3. Run the a11y config with `--list` and isolated env inputs through the previously installed dependency tree. Preserve the expected RED result: 19 tests in 11 files and `[chromium]` project labels despite `E2E_CHROMIUM_CHANNEL=chrome`.
4. Run source assertions that demonstrate hardcoded `localhost:3080`, direct `api/server/index.js`, unanchored `testMatch`, and inherited `reuseExistingServer: true`.

### Success Criteria

#### Automated Verification

- [ ] `node --version` prints `v24.16.0`.
- [ ] `google-chrome --version` succeeds.
- [ ] `ss -ltn '( sport = :43127 )'` has no listening entry before the full run.
- [ ] The already-recorded safe RED command below reports 19 tests in 11 files and `[chromium]` labels:

  ```bash
  NODE_PATH=/home/maceo/ntm_Dev/clerk-auth-2026-08-13-05-31/node_modules \
    E2E_BASE_URL=http://127.0.0.1:43127 \
    E2E_USE_MEMORY_MONGO=true \
    E2E_CHROMIUM_CHANNEL=chrome \
    /home/maceo/ntm_Dev/clerk-auth-2026-08-13-05-31/node_modules/.bin/playwright \
    test --config=e2e/playwright.config.a11y.ts --list
  ```
- [ ] No command sends an HTTP request to port 3080.

#### Manual Verification

- [ ] The recorded RED output is attributable to absolute-path matching and the missing worker-channel override, not to server startup or browser execution.

## Phase 2: Align the a11y Spec and Config

### Overview

Make the a11y suite consume Playwright's isolated URL, memory-Mongo server wrapper, exact test membership, and requested browser channel without altering its existing runtime env values.

### Changes Required

#### 1. Accessibility spec navigation

**File**: `e2e/specs/a11y.spec.ts`

Replace all four absolute navigations with the established relative form:

```ts
await page.goto('/', { timeout: 5000 });
```

This keeps `e2e/setup/env.ts` as the single source of the configured base URL through `playwright.config.ts`'s inherited `use.baseURL`.

#### 2. Accessibility Playwright specialization

**File**: `e2e/playwright.config.a11y.ts`

- Import the `devices` value from `@playwright/test` and import `PlaywrightTestConfig` separately with `import type`, following repository import rules.
- Resolve `rootPath` from `__dirname` and `serverPath` as `e2e/setup/start-server.js`.
- Point `webServer.command` at `serverPath`, set `cwd: rootPath`, and set `reuseExistingServer: false` so an occupied target fails closed.
- Preserve the existing `webServer.env` block byte-for-byte, including `SESSION_EXPIRY: '60000'` and `REFRESH_TOKEN_EXPIRY: '300000'`; do not import `getLocalE2EEnv()`.
- Override `projects` with the mock/real pattern: project name is `E2E_CHROMIUM_CHANNEL` or `chromium`, and worker `use.channel` is present only when the env variable is set.
- Replace `testMatch: /a11y/` with the filename-only string glob `testMatch: 'a11y.spec.ts'`.
- Preserve a11y-specific retries, setup/teardown selection, non-parallel execution, and inherited base URL/reporting/storage behavior.

### Success Criteria

#### Automated Verification

- [ ] `! rg -n "localhost:3080|api/server/index\\.js|testMatch: /a11y/" e2e/specs/a11y.spec.ts e2e/playwright.config.a11y.ts` exits 0.
- [ ] `rg -n "page\\.goto\\('/'|start-server\\.js|reuseExistingServer: false|testMatch: 'a11y\\.spec\\.ts'|E2E_CHROMIUM_CHANNEL" e2e/specs/a11y.spec.ts e2e/playwright.config.a11y.ts` finds every intended contract.
- [ ] `npx prettier --check e2e/specs/a11y.spec.ts e2e/playwright.config.a11y.ts` passes.
- [ ] `npx eslint e2e/specs/a11y.spec.ts e2e/playwright.config.a11y.ts` passes.
- [ ] `node scripts/sort-imports.mts --check e2e/specs/a11y.spec.ts e2e/playwright.config.a11y.ts` passes.

#### Manual Verification

- [ ] The diff contains no production code, document mutation, or unrelated E2E spec changes.
- [ ] The a11y config remains a specialization of `mainConfig`, and a diff comparison confirms every pre-existing env key/value is preserved.

## Phase 3: Isolated Config and Full-Suite Validation

### Overview

Prove selection/channel behavior without startup first, then run only the four intended a11y tests against a disposable server and database on the alternate port.

### Changes Required

No additional repository code is expected in this phase; failures are resolved within the two Phase 2 files if they expose an implementation mistake.

1. Run `npm ci` under Node 24.16.0 so this worktree uses its own lockfile-exact dependencies and workspace links.
2. Run `--list` with the isolated URL, forced memory Mongo, and Chrome channel. It must list exactly four `[chrome]` a11y tests.
3. Create unique runtime-env and log paths with `mktemp`; do not inspect the shared default runtime-env file as freshness evidence.
4. Reconfirm port 43127 is free immediately before the full run. Do not probe port 3080 with Playwright or HTTP.
5. Run the exact `npm run e2e:a11y` entrypoint under installed `xvfb-run`; that script performs `npm run e2e:prepare` before headed Playwright startup. Capture output for Beads closure evidence.
6. Verify stdout contains the isolated base URL and `[e2e] Started memory MongoDB at mongodb://127.0.0.1:<ephemeral-port>/LibreChat-e2e`.
7. Verify the unique runtime-env file contains a loopback Mongo URI on neither 27017 nor 3080 and matches the startup log.
8. Re-run the source gate and inspect `git diff --check`/`git status`.

### Success Criteria

#### Automated Verification

- [ ] `npm ci` exits 0 without changing tracked dependency manifests or the lockfile.
- [ ] `E2E_BASE_URL=http://127.0.0.1:43127 E2E_USE_MEMORY_MONGO=true E2E_CHROMIUM_CHANNEL=chrome npx playwright test --config=e2e/playwright.config.a11y.ts --list` exits 0 with exactly four tests in one file, all labeled `[chrome]`.
- [ ] The exact headed script is attempted with fresh evidence paths:

  ```bash
  set -o pipefail
  AF3RFC_RUNTIME_ENV=$(mktemp /tmp/af-3rfc-runtime-env.XXXXXX)
  AF3RFC_RUN_LOG=$(mktemp /tmp/af-3rfc-a11y.XXXXXX)
  E2E_BASE_URL=http://127.0.0.1:43127 \
    E2E_USE_MEMORY_MONGO=true \
    E2E_CHROMIUM_CHANNEL=chrome \
    E2E_RUNTIME_ENV_PATH="$AF3RFC_RUNTIME_ENV" \
    xvfb-run -a npm run e2e:a11y 2>&1 | tee "$AF3RFC_RUN_LOG"
  ```

- [ ] Desired result: the exact script exits 0 with four passing tests. If an auth/axe assertion fails only after the isolated harness chain is proven, record the exact failure separately and do not broaden AF-3rfc or report the suite green.
- [ ] Full-run logs contain `using baseURL http://127.0.0.1:43127` and `[e2e] Started memory MongoDB` with a non-27017 port.
- [ ] The fresh runtime-env file records the same loopback ephemeral memory-Mongo URI and uses neither port 27017 nor 3080.
- [ ] `git diff --check` exits 0.
- [ ] Final source grep finds no direct port-3080 target in the a11y spec/config.

#### Manual Verification

- [ ] The port-3080 listener remains untouched; no validation command was addressed to it.
- [ ] Failure cleanup leaves no listener on port 43127 and no memory-Mongo child process.

## Testing Strategy

### Config-Level Regression Checks

- Use `--list` as the durable executable check for exact file membership and requested project/channel without starting the server.
- Use source assertions for properties Playwright does not print in list mode: relative navigation, shared server command, and disabled reuse.
- Preserve the RED/Green transition: 19 `[chromium]` tests before the change, exactly four `[chrome]` tests after it.

### End-to-End Validation

- Exercise the actual shared `start-server.js` wrapper, global authentication, four a11y tests, and teardown on an isolated URL.
- Force `E2E_USE_MEMORY_MONGO=true` so proof is independent of local port-27017 state.
- Use system Chrome explicitly so global setup and workers demonstrate matching channel behavior.
- Treat isolated harness completion and a11y assertion success as distinct evidence fields; both are reported accurately.

### Manual Safety Checks

1. Inspect listener state without contacting port 3080.
2. Confirm the chosen alternate port is free.
3. Confirm the list contains only four a11y tests before allowing any server startup.
4. Confirm the alternate app and memory Mongo are gone after teardown.

## Performance Considerations

The implementation changes only test configuration. The shared wrapper adds memory-Mongo startup to the a11y run, matching supported E2E behavior; test count is reduced from the accidental 19-test selection to the intended four. No production runtime path changes.

## Migration Notes

No data migration or compatibility rollout is required. The a11y config remains opt-in via `npm run e2e:a11y` or an explicit Playwright config argument.

## Review Finding Traceability

| Review finding | Locked amendment |
|---|---|
| `getLocalE2EEnv()` changes expiry semantics | Keep the existing `webServer.env` block byte-for-byte; no env-helper import |
| Missing dependencies/build | Run `npm ci`; use exact `npm run e2e:a11y`, which includes `e2e:prepare` |
| Type/value import contract | Standalone `import type` for `PlaywrightTestConfig`; value import for `devices` |
| Exact npm-script acceptance | Run headed script under `xvfb-run`; do not claim it green unless executed successfully |
| Stale runtime-env risk | Set a unique `mktemp`-backed `E2E_RUNTIME_ENV_PATH` |
| Harness proof vs assertion failures | Record the isolated chain separately from any auth/axe failure |
| Negative grep exit status | Use `! rg` so absence of forbidden strings is success |
| Live 3080 safety | Never run an availability or browser probe against 3080; validate reuse through source/config and the owned alternate port |

## References

- Beads issue: `AF-3rfc`
- Research: `thoughts/searchable/shared/research/2026-08-16-12-22-AF-3rfc-a11y-e2e-isolated-runtime-settings.md`
- Base env derivation: `e2e/setup/env.ts:37-46,100-160`
- Shared server harness: `e2e/setup/start-server.js:120-159,211-225`
- Closest config pattern: `e2e/playwright.config.local.ts:3-22`
- Browser-channel pattern: `e2e/playwright.config.mock.ts:22,140-157`

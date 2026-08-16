---
date: 2026-08-16T12:22:21-04:00
researcher: maceo
git_commit: 5e7e853b7b58da1539e240198ce0d2ebfd9b385b
branch: a11y-e2e-2026-08-16-12-16
repository: silmari-chat
topic: "AF-3rfc: Make a11y Playwright tests honor isolated E2E runtime settings"
tags: [research, codebase, e2e, playwright, a11y, accessibility, mongodb-memory-server, test-harness]
status: complete
last_updated: 2026-08-16
last_updated_by: maceo
---

# Research: AF-3rfc — a11y Playwright tests honor isolated E2E runtime settings

**Date**: 2026-08-16T12:22:21-04:00
**Researcher**: maceo
**Git Commit**: 5e7e853b7b58da1539e240198ce0d2ebfd9b385b
**Branch**: a11y-e2e-2026-08-16-12-16
**Repository**: silmari-chat

## Research Question

Document how `e2e/specs/a11y.spec.ts`, `e2e/setup/env.ts`, and `e2e/playwright.config.a11y.ts` diverge from the rest of the Playwright E2E suite's isolated-runtime pattern: how other spec files correctly consume `getE2EBaseURL()`/the configured `baseURL`, how `playwright.config.ts`'s `webServer.command` (via `e2e/setup/start-server.js`) provisions disposable in-memory MongoDB and a consistent browser channel, and exactly what the a11y spec/config do differently that causes them to target a live service on port 3080 instead of the isolated E2E harness.

## Summary

`e2e/setup/env.ts` exposes `getE2EBaseURL()`, which reads `process.env.E2E_BASE_URL` and falls back to `http://localhost:3080` only as a default (`e2e/setup/env.ts:37-38`). Every Playwright config in the suite except `playwright.config.a11y.ts` derives its `baseURL` from this function and threads it into `use.baseURL` / `webServer.url`, so specs that call `page.goto('/...')` (a relative path) transparently target whatever isolated `E2E_BASE_URL` was set. `a11y.spec.ts` never imports `env.ts` at all — its four tests call `page.goto('http://localhost:3080/', ...)` with a literal hardcoded string (`e2e/specs/a11y.spec.ts:7,15,30,38`), so setting `E2E_BASE_URL` to an alternate port has no effect on where these tests navigate.

Separately, every other config's `webServer.command` launches `e2e/setup/start-server.js`, a wrapper that (a) auto-provisions a disposable `mongodb-memory-server` instance when no real local Mongo is reachable (`maybeStartMemoryMongo`, `e2e/setup/start-server.js:126-153`), (b) optionally gates on Redis-stream readiness, and (c) only then `require()`s the real `api/server/index.js` in-process. `playwright.config.a11y.ts` overrides `webServer.command` to invoke `node api/server/index.js` directly (`e2e/playwright.config.a11y.ts:4,15`), skipping the wrapper entirely — so it never gets memory-Mongo provisioning and instead connects straight to whatever `MONGO_URI` is already in the environment (default `mongodb://127.0.0.1:27017/LibreChat-e2e`, i.e. a real local Mongo instance if one happens to be running).

The a11y config also uses `testMatch: /a11y/` (`e2e/playwright.config.a11y.ts:55`). Playwright applies a regular-expression match to the absolute test path, and this checkout's absolute path contains `a11y-e2e-2026-08-16-12-16`. A safe `--list` probe with an isolated base URL therefore selected 19 tests across 11 files rather than the intended four tests in `a11y.spec.ts`; the selection included all four `specs/real/*` provider tests. The same broadening occurs in any checkout or CI workspace whose parent path contains `a11y`.

On browser channel: `E2E_CHROMIUM_CHANNEL` is read in three places — `authenticate.ts` (global setup, used by all configs), `playwright.config.mock.ts`, and `playwright.config.real.ts` — but `playwright.config.ts`, `playwright.config.local.ts`, and `playwright.config.a11y.ts` all use a static `projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]` that never reads `E2E_CHROMIUM_CHANNEL` for the test-running browser (only the global-setup authentication browser would honor it, via `authenticate.ts`). This is pre-existing behavior shared identically by the root config and the a11y config — not a divergence introduced by `playwright.config.a11y.ts` — so the "browser channel" gap, if any, is a suite-wide characteristic of the non-mock/non-real configs rather than something unique to a11y.

A prior handoff document (`thoughts/shared/handoffs/general/2026-08-13_22-13-17_clerk-auth-merged-cosmic-ds-inprogress.md:59`) already names this exact gap as a known, deliberately-accepted exception filed as AF-3rfc during the Clerk auth integration work, and a bd audit note on the issue (2026-08-13) independently re-confirmed via `rg` that all four `page.goto` calls in `a11y.spec.ts` are hardcoded and that the a11y config replaces the shared `start-server.js` command with a direct `api/server/index.js` launch.

## Detailed Findings

### `e2e/specs/a11y.spec.ts` — hardcoded navigation

- Four tests, each opening with `await page.goto('http://localhost:3080/', { timeout: 5000 });`: `e2e/specs/a11y.spec.ts:7` (landing page), `e2e/specs/a11y.spec.ts:15` (conversation page), `e2e/specs/a11y.spec.ts:30` (navigation elements), `e2e/specs/a11y.spec.ts:38` (input form).
- The file has no import from `../setup/env` and does not reference `getE2EBaseURL()`, `getBaseE2EEnv()`, or the Playwright `baseURL` fixture at all.
- This is the same hardcoded-URL pattern also present (independently, out of scope for AF-3rfc) in `e2e/specs/keys.spec.ts:16,53`, `e2e/specs/settings.spec.ts:5,18`, `e2e/specs/popup.spec.ts:5`, and `e2e/specs/messages.spec.ts:4-5` (`const basePath = 'http://localhost:3080/c/'`), all of which run under the root `playwright.config.ts` rather than `playwright.config.a11y.ts`.

### `e2e/setup/env.ts` — the base-URL/env-derivation module a11y bypasses

- `DEFAULT_BASE_URL = 'http://localhost:3080'` (`e2e/setup/env.ts:4`) is only a fallback default, not a hardcoded target.
- `getE2EBaseURL()` (`e2e/setup/env.ts:37-39`): `return process.env.E2E_BASE_URL ?? DEFAULT_BASE_URL;`
- `getE2EServerAddress(baseURL = getE2EBaseURL())` (`e2e/setup/env.ts:41-47`) parses `host`/`port` out of the base URL for use as `HOST`/`PORT` env vars passed to the spawned server process.
- `getBaseE2EEnv()` (`e2e/setup/env.ts:100-127`) builds the full env block injected into the webServer child process: `HOST`/`PORT` from `getE2EServerAddress`, `MONGO_URI` (default `mongodb://127.0.0.1:27017/LibreChat-e2e` unless overridden), `DOMAIN_CLIENT`/`DOMAIN_SERVER` set to `baseURL`, `E2E_USE_MEMORY_MONGO` (default `'auto'`), plus generated CREDS/JWT secrets, rate-limit/violation-score zeroing, and stream-store env via `getStreamStoreEnv()` (`e2e/setup/env.ts:76-98`, which toggles `USE_REDIS`/`USE_REDIS_STREAMS`/`E2E_REQUIRE_REDIS_STREAMS` based on `E2E_STREAM_STORE`).
- `getLocalE2EEnv()` (`e2e/setup/env.ts:129-161`) layers additional local-run defaults (violation scores, rate-limit maxes) on top of `getBaseE2EEnv()`.
- No spec file under `e2e/specs/**` imports `getE2EBaseURL()` directly (confirmed via grep for `setup/env`/`getE2EBaseURL` across specs — zero matches); it is consumed only by the Playwright config files, which then expose the value to specs implicitly via `use.baseURL`.

### `e2e/playwright.config.a11y.ts` — the diverging config

- `e2e/playwright.config.a11y.ts:2` imports `mainConfig` from `./playwright.config` and spreads it (`...mainConfig`, line 9), so `playwright.config.ts`'s module-level side effect (`Object.assign(process.env, getBaseE2EEnv())`, see below) still runs at import time.
- `e2e/playwright.config.a11y.ts:4`: `const absolutePath = path.resolve(process.cwd(), 'api/server/index.js');`
- `e2e/playwright.config.a11y.ts:13-52`: overrides `webServer` — spreads `...mainConfig.webServer` (inheriting `cwd`, `url: baseURL`, `stdout: 'pipe'`, `ignoreHTTPSErrors`, `timeout: 120_000`, `reuseExistingServer: true`) but replaces `command: `node ${absolutePath}`` (line 15) and replaces `env` (lines 16-51) with a literal object: `{ ...process.env, SEARCH: 'false', NODE_ENV: 'CI', EMAIL_HOST: '', TITLE_CONVO: 'false', SESSION_EXPIRY: '60000', REFRESH_TOKEN_EXPIRY: '300000', ...a block of *_VIOLATION_SCORE: '0' entries, ...rate-limit MAX/WINDOW overrides }`.
- `globalSetup`/`globalTeardown` point at `./setup/global-setup.local` / `./setup/global-teardown.local` (`e2e/playwright.config.a11y.ts:11-12`) rather than the non-`.local` variants the root config uses.
- `testMatch: /a11y/` (`e2e/playwright.config.a11y.ts:55`) is a regular expression evaluated against absolute test paths. In this checkout, `/home/maceo/ntm_Dev/a11y-e2e-2026-08-16-12-16/...` makes every otherwise eligible spec match before the filename is considered.
- A safe pre-change listing probe used the existing installed Playwright binary with `E2E_BASE_URL=http://127.0.0.1:43127`, `E2E_USE_MEMORY_MONGO=true`, `E2E_CHROMIUM_CHANNEL=chrome`, and `--list`. It started no server or global setup, exited 0, and reported `Total: 19 tests in 11 files`. Besides the four a11y tests, it selected `keys`, `landing`, `messages`, `nav`, `popup`, `settings`, and all four `specs/real/*` tests. Every listed project was `[chromium]`, despite the requested `chrome` channel.
- `retries: 0` (line 10) and `fullyParallel: false` (line 53) are explicit overrides; other fields (`projects`, `use`, `expect`, `testDir`, `outputDir`, `reporter`, `testIgnore`) are inherited unchanged from `mainConfig`.
- Invoked via `npm run e2e:a11y`, defined as `"e2e:a11y": "npm run e2e:prepare && playwright test --config=e2e/playwright.config.a11y.ts --headed"` (`package.json:68`).

### `e2e/playwright.config.ts` — the base config a11y diverges from

- `e2e/playwright.config.ts:3`: `import { getBaseE2EEnv, getE2EBaseURL } from './setup/env';`
- `e2e/playwright.config.ts:5`: `const serverPath = path.resolve(rootPath, 'e2e/setup/start-server.js');`
- `e2e/playwright.config.ts:9-11`: `const baseURL = getE2EBaseURL(); const e2eEnv = getBaseE2EEnv(); Object.assign(process.env, e2eEnv);` — this runs at module-import time, before Playwright spawns the webServer child, so the child inherits these values via normal process env inheritance.
- `e2e/playwright.config.ts:14-15`: `globalSetup: require.resolve('./setup/global-setup')`, `globalTeardown: require.resolve('./setup/global-teardown')`.
- `e2e/playwright.config.ts:32-40`: `use: { baseURL, video: 'on-first-retry', trace: 'retain-on-failure', ignoreHTTPSErrors: true, headless: true, storageState: ..., screenshot: 'only-on-failure' }`.
- `e2e/playwright.config.ts:45-49`: `projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]` — no `channel` key, no `E2E_CHROMIUM_CHANNEL` read.
- `e2e/playwright.config.ts:62-70`: `webServer: { command: `node ${serverPath}`, cwd: rootPath, url: baseURL, stdout: 'pipe', ignoreHTTPSErrors: true, timeout: 120_000, reuseExistingServer: true }`.
- Sibling configs `playwright.config.mock.ts` and `playwright.config.real.ts` follow the same `getE2EBaseURL()` → `baseURL` → `use.baseURL`/`webServer.url` → `start-server.js` pattern (`playwright.config.mock.ts:21,129,153`; `playwright.config.real.ts:29,123,147`), and `playwright.config.local.ts` also invokes `start-server.js` (`playwright.config.local.ts:18-22`) while pointing `globalSetup`/`globalTeardown` at the `.local` variants (same as `playwright.config.a11y.ts` does for setup/teardown, but *not* for `webServer.command`).

### `e2e/setup/start-server.js` — the isolated-harness wrapper a11y skips

Invoked as `node e2e/setup/start-server.js` by every config except `playwright.config.a11y.ts`. Orchestration (`startServer`, `e2e/setup/start-server.js:211-222`):
```js
maybeStartMemoryMongo()
  .then(requireRedisStreams)
  .then(async () => {
    require(path.resolve(__dirname, '../../api/server/index.js'));
    await verifyRedisStreams();
  })
  .catch((error) => {
    console.error('[e2e] Failed to start test server:', error);
    process.exit(1);
  });
```
- `require('dotenv').config()` (`e2e/setup/start-server.js:4`) loads a root `.env` file into `process.env` in the child process (in addition to whatever the parent config already injected via `Object.assign(process.env, e2eEnv)` and normal process-env inheritance).
- `maybeStartMemoryMongo()` (`e2e/setup/start-server.js:126-153`): reads `mongoUri = process.env.MONGO_URI ?? DEFAULT_MONGO_URI` and `mode = process.env.E2E_USE_MEMORY_MONGO ?? 'auto'`.
  - `mode === 'false'`: uses the given/default URI as-is (line 130-134), no memory server.
  - `mode === 'auto'` (default) and the URI's host is *not* probeable/local, or a live TCP connect to it succeeds (`canConnect`, lines 99-112): reuses the given URI unchanged (line 137-141) — i.e., a real reachable Mongo is treated as already available.
  - Otherwise: dynamically `require('mongodb-memory-server')`, creates `MongoMemoryServer.create({ instance: { dbName, ip: '127.0.0.1' } })` (lines 143-149), rewrites `process.env.MONGO_URI` to the ephemeral server's URI via `withDbName()` (line 150), logs `[e2e] Started memory MongoDB at ...` (line 152).
  - Every branch ends with `writeRuntimeEnv()` (lines 120-124), which writes `{ MONGO_URI: process.env.MONGO_URI }` to `E2E_RUNTIME_ENV_PATH` (default `e2e/specs/.test-results/runtime-env.json`) — this is how `cleanupUser.ts`'s `applyRuntimeEnv()` (`e2e/setup/runtimeEnv.ts:4-21`) later discovers the exact (possibly ephemeral) Mongo URI the server used during teardown.
- `requireRedisStreams()`/`verifyRedisStreams()` (lines 161-199) are no-ops unless `E2E_REQUIRE_REDIS_STREAMS === 'true'` (set by `getStreamStoreEnv()` when `E2E_STREAM_STORE=redis`); otherwise they ping/poll a Redis-backed `GenerationJobManager` before/after the server module loads.
- `api/server/index.js` itself is `require()`d unmodified (line 215) — all of its own startup logic (Mongo connect, seeding, MCP init, `app.listen`, readiness flags) runs exactly as on a direct launch; `start-server.js` only gates *what* `MONGO_URI`/Redis state exists before that require happens.
- `SIGINT`/`SIGTERM` handlers (lines 201-209) call `shutdown()` (lines 155-159), which stops the in-memory `mongoServer` if one was created, then exits 130/143.

Because `playwright.config.a11y.ts` launches `node api/server/index.js` directly (bypassing this file entirely), it gets none of the above: no memory-Mongo auto-provisioning, no Redis-stream gating/verification, no `runtime-env.json` write. It connects to whatever `MONGO_URI` is already in `process.env` — the `getBaseE2EEnv()` default of `mongodb://127.0.0.1:27017/LibreChat-e2e`, i.e., a real MongoDB instance expected to already be listening locally, unless overridden.

### Global setup/teardown variants

- `e2e/setup/global-setup.ts` and `e2e/setup/global-setup.local.ts` are byte-for-byte identical (confirmed via `diff`, no output): both call `authenticate(config, getE2EUser())`.
- `e2e/setup/global-teardown.ts` and `e2e/setup/global-teardown.local.ts` are also byte-for-byte identical (confirmed via `diff`): both call `cleanupUser(getE2EUser())` inside a try/catch.
- `playwright.config.mock.ts`/`playwright.config.real.ts` use a third variant, `global-teardown.mock.ts`, which iterates `[getPrimaryE2EUser(), getSecondaryE2EUser()]` and cleans up both.
- Which pair runs is selected purely by which config references it: root `playwright.config.ts` references the non-`.local` pair (`playwright.config.ts:14-15`); `playwright.config.local.ts` and `playwright.config.a11y.ts` both reference the `.local` pair (`playwright.config.a11y.ts:11-12`). The `.local` selection is *not itself* the source of the AF-3rfc bug — it's the `webServer.command` override in `playwright.config.a11y.ts` that bypasses `start-server.js`.
- `authenticate()` (`e2e/setup/authenticate.ts:43-105`) reads `baseURL`/`storageState` from `config.projects[0].use` (line 45) — since `playwright.config.a11y.ts` inherits `use.baseURL` from `mainConfig` (i.e., `getE2EBaseURL()`), global setup's authentication step *does* correctly target an isolated `E2E_BASE_URL` if one is set; it is only the spec file's own `page.goto` calls and the `webServer.command`'s Mongo provisioning that don't.

### Browser channel (`E2E_CHROMIUM_CHANNEL`)

- Read in exactly three places in the repo: `e2e/setup/authenticate.ts:9,54` (global-setup browser launch, used by *all* configs' `globalSetup`), `e2e/playwright.config.mock.ts:22,140-148` (`projects: [{ name: chromiumChannel ?? 'chromium', use: { ...devices['Desktop Chrome'], ...(chromiumChannel ? { channel: chromiumChannel } : {}) } }]`), and `e2e/playwright.config.real.ts:30,134-142` (identical pattern).
- `playwright.config.benchmark.ts` and `playwright.config.reasoning-perf.ts` both spread `mockConfig` without overriding `projects`, so they inherit `playwright.config.mock.ts`'s `chromiumChannel`-driven projects array.
- `playwright.config.ts:45-49`, `playwright.config.local.ts` (spreads `mainConfig`), and `playwright.config.a11y.ts` (spreads `mainConfig`) all use a static `projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]` — confirmed via grep, no `channel`/`E2E_CHROMIUM_CHANNEL` reference in any of these three files' own content. The a11y config does not diverge from the root config on this point; both share the same static-channel behavior for the test-running browser (only the shared `authenticate.ts` global-setup browser would honor `E2E_CHROMIUM_CHANNEL` for these three configs, if the variable happens to be set in the ambient environment).
- No occurrence of `E2E_CHROMIUM_CHANNEL` in `package.json`. `.github/workflows/playwright-mock.yml:54` sets `E2E_CHROMIUM_CHANNEL: chrome` at the job level for CI runs of the mock suite (which uses `playwright.config.mock.ts`).

## Code References

- `e2e/specs/a11y.spec.ts:7,15,30,38` — four hardcoded `page.goto('http://localhost:3080/', ...)` calls
- `e2e/setup/env.ts:4` — `DEFAULT_BASE_URL = 'http://localhost:3080'`
- `e2e/setup/env.ts:37-39` — `getE2EBaseURL()`
- `e2e/setup/env.ts:41-47` — `getE2EServerAddress()`
- `e2e/setup/env.ts:100-127` — `getBaseE2EEnv()`
- `e2e/playwright.config.a11y.ts:4` — `absolutePath = path.resolve(process.cwd(), 'api/server/index.js')`
- `e2e/playwright.config.a11y.ts:9-15` — `webServer` override, `command: node ${absolutePath}`
- `e2e/playwright.config.a11y.ts:11-12` — `globalSetup`/`globalTeardown` `.local` variants
- `e2e/playwright.config.a11y.ts:55` — `testMatch: /a11y/`
- `e2e/playwright.config.ts:3,5,9-11,14-15,62-70` — `getE2EBaseURL`/`getBaseE2EEnv` import, `serverPath` to `start-server.js`, `baseURL` derivation + `process.env` assignment, `globalSetup`/`globalTeardown`, `webServer` block
- `e2e/setup/start-server.js:120-153` — `writeRuntimeEnv()`/`maybeStartMemoryMongo()`
- `e2e/setup/start-server.js:161-199` — `requireRedisStreams()`/`verifyRedisStreams()`
- `e2e/setup/start-server.js:211-222` — `startServer()` orchestration
- `e2e/setup/global-setup.ts:1-9`, `e2e/setup/global-setup.local.ts:1-9` — identical `authenticate(config, getE2EUser())`
- `e2e/setup/global-teardown.ts:1-12`, `e2e/setup/global-teardown.local.ts:1-12` — identical `cleanupUser(getE2EUser())`
- `e2e/setup/authenticate.ts:9,43-55` — `chromiumChannel` read, `config.projects[0].use` destructure, `chromium.launch()`
- `e2e/playwright.config.mock.ts:22,140-148` — `chromiumChannel`-driven `projects`
- `e2e/playwright.config.real.ts:30,134-142` — same pattern
- `package.json:68` — `"e2e:a11y": "npm run e2e:prepare && playwright test --config=e2e/playwright.config.a11y.ts --headed"`
- `package.json:69` — `"e2e:ci": "npm run e2e:prepare && playwright test --config=e2e/playwright.config.ts"`
- `.github/workflows/playwright-mock.yml:54` — `E2E_CHROMIUM_CHANNEL: chrome` CI env for the mock suite

## Verification Notes

- The configured Semgrep citation verifier and closure mapper are not present in this checkout (`SAI/skills/ResearchSemgrep/verify-citations.ts` and `closure-map.ts` do not exist). Citations above were verified with full/targeted source reads, `rg`, `git blame`, and `git show` against pinned commit `5e7e853b7b58da1539e240198ce0d2ebfd9b385b`.
- `ss -ltnp '( sport = :3080 or sport = :27017 )'` showed active IPv4 and IPv6 listeners on port 3080 and no listener on 27017. No request was sent to either port.
- `/usr/bin/google-chrome` is installed as Google Chrome 148.0.7778.96, so an isolated validation can explicitly set `E2E_CHROMIUM_CHANNEL=chrome`.

## Architecture Documentation

The suite has one shared env-derivation module (`e2e/setup/env.ts`) and five Playwright configs (`playwright.config.ts`, `.mock.ts`, `.real.ts`, `.local.ts`, `.a11y.ts`, plus `.benchmark.ts`/`.reasoning-perf.ts` which extend `.mock.ts`). All configs except `.a11y.ts` launch the app under test via the shared `e2e/setup/start-server.js` wrapper, which conditionally provisions a disposable `mongodb-memory-server` instance and writes the resulting `MONGO_URI` to a runtime-env JSON file consumed by teardown. Each config either derives `baseURL` directly from `getE2EBaseURL()` or inherits it from a config that does. Spec files reach the configured base URL either implicitly (relative `page.goto('/...')`, resolved against `use.baseURL`) or explicitly via the Playwright `baseURL` test fixture (used to build secondary browser contexts/API request contexts) — no spec imports `getE2EBaseURL()` directly. `playwright.config.a11y.ts` is the sole config that both (a) launches the target server binary directly rather than through `start-server.js`, and (b) is paired with a spec file (`a11y.spec.ts`) that hardcodes its own navigation target rather than relying on `use.baseURL`. Its unanchored regular-expression `testMatch` also makes suite membership depend on the absolute checkout path.

## Workflow Closure Map

This research concerns Playwright test-runner configuration, not a production source-of-truth write that propagates to a user-visible read model. There is therefore no production workflow closure chain or closure adapter to emit. The relevant executable lineage is the test invocation's `E2E_BASE_URL` → config `use.baseURL`/`webServer.url` → spawned test server and browser navigation → axe assertions, all within the validation harness.

## Historical Context (from thoughts/)

- `thoughts/searchable/shared/handoffs/general/2026-08-13_22-13-17_clerk-auth-merged-cosmic-ds-inprogress.md:59` — names AF-3rfc directly: "a11y Playwright hardcodes port 3080, doesn't honor `E2E_BASE_URL`," recorded as a known, deliberately-accepted exception at the time Clerk auth was merged.
- `thoughts/searchable/shared/plans/2026-08-12-20-05-tdd-clerk-auth-integration.md:425` — includes a `mongodb-memory-server`-based DB test-setup diagram for the Clerk integration work; `:1242` shows a direct invocation `npx playwright test e2e/specs/a11y.spec.ts --config=e2e/playwright.config.a11y.ts`.
- `thoughts/searchable/shared/plans/2026-08-13-08-59-cosmic-ds-frontend-reskin-plan-REVIEW.md:111,113,137` — identifies `e2e/specs/a11y.spec.ts` (via `@axe-core/playwright`) as the only accidental contrast/theme regression guard in the suite, and notes it is effectively disabled on this fork.
- No standalone thoughts/ ticket file exists for AF-3rfc; the only tracked record is the `bd` issue itself (`bd show AF-3rfc`), whose 2026-08-13 audit note independently re-confirms the same four hardcoded `page.goto` lines and the `start-server.js` bypass via a read-only `rg` command.

## Related Research

- `thoughts/searchable/shared/research/2026-08-12-18-21-clerk-auth-integration-seams.md` — seams/interfaces research for the Clerk auth integration that originally surfaced AF-3rfc as a follow-on gap.

## Open Questions

- `keys.spec.ts`, `settings.spec.ts`, `popup.spec.ts`, and `messages.spec.ts` hardcode `http://localhost:3080` identically to `a11y.spec.ts` but run under `playwright.config.ts` (which does use `start-server.js`/memory-Mongo) — whether these are in scope for any future harness-hygiene work is outside AF-3rfc's stated acceptance criteria (which names only `a11y.spec.ts`, `env.ts`, and `playwright.config.a11y.ts`).
- Whether the suite-wide absence of `E2E_CHROMIUM_CHANNEL` support in `playwright.config.ts`/`.local.ts`/`.a11y.ts`'s `projects[]` (as opposed to `.mock.ts`/`.real.ts`, which do read it) is itself considered a gap for AF-3rfc's "consistent browser channel with the rest of the E2E suite" acceptance criterion, or whether "consistent" means only "a11y should behave the same as its nearest sibling config (`playwright.config.ts`)," which it already does on this specific point.

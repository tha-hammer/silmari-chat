---
date: 2026-08-16T12:20:46-04:00
researcher: FrostyMountain
git_commit: 90bf5dd54a090f9a1c420f660eb6741de11e21a3
branch: lint-cleanup-2026-08-16-12-15
repository: lint-cleanup-2026-08-16-12-15
topic: "AF-5qx7 BAML and root src ESLint parser-project coverage"
tags: [research, codebase, eslint, typescript, baml]
status: complete
last_updated: 2026-08-16
last_updated_by: FrostyMountain
---

# Research: AF-5qx7 BAML and Root `src` ESLint Project Coverage

**Date**: 2026-08-16 12:20:46 -04:00  
**Researcher**: FrostyMountain  
**Git Commit**: `90bf5dd54a090f9a1c420f660eb6741de11e21a3`  
**Branch**: `lint-cleanup-2026-08-16-12-15`  
**Repository**: `lint-cleanup-2026-08-16-12-15`

## Research Question

Why does the repository lint gate report 35 parser-project errors in `baml_ts` and one in root `src`, and which TypeScript projects currently own those files?

## Summary

The root lint driver deliberately scans `baml_ts` and `src` as independent source partitions. All 35 checked-in BAML SDK TypeScript files are included by the existing `baml_ts/tsconfig.json`. The parser errors occur because the broad typed ESLint block assigns `client/tsconfig.json` to every TypeScript file outside `packages`, `client/vite.config.ts`, and `e2e`; consequently, the BAML and root test files are parsed against the client project instead of an owning project.

Root `src` contains one file, `src/tests/oidc-integration.test.ts`. It imports the package API's OIDC and environment utilities, but no checked-in TypeScript project includes the root `src/tests` path. `packages/api/tsconfig.spec.json` includes only paths relative to `packages/api`.

The exact Node v24.16.0 partition run produced 36 errors and zero warnings: 35 under `baml_ts/baml_sdk` and one at `src/tests/oidc-integration.test.ts`; every error was the same `parserOptions.project` file-not-found diagnostic.

## Detailed Findings

### Root lint partitioning

- `scripts/lint.mts:11-22` declares `baml_ts` and `src` as source directories alongside the workspaces.
- `scripts/lint.mts:61-80` invokes ESLint separately for every declared directory with TypeScript extensions enabled.
- `scripts/lint.mts:93-102` records any nonzero partition and makes the root command fail.

### ESLint project selection

- `eslint.config.mjs:212-220` applies the non-type-checked TypeScript recommended configuration to all TS/TSX files.
- `eslint.config.mjs:221-270` adds typed linting with `project: './client/tsconfig.json'` to all TS/TSX files except `packages/**/*`, `client/vite.config.ts`, and `e2e/**/*`.
- Because neither `baml_ts/**/*` nor `src/**/*` is excluded or overridden later, both partitions inherit the client project.
- Later project-specific blocks select appropriate projects for data-provider, config translations, package specs, and data-schemas (`eslint.config.mjs:272-371`), but there is no corresponding BAML or root-`src` block.

### BAML project ownership

- `baml_ts/tsconfig.json:2-11` defines the generated SDK compiler settings and names `baml_sdk` as its root directory.
- `baml_ts/tsconfig.json:13` includes `baml_sdk/**/*.ts`, which covers all 35 files reported by ESLint.
- Root `package.json` exposes the same ownership through `build:baml`, which runs `tsc -p baml_ts/tsconfig.json`.

### Root test ownership

- `src/tests/oidc-integration.test.ts:1-12` is a Jest integration test importing `packages/api/src/utils/oidc`, `packages/api/src/utils/env`, and the data workspace types.
- `packages/api/tsconfig.spec.json:1-9` is the existing package API test project, but its include list is relative to `packages/api` and names only `specs/**/*` and `src/**/*`.
- No other `tsconfig*.json` includes root `src/**/*`, so the test currently has no TypeScript project owner.

## Code References

- `scripts/lint.mts:11-22` — enumerates lint source partitions.
- `scripts/lint.mts:61-102` — executes each ESLint partition and aggregates failures.
- `eslint.config.mjs:212-270` — global TS recommendations plus the broad client-project typed block.
- `eslint.config.mjs:272-371` — existing project-specific typed-lint overrides.
- `baml_ts/tsconfig.json:1-14` — complete BAML SDK TypeScript project.
- `packages/api/tsconfig.spec.json:1-9` — package API test project boundary.
- `src/tests/oidc-integration.test.ts:1-12` — root integration-test imports.

## Architecture Documentation

Typed ESLint parsing is selected by flat-config file globs. The broad client block supplies shared typed rules, while later file-specific blocks replace `parserOptions.project` for files owned by other workspaces. The lint driver and the TypeScript compiler projects are separate layers: the driver decides which directory to scan, and the applicable flat-config block decides which TypeScript program the parser uses.

This task concerns static toolchain configuration only. It does not change a production input-to-side-effect-to-read behavior, so there is no production Workflow Closure Map.

## Historical Context

- `thoughts/searchable/shared/handoffs/general/2026-08-09_12-45-10_baml-llm-interface-tdd-plan.md` records that `baml_ts/baml_sdk/**` is generated and committed and that `baml_ts/tsconfig.json` is its build project.
- Bead `AF-5qx7` records the earlier repository-wide baseline of 35 `baml_ts` parser errors and one root `src` parser error.

## Related Research

- `thoughts/searchable/shared/research/2026-08-10-08-13-baml-chat-path-wiring.md` documents the generated BAML SDK tree for the chat-path work.

## Open Questions

None for this partition. The live configuration and project boundaries fully explain the two parser-error groups.

---
date: 2026-08-16T12:37:24-04:00
researcher: FrostyMountain
git_commit: c4b7a945c4e535d3bc1394d77353bb25f8ae70b5
branch: lint-cleanup-2026-08-16-12-15
repository: lint-cleanup-2026-08-16-12-15
topic: "AF-5qx7 residual API and package ESLint warnings"
tags: [research, codebase, eslint, api, packages]
status: complete
last_updated: 2026-08-16
last_updated_by: FrostyMountain
---

# Research: AF-5qx7 Residual API and Package ESLint Warnings

## Research Question

Which warning-only findings remain outside the already assigned client, e2e, config, data-provider, BAML, and root-source partitions, and what current behavior makes each binding necessary or unnecessary?

## Summary

The post-merge Node v24.16.0 root lint run reports eight residual warnings outside client: four in legacy `api`, two in `packages/api`, and two in `packages/data-schemas`. All are local hygiene findings. Two catch bindings are unused because their handlers deliberately return generic failure responses. Two OpenID mock parameters preserve a callback signature but are not consumed. Two imports are unused. The manual Redis benchmark seeds a cache for its side effect but retains an unused local and performs timing work without an assertion in its final benchmark.

## Detailed Findings

### Legacy API

- `api/server/middleware/roles/admin.js:3-11` catches all failures and emits the same generic HTTP 500 body; the caught value is not inspected or logged.
- `api/server/routes/search.js:15-24` catches Meilisearch construction or health failures and returns `false`; the caught value is not inspected.
- `api/test/__mocks__/openid-client.js:22-25` declares `options` and `verify` to mirror the mocked Strategy constructor, while the mock returns a fixed strategy descriptor without reading either argument.

### Package API benchmark

- `packages/api/src/mcp/registry/cache/__tests__/ServerConfigsCacheRedis.perf_benchmark.manual.spec.ts:298-301` assigns the result of `populateCache` to `cache`, but the final raw-MGET benchmark uses only the population side effect and cleans by namespace.
- The same benchmark discovers the populated keys at lines 303-311 and proceeds directly to timing. Unlike the preceding benchmark cases, it has no `expect`, producing `jest/expect-expect`.
- An assertion that the discovered key count equals `configCount` validates the benchmark fixture before timing and satisfies the existing test contract without asserting latency.

### Data-schemas

- `packages/data-schemas/src/app/web.ts:1` imports `RerankerTypes`, but the file uses only `SafeSearchTypes`; `rerankerType` is passed through from config without consulting the enum.
- `packages/data-schemas/src/utils/tenantBulkWrite.spec.ts:4` imports `SYSTEM_TENANT_ID`, while all system-context cases call `runAsSystem` and never reference the constant directly.

## Code References

- `api/server/middleware/roles/admin.js:3-11`
- `api/server/routes/search.js:15-24`
- `api/test/__mocks__/openid-client.js:22-25`
- `packages/api/src/mcp/registry/cache/__tests__/ServerConfigsCacheRedis.perf_benchmark.manual.spec.ts:298-311`
- `packages/data-schemas/src/app/web.ts:1-3,86-106`
- `packages/data-schemas/src/utils/tenantBulkWrite.spec.ts:1-5,141-185`

## Architecture Documentation

The repository lint driver scans legacy API and each package independently, but warnings do not make a partition fail under the default command. Project instructions nevertheless require warnings to be resolved. These eight findings do not cross module boundaries or change a production workflow: they concern unused local syntax and one benchmark fixture assertion. No production Workflow Closure Map applies.

## Historical Context

- Bead `AF-5qx7` notes that API and package partitions had warning-only findings after the original lint driver restoration.
- The current root lint run after commits through `c4b7a945c` confirms only the client partition still exits nonzero.

## Open Questions

None. Every warning maps to a behavior-preserving local edit with a direct scoped lint check.

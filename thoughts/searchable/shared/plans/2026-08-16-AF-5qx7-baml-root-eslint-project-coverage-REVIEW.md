# Plan Review Report: AF-5qx7 BAML and Root `src` ESLint Project Coverage

## Review Summary

| Category | Status | Issues Found |
|---|---:|---:|
| Contracts | ⚠️ | 1 |
| Interfaces | ✅ | 0 |
| Promises | ✅ | 0 |
| Data Models | ✅ | 0 |
| APIs | ✅ | 0 |
| CodeCleanup Gates | ✅ | 0 |

## Contract Review

### Well-Defined

- ✅ The plan identifies the exact file-glob-to-TypeScript-project contract for both failing partitions.
- ✅ It preserves the existing typed-rule configuration and changes only project selection.
- ✅ Failure and success are observable through exact ESLint and TypeScript commands.

### Missing or Unclear

- ⚠️ The desired state says `src/**/*.ts` is owned by `src/tsconfig.json`, but the proposed include is only `tests/**/*.ts`. That is sufficient for the sole current file yet leaves the declared partition contract narrower than the ESLint override.

### Recommendation

- Align the new project's include with its flat-config scope by using `**/*.ts`. This preserves the current one-file program while ensuring any future root `src` TypeScript file is in the project ESLint selects.

## Interface Review

- ✅ No runtime or public interface changes are proposed.
- ✅ The configuration interface is explicit: `baml_ts/**/*.ts` maps to the existing BAML project, while `src/**/*.ts` maps to a local root-source project.
- ✅ The new root project inherits the package API spec compiler environment rather than duplicating it.

## Promise Review

- ✅ The plan promises zero parser-project errors and supplies exact commands to prove that result.
- ✅ It explicitly preserves lint rules, ignores, generated sources, tests, and runtime behavior.
- ✅ All work is synchronous developer-tool configuration; timeout, cancellation, ordering, and resource-lifecycle contracts do not apply.

## Data Model Review

- ✅ No schema, persisted data, serialization, or migration is involved.

## API Review

- ✅ No external API, authentication, authorization, request, or response contract changes.

## CodeCleanup Plan-Hygiene Review

- ✅ No control expression, mutation, side effect, nesting, or literal-bearing implementation code is introduced.
- ✅ The plan avoids broad suppression and addresses the project-ownership cause directly.
- ✅ The narrow flat-config overrides keep the configuration understandable at the module boundary.

## Critical Issues

None.

## Suggested Plan Amendments

```diff
 # Root `src` TypeScript project
- Include `tests/**/*.ts` relative to root `src`.
+ Include `**/*.ts` relative to root `src`, matching the ESLint `src/**/*.ts` scope.

 # Automated Verification
+ Verify `npx tsc -p src/tsconfig.json --showConfig` lists the root OIDC test.
```

## Approval Status

- [x] Ready for Implementation — The include-scope warning is resolved in the enhanced plan
- [ ] Needs Minor Revision — Align the root project include with the declared lint scope
- [ ] Needs Major Revision — Critical issues must be resolved first

## Implementation-Discovery Addendum

The first project-membership check showed that `src/tests/oidc-integration.test.ts` is not a standalone build target: its historical relative imports and unbuilt workspace package exports do not form a green root `tsc --noEmit` graph. The reviewed response is to name the new file `src/tsconfig.eslint.json`, retain exact source membership, and use it only for parser ownership. This avoids pretending to create a compilation contract or broadening `packages/api/tsconfig.spec.json`.

With correct parsing, ESLint exposes one unused generated directive and 19 Prettier findings. The enhanced plan adds a separate deterministic autofix phase for the two owned partitions. This remains mechanical, changes no lint rules or ignores, and resolves the real diagnostics instead of hiding them.

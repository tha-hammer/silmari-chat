---
date: 2026-08-16T12:23:47-04:00
researcher: WindyGorge
git_commit: 90bf5dd54a090f9a1c420f660eb6741de11e21a3
branch: lint-cleanup-2026-08-16-12-15
repository: lint-cleanup-2026-08-16-12-15
topic: "AF-5qx7 data-provider, config, and e2e ESLint findings"
tags: [research, codebase, eslint, data-provider, config, e2e, AF-5qx7]
status: complete
last_updated: 2026-08-16
last_updated_by: WindyGorge
---

# Research: AF-5qx7 data-provider, config, and e2e ESLint findings

## Research Question

What currently produces the AF-5qx7 ESLint findings in the `packages/data-provider`,
`config`, and `e2e` partitions, and which existing repository contracts constrain a
behavior-preserving cleanup?

## Summary

The bounded root lint driver enumerates ten source partitions and invokes ESLint once per
partition, accumulating nonzero results before reporting the failed partition names
(`scripts/lint.mts:11-22`, `scripts/lint.mts:68-95`). At the pinned commit, direct runs of
those same ESLint arguments reproduce 8 errors and 3 warnings in this research scope:

| Partition | Errors | Warnings | Finding classes |
|---|---:|---:|---|
| `packages/data-provider` | 1 | 0 | nested conditional expression |
| `config` | 3 | 3 | Prettier formatting and unused bindings |
| `e2e` | 4 | 0 | unused import, catch bindings, and local variable |

All cited source files were unmodified when researched. The only other working-tree items
were another agent's untracked AF-5qx7 parser-project workflow documents.

## Detailed Findings

### Data-provider endpoint issue selection

`packages/data-provider/src/config.ts:2186-2200` refines every custom endpoint. The selector
at lines 2190-2194 returns BAML issues for BAML endpoints, Claude Agent SDK issues for Claude
Agent SDK endpoints, and an empty issue list for other endpoints. The resulting issues are
added to the Zod refinement context at lines 2195-2197.

ESLint reports one `no-nested-ternary` error at `packages/data-provider/src/config.ts:2190`.
`git blame` attributes the nested selector to commit `e657ee881`; that commit extended the
prior BAML-only selector with the Claude Agent SDK branch. The two issue builders remain
separate functions at `packages/data-provider/src/config.ts:1956` and
`packages/data-provider/src/config.ts:2072`.

The public configuration loader observes this schema through
`api/server/services/Config/loadCustomConfig.js:114`, which invokes
`configSchema.strict().safeParse`. Existing BAML validation coverage lives in
`packages/data-provider/specs/baml-config.spec.ts:25`; no data-provider test currently names
the Claude Agent SDK issue selector.

### Config partition

The config findings are:

- `config/create-user.js:17`, `config/create-user.js:91`, and
  `config/create-user.js:93`: three `prettier/prettier` errors (one line wrap and two missing
  semicolons).
- `config/helpers.js:49`: unused catch binding `e` (`no-unused-vars`, warning).
- `config/translations/instructions.ts:30`: unused `fileName` parameter
  (`@typescript-eslint/no-unused-vars`, warning); its second call argument is supplied at
  line 69.
- `config/update.js:97`: unused catch binding `e` (`no-unused-vars`, warning).

The global configuration enables Prettier errors at `eslint.config.mjs:108` and configures
unused JavaScript bindings as warnings at `eslint.config.mjs:126-133`. Translation TypeScript
receives the typed data-provider-style unused rule at `eslint.config.mjs:251-258` and the
translation project override at `eslint.config.mjs:313-320`.

### E2E partition

The e2e findings are:

- `e2e/specs/mock/shared-links.spec.ts:7`: unused `MOCK_REPLY_TEXT` import.
- `e2e/specs/settings.spec.ts:37` and `e2e/specs/settings.spec.ts:43`: unused catch bindings
  named `e`.
- `e2e/specs/settings.spec.ts:59`: an unused local variable assigned from a browser
  `localStorage` read; the following assertion observes the Sydney-mode button instead.

The generic TypeScript recommended configuration is applied at
`eslint.config.mjs:212-220`. E2E files are excluded only from the typed client-project block
at `eslint.config.mjs:222-270`, so they still receive the non-typechecked TypeScript
unused-variable errors.

## Code References

- `scripts/lint.mts:11-22` — bounded source partition inventory.
- `scripts/lint.mts:68-95` — per-partition ESLint invocation and final failure aggregation.
- `eslint.config.mjs:108` — Prettier findings are errors.
- `eslint.config.mjs:126-133` — JavaScript unused bindings are warnings with underscore
  exceptions.
- `packages/data-provider/src/config.ts:2186-2200` — custom endpoint issue selection and
  emission.
- `config/create-user.js:17-94` — all three config formatting errors.
- `config/helpers.js:45-51` and `config/update.js:94-99` — unused catch bindings.
- `config/translations/instructions.ts:30-69` — unused parameter and its call site.
- `e2e/specs/mock/shared-links.spec.ts:1-12` — unused helper import.
- `e2e/specs/settings.spec.ts:34-60` — unused catches and local variable.

## Architecture Documentation

The repository treats lint as a partitioned static-analysis pipeline. Every partition is
checked even after an earlier one fails, and the overall command exits nonzero if any
partition fails. In this scope, the findings are local expression, binding, import, and
formatting properties; they do not cross runtime module boundaries or mutate user documents.

## Workflow Closure Map

No production workflow closure map applies. This research documents static-analysis
findings rather than a runtime input-to-observable behavior. The observable contract is the
lint process exit status, which is fully exercised by direct partition commands and the root
`npm run lint` aggregation.

## Verification Notes

The repository citation-verifier path named by the research workflow (`SAI/skills/ResearchSemgrep`)
is not present in this checkout. Citations were therefore verified through full reads of all
finding-bearing files, targeted numbered reads of the lint/configuration files, `git blame`,
and exact ESLint reproduction under Node v24.16.0 with lockfile versions ESLint 9.39.1 and
`@typescript-eslint` 8.60.1.

## Related Work

- Beads issue: `AF-5qx7`
- Parallel AF-5qx7 partitions: client findings; BAML/root parser-project coverage.
- AF-f490 was completed separately in five deterministic import-order commits.

## Open Questions

None for this partition. Each finding has a local, directly verifiable lint contract.

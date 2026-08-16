# Plan Review Report: AF-5qx7 Config, E2E, and Data-Provider ESLint Cleanup

## Review Summary

| Category | Status | Issues Found |
|---|---|---:|
| Contracts | Ready with amendment | 1 |
| Interfaces | Ready | 0 |
| Promises | Ready | 0 |
| Data Models | Not applicable | 0 |
| APIs | Not applicable | 0 |
| CodeCleanup Gates | Ready with amendment | 1 |

## Contract Review

### Well-Defined

- Each owned partition has an exact baseline count and direct ESLint command.
- The data-provider plan preserves the three selector results: BAML issues, Claude Agent SDK
  issues, or an empty issue list.
- The final root gate remains explicitly coordinated with other Agent Mail owners.

### Amendment Required

- The direct ESLint commands do not fail on warnings by default. Because this plan promises
  zero warnings in the config partition, add `--max-warnings 0` to every scoped verification
  command so the command enforces the stated outcome.

## Interface Review

No public signatures, exports, APIs, or schema fields change. Removing the private unused
`fileName` parameter updates its only call in the same module.

## Promise Review

The plan preserves execution and observation promises:

- Endpoint discriminator order remains BAML first, Claude Agent SDK second, default empty.
- `ctx.addIssue` emission order remains unchanged.
- Bindingless catches preserve exception swallowing.
- E2E user actions and assertions remain unchanged; only unused syntax and a pure dead read
  are removed.

## Data Model and API Review

Not applicable. No serialized value, persistence contract, endpoint, or user document is
added or changed. The AGENTS.md auth-user cache invalidation instruction is therefore not
triggered.

## CodeCleanup Plan-Hygiene Review

### Well-Defined

- **No Side Effects in Conditionals:** proposed conditions are predicate checks only; issue
  builder calls occur in branch bodies.
- **No Mutation in Control Expressions:** `issues` assignment occurs in statements, never in
  a condition.
- **Never Nesting:** the selector is a flat `if`/`else if` inside the existing refinement
  callback; no new nested success path is introduced.
- **Named Constants Over Literals:** no new positional, structural, serialized, or protocol
  literal is introduced or reordered.
- **Control-Expression Discipline:** replacing the nested ternary makes each discriminator
  check independently readable and preserves order.
- **Maintainability Recovery:** the plan addresses the local expression that caused the
  regression without broadening into unrelated cleanup.

### Amendment Required

- Name the exact formatter command for `config/create-user.js` rather than saying only "run
  the configured formatter." Use the repository-pinned Prettier executable on that one file,
  then verify with ESLint.

### When-Not-to-Apply Audit

- No short-circuit side effect or conditional mutation is being hoisted.
- No error-precedence guard is reordered.
- No protocol, CLI argument, database, or serialized number is changed.
- The existing long user-facing usage string is formatted only; it is not newly introduced,
  rewritten, or externalized as part of this lint-only scope.

## Critical Issues

None.

## Suggested Plan Amendments

```diff
- Direct ESLint passes.
+ Direct ESLint passes with `--max-warnings 0`.

- Run the configured formatter for `config/create-user.js`.
+ Run `node_modules/.bin/prettier --write config/create-user.js`, then direct ESLint.
```

## Approval Status

- [x] Ready for implementation after the two mechanical plan amendments above.
- [ ] Needs minor revision beyond the listed amendments.
- [ ] Needs major revision.

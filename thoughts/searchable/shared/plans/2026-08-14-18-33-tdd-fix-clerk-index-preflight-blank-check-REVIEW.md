---
date: 2026-08-14T18:48:16-04:00
reviewed_plan: thoughts/searchable/shared/plans/2026-08-14-18-33-tdd-fix-clerk-index-preflight-blank-check.md
plan_sha256: ca625bf7cf964f7bfbb2aa9c2571b36d280e0d703e917bacf6558bd0839e21b4
git_commit: d713477caf10a75dc1c64cbf9b18cdbbe7e37c0c
branch: main
decision: needs-major-revision
review_issue: AF-vkn1
amendment_issue: AF-5ie0
related_bug: AF-g4xa
---

# Review: Fix `ensureClerkIndexes` Preflight False-Positive TDD Plan

## Decision

> **❌ Needs major revision before implementation.**

The proposed Mongo predicate is correct for the production incident: an explicit
`$exists: true` clause ANDed with the current blank-value disjunction excludes a
missing field while retaining explicit `null`, empty-string, and whitespace-only
matches. MongoDB documents that a null equality filter matches both null and
missing fields, which is the bug's mechanism: [Query for Null or Missing
Fields](https://www.mongodb.com/docs/manual/tutorial/query-for-null-fields/).

The plan is not yet implementation-ready because it preserves a fail-open
database-error path in the preflight, treats the implementation's field table as
its own exhaustive test oracle even though the governing claim contract contains
additional required Clerk identifiers, and models all claim-field absence as the
same state despite the claim schema's discriminated variants. The literal test
steps also omit the new identifier's import and do not prove the promised error
class or exact count.

This review inspected the plan at the SHA above, the current implementation and
tests, the original Fixed Contract 5, the User/Session/ClerkAuthClaim schemas and
types, both startup entrypoints, package exports, repository quality gates, and
all seven CodeCleanup plan-hygiene lenses. No implementation source or source plan
was changed.

## Review summary

Counts are category-local; overlapping findings are counted in each contract they
affect.

| Category    | Status | Critical | Other | Main concerns                                                                  |
| ----------- | -----: | -------: | ----: | ------------------------------------------------------------------------------ |
| Contracts   |     ❌ |        2 |     4 | Fail-open reads, incomplete authoritative field set, overbroad absence promise |
| Interfaces  |     ❌ |        1 |     2 | Self-referential oracle, omitted import, unnecessary source-module export      |
| Promises    |     ❌ |        1 |     3 | Read errors become success; once-per-worker/concurrency promise is unstated    |
| Data models |     ❌ |        1 |     4 | Two required claim identifiers omitted; fixtures ignore discriminated shapes   |
| APIs        |     ⚠️ |        0 |     3 | Published behavior changes compatibly; barrel and worker topology need clarity |
| CodeCleanup |     ❌ |        1 |     2 | Hidden fail-open fallback survives; test constants/count prose drift           |

## Critical blockers

### 1. Preflight database failures are still converted into a clean result

The current blank scan maps every `countDocuments` rejection to `0`
(`packages/data-schemas/src/migrations/clerk.ts:147-158`). Both proposed
implementation snippets preserve that behavior (reviewed plan `:240-263` and
`:289-318`), and Behavior 3 incorrectly describes it as handling a missing
collection (`:438-444`).

A missing collection is not an error in the current real-Mongo harness:
`countDocuments` returns `0` without creating the collection. The blanket catch
instead suppresses authorization, topology, timeout, network, and command errors.
If a transient read fails and later index operations succeed, startup can resolve
without ever establishing the blank-field invariant. That contradicts the
function's assurance comment (`clerk.ts:249-256`), the awaited propagation in
`packages/api/src/auth/clerk/startup.ts:8-20`, and Fixed Contract 5's fail-closed
readiness boundary (`thoughts/searchable/shared/plans/2026-08-12-20-05-tdd-clerk-auth-integration.md:719-729`).

The duplicate scan has the same pre-existing issue by mapping aggregation errors
to `[]` (`clerk.ts:174-184`). A revised plan cannot continue to claim that the
overall preflight fails closed while leaving either scan fail-open.

**Required amendment:** remove the blanket fallbacks and let driver failures
reject, or wrap them in `ClerkIndexAssuranceError` with redacted
`collection.field`/index context and preserved cause. Add a focused failing-read
test proving that `ensureClerkIndexes` rejects rather than continuing. If a
supported database needs special namespace-not-found handling, enumerate only
that driver error and test it; do not convert every rejection to an empty result.

### 2. The “exhaustive” field contract is incomplete and tested against itself

The plan calls the current eight `NO_BLANK_CHECKS` pairs the complete domain and
drives both parameterized suites from the same production constant (reviewed plan
`:70-74`, `:145-149`, `:204-227`, and `:375-393`). Removing, misspelling, or
misassigning a production entry therefore removes or changes its test at the same
time; the suite cannot detect field-table drift.

There is already a concrete mismatch. Fixed Contract 5's consumed-token shape
requires `sourceClerkSessionId` and `sourceClerkUserId`
(`thoughts/searchable/shared/plans/2026-08-12-20-05-tdd-clerk-auth-integration.md:190-196`).
The canonical input type requires both strings
(`packages/data-schemas/src/types/clerkAuthClaim.ts:33-40`), and schema validation
rejects either when blank (`packages/data-schemas/src/schema/clerkAuthClaim.ts:4-9`
and `:33-43`). Neither field appears in `NO_BLANK_CHECKS`
(`packages/data-schemas/src/migrations/clerk.ts:98-108`).

**Required amendment:** first decide and state the authoritative contract:

- If Fixed Contract 5 still means every present Clerk claim identifier, add the
  two source identifiers and independently enumerate/assert the resulting ten
  pairs.
- If startup preflight is intentionally limited to indexed key fields, amend the
  governing contract and stop describing the eight-entry table as every Clerk
  claim field.

In either case, keep an independent expected table or exact membership assertion
in the spec. Sharing the implementation table may still reduce repeated test
setup, but it cannot be the only oracle for table completeness.

## Contract review

### Well-defined

- The narrow absent-versus-null invariant is explicit, and the proposed `$and`
  predicate preserves evaluation semantics without changing error messages or
  index definitions.
- `ensureClerkIndexes(connection: Connection): Promise<void>` remains the tested
  production boundary (`clerk.ts:258-299`); `preflightNoBlankValues` appropriately
  remains private.
- Enabled startup awaits the migration and propagates rejection before either
  server listens (`packages/api/src/auth/clerk/startup.ts:13-20`,
  `api/server/index.js:124-141`, `api/server/experimental.js:290-309`).
- The change reads User/Session documents but does not mutate them, so the
  repository's auth user-document-cache invalidation rule is not triggered.

### Missing or unclear

- The reviewed plan says every checked field has a field-`$exists` partial index
  (`:70-74`). That is true only for User and Session. Claim indexes are filtered
  by `kind` (`clerk.ts:64-89`; `schema/clerkAuthClaim.ts:128-150`), and the TTL
  index has no corresponding string blank check.
- “A missing field always succeeds” conflates valid cross-variant absence with a
  malformed owning variant. A `session_state` claim must omit consumed-token
  fields, while a `consumed_token` claim missing `tenantScope` is invalid. The
  `{ unrelated: 'value' }` fixture does not exercise either contract.
- Behavior 2 promises `ClerkIndexAssuranceError` and the correct count
  (`:343-358`), but the test accepts any `Error` with any digit sequence and
  inserts only one document (`:375-393`).
- The listed mixed case—one field blank while another field in the same document
  is absent—is not asserted with exact error precedence/count.

### Recommendations

- Correct the claim-index rationale and add valid raw fixtures for
  `consumed_token`, `session_state`, and `user_state`, demonstrating intentional
  cross-variant omissions.
- Add a mixed fixture with multiple absent rows plus two genuinely blank rows;
  assert `ClerkIndexAssuranceError` and exact `has 2 ... value(s)` text.
- Add an explicit nonblank-success case if the testing strategy continues to call
  absent/null/empty/whitespace/nonblank fully enumerable.

## Interface review

### Well-defined

- The published callable and error type remain unchanged. No new callable test
  seam or external method is needed.
- Exporting a symbol only from `migrations/clerk.ts` would remain source-local:
  the migration barrel, package root, build entries, and `package.json` exports
  are selective (`migrations/index.ts:1-3`, `src/index.ts:60-66`, and
  `packages/data-schemas/package.json:10-30`).

### Missing or unclear

- The proposed tests reference `NO_BLANK_CHECKS`, but the plan never updates the
  existing import at `packages/data-schemas/src/migrations/clerk.spec.ts:5`.
  The Red step would fail with a missing identifier before reaching MongoDB.
- `ReadonlyArray<{ collection: string; field: string }>` is only shallowly
  readonly; exporting it widens a mutable source-module surface solely for tests.

### Recommendations

- Prefer a spec-local independent contract table and keep `NO_BLANK_CHECKS`
  private. If the production table is exported, add the exact `./clerk` import,
  independently assert its membership, make element properties readonly, and
  explicitly forbid migration/root barrel exports.

## Promise review

### Well-defined

- The startup promise chain is attached and awaited; rejection reaches process
  exit rather than becoming a detached rejection. Existing tests cover disabled
  no-op, enabled call, and rejection propagation
  (`packages/api/src/auth/clerk/startup.spec.ts:3-51`).
- Transaction-probe cleanup remains in `finally`, and the memory-server fixtures
  close both connection and server (`clerk.ts:230-246`,
  `clerk.spec.ts:23-26,116-119`).
- Serial rerun idempotency is already tested against real Mongo
  (`clerk.spec.ts:59-65`).

### Missing or unclear

- The fail-open read fallback is the blocking promise defect described above.
- Workflow Closure says the gate is called “once” (`:152-165`), but experimental
  mode defaults to four workers, forks them together, and each worker runs the
  gate (`api/server/experimental.js:69,154-191,283-309`). The accurate promise is
  once per startup invocation/worker, potentially overlapping across workers or
  pods.
- The preflight is a sequence of reads, not an atomic snapshot/fence. The plan
  should state the assumption that no legacy/direct Clerk-field writes race the
  startup scan. Normal Mongoose validation narrows this risk but does not make the
  scan atomic.

### Recommendations

- Correct the once-only language. If concurrent assurance is claimed, add a
  `Promise.all` real-Mongo idempotency case; otherwise document concurrency as a
  pre-existing implementation property outside this predicate-only change.
- Do not claim a bounded completion/cancellation guarantee: these database calls
  have no operation-specific deadline. Track that separately if startup time
  bounds are required.

## Data-model review

### Well-defined

- Missing Clerk fields on historical local/social Users and non-Clerk Sessions
  are valid and backward-compatible (`types/user.ts:66`,
  `types/session.ts:8-14`, `schema/session.ts:10-23`). No stored-schema migration
  or user-document rewrite is required for the narrow predicate correction.
- Explicit null/empty/whitespace remains invalid for the checked fields; the
  proposed `$exists` gate does not overcorrect explicit null.

### Missing or unclear

- The two consumed-token source identifiers are absent from the claimed complete
  field set, as described in blocker 2.
- Behavior 3's Session fixtures are not realistic model documents: `user` is a
  string rather than an ObjectId, `refreshTokenHash` is absent, and
  `expiration: new Date()` is immediately expired (`schema/session.ts:39-53`).
- Behavior 1's `{ unrelated: 'value' }` is invalid for every named schema. Raw
  inserts are appropriate for legacy-corruption tests, but they should not be
  described as realistic model shapes.
- No restart fixture includes valid existing claim variants, the most important
  proof that their intentionally absent cross-variant fields do not false-positive.

### Recommendations

- Use realistic User/Session raw shapes in the incident regression (ObjectIds,
  refresh-token hashes, future expirations), while still omitting Clerk fields.
- Add valid raw documents for all three claim variants and state whether malformed
  owning-variant omissions are outside blank preflight or must fail another
  validation stage.

## API review

### Well-defined

- No HTTP request/response, auth, status-code, versioning, or client API changes
  are introduced. Existing startup-adapter coverage is proportionate for this
  query-only fix.
- The post-merge Railway health check is correctly tracked separately on
  `AF-0m3k`, which depends on the implementation bug `AF-g4xa`.

### Clarifications

- `ensureClerkIndexes` is already a published root API
  (`packages/data-schemas/src/index.ts:60-66`). Classify the change as a
  backward-compatible behavioral relaxation: optional absent Clerk fields now
  succeed; the signature and error class remain unchanged.
- Do not promote a test-only field table through package barrels.
- Correct “once” to once per worker/startup invocation; this does not create a new
  HTTP/E2E requirement for the predicate itself.

## CodeCleanup plan-hygiene review

### Well-defined

- The proposed TypeScript control expressions contain no mutation or effecting
  calls. The Mongo `$and`/`$or` object is query data, not code nesting.
- The loop's `if (count > 0) throw` path is already flat and readable; no guard
  inversion or helper extraction is warranted.
- `NO_BLANK_CHECKS` and `blankValues` are appropriate named collections; no wire,
  serialized, ABI, CLI, or database numeric value is being reordered.
- The CodeCleanup When-NOT-to-Apply constraints argue against adding a query
  builder, reordering fail-fast checks, or broad cleanup of
  `findCompatibleOrConflicting` during this fix.

### Blocking hygiene issue

- `.catch(() => 0)` is hidden production behavior that makes “could not inspect”
  indistinguishable from “inspected and clean.” Retaining it fixes one Mongo
  semantic trap while preserving another root-cause-level assurance defect.

### Warnings

- The production table serving as its own exhaustive test oracle defeats the
  named-constant anti-drift goal.
- The plan repeatedly says 8 × 3 = 24 cases, but `blankValues` contains four
  concrete values (`null`, `''`, spaces, and tab/newline), so the table runs 32
  cases. It also says four collections where the table contains three.

No CodeCleanup customization directory was present. The review applied the base
rules only and did not run cleanup transforms or notifications.

## Validation and quality-gate review

The current focused suite passed unchanged under Node `v24.16.0`:

```text
cd packages/data-schemas && npx jest migrations/clerk.spec.ts --runInBand
PASS — 1 suite, 9 tests
```

A direct real-Mongo diagnostic confirmed that `countDocuments` on a nonexistent
collection returns `0` and leaves the collection nonexistent, so the blanket
catch is not needed for the plan's fresh-database case.

The proposed gate text says “typecheck and lint clean,” but its command runs only
Jest and TypeScript (`:329-330`). `jscpd` is not installed in the repository, so
bare `npx jscpd` may fetch an unpinned package and is disproportionate for this
small query edit.

**Required gate amendments:**

```bash
cd packages/data-schemas
npx jest migrations/clerk.spec.ts --runInBand
npm run test:ci
npx tsc --noEmit -p tsconfig.json

# from repository root, matching CI's changed-file gate
npx eslint --no-error-on-unmatched-pattern --config eslint.config.mjs \
  --no-warn-ignored --max-warnings=0 -- \
  packages/data-schemas/src/migrations/clerk.ts \
  packages/data-schemas/src/migrations/clerk.spec.ts
npx prettier --check \
  packages/data-schemas/src/migrations/clerk.ts \
  packages/data-schemas/src/migrations/clerk.spec.ts
npm run build:data-schemas
```

Remove the `jscpd` step unless the repository intentionally adds and pins that
tool; ordinary review is enough to establish that the predicate edit introduces
no duplication.

## Suggested plan amendments

```diff
# Current State / Desired End State
- Treat the current eight-entry production list as the exhaustive contract.
+ Reconcile Fixed Contract 5 with sourceClerkSessionId/sourceClerkUserId.
+ Define an independent expected field table or exact membership assertion.
+ Explain that claim index filters are discriminator-based, not field-$exists.

# Behavior 1
- Export NO_BLANK_CHECKS solely to drive the tests from production state.
- Seed `{ unrelated: 'value' }` for every table row.
+ Keep the table private, or import a source-local readonly export explicitly.
+ Use independent, variant-aware User/Session/claim fixtures.
+ Add a read-failure Red test; remove/wrap blanket count/aggregate catches Green.

# Behavior 2
- Assert any numeric count through a message-only regular expression.
- Call four concrete blank values 24 cases.
+ Assert ClerkIndexAssuranceError and exact `has 1` messages for 32 cases.
+ Add absent+blank coexistence with an exact count greater than one.
+ Add a present-nonblank success matrix if claiming the domain is exhaustive.

# Behavior 3 / Workflow Closure
- Use schema-invalid raw Session fixtures while calling them realistic.
- Say ensureClerkIndexes runs once.
+ Use realistic pre-Clerk User/Session raw shapes and valid claim variants.
+ Say once per worker/startup invocation; document overlap/snapshot assumptions.

# Quality gates
- Claim lint coverage without a lint command; run unpinned npx jscpd.
+ Add exact Jest, TypeScript, ESLint, Prettier, and build commands.
+ Remove or pin the duplication tool.
```

## Review checklist

### Contracts

- [x] Component and startup boundaries are identified.
- [x] Narrow absent/null predicate semantics are specified.
- [ ] Read-error contract fails closed.
- [ ] Authoritative blank-field membership is independently specified.
- [ ] Claim discriminator and malformed-owning-variant semantics are explicit.

### Interfaces

- [x] Production callable signature remains stable.
- [x] Private helper remains private.
- [ ] Test identifier import/oracle is complete.
- [ ] Test-only data is kept out of published barrels.

### Promises

- [x] Awaiting, propagation, and resource cleanup are defined.
- [x] Serial idempotency has real-Mongo coverage.
- [ ] Database read failure cannot resolve as success.
- [ ] Per-worker concurrency/snapshot assumptions are documented.

### Data models

- [x] Historical User/Session field omission is backward-compatible.
- [x] No stored-data rewrite is required for the narrow fix.
- [ ] Required consumed-token source identifiers are reconciled.
- [ ] Fixtures represent valid model/variant relationships where realism is claimed.

### APIs

- [x] No HTTP/client/auth API change is required.
- [x] Post-merge live verification is tracked separately.
- [ ] Published behavioral compatibility and barrel constraints are stated.

### CodeCleanup

- [x] Conditions are pure and mutation-free.
- [x] Control flow remains flat; query-data nesting is justified.
- [x] No externally observed literal is renumbered.
- [ ] Hidden fail-open fallbacks are removed or explicitly reconciled.
- [ ] Test constants/counts cannot drift silently.

## Approval status

- [ ] Ready for Implementation
- [ ] Needs Minor Revision
- [x] **Needs Major Revision — critical contract and promise issues must be resolved first**

Amendments are tracked by `AF-5ie0`, which blocks implementation issue
`AF-g4xa`. Re-review the amended plan before implementation begins.

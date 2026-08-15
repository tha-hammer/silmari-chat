---
date: 2026-08-15T07:15:34-04:00
reviewed_plan: thoughts/searchable/shared/plans/2026-08-14-18-33-tdd-fix-clerk-index-preflight-blank-check.md
plan_sha256: 9ffb4ce4acc2b0f5f40333a6f5e43b7a5a9bc27dc3f3b52d53863fa1c5a45271
prior_review: thoughts/searchable/shared/plans/2026-08-14-18-33-tdd-fix-clerk-index-preflight-blank-check-REVIEW.md
git_commit: d713477caf10a75dc1c64cbf9b18cdbbe7e37c0c
branch: main
decision: needs-minor-revision
amendment_issue: AF-5ie0
related_bug: AF-g4xa
---

# Second Review: Fix `ensureClerkIndexes` Preflight False Positive

## Decision

> **⚠️ Needs minor revision before implementation.**

The amended plan resolves both Critical blockers from the first review. It now removes
both catch-to-clean database fallbacks, independently specifies the governing 10-field
blank-check contract, models valid claim omissions by discriminator, and uses the public
real-Mongo assurance boundary for closure. The production design is now sound and no new
Critical blocker was found.

The plan is not quite implementation-ready because several test instructions remain
ambiguous enough to produce a passing test for the wrong reason. Most importantly, Cycle
1's Red step asks for the current incident rejection even though the cycle's acceptance
contract is resolution, and the fault cycles do not completely specify the native error,
the command-count invariant, or the concrete proof that index creation was not reached.
These are small plan edits, not a redesign.

This review inspected the amended plan at the SHA above, the first review, the governing
Fixed Contract 5, current migration and test code, User/Session/ClerkAuthClaim schemas and
types, package exports, startup adapters and entrypoints, repository gates, and all seven
CodeCleanup plan-hygiene lenses. The unchanged focused suite also passed under Node
`v24.16.0`. No implementation source or source plan was changed.

## Review summary

Counts are category-local; related findings can appear in more than one lens.

| Category    | Status | Critical | Warnings | Result                                                                           |
| ----------- | -----: | -------: | -------: | -------------------------------------------------------------------------------- |
| Contracts   |     ⚠️ |        0 |        3 | Prior blockers resolved; Cycle 1 and governing-contract wording need precision   |
| Interfaces  |     ⚠️ |        0 |        3 | Boundaries are correct; fault payload and observables are under-specified        |
| Promises    |     ✅ |        0 |        2 | Both fail-open reads are independently testable and will reject unchanged        |
| Data models |     ⚠️ |        0 |        2 | Ten-field ownership is correct; fixture expiry/branch wording should be hardened |
| APIs        |     ⚠️ |        0 |        3 | Surface is stable; rejected-error and startup-precondition prose diverge         |
| CodeCleanup |     ⚠️ |        0 |        3 | Root-cause scope is good; placeholders/literals/isolation fallback need cleanup  |

## Required minor amendments

### 1. Make Cycle 1's Red test assert the desired success behavior

Cycle 1's Given/When/Then correctly requires public assurance to resolve and verify all
eight indexes (`plan:328-333`). Its Red instructions then say to “require the existing
exact incident failure” (`plan:335-340`). An assertion for that rejection passes against
the current buggy implementation; it is characterization, not a Red test of the desired
contract.

Change the executable Red step to expect
`ensureClerkIndexes(connection)` to resolve and the eight exact indexes to exist. The
current `users.clerkId has 1 ...` rejection may be recorded as the observed reason for
the failed resolve assertion or as an explicitly temporary diagnostic, but it must not be
the cycle's final assertion. Replace the unresolved `<legacy-user-count>` placeholder
with `1` if that diagnostic remains.

### 2. Specify the real-Mongo fault harness exactly

Cycles 4-5 identify the correct mechanism, but “a stable test error code” is not an
executable value and the connection lifecycle is implicit (`plan:424-429`). Define a
named test-only error-code constant, use it in `data.errorCode`, and assert the captured
native driver rejection's concrete class/name and exact `.code`. Show the exact
`configureFailPoint: 'failCommand'` enable and `mode: 'off'` disable commands, state which
connection is created with `{ retryReads: false }`, and close that connection with the
replica set.

Derive the duplicate-scan skip budget from the independent oracle, for example
`EXPECTED_BLANK_COUNT_COMMANDS = EXPECTED_NO_BLANK_CHECKS.length`, rather than repeating
the structural literal `10`. State that, with the pinned driver, each `countDocuments`
issues one `aggregate`; the next aggregate is the first duplicate scan. This keeps Cycle
5's failure targeted if the contract table changes.

### 3. Make “pre-index failure” an observable assertion

The plan promises that both injected read failures reject before index creation and the
transaction probe (`plan:306-320,418-431,442-453`) but does not say how the tests prove
that boundary. The existing mocked success logger alone is insufficient because any later
failure would also suppress the final log.

After each captured rejection, use real Mongo reads to assert that none of the required
`CLERK_INDEX_SPECS` names exists. Also assert that the exact final success log was not
emitted. Optionally assert that `__clerk_txn_probe__` was not created. These checks preserve
the plan's prohibition on driver and production-method mocks while proving the intended
phase was not reached.

### 4. Harden fixture and isolation constants

The shared fixture expiration is only `Date.now() + 60_000` (`plan:202-209`). A fresh
binary download, debugger, slow coverage run, or loaded CI worker can cross that horizon,
after which Mongo's TTL monitor may delete rows used by the real-Mongo cases. Use a named,
substantially longer test horizon, such as one hour.

Likewise, derive the matrix's expected blank count from `BLANK_VALUES.length` rather than
duplicating `4`. The intentional mixed-case count of two may remain a named scenario
constant. For test isolation, remove the existing broad collection-drop
`.catch(() => undefined)` (`clerk.spec.ts:28-39`) or explicitly narrow/justify it; silently
continuing after a failed drop can leak rows or indexes into the new exact-count cases.

### 5. Reconcile two governing-contract statements

The amended plan intentionally allows the original native Mongo rejection to escape a
failed preflight read (`plan:48-51,173-181,501-507`). Governing Fixed Contract 5 currently
describes only `Rejected<IndexAssuranceError>`
(`2026-08-12-20-05-tdd-clerk-auth-integration.md:719-729`). State explicitly that the
amendment supersedes that notation for database read failures: detected data remains
`ClerkIndexAssuranceError`, while an inability to read propagates the native driver error.

The same governing contract says assurance runs only when Clerk is enabled and
`MONGO_AUTO_INDEX=false`, whereas the live startup adapter delegates whenever Clerk is
enabled (`packages/api/src/auth/clerk/startup.ts:13-21`). This mismatch predates the bug
fix and must not expand its implementation scope. Clarify whether targeted assurance is
intentionally idempotent for every Clerk-enabled startup or whether the old condition is
a deferred contract discrepancy.

## First-review resolution matrix

| First-review finding                                 | Second-review disposition                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Mongo null equality matched missing fields           | **Resolved.** Exact `$exists` + blank `$or` predicate and public restart closure are specified.     |
| Blank-count failure mapped to zero                   | **Resolved.** Cycle 4 removes the catch and injects a real aggregate failure.                       |
| Duplicate-scan failure mapped to empty               | **Resolved.** Cycle 5 faults the first duplicate aggregate after the blank scans.                   |
| Eight-field table was incomplete                     | **Resolved.** Both source claim identifiers are included in the 10-field grammar.                   |
| Production table was its own oracle                  | **Resolved.** The test owns an independently authored table and production remains private.         |
| Claim absence ignored discriminated variants         | **Resolved.** Valid fixtures cover consumed, session-state, and user-state ownership.               |
| Exact error class/count was not proved               | **Resolved for data errors.** Cycles 2-3 capture one rejection and assert class plus exact text.    |
| Mixed absence/count/precedence was missing           | **Resolved.** Cycle 3 requires exact count two and first-field precedence.                          |
| Fixtures were not schema-faithful                    | **Resolved.** User/Session/claim fixtures include required ownership fields and future dates.       |
| Once-only and atomic-scan claims were inaccurate     | **Resolved.** The plan says once per worker/invocation and disclaims atomicity/global coordination. |
| API/barrel compatibility was unclear                 | **Resolved.** Published signature, error class, indexes, and barrels stay unchanged.                |
| Counts, collection totals, and quality gates drifted | **Resolved.** The plan says 10 × 4 = 40 across three collections and lists exact repository gates.  |
| Handoff was mislabeled as incident discovery         | **Resolved.** It is now described as pre-incident deployment/credential context.                    |

The independent matrix proves every required member and detects missing, misspelled, or
reassigned production rows. Because the private production table cannot be introspected,
it does not mechanically reject an extra production row. Either describe the matrix as
complete required-member coverage or retain exact-membership enforcement as an explicit
code-review invariant; do not claim the behavior test detects additions that it cannot
observe.

## Lens findings

### Contracts

**Good**

- The public boundary, exact absent-versus-blank predicate, error order, and eight index
  definitions are stable.
- Both preflight reads fail closed and preserve their original native rejection.
- Valid absence is separated from malformed owning-variant omission, which remains outside
  this narrow scan and is rejected by normal Mongoose validation.
- Worker overlap, non-atomic observations, validation-bypassing write races, timeouts, and
  cancellation are accurately bounded.

**Warnings**

- Cycle 1's Red instruction conflicts with its resolve-success acceptance contract.
- The private-table test proves required membership, not the absence of extra rows.
- Fixed Contract 5's error and `MONGO_AUTO_INDEX` wording must be reconciled with the
  amended/live behavior.

### Interfaces

**Good**

- `NO_BLANK_CHECKS` stays private and no package, barrel, build-entry, or deep-import seam is
  added.
- The independently authored oracle has exact live field names and does not import
  production metadata.
- `ensureClerkIndexes`, `ClerkIndexAssuranceError`, and `CLERK_INDEX_SPECS` retain their
  existing names, signatures, and export paths.
- The real public trigger and existing logger mock are sufficient; no production test seam
  is required.

**Warnings**

- The failpoint payload, error identity, disable command, and connection lifecycle need
  exact instructions.
- The no-index-created observable must be specified, not inferred from rejection or logs.
- The duplicate fault's skip budget should be named/derived from the spec oracle.

### Promises

**Good**

- `ensureClerkIndexes` awaits both preflights before discovery, creation, verification, and
  the transaction probe (`clerk.ts:258-299`). Removing either catch makes the native
  rejection exit the public promise immediately.
- `ensureClerkStartupReady` awaits the public promise, and both entrypoints attach startup
  failure handling before listening.
- Cycle 4 is a valid Red → Green: the one-shot aggregate failure is currently converted to
  zero and will propagate after removing `.catch(() => 0)`.
- Cycle 5 is a valid Red → Green at the amended 10-row table: ten blank aggregates precede
  the first duplicate aggregate, whose error is currently converted to `[]`.
- `retryReads: false` prevents the driver from masking the injected read error; production
  `retryWithBackoff` applies only to `createIndex`.
- Failpoint cleanup in `finally` and the existing transaction-session cleanup remain
  attached and awaited.

**Warnings**

- Native error identity and pre-index observables need exact assertions.
- No operation-specific timeout or cancellation exists; the plan correctly keeps that as a
  documented non-goal.

### Data models

**Good**

- The 10 rows exactly match the optional User identifier, all-or-none Clerk Session fields,
  four consumed-token fields, and the two state-claim identifiers.
- Fixtures satisfy required User, Session, and claim fields; raw blank rows are correctly
  labeled deliberate corruption rather than valid documents.
- No stored schema/index migration or User mutation is introduced, so the auth user-document
  cache invalidation rule is not triggered.

**Warnings**

- Extend and name the 60-second expiration horizon for deterministic TTL behavior.
- “All three claim variants” means the three identifier-ownership kinds. If full union-branch
  coverage is intended, also include revoked/deleted states; otherwise say active rows are
  representative because identifier ownership is unchanged.

### APIs

**Good**

- No HTTP, client, auth-session, cache, deployment-variable, or route contract changes.
- Missing optional-field success is a backward-compatible relaxation; exact data-error and
  index metadata remain stable.
- Downstream Railway credential/health/sign-in work stays separate behind `AF-g4xa` and
  `AF-0m3k`.

**Warnings**

- Raw Mongo read rejection broadens the runtime rejected-error set even though the
  TypeScript `Promise<void>` surface is unchanged; document the governing contract update.
- Clarify the inherited `MONGO_AUTO_INDEX` startup-condition mismatch without broadening
  this two-file fix.
- If `@librechat/data-schemas` release policy requires changelog/version notes for runtime
  changes, record this compatible behavioral change during release.

## CodeCleanup plan-hygiene review

The seven rules were applied as review criteria only; no cleanup transform or notification
was run. No customization directory was present.

| Rule                               | Assessment                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| No Side Effects in Conditionals    | **Good.** The `$and`/`$or` object is Mongo query data; operations remain serial and awaited.     |
| No Mutation in Control Expressions | **Good.** No planned condition contains assignment, increment, or a mutating call.               |
| Never Nesting                      | **Good.** Existing loop/guard flow remains flat; `try/finally` is justified fault cleanup.       |
| Named Constants Over Literals      | **Warning.** Name/derive `skip: 10`, count `4`, the fixture horizon, and failpoint error code.   |
| Control Expressions Discipline     | **Good.** The production checks stay simple and preserve first-failure order.                    |
| Maintainability Recovery           | **Good.** The plan fixes root causes and resists a query builder or unrelated migration cleanup. |
| Execution/gate discipline          | **Warning.** Remove or justify the test-isolation catch that hides collection-drop failure.      |

The plan correctly defers the pre-existing broad `indexes()` catch in
`findCompatibleOrConflicting` (`clerk.ts:194-204`). Do not describe this slice as removing
every database-read fallback; it specifically closes both preflight reads.

## Validation

The current implementation remains intentionally unfixed. Its baseline suite passed under
the required runtime:

```text
node --version
v24.16.0

cd packages/data-schemas
npx jest migrations/clerk.spec.ts --runInBand
PASS — 1 suite, 9 tests
```

The amended plan's SHA-256 is
`9ffb4ce4acc2b0f5f40333a6f5e43b7a5a9bc27dc3f3b52d53863fa1c5a45271`; the repository
commit and branch still match its recorded `d713477...` / `main` context. The installed
memory-server harness uses MongoDB `8.2.1`, and the plan's `failCommand` prerequisites were
validated locally with `enableTestCommands=1` and `retryReads: false`.

## Approval checklist

### Contracts

- [x] Prior absent/null, fail-open, field-membership, and variant blockers are resolved.
- [x] Public signature, index definitions, and failure order are stable.
- [ ] Cycle 1 has one unambiguous desired-behavior Red assertion.
- [ ] Governing error/startup precondition wording is reconciled.

### Interfaces and promises

- [x] Production metadata remains private and the test oracle is independent.
- [x] Both read-failure cycles are mechanically valid at the public boundary.
- [ ] Fault payload, error constant, connection lifecycle, and disable command are exact.
- [ ] Pre-index failure has a concrete no-required-index assertion.
- [ ] Duplicate skip budget is named/derived.

### Data and hygiene

- [x] Ten field owners and schema-faithful fixtures are correct.
- [x] No schema rewrite, User mutation, or cache invalidation is required.
- [ ] TTL horizon and structural test counts are deterministic/named.
- [ ] Test collection-drop failures cannot silently leak state.

## Approval status

- [ ] Ready for Implementation
- [x] **Needs Minor Revision — test mechanics and inherited contract wording need one more precision pass**
- [ ] Needs Major Revision

Keep `AF-5ie0` in progress and `AF-g4xa` blocked. Once the required minor amendments are
made, rerun a targeted verification of the edited sections; the production design does not
need another full architectural review.

---
date: 2026-08-14T18:33:29-04:00
author: maceo
git_commit: d713477caf10a75dc1c64cbf9b18cdbbe7e37c0c
branch: main
repository: silmari-chat
topic: 'Fix ensureClerkIndexes preflight false-positive and fail-open reads'
tags: [tdd-plan, bugfix, clerk, mongodb, data-schemas]
status: implemented-all-gates-green
last_updated: 2026-08-15
last_updated_by: claude
type: tdd_plan
related_bug: AF-g4xa
review: thoughts/searchable/shared/plans/2026-08-14-18-33-tdd-fix-clerk-index-preflight-blank-check-REVIEW.md
review_issue: AF-vkn1
amendment_issue: AF-5ie0
---

# Fix `ensureClerkIndexes` Missing-Field False Positive and Fail-Open Reads

## Outcome

When Clerk is enabled, `ensureClerkIndexes` must distinguish a field that is absent by
contract from one that is present but blank. It must also reject when either preflight
database read cannot establish its invariant. The public signature remains
`ensureClerkIndexes(connection: Connection): Promise<void>`; the eight index definitions
and `ClerkIndexAssuranceError` remain published and source-compatible.

This plan fixes the production incident in which a normal pre-Clerk User without
`clerkId` matched MongoDB's `{ clerkId: null }` equality semantics and crash-looped
startup. It incorporates every blocker and warning from the linked review and must be
re-reviewed before implementation begins.

## Review-Locked Decisions

1. **Gate blank equality with presence.** For every checked field, the blank query is an
   outer `$and` containing `{ [field]: { $exists: true } }` and the existing blank-value
   `$or`. A bare `{ [field]: null }` is never used as a complete blank predicate because it
   also matches missing fields.
2. **Use the governing 10-field contract.** Fixed Contract 5 covers every present Clerk
   User, Session, or claim identifier, not only index keys. The current eight entries gain
   `clerkauthclaims.sourceClerkSessionId` and
   `clerkauthclaims.sourceClerkUserId`.
3. **Keep production metadata private and tests independent.** `NO_BLANK_CHECKS` remains
   private to `migrations/clerk.ts`. The spec owns a separately authored 10-row oracle. No
   `./clerk`, migrations-barrel, package-root, build-entry, or `package.json` export is
   added for test data.
4. **Fail closed on both preflight reads.** Remove `.catch(() => 0)` from
   `countDocuments` and `.catch(() => [])` from duplicate aggregation. Original Mongo
   driver failures propagate unchanged. A nonexistent collection is not special-cased:
   real Mongo returns an empty read result for it.
5. **Model absence by document variant.** Historical/local Users and non-Clerk Sessions
   may omit Clerk fields. Each valid `ClerkAuthClaim` variant must omit fields belonging to
   other variants. Missing a required field on the owning variant is malformed and remains
   outside this narrow present-but-blank startup check; canonical Mongoose validation
   rejects that write.
6. **State startup topology precisely.** Assurance runs once per startup invocation or
   worker, including replacement workers, and may overlap across workers or pods. The
   sequential scans are not an atomic snapshot or write fence. This slice assumes no
   validation-bypassing Clerk-field write races startup and adds no operation-specific
   deadline, global single-flight, or concurrency guarantee.
7. **Preserve scope and failure order.** Keep the existing fail-fast field order. Do not
   add a query builder, reorder preflights, change index definitions, or broaden cleanup of
   `findCompatibleOrConflicting`, retry, or transaction-probe code.

## Current-State Evidence

- The private eight-row table is at
  `packages/data-schemas/src/migrations/clerk.ts:98-108`; the blank scan maps read errors
  to zero at `:146-165`, and the duplicate scan maps aggregation errors to an empty array at
  `:167-192`.
- `ensureClerkIndexes` awaits both scans before index creation, verification, and the
  transaction probe (`clerk.ts:249-299`). Its own contract says assurance fails closed.
- The canonical consumed-token input requires `tenantScope`, `clerkTokenId`,
  `sourceClerkSessionId`, and `sourceClerkUserId`
  (`packages/data-schemas/src/types/clerkAuthClaim.ts:33-40`). Schema validation rejects
  missing or blank values for all four (`schema/clerkAuthClaim.ts:4-9,33-43`).
- User and Session indexes use field-`$exists` partial filters, but claim indexes are
  discriminator-filtered by `kind`; the TTL index has no string blank check
  (`migrations/clerk.ts:29-96`, `schema/clerkAuthClaim.ts:128-152`). Blank-field assurance
  and index definitions are related contracts, not a one-row-per-index mapping.
- Standard startup awaits assurance before listening (`api/server/index.js:124-141`).
  Experimental startup defaults to four workers and each worker awaits it independently
  (`api/server/experimental.js:68-69,154-191,283-309`).
- The existing real-Mongo suite provides collection isolation, exact index verification,
  serial idempotency, duplicate, incompatible-index, and transaction-support coverage
  (`packages/data-schemas/src/migrations/clerk.spec.ts:14-130`).
- A local Node 24 diagnostic confirmed two harness facts used below: a missing collection's
  `countDocuments` resolves to `0`, and the installed memory-server binary supports the
  `failCommand` failpoint when started with `enableTestCommands=1` and `retryReads: false`.

## Desired End State

The following are the smallest observable behaviors:

1. Given realistic pre-Clerk User and Session rows, when public
   `ensureClerkIndexes(connection)` runs, then missing optional Clerk fields do not count as
   blank, assurance resolves, and all eight exact indexes exist.
2. Given valid `consumed_token`, `session_state`, and `user_state` rows, when assurance
   runs, then each variant's intentional cross-variant omissions succeed.
3. Given any independently specified Clerk field present as `null`, `''`, spaces, or
   tab/newline, when assurance runs, then it rejects with `ClerkIndexAssuranceError`
   naming the exact `collection.field` and exact count.
4. Given absent rows alongside two genuinely blank rows for the same field, when assurance
   runs, then only the two present blanks count and the first failing field is reported.
5. Given Mongo rejects the blank-count read, when assurance runs, then the original driver
   error rejects the public promise before index creation or the transaction probe.
6. Given all blank counts succeed but Mongo rejects the first duplicate aggregate, when
   assurance runs, then the original driver error rejects the public promise before index
   creation or the transaction probe.

## Authoritative Field and Value Grammar

The production and spec tables have the same intended membership, but they are authored
independently:

| Order | Collection        | Field                  | Owning shape / valid omission                           |
| ----: | ----------------- | ---------------------- | ------------------------------------------------------- |
|     1 | `users`           | `clerkId`              | Optional on historical/local Users                      |
|     2 | `sessions`        | `clerkTokenId`         | Required together only on Clerk Sessions                |
|     3 | `sessions`        | `clerkSessionId`       | Required together only on Clerk Sessions                |
|     4 | `sessions`        | `clerkUserId`          | Required together only on Clerk Sessions                |
|     5 | `clerkauthclaims` | `tenantScope`          | Required on `consumed_token`; omitted by state variants |
|     6 | `clerkauthclaims` | `clerkTokenId`         | Required on `consumed_token`; omitted by state variants |
|     7 | `clerkauthclaims` | `sourceClerkSessionId` | Required on `consumed_token`; omitted by state variants |
|     8 | `clerkauthclaims` | `sourceClerkUserId`    | Required on `consumed_token`; omitted by state variants |
|     9 | `clerkauthclaims` | `clerkSessionId`       | Required on `session_state`; omitted by other variants  |
|    10 | `clerkauthclaims` | `clerkUserId`          | Required on `user_state`; omitted by other variants     |

The spec-local oracle is explicit and is not imported from production:

```ts
const EXPECTED_NO_BLANK_CHECKS = [
  { collection: 'users', field: 'clerkId' },
  { collection: 'sessions', field: 'clerkTokenId' },
  { collection: 'sessions', field: 'clerkSessionId' },
  { collection: 'sessions', field: 'clerkUserId' },
  { collection: 'clerkauthclaims', field: 'tenantScope' },
  { collection: 'clerkauthclaims', field: 'clerkTokenId' },
  { collection: 'clerkauthclaims', field: 'sourceClerkSessionId' },
  { collection: 'clerkauthclaims', field: 'sourceClerkUserId' },
  { collection: 'clerkauthclaims', field: 'clerkSessionId' },
  { collection: 'clerkauthclaims', field: 'clerkUserId' },
] as const;

const BLANK_VALUES = [null, '', '   ', '\t\n'] as const;

// Derived, not duplicated literals — see CodeCleanup "Named Constants Over Literals".
const EXPECTED_BLANK_VALUE_COUNT = BLANK_VALUES.length; // 4
const EXPECTED_BLANK_COUNT_COMMANDS = EXPECTED_NO_BLANK_CHECKS.length; // 10 — with the
// pinned driver, each countDocuments call issues exactly one `aggregate` command, so this
// is also the duplicate-scan fault's skip budget (Cycle 5). If the contract table's length
// changes, this constant — not a repeated literal — keeps Cycle 5 targeted at the right
// command.
const MIXED_CASE_BLANK_COUNT = 2; // Cycle 3's intentional two-row mixed fixture; a named
// scenario constant, not a structural derivation.
const FIXTURE_TTL_HORIZON_MS = 60 * 60 * 1000; // 1 hour. A 60-second horizon can be crossed
// by a fresh binary download, a debugger pause, or a loaded CI worker, after which Mongo's
// TTL monitor may delete rows the real-Mongo cases still depend on.
const INJECTED_READ_FAILURE_CODE = 9001; // artificial, test-only Mongo error code injected
// via failCommand (Cycles 4-5) — chosen to be unambiguous against any real driver/server
// error code.
```

There are three semantic blank classes and four concrete values. The matrix therefore
covers `EXPECTED_BLANK_COUNT_COMMANDS × EXPECTED_BLANK_VALUE_COUNT` = 10 × 4 = **40
examples** across **three collections**. Tests may seed all four values for one field in a
single isolated case and require an exact count of `EXPECTED_BLANK_VALUE_COUNT`; this
retains full value coverage while avoiding 40 expensive index-assurance runs. A missing,
misspelled, or reassigned production table row then makes its independent targeted test
resolve or report the wrong field, so drift is observable.

The independent oracle proves complete coverage of every *required* member — it does not,
and cannot, mechanically detect an *extra* row silently added to the private production
table, since that table is never introspected. Treat exact-membership (no unlisted extra
Clerk field) as a code-review invariant, not a claim this behavior test makes.

The exact Mongo predicate is:

```ts
{
  $and: [
    { [field]: { $exists: true } },
    {
      $or: [
        { [field]: null },
        { [field]: '' },
        { [field]: { $type: 'string', $regex: /^\s+$/ } },
      ],
    },
  ],
}
```

The error contract for detected data is unchanged:

```text
[ensureClerkIndexes] Preflight failed: <collection>.<field> has <exact-count> null/empty/whitespace value(s)
```

Detected data violations are `ClerkIndexAssuranceError`. Database read failures are not
data violations and propagate as their original driver errors; no error is converted to a
clean result.

## Testing Strategy

- **Framework:** Jest 30 in `packages/data-schemas`.
- **Primary harness:** real `MongoMemoryReplSet`, public `ensureClerkIndexes`, real Mongo
  queries, index creation/re-read, and transaction probe.
- **Fault harness:** the same real replica set with `enableTestCommands=1`, driver
  `retryReads: false`, and Mongo's `failCommand` failpoint. Failpoints are disabled in
  `finally`; no production helper, Mongo method, or assurance function is mocked.
- **Isolation:** retain the current `beforeEach` collection drop, but narrow its
  `.catch(() => undefined)` (`clerk.spec.ts:28-39`) to swallow only Mongo's "namespace not
  found" case (error code `26` — the benign race where a collection was already absent) and
  rethrow anything else. A silent catch-all here could let a genuine drop failure leak rows
  or stale indexes into the new exact-count cases. Restore/disable every injected fault even
  when an assertion fails.
- **Property testing:** no generator dependency. The domain is a fixed, independently
  enumerated 10-row table and four concrete values.
- **Exact errors:** capture one rejection, assert `toBeInstanceOf(ClerkIndexAssuranceError)`,
  runtime-narrow it to `Error`, and compare `.message` with `toBe`. Do not run assurance
  twice merely to assert class and text.
- **Raw fixtures:** use raw collection writes intentionally because preflight must inspect
  historical/direct-write corruption. Fixtures described as realistic still include the
  owning schema's required fields.

### Fixture Contracts

Use future expirations and distinct IDs so TTL and unique indexes cannot make a test
nondeterministic.

```ts
const future = new Date(Date.now() + FIXTURE_TTL_HORIZON_MS); // 1 hour — see named constants
const userId = new mongoose.Types.ObjectId();

const legacyUser = {
  _id: userId,
  email: 'legacy@test.com',
  emailVerified: false,
  provider: 'local',
};

const clerkUserId = new mongoose.Types.ObjectId();
const clerkUser = {
  _id: clerkUserId,
  email: 'clerk@test.com',
  emailVerified: true,
  provider: 'clerk',
  clerkId: 'user-clerk',
};

const legacySession = {
  user: userId,
  refreshTokenHash: 'legacy-refresh-hash',
  expiration: future,
};

const clerkSession = {
  user: clerkUserId,
  refreshTokenHash: 'clerk-refresh-hash',
  expiration: future,
  absoluteExpiresAt: future,
  authProvider: 'clerk',
  clerkTokenId: 'token-session',
  clerkSessionId: 'session-current',
  clerkUserId: 'user-clerk',
};

const consumedToken = {
  kind: 'consumed_token',
  tenantScope: 'tenant-a',
  clerkTokenId: 'token-existing',
  sourceClerkSessionId: 'session-source',
  sourceClerkUserId: 'user-source',
  expiration: future,
};

const sessionState = {
  kind: 'session_state',
  clerkSessionId: 'session-state',
  state: 'active',
  expiration: future,
};

const userState = {
  kind: 'user_state',
  clerkUserId: 'user-state',
  state: 'active',
  expiration: future,
};
```

Blank-matrix rows are deliberately schema-invalid raw corruption fixtures. They must not
be called realistic model documents. The realistic success fixtures above prove valid
absence and present nonblank values across all 10 fields.

## Workflow Closure

**Classification: BLOCKING.** Every promised outcome crosses an asynchronous MongoDB
connector, and this is an index/startup-readiness workflow. Calling the private
`preflightNoBlankValues` directly would start below the highest connector changed and is
forbidden. The optional `references/closure-test-framework.md` named by the enhancement
skill is absent from the installed skill; this section applies the complete closure rules
embedded in the skill itself.

### Closure Map

| Anchor         | Contract                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SOURCE         | Fresh isolated replica-set database; schema-faithful success rows; explicit raw corruption rows; test-only server failpoint configuration                                       |
| TRIGGER        | Public production `ensureClerkIndexes(connection)`                                                                                                                              |
| DRIVERS        | Awaited real Mongoose/Mongo promises and real `failCommand`; no sleeps or polling                                                                                               |
| OBSERVABLE     | Public promise resolves only after production index verification/transaction probe, or rejects with the locked data/driver error contract                                       |
| FORBIDDEN SPAN | Do not export/call private preflights, recreate the predicate in tests, mock `ensureClerkIndexes`, mock driver methods, skip index verification, or assert only raw stored rows |

The production registration chain already exists and is unchanged:

```text
api/server/index.js or each api/server/experimental.js worker
  -> ensureClerkStartupReady(config, { ensureClerkIndexes, connection })
  -> ensureClerkIndexes(connection)
  -> blank scan
  -> duplicate scan
  -> index discovery/create/re-read
  -> transaction probe
  -> resolve before that worker listens, or reject into its startup catch
```

No handler, worker, listener, registration point, or test-only production caller is added.

### Blocking Closure Tests

1. **Variant-aware restart success:** seed realistic pre-Clerk and Clerk User/Session rows
   plus valid rows for all three claim variants, call public assurance, require resolution,
   and inspect each exact named index through Mongo's production `indexes()` read path. The
   test calls, seeds, and mocks nothing inside the forbidden span. A separate pre-Clerk-only
   incident case begins with no claim collection.
2. **Blank-count command failure:** configure `failCommand` for the next `aggregate`
   command, call public assurance, require the Mongo driver error, and prove the success log
   and index-creation phase were not reached. With `retryReads: false`, the fault is not
   hidden by a retry.
3. **Duplicate-aggregate command failure:** after the 10-field table is green, configure
   `failCommand` in `{ skip: 10 }` mode so the ten blank counts succeed and the first
   duplicate aggregate fails. Call public assurance and require the original driver error
   before index creation. Disable the failpoint in `finally`.

No passing Closure Test means the corresponding behavior is not complete.

## TDD Delivery Sequence

Each cycle is completed Red → Green → Refactor before the next production change.

### Cycle 1 — Valid absence no longer false-positives

**Given** realistic historical and Clerk User/Session rows plus valid claim variants with
only their own fields; **when** public assurance runs; **then** it resolves and
creates/verifies all eight indexes. Together these fixtures cover valid absence and a
present nonblank value for every field in the independent 10-row contract.

**Red**

- Add the variant-aware restart closure fixture to `clerk.spec.ts`.
- The executable assertion is the desired contract, not incident characterization:
  `await expect(ensureClerkIndexes(connection)).resolves.toBeUndefined()`, followed by
  asserting all eight `CLERK_INDEX_SPECS` names exist. Run this against the unmodified
  implementation first — it fails because assurance rejects with the incident error
  `users.clerkId has 1 null/empty/whitespace value(s)` (1, matching the fixture's single
  legacy user with no `clerkId`). That message is the *observed reason* for Red, recorded as
  a diagnostic; it is never the test's own assertion.
- Assert the claim collection does not exist before the pre-Clerk-only subcase; do not
  describe missing-collection reads as errors.

**Green**

- Wrap the existing blank `$or` in the locked `$and` and add the field-`$exists` gate.
- Retain the current error string, loop order, private helper, and index definitions.

**Refactor**

- Keep the query inline and control flow flat. At most add one short comment that Mongo null
  equality also matches missing fields; do not add a query-builder abstraction.
- Share only spec fixture builders; do not share the production field table.

**Focused command**

```bash
cd packages/data-schemas
npx jest migrations/clerk.spec.ts --runInBand -t "variant-aware restart"
```

### Cycle 2 — The independent 10-field contract is exhaustive

**Given** each independently listed field and all four concrete blank values; **when**
assurance runs; **then** the exact field rejects as `ClerkIndexAssuranceError` with the
exact count.

**Red**

- Add `EXPECTED_NO_BLANK_CHECKS` and `BLANK_VALUES` to the spec, not production exports.
- For each of the 10 rows, insert four raw documents with the target field set to the four
  blank values, then require the exact error and `has 4 ... value(s)` text.
- After Cycle 1, the two source-ID rows remain red because production does not scan them.

**Green**

- Add `sourceClerkSessionId` and `sourceClerkUserId` beside the other consumed-token fields
  in private `NO_BLANK_CHECKS`.
- Express the private table as an `as const` value so its elements are deeply readonly
  without adding an external type/export surface.

**Refactor**

- Replace the old loose one-off blank assertion if the independent matrix fully subsumes
  it. Preserve a readable exact-error helper and one assurance call per case.

**Focused command**

```bash
cd packages/data-schemas
npx jest migrations/clerk.spec.ts --runInBand -t "authoritative present-blank field"
```

### Cycle 3 — Mixed absence, count, and precedence are exact

**Given** multiple valid rows omitting `sessions.clerkTokenId`, two raw rows with that field
blank, and a later-ordered Clerk field also blank; **when** assurance runs; **then** it
rejects first for `sessions.clerkTokenId` with exactly `has 2 ... value(s)`.

**Red / characterization**

- Capture one rejection; assert the concrete class and exact full message.
- If Cycles 1-2 already make this test green, record it as characterization coverage rather
  than claiming a manufactured failing Red.

**Green**

- No production change is expected. A failure here means Cycle 1 or field order/count
  semantics are incomplete and must be corrected before continuing.

**Refactor**

- Keep one mixed fixture that proves absent rows do not increment the count and a later
  blank field does not change fail-fast precedence.

### Cycle 4 — Blank-count read errors fail closed

**Given** real Mongo is configured to fail the next aggregate command; **when** assurance
runs; **then** it rejects with that driver error and never reaches index creation or the
transaction probe.

**Red**

- Start the replica-set member with `args: ['--setParameter', 'enableTestCommands=1']`.
  Create a dedicated connection for this describe block with `{ retryReads: false }` so the
  driver cannot mask the injected failure with an automatic retry; close that connection
  (and the replica set) in `afterAll`.
- In a `try/finally`:
  - Enable:
    ```ts
    await connection.db!.admin().command({
      configureFailPoint: 'failCommand',
      mode: { times: 1 },
      data: { failCommands: ['aggregate'], errorCode: INJECTED_READ_FAILURE_CODE },
    });
    ```
  - Capture one rejection: `const error = await ensureClerkIndexes(connection).catch((e) => e);`
  - Assert the native driver rejection specifically — `expect(error).toBeInstanceOf(MongoServerError)`
    and `expect((error as MongoServerError).code).toBe(INJECTED_READ_FAILURE_CODE)` — and
    explicitly `expect(error).not.toBeInstanceOf(ClerkIndexAssuranceError)`.
  - Assert no required index exists yet: for every `CLERK_INDEX_SPECS` entry, read
    `connection.db!.collection(spec.collection).indexes()` and assert `spec.options.name` is
    absent.
  - Assert the mocked `logger.info` was never called with the final
    `'[ensureClerkIndexes] All Clerk indexes assured...'` success message.
  - Disable:
    `await connection.db!.admin().command({ configureFailPoint: 'failCommand', mode: 'off' });`
- The current `.catch(() => 0)` makes `countDocuments` resolve to `0` under this fault, so
  assurance proceeds past the blank scan; this test is Red for the intended reason (a
  swallowed read error, not an intentionally-rejecting `ClerkIndexAssuranceError`).

**Green**

- Remove `.catch(() => 0)` from `countDocuments`. Do not introduce a broad namespace error
  exception.

**Refactor**

- Let the driver error propagate unchanged; no wrapper/helper is needed.

### Cycle 5 — Duplicate-scan read errors fail closed

**Given** all 10 blank counts succeed and the first duplicate aggregate fails; **when**
assurance runs; **then** it rejects with the original driver error before index creation or
the transaction probe.

**Red**

- Reuse the Cycle 4 fault harness (dedicated `{ retryReads: false }` connection, same
  `try/finally` shape). Enable the aggregate failpoint with
  `mode: { skip: EXPECTED_BLANK_COUNT_COMMANDS, times: 1 }` — the ten blank-check
  `countDocuments` calls each issue one `aggregate` and consume the skip budget; the eleventh
  `aggregate` (the first unique-index duplicate scan) is the one that fails.
- Capture one rejection, assert `toBeInstanceOf(MongoServerError)` and
  `.code === INJECTED_READ_FAILURE_CODE` (not `ClerkIndexAssuranceError`), assert no
  required index exists yet (same per-spec `indexes()` check as Cycle 4), assert the final
  success log was not emitted, and disable the failpoint in `finally`.
- The current `.catch(() => [])` makes the duplicate scan resolve to `[]` under this fault,
  so assurance proceeds past it instead of rejecting; this test is Red for the intended
  reason.

**Green**

- Remove `.catch(() => [])` from the duplicate aggregation's `toArray()` promise.

**Refactor**

- Do not change duplicate grouping, unique-index filters, error messages, or scan order.

**Focused command for both read failures**

```bash
cd packages/data-schemas
npx jest migrations/clerk.spec.ts --runInBand -t "read failure fails closed"
```

### Cycle 6 — Integrated regression gate

Run the complete migration suite after all five cycles. Preserve existing coverage for a
fresh database, exact definitions, serial rerun idempotency, duplicate values, tenant
scope, incompatible definitions, absent database handle, standalone transaction failure,
and the prohibition on production `syncIndexes()`.

```bash
cd packages/data-schemas
npx jest migrations/clerk.spec.ts --runInBand
```

## File Impact Inventory

| File                                                 | Required change                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/data-schemas/src/migrations/clerk.ts`      | Add the `$exists` gate, add the two consumed-token source fields, keep the table private/deep-readonly, remove both fail-open read fallbacks            |
| `packages/data-schemas/src/migrations/clerk.spec.ts` | Add independent oracle, schema-faithful fixtures, exact class/count assertions, mixed case, real-Mongo failpoint closure tests, and incident regression |

Files inspected but intentionally unchanged:

- `packages/data-schemas/src/migrations/index.ts`,
  `packages/data-schemas/src/index.ts`, and `packages/data-schemas/package.json`: no new
  export or package surface.
- User, Session, and ClerkAuthClaim schemas/types: they define fixture validity and the
  governing field contract; no schema migration is required.
- `packages/api/src/auth/clerk/startup.ts`, both server entrypoints, and startup tests: the
  awaited propagation path already exists; only the plan's topology wording changes.
- No User document is mutated. The repository's auth user-document cache invalidation rule
  is therefore not triggered.

## API, Compatibility, and Risk Contract

- This is a backward-compatible behavioral relaxation of the already-published
  `ensureClerkIndexes`: optional absent Clerk fields now succeed. Its signature, export
  path, detected-data error class, and eight index definitions do not change.
- Read errors become more strictly fail-closed by surfacing the original driver rejection;
  this matches the existing startup promise chain and readiness policy.
- Assurance is per worker. Concurrent workers/pods and concurrent index creation are
  pre-existing behavior and are not newly claimed or tested here.
- Sequential reads establish startup observations, not a timeless invariant. A direct raw
  writer racing the scan remains outside this slice.
- No Mongo operation-specific timeout/cancellation is added.
- No HTTP, client, auth-session, stored-schema, user-document, cache, or deployment-variable
  change occurs.
- **Supersedes governing Fixed Contract 5's error notation for read failures.** Contract 5
  (`2026-08-12-20-05-tdd-clerk-auth-integration.md:719-729`) describes assurance rejecting
  only with `Rejected<IndexAssuranceError>`. This amendment narrows that: a **detected data
  violation** (present-and-blank field, real duplicate) still rejects with
  `ClerkIndexAssuranceError` exactly as before; an **inability to read** (this fix's Cycles
  4-5) now propagates the original native Mongo driver error instead of being silently
  mapped to a clean `0`/`[]`. The published `Promise<void>` signature is unchanged; the
  runtime-rejected-error set is broader than Contract 5's original notation described.
- **Pre-existing, out-of-scope gating mismatch (not touched by this fix).** Contract 5 also
  describes assurance as running only when Clerk is enabled *and* `MONGO_AUTO_INDEX=false`.
  The live adapter (`packages/api/src/auth/clerk/startup.ts:13-21`) in fact runs
  `ensureClerkIndexes` whenever Clerk is enabled, regardless of `MONGO_AUTO_INDEX`. This
  predates this bug fix and is noted here for accuracy only — resolving it is explicitly out
  of scope for this two-file change.

## Verification Gates

Use Node `24.16.0` (`.nvmrc`, `CLAUDE.md`, and CI agree).

From `packages/data-schemas`:

```bash
npx jest migrations/clerk.spec.ts --runInBand
npm run test:ci
npx tsc --noEmit -p tsconfig.json
```

From the repository root:

```bash
npx eslint --no-error-on-unmatched-pattern --config eslint.config.mjs \
  --no-warn-ignored --max-warnings=0 -- \
  packages/data-schemas/src/migrations/clerk.ts \
  packages/data-schemas/src/migrations/clerk.spec.ts
npx prettier --check \
  packages/data-schemas/src/migrations/clerk.ts \
  packages/data-schemas/src/migrations/clerk.spec.ts
npm run build:data-schemas
```

Do not run bare `npx jscpd`: it is not installed or pinned and would introduce an
unreviewed network dependency for a two-file change. Ordinary review of the inline query
and tests is the proportional duplication gate.

## Review Finding Traceability

| Review finding                                      | Locked resolution                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Blank equality matches missing fields               | Decision 1; Cycles 1 and 3; variant-aware blocking closure                                                |
| Blank-count failures map to zero                    | Decision 4; Cycle 4 real-command failure closure                                                          |
| Duplicate-scan failures map to empty                | Decision 4; Cycle 5 real-command failure closure                                                          |
| Eight-field table is incomplete/self-referential    | Decisions 2-3; independent 10-row oracle; Cycle 2                                                         |
| Source claim identifiers omitted                    | Authoritative grammar rows 7-8; Cycle 2 Green                                                             |
| Claim index rationale incorrectly says field-exists | Current-state and API contract distinguish field-based User/Session indexes from kind-based claim indexes |
| All missing fields treated alike                    | Decision 5; valid three-variant fixtures; malformed owning omission explicitly outside the narrow promise |
| Error class/count were not proved                   | Exact-error strategy; Cycles 2-3                                                                          |
| Mixed absent/blank case lacked precedence/count     | Cycle 3 exact `has 2` characterization                                                                    |
| Missing test import / shallow test export           | No production table import or export; private `as const`; explicit unchanged barrels                      |
| Unrealistic User/Session/claim fixtures             | Fixture contracts with ObjectId, refresh hash, future expiry, and all three valid claim variants          |
| Once-only/concurrency promise inaccurate            | Decision 6; per-invocation/worker topology and unchanged concurrency risk                                 |
| Sequential scan described too strongly              | Decision 6; explicit non-atomic snapshot assumption                                                       |
| Public API compatibility unclear                    | API section: compatible relaxation; signature/error/index exports stable                                  |
| Test counts/collection counts drifted               | Exact 10 × 4 = 40 examples across three collections                                                       |
| Lint/format/build gates missing; `jscpd` unpinned   | Exact Jest, package suite, TypeScript, ESLint, Prettier, and build commands; no `jscpd`                   |
| Handoff mislabeled as incident discovery            | References below describe it only as pre-incident deployment/credential context                           |

## Implementation Result (2026-08-15)

All six cycles implemented and green:

- [x] Cycle 1 — `clerk.ts` `preflightNoBlankValues` gated with `$and: [{field:{$exists:true}}, ...]`; both variant-aware restart tests pass (confirmed Red first: exact incident message `users.clerkId has 1 ...`).
- [x] Cycle 2 — `NO_BLANK_CHECKS` extended to the 10-field contract (`sourceClerkSessionId`/`sourceClerkUserId` added), declared `as const`, stays private/unexported. Independent 10-row oracle in the spec passes all 10 `test.each` cases.
- [x] Cycle 3 — mixed absence/count/precedence case passes with exact count 2 and first-field (`sessions.clerkTokenId`) precedence.
- [x] Cycle 4 — `.catch(() => 0)` removed from the blank-count `countDocuments`; real `failCommand` closure test passes (`MongoServerError`, exact injected code, no index created, success log not emitted).
- [x] Cycle 5 — `.catch(() => [])` removed from the duplicate-aggregate `toArray()`; real `failCommand` closure test (skip-budget-derived) passes with the same assertions.
- [x] Cycle 6 — full suite green: `packages/data-schemas/src/migrations/clerk.spec.ts` 24/24; full `data-schemas` package 57 suites / 2018 tests; `tsc --noEmit` clean; ESLint 0 warnings; Prettier clean; `build:data-schemas` succeeds.

Verified: `NO_BLANK_CHECKS` is not exported anywhere (`migrations/index.ts`, `data-schemas/index.ts`, `package.json` all unchanged). Files touched: exactly `clerk.ts` and `clerk.spec.ts`, matching the File Impact Inventory.

## Tracking and Re-Review

- `AF-5ie0` tracks this amendment and blocks implementation bug `AF-g4xa`.
- `AF-g4xa` blocks the separate post-merge Railway credential/health/sign-in work in
  `AF-0m3k`.
- Closed review issue `AF-vkn1` remains historical; it is not reopened.
- Second review `AF-14-18-33-...-REVIEW-2.md` (`decision: needs-minor-revision`, no
  Critical blocker) is resolved by this edit: all 5 required minor amendments above are
  incorporated (Cycle 1 Red assertion, exact failpoint/constant mechanics, pre-index-failure
  observables, hardened fixture/isolation constants, Fixed-Contract-5 reconciliation). Per
  explicit user direction, this was self-verified against the second review's checklist
  during implementation rather than routed through a third external review pass — noted here
  for traceability, not represented as an independent sign-off.

## References

- Review incorporated:
  `thoughts/searchable/shared/plans/2026-08-14-18-33-tdd-fix-clerk-index-preflight-blank-check-REVIEW.md`
- Governing Clerk integration plan, especially Fixed Contract 5:
  `thoughts/searchable/shared/plans/2026-08-12-20-05-tdd-clerk-auth-integration.md`
- Pre-incident merged-deployment and credential context (not incident discovery):
  `thoughts/searchable/shared/handoffs/general/2026-08-13_22-13-17_clerk-auth-merged-cosmic-ds-inprogress.md`
- Implementation and tests:
  `packages/data-schemas/src/migrations/clerk.ts`,
  `packages/data-schemas/src/migrations/clerk.spec.ts`
- Tracking: `bd show AF-5ie0`, `bd show AF-g4xa`, `bd show AF-0m3k`

---
date: 2026-05-02T13:21:06-04:00
reviewer: Codex
repository: silmari-agent-memory
plan_under_review: thoughts/searchable/shared/plans/2026-05-02-silmari-agent-memory-afm-tdd-kc-baker-pipeline-test-results.md
review_type: pre_implementation_architectural
methodology: contracts / interfaces / promises / data_models / apis
beads: silmari-agent-memory-afm
review_bead: silmari-agent-memory-4nd
status: needs_minor_revision
verdict: NEEDS_MINOR_REVISION
tags: [review, plan-review, tdd, kc-baker, cascade-ingest, step8]
---

# Plan Review Report: KC Baker Pipeline Test Results

## Review Summary

| Category | Status | Issues Found |
|----------|--------|--------------|
| Contracts | WARNING | 3 warnings |
| Interfaces | WARNING | 2 warnings |
| Promises | WARNING | 3 warnings |
| Data Models | OK | 1 warning |
| APIs | OK | 0 blocking issues |

Approval status: **Needs Minor Revision**. The plan is directionally correct and implementable. The stale shape-test findings, Step 8 aggregate drift, and cold native build diagnosis were all verified against the codebase. No critical architectural issue blocks implementation, but the plan should be amended so the writer setup fix is not limited to a file-level `beforeAll` timeout and so the Pass 1 prompt/test contract is internally consistent.

## Verification Notes

- The plan path exists and was read completely: `thoughts/searchable/shared/plans/2026-05-02-silmari-agent-memory-afm-tdd-kc-baker-pipeline-test-results.md`.
- `bd show silmari-agent-memory-afm` confirms the source issue is closed with the plan as its output.
- Baseline shape tests fail at import time as claimed:
  `cd scripts/kc-baker-pipeline-v2 && bun test tests/pass1-themes-shape.test.ts tests/pass2-ideas-shape.test.ts tests/pass3-micros-shape.test.ts`
  returned `0 pass`, `3 fail`, `3 errors`.
- Current Step 8 unit tests pass:
  `cd scripts/kc-baker-pipeline-v2 && bun test tests/step8-aggregate.test.ts`
  returned `5 pass`, `0 fail`.
- Recomputing Step 8 in a temp copy currently gives `transcripts=0`, `cards_total=0`, `gateB_edges_total=0`, `failed_transcripts.length=15`, while the checked-in aggregate says `transcripts=3`, `cards_total=80`, `gateB_edges_total=256`.

## Contract Review

### Well-Defined

- Pass 1 now has the intended segment-ID boundary: `parseThemesLlm(raw)` parses `text_span_ids`, and `reconstituteThemes(llmThemes, segments)` rebuilds verbatim text from `TranscriptSegment[]` (`scripts/kc-baker-pipeline-v2/extract/pass1-themes.ts:60`, `scripts/kc-baker-pipeline-v2/extract/pass1-themes.ts:101`).
- Pass 2 and Pass 3 correctly separate parse-time shape checks from reconstitution-time provenance checks. Parent range containment is enforced through `rebuildRange(..., subset)` (`scripts/kc-baker-pipeline-v2/extract/pass2-ideas.ts:107`, `scripts/kc-baker-pipeline-v2/extract/pass3-micros.ts:141`, `scripts/kc-baker-pipeline-v2/extract/segments.ts:107`).
- Step 8 already implements the failure-overrides-success contract by reading non-empty `failure-report.json`, building a failed basename set, and filtering matching success reports (`scripts/kc-baker-pipeline-v2/extract/step8-aggregate.ts:100`, `scripts/kc-baker-pipeline-v2/extract/step8-aggregate.ts:120`).

### Missing or Unclear

- WARNING: The Pass 1 prompt says `2-8` themes, while the parser and plan assert `[1,8]` (`scripts/kc-baker-pipeline-v2/extract/prompts/pass1-themes-v3.md:12`, `scripts/kc-baker-pipeline-v2/extract/pass1-themes.ts:89`). The plan should either add a prompt update to `1-8` or change the planned count test to match the prompt. Existing historical notes suggest one-theme short transcripts are allowed, so updating the prompt is likely the right amendment.
- WARNING: The writer setup behavior is underspecified. The plan's minimal Green step is `beforeAll(..., 120000)`, but the current file-level `beforeAll` runs native setup for pure mocked tests too (`scripts/kc-baker-pipeline-v2/tests/cascade-import-writer.test.ts:29`, `scripts/kc-baker-pipeline-v2/tests/cascade-import-writer.test.ts:211`). The plan's Refactor section says to move setup into a helper used only by real native tests; promote that from Refactor to Green or Success Criteria.
- WARNING: The cargo build failure contract says stderr should be visible, but the minimal Green step only adds timeout. Current setup uses `execFileSync(..., { stdio: "pipe" })` without catch/diagnostic forwarding (`scripts/kc-baker-pipeline-v2/tests/cascade-import-writer.test.ts:33`). The plan should require wrapping the build error with stderr/stdout in the thrown assertion message.

### Recommendations

- Amend Behavior 1 to include a tiny prompt contract fix: `pass1-themes-v3.md` should say `1-8` if the parser remains `[1,8]`.
- Amend Behavior 5 so `ensureSilmariStoreTestBinary()` is the Green path and is called only by the native integration `describe` or first native test.
- Add an explicit assertion or helper test proving pure `buildImportRows` and fake-deps `writeCascadeImport` tests can run without invoking `cargo build`.

## Interface Review

### Well-Defined

- The exported interfaces the tests should use are concrete and current:
  - Pass 1: `parseThemesLlm`, `reconstituteThemes`
  - Pass 2: `parseIdeasLlm`, `reconstituteIdeas`
  - Pass 3: `parseMicrosLlm`, `reconstituteMicros`, `auditMicroBodyLength`, `wordCount`, `MICRO_BODY_WORD_CEILING`
- The plan correctly avoids reintroducing compatibility aliases for `parseThemesJson`, `parseIdeasJson`, `parseMicrosJson`, or the old audit helpers.
- The Step 8 test interface is already established by existing tests: set `EXTRACTED_DIR`, run `extract/step8-aggregate.ts`, read `step8-aggregate.json` from the temp tree (`scripts/kc-baker-pipeline-v2/tests/step8-aggregate.test.ts:73`).

### Missing or Unclear

- WARNING: The Step 8 drift test should name a filesystem-copy interface that is safe inside `bun:test`. Prefer `cpSync(repoExtractedDir, tempExtractedDir, { recursive: true })` or an equivalent Bun/Node API over shell `cp -rf`, because project shell guidance warns that file commands may be aliased interactively.
- WARNING: The writer timeout defaults are inconsistent in the local sources: writer code defaults to `CASCADE_IMPORT_STORE_TIMEOUT_MS ?? "120000"` (`scripts/kc-baker-pipeline-v2/ingest/cascade-import-writer.ts:132`), while the pipeline README documents `180000` (`scripts/kc-baker-pipeline-v2/README.md:185`). The plan does not need to resolve product timeout policy, but Behavior 5 should not accidentally hard-code a third value without explaining test setup versus runtime operation.

### Recommendations

- Add a small helper signature to the plan:

```ts
async function ensureSilmariStoreTestBinary(): Promise<string>
```

It should return the binary path used by native integration tests, skip cargo when an env-provided or target/debug binary exists, and throw a diagnostic error containing cargo stderr/stdout on build failure.

## Promise Review

### Well-Defined

- The plan preserves the important behavioral promise that the LLM returns IDs only, while code computes verbatim `text_span`, `source_span`, and `source_sentence`.
- The Step 8 plan promises not to mutate the repository `extracted` tree during the test. Existing aggregate tests already follow this temp-directory pattern.
- The plan explicitly avoids making a failed/stale pipeline result appear green by deleting failure reports. That is the right operator-facing promise.

### Missing or Unclear

- WARNING: The Step 8 drift comparison says normalize `generated_at`, but future failures may be misread if additional volatile fields are added. Current failure report timestamps are stable because the test copies checked-in reports, but the plan should define a local `normalizeAggregateForDriftTest()` helper with an allowlist of volatile fields.
- WARNING: The native setup timeout promise should include both Bun hook timeout and child-process timeout. Current cargo build has no child-process timeout, so a failed or hung cargo invocation can still stall even if Bun's hook limit is raised.
- WARNING: Cold-run verification temporarily moves the binary out of `target/debug`. The plan already shows restore commands, but it should require a `trap` or `finally` style restore in any script form so a failed manual check does not leave the workspace cold by accident.

### Recommendations

- Define `normalizeAggregateForDriftTest(aggregate)` in the Step 8 test section and initially normalize only `generated_at`.
- Add a cargo build timeout in `ensureSilmariStoreTestBinary`, for example via `execFileSync`'s `timeout` option, and preserve stdout/stderr on failure.
- Change the manual cold-run snippet into a single shell block with `trap` restoring the moved binary.

## Data Model Review

### Well-Defined

- The current output data models include both deterministic ID ranges and computed verbatim text:
  - `PassOneTheme`: `text_span_ids` plus `text_span` (`scripts/kc-baker-pipeline-v2/types/themes.ts:19`, `scripts/kc-baker-pipeline-v2/types/themes.ts:25`)
  - `PassTwoIdea`: `source_span_ids` plus `source_span` (`scripts/kc-baker-pipeline-v2/types/ideas.ts:20`, `scripts/kc-baker-pipeline-v2/types/ideas.ts:22`)
  - `PassThreeMicro`: `source_sentence_ids` plus `source_sentence` (`scripts/kc-baker-pipeline-v2/types/micros.ts:22`, `scripts/kc-baker-pipeline-v2/types/micros.ts:28`)
- Step 8 aggregate shape is explicit in `Aggregate`, including `per_transcript_reports` and `failed_transcripts` (`scripts/kc-baker-pipeline-v2/extract/step8-aggregate.ts:61`).

### Missing or Unclear

- WARNING: Older plan/research diagrams still describe the LLM outputs as direct text spans. The reviewed plan fixes the tests, but it should mention that only the shape tests are updated in this slice, not older architecture diagrams. This avoids an implementer trying to "clean up" broad documentation during a narrow test-result fix.

### Recommendations

- Add one sentence to "What We're Not Doing": not updating older cascade-extractor PRDs or diagrams that still show the pre-ID contract.

## API Review

### Well-Defined

- No public MCP, HTTP, or CLI API surface is intentionally changed by this plan.
- The only script behavior touched is test setup and the checked-in generated aggregate artifact.
- The artifact policy is clear enough: either keep committing `step8-aggregate.json` and test drift, or stop committing it and encode that policy. The plan chooses the keep-and-test path unless product intent changes.

### Missing or Unclear

- No blocking API gaps found.

### Recommendations

- Keep this implementation scoped to tests plus `extracted/step8-aggregate.json`, unless a failing test proves production behavior has diverged.

## Critical Issues

None.

## Suggested Plan Amendments

```diff
# In Behavior 1: Pass 1 Shape Test Uses Segment IDs

+ Add Green/Refactor item:
+ Update extract/prompts/pass1-themes-v3.md from "2-8" themes to "1-8"
+ if the parser remains the source of truth for accepting one-theme short transcripts.

# In Behavior 4: Checked-In Step 8 Aggregate Matches Current Artifacts

+ Add helper:
+ normalizeAggregateForDriftTest(aggregate) returns a clone with generated_at
+ replaced by "<normalized>". No other fields are normalized unless a future
+ stable source fingerprint replaces timestamp comparison.
+
+ Use Node/Bun filesystem APIs to copy extracted fixtures in-test, not shell
+ cp, so the test cannot hang on aliased interactive file operations.

# In Behavior 5: Native Writer Test Survives Cold Rust Binary Setup

- beforeAll(async () => {
-   // existing setup
- }, 120000);
+ async function ensureSilmariStoreTestBinary(): Promise<string> {
+   // env override check, target/debug check, cargo build with child timeout,
+   // and stderr/stdout forwarding on failure
+ }
+
+ Call ensureSilmariStoreTestBinary() only from the real native integration
+ tests. Pure buildImportRows and fake-deps writeCascadeImport tests must not
+ run cargo build.

# In Behavior 5: Manual cold-run verification

+ Wrap the temporary binary move in a trap/finally restore block.
```

## Review Checklist

### Contracts

- [x] Component boundaries are clearly defined
- [x] Input/output contracts are specified
- [x] Error contracts are mostly specified
- [x] Preconditions and postconditions are documented
- [x] Invariants are identified

### Interfaces

- [x] All public methods are defined with signatures
- [x] Naming follows codebase conventions
- [x] Interface matches existing patterns
- [x] Extension points are considered
- [x] Visibility modifiers are appropriate

### Promises

- [x] Behavioral guarantees are documented
- [ ] Async/setup timeout handling needs minor amendment
- [x] Resource cleanup is specified for temp directories
- [x] Idempotency requirements are addressed where relevant
- [x] Ordering guarantees are documented where needed

### Data Models

- [x] All fields have types
- [x] Required vs optional is clear
- [x] Relationships are documented
- [x] Migration strategy is out of scope
- [x] Serialization format is specified

### APIs

- [x] Endpoints/commands are unchanged or out of scope
- [x] Request/response formats are unchanged or out of scope
- [x] Error responses are documented for touched test setup
- [x] Authentication requirements are out of scope
- [x] Versioning strategy is out of scope

## Final Verdict

**Needs Minor Revision.** Resolve the amendments above, especially the writer setup Green path, then proceed with implementation. No new blocking beads issue was created because the findings are amendments to the existing AFM implementation plan rather than separate product work.

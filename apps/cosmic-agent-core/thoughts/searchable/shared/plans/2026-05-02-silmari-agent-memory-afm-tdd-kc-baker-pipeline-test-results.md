---
date: 2026-05-02T00:00:00-04:00
researcher: Codex
repository: silmari-agent-memory
topic: "TDD plan: KC Baker pipeline test-result fixes"
tags: [plan, tdd, kc-baker, cascade-ingest, bun-test, step8]
status: implemented-complete
beads: silmari-agent-memory-afm
review_addressed: thoughts/searchable/shared/plans/2026-05-02-silmari-agent-memory-afm-tdd-kc-baker-pipeline-test-results-REVIEW.md
implementation_bead: silmari-agent-memory-i5s
last_updated: 2026-05-02
last_updated_by: Codex
---

# KC Baker Pipeline Test Results TDD Implementation Plan

## Overview

Fix the three concrete findings from the `scripts/kc-baker-pipeline-v2`
test-result review:

1. The shape tests import old parser/audit helpers and still assert the
   obsolete LLM-authored verbatim-span contract.
2. The checked-in `extracted/step8-aggregate.json` is stale and can report a
   successful historical aggregate even though current failure reports make
   the recomputed aggregate `0/15` succeeded.
3. `cascade-import-writer.test.ts` can fail on a cold checkout because it
   tries to build `silmari-store` inside Bun's default 5 second hook window
   and currently hides useful cargo stdout/stderr when the build fails.

The fix should be test-first and should avoid changing the production
pipeline semantics unless a failing test proves the current behavior is
wrong or unobservable.

## Current State Analysis

### Key Discoveries

- `pass1-themes-shape.test.ts` imports `parseThemesJson` and
  `auditVerbatimSpans`, neither of which exists in the implementation. It
  also feeds `text_span` as an LLM field, which is no longer the contract:
  `scripts/kc-baker-pipeline-v2/tests/pass1-themes-shape.test.ts:2` and
  `scripts/kc-baker-pipeline-v2/tests/pass1-themes-shape.test.ts:12`.
- Pass 1 now parses `text_span_ids` and reconstitutes `text_span` with
  `rebuildRange()`: `scripts/kc-baker-pipeline-v2/extract/pass1-themes.ts:60`
  and `scripts/kc-baker-pipeline-v2/extract/pass1-themes.ts:101`.
- The current Pass 1 parser accepts one to eight themes, but the prompt still
  says `2-8` themes. This plan keeps the parser as the source of truth for
  short transcripts and updates the prompt to `1-8`:
  `scripts/kc-baker-pipeline-v2/extract/prompts/pass1-themes-v3.md:12` and
  `scripts/kc-baker-pipeline-v2/extract/pass1-themes.ts:89`.
- `pass2-ideas-shape.test.ts` imports `parseIdeasJson` and
  `auditIdeaSpans`, while Pass 2 exports `parseIdeasLlm` and
  `reconstituteIdeas`: `scripts/kc-baker-pipeline-v2/tests/pass2-ideas-shape.test.ts:2`,
  `scripts/kc-baker-pipeline-v2/extract/pass2-ideas.ts:62`, and
  `scripts/kc-baker-pipeline-v2/extract/pass2-ideas.ts:107`.
- `pass3-micros-shape.test.ts` imports `parseMicrosJson` and
  `auditMicroSpans`, while Pass 3 exports `parseMicrosLlm`,
  `reconstituteMicros`, and `auditMicroBodyLength`:
  `scripts/kc-baker-pipeline-v2/tests/pass3-micros-shape.test.ts:3`,
  `scripts/kc-baker-pipeline-v2/extract/pass3-micros.ts:103`, and
  `scripts/kc-baker-pipeline-v2/extract/pass3-micros.ts:141`.
- `segments.ts` is the provenance boundary. It validates inclusive segment ID
  ranges and throws when a child range escapes a parent range:
  `scripts/kc-baker-pipeline-v2/extract/segments.ts:93`.
- `step8-aggregate.ts` already treats non-empty `failure-report.json` as
  overriding stale `ingest-report.json`: `scripts/kc-baker-pipeline-v2/extract/step8-aggregate.ts:100`
  and `scripts/kc-baker-pipeline-v2/extract/step8-aggregate.ts:120`.
- Existing aggregate tests cover empty failure reports, structured failure
  reports, and failure-overrides-success behavior, but they do not protect the
  repository's checked-in aggregate artifact from drift:
  `scripts/kc-baker-pipeline-v2/tests/step8-aggregate.test.ts:49`.
- The preferred validation command explicitly copies `extracted` to a temp
  directory and deletes old ingest/failure reports before a fresh validation:
  `scripts/kc-baker-pipeline-v2/README.md:91` and
  `scripts/kc-baker-pipeline-v2/ingest/README.md:18`.
- `cascade-import-writer.test.ts` builds the Rust binary inside `beforeAll`
  when no env override or local binary exists:
  `scripts/kc-baker-pipeline-v2/tests/cascade-import-writer.test.ts:29`.
  That file-level setup runs even for pure `buildImportRows` tests and mocked
  `writeCascadeImport` tests, so the fix must scope Rust setup to the real
  native integration tests. After prebuilding the binary, the same file passes
  `14/14`.

### Baseline Reproduction

From `scripts/kc-baker-pipeline-v2`:

```bash
bun test tests/pass1-themes-shape.test.ts \
  tests/pass2-ideas-shape.test.ts \
  tests/pass3-micros-shape.test.ts \
  tests/cascade-import-writer.test.ts
```

Current result:

```text
14 pass
3 fail
3 errors
```

The three failures are module-load errors for missing exports. The writer
tests pass when the Rust binary already exists.

## Desired End State

- The shape tests verify the current segment-ID LLM contract:
  parse `_ids`, reject missing/out-of-range/mismatched IDs, and prove
  reconstitution produces verbatim fields from `TranscriptSegment[]`.
- The Pass 1 prompt and parser agree that short transcripts may produce one
  theme, so the test contract and operator prompt do not conflict.
- The Step 8 aggregate artifact cannot silently drift from the checked-in
  per-transcript `ingest-report.json` and `failure-report.json` files.
- A cold local test run either builds `silmari-store` with an adequate setup
  timeout or clearly separates slow native setup from pure unit coverage, and
  failed cargo builds surface stdout/stderr.
- `cd scripts/kc-baker-pipeline-v2 && bun test` is green after the fix.

## What We're Not Doing

- Not restoring `parseThemesJson`, `parseIdeasJson`, `parseMicrosJson`, or
  the old audit helpers as compatibility aliases.
- Not asking the LLM for verbatim `text_span`, `source_span`, or
  `source_sentence` again.
- Not updating older cascade-extractor PRDs, architecture diagrams, or
  research diagrams that still show the pre-ID LLM text-span contract; this
  slice updates the active tests and the Pass 1 prompt only.
- Not making a stale or failed pipeline result appear green by deleting
  failure reports without rerunning the documented native-primary validation.
- Not changing Gate B classifier quality, OpenAI routing, or transcript card
  density in this slice.
- Not changing public MCP, HTTP, CLI, or runtime cascade-import APIs unless a
  failing test proves production behavior has diverged.

## Observable Behaviors

1. Given Pass 1 LLM JSON with `text_span_ids`, when `parseThemesLlm` and
   `reconstituteThemes` run, then the output has deterministic verbatim
   `text_span` values computed from segments.
   The Pass 1 prompt must ask for `1-8` themes to match the parser's accepted
   range.
2. Given Pass 2 LLM JSON with `source_span_ids`, when `parseIdeasLlm` and
   `reconstituteIdeas` run, then child ranges are constrained to the parent
   theme and verbatim `source_span` is computed from segments.
3. Given Pass 3 LLM JSON with `source_sentence_ids`, when `parseMicrosLlm`
   and `reconstituteMicros` run, then child ranges are constrained to the
   parent idea and micro body length auditing still works.
4. Given current repository extracted artifacts, when the Step 8 aggregate is
   recomputed in a temp copy, then the checked-in aggregate matches the
   recomputed result except for intentionally volatile fields.
5. Given `silmari-store` is absent, when the native writer test setup runs,
   then it does not fail solely because a legitimate Rust build exceeds Bun's
   default hook timeout, and pure writer tests do not invoke Rust setup.

## Testing Strategy

- Framework: `bun:test`.
- Unit tests: pass parser/reconstitution tests and aggregate drift tests.
- Integration tests: `cascade-import-writer.test.ts` real native temp-store
  test remains the writer integration coverage.
- Manual/smoke tests: recompute Step 8 in a temp copy and run the full
  pipeline-v2 test suite.
- Mocking/setup: use small in-memory `TranscriptSegment[]` fixtures for
  extraction tests; use temp directories for aggregate drift tests; avoid
  mutating the source `extracted` tree during tests.

## Behavior 1: Pass 1 Shape Test Uses Segment IDs

### Test Specification

Given a valid Pass 1 LLM response with contiguous `theme_idx` values and
`text_span_ids`, when the parser runs, then it returns parsed themes without
LLM-authored `text_span` fields.

Given parsed themes and a segment fixture, when reconstitution runs, then it
computes `text_span` by joining the selected segment range.

Edge cases:

- Markdown JSON fences are tolerated.
- Missing `themes[]` still throws.
- Missing `text_span_ids` throws.
- Non-contiguous `theme_idx` throws.
- Theme count outside `[1,8]` throws.
- Invalid segment IDs throw through `rebuildRange`.

### TDD Cycle

#### Red: Rewrite The Test First

File: `scripts/kc-baker-pipeline-v2/tests/pass1-themes-shape.test.ts`

Replace the stale import with:

```ts
import { parseThemesLlm, reconstituteThemes } from "../extract/pass1-themes";
```

Change fixtures from:

```ts
{ theme_idx: 0, theme_title: "T", theme_summary: "S", text_span: "X" }
```

to:

```ts
{ theme_idx: 0, theme_title: "T", theme_summary: "S", text_span_ids: [1, 2] }
```

Add a reconstitution assertion:

```ts
const segments = [
  { idx: 0, text: "alpha. " },
  { idx: 1, text: "bravo. " },
  { idx: 2, text: "charlie." },
];
expect(reconstituteThemes(parsed, segments)[0].text_span).toBe("bravo. charlie.");
```

Run:

```bash
cd scripts/kc-baker-pipeline-v2
bun test tests/pass1-themes-shape.test.ts
```

The test should fail for the right reason before implementation only if the
implementation does not already satisfy the current contract.

#### Green: Minimal Implementation

Expected minimal code change is in the test file only. If TypeScript blocks
because the internal `LlmTheme` interface is private, prefer inferred return
types in the test instead of exporting a new production type.

Also update the active Pass 1 prompt so it matches the parser and test
contract:

```diff
- Extract 2-8 major themes from the transcript.
+ Extract 1-8 major themes from the transcript.
```

File:
`scripts/kc-baker-pipeline-v2/extract/prompts/pass1-themes-v3.md`

Do not change the parser count bounds unless this test exposes a real parser
bug. One-theme outputs are allowed for short transcripts.

#### Refactor

Remove all references to `auditVerbatimSpans` and old LLM-authored
`text_span` inputs from this test file.

### Success Criteria

Automated:

- `bun test tests/pass1-themes-shape.test.ts` passes.
- `rg "parseThemesJson|auditVerbatimSpans|text_span:" tests/pass1-themes-shape.test.ts`
  shows no stale parser/audit usage. It may still show output assertions for
  computed `text_span`.
- `rg "2-8 major themes|1-8 major themes" extract/prompts/pass1-themes-v3.md`
  shows the prompt uses `1-8` and no longer advertises `2-8`.

Manual:

- The test name and fixture data make it clear that integer segment IDs are
  the LLM contract and verbatim text is computed by code.
- The Pass 1 prompt, parser, and shape test all agree on the `[1,8]` theme
  count contract.

## Behavior 2: Pass 2 Shape Test Uses Parent-Bounded Segment IDs

### Test Specification

Given valid Pass 2 LLM JSON with `source_span_ids`, when `parseIdeasLlm`
runs with the expected theme index, then ideas parse and keep contiguous
`idea_idx` values.

Given parsed ideas, transcript segments, and the parent theme range, when
`reconstituteIdeas` runs, then each `source_span` is computed from segments
and any range outside the parent theme throws.

Edge cases:

- Markdown JSON fences are tolerated.
- Wrong `theme_idx` throws.
- Missing `ideas[]` throws.
- Missing `source_span_ids` throws.
- Non-contiguous `idea_idx` throws.
- Idea count outside `[1,8]` throws.
- Child segment range escaping the theme range throws.

### TDD Cycle

#### Red: Rewrite The Test First

File: `scripts/kc-baker-pipeline-v2/tests/pass2-ideas-shape.test.ts`

Replace:

```ts
import { parseIdeasJson, auditIdeaSpans } from "../extract/pass2-ideas";
```

with:

```ts
import { parseIdeasLlm, reconstituteIdeas } from "../extract/pass2-ideas";
```

Use `source_span_ids` fixtures and add a parent-range failure assertion:

```ts
expect(() => reconstituteIdeas(parsed, segments, [2, 4])).toThrow(/escapes parent subset/);
```

Run:

```bash
cd scripts/kc-baker-pipeline-v2
bun test tests/pass2-ideas-shape.test.ts
```

#### Green: Minimal Implementation

Expected minimal code change is in the test file only. If an implementation
gap appears, keep the implementation localized to `parseIdeasLlm` or
`reconstituteIdeas`.

#### Refactor

Delete stale `auditIdeaSpans` tests. The equivalent observable behavior is
that invalid provenance is impossible to accept silently because
`rebuildRange(..., themeRange)` throws for out-of-parent IDs.

### Success Criteria

Automated:

- `bun test tests/pass2-ideas-shape.test.ts` passes.
- `rg "parseIdeasJson|auditIdeaSpans|source_span:" tests/pass2-ideas-shape.test.ts`
  shows no stale parser/audit input contract. Computed output assertions are
  still allowed.

Manual:

- The test distinguishes parsing IDs from reconstituting verbatim text.

## Behavior 3: Pass 3 Shape Test Uses Source Sentence IDs

### Test Specification

Given valid Pass 3 LLM JSON with `source_sentence_ids`, when
`parseMicrosLlm` runs with the expected global `idea_idx`, then micros parse.

Given parsed micros, transcript segments, and the parent idea range, when
`reconstituteMicros` runs, then each `source_sentence` is computed from
segments and any range outside the idea range throws.

Given micros with body text, when `auditMicroBodyLength` runs, then body
length validation remains unchanged.

Edge cases:

- Markdown JSON fences are tolerated.
- Wrong global `idea_idx` throws.
- Missing `micros[]` throws.
- Missing `source_sentence_ids` throws.
- Micro count outside `[1,5]` throws.
- Child segment range escaping the idea range throws.
- `wordCount` continues to handle whitespace and empty strings.

### TDD Cycle

#### Red: Rewrite The Test First

File: `scripts/kc-baker-pipeline-v2/tests/pass3-micros-shape.test.ts`

Replace:

```ts
parseMicrosJson,
auditMicroSpans,
```

with:

```ts
parseMicrosLlm,
reconstituteMicros,
```

Keep:

```ts
auditMicroBodyLength,
wordCount,
MICRO_BODY_WORD_CEILING,
```

Use `source_sentence_ids` fixtures and add:

```ts
expect(reconstituteMicros(parsed, segments, [1, 2])[0].source_sentence)
  .toBe("the exact source sentence. ");
expect(() => reconstituteMicros(parsed, segments, [3, 4]))
  .toThrow(/escapes parent subset/);
```

Run:

```bash
cd scripts/kc-baker-pipeline-v2
bun test tests/pass3-micros-shape.test.ts
```

#### Green: Minimal Implementation

Expected minimal code change is in the test file only. Preserve
`auditMicroBodyLength` coverage.

#### Refactor

Remove stale `auditMicroSpans` tests. Keep the body-length tests unchanged
unless fixture shape updates require adding `source_sentence_ids`.

### Success Criteria

Automated:

- `bun test tests/pass3-micros-shape.test.ts` passes.
- `rg "parseMicrosJson|auditMicroSpans|source_sentence:" tests/pass3-micros-shape.test.ts`
  shows no stale parser/audit input contract. Computed output assertions are
  still allowed.

Manual:

- The test explicitly calls out that `idea_idx` is the global flattened Pass 2
  index, matching `pass3-micros.ts`.

## Behavior 4: Checked-In Step 8 Aggregate Matches Current Artifacts

### Test Specification

Given the repository's current `scripts/kc-baker-pipeline-v2/extracted`
directory, when Step 8 is recomputed in a temp copy, then the checked-in
`extracted/step8-aggregate.json` matches the recomputed aggregate after
normalizing volatile fields such as `generated_at`.

Given non-empty failure reports for every transcript, when the aggregate is
recomputed, then `transcripts` is `0`, `failed_transcripts.length` is `15`,
`cards_total` is `0`, `gateB_edges_total` is `0`, and the acceptance flag for
Gate B edges is false.

Edge cases:

- The test must not write into the repository's `extracted` directory.
- `generated_at` must be ignored or replaced before comparing through a local
  helper that allowlists volatile fields.
- If the implementation adds a stable source fingerprint field later, compare
  that instead of comparing timestamps.
- The test must copy fixtures with Node/Bun filesystem APIs, not shell `cp`,
  so it cannot hang on an interactive shell alias.

### TDD Cycle

#### Red: Add Artifact Drift Test

File: `scripts/kc-baker-pipeline-v2/tests/step8-aggregate.test.ts`

Add a test that:

1. Copies `../extracted` to a temp directory using `cpSync` or equivalent
   Node/Bun filesystem API.
2. Runs `bun run extract/step8-aggregate.ts` with `EXTRACTED_DIR=<temp>`.
3. Reads temp `step8-aggregate.json`.
4. Reads repository `extracted/step8-aggregate.json`.
5. Normalizes both objects through `normalizeAggregateForDriftTest`.
6. Expects equality.

Use an explicit helper so future volatility is reviewed field-by-field:

```ts
function normalizeAggregateForDriftTest(aggregate: unknown): unknown {
  return {
    ...(aggregate as Record<string, unknown>),
    generated_at: "<normalized>",
  };
}
```

Initial policy: normalize only `generated_at`. Do not mask
`failed_transcripts`, transcript counts, card counts, Gate B totals, or
acceptance fields.

Use a filesystem copy shape like:

```ts
cpSync(repoExtractedDir, tempExtractedDir, { recursive: true });
```

This should fail initially because the checked-in aggregate is from April 23
and reports three successes, while current failure reports recompute to
`0/15` succeeded.

Also add a focused assertion:

```ts
expect(recomputed.transcripts).toBe(0);
expect(recomputed.failed_transcripts).toHaveLength(15);
expect(recomputed.cards_total).toBe(0);
expect(recomputed.gateB_edges_total).toBe(0);
expect(recomputed.acceptance.gateB_ge_5_typed_edges_above_0_7).toBe(false);
```

Run:

```bash
cd scripts/kc-baker-pipeline-v2
bun test tests/step8-aggregate.test.ts
```

#### Green: Regenerate Or Replace The Artifact

Regenerate the checked-in artifact from current per-transcript reports:

```bash
cd scripts/kc-baker-pipeline-v2
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -rf extracted "$tmp/extracted"
EXTRACTED_DIR="$tmp/extracted" bun run extract/step8-aggregate.ts
cp -f "$tmp/extracted/step8-aggregate.json" extracted/step8-aggregate.json
```

Do not delete failure reports to make the aggregate green. If product intent
is instead to stop committing generated aggregates, replace the checked-in file
with a README note and make the test assert absence plus `.gitignore` coverage.
Pick one policy and encode it in tests.

#### Refactor

If the drift test feels too broad for normal unit runs, factor the copy/run/read
logic into a helper inside `step8-aggregate.test.ts` and keep it deterministic.
Do not introduce a dependency on live LLM, Docker, or native store binaries.
Keep the normalizer narrow; adding another volatile field requires a comment
explaining why that field is expected to vary across deterministic recomputes.

### Success Criteria

Automated:

- `bun test tests/step8-aggregate.test.ts` passes.
- Recomputing Step 8 in a temp copy reports the same normalized object as the
  checked-in artifact.
- `git diff -- scripts/kc-baker-pipeline-v2/extracted/step8-aggregate.json`
  shows the artifact now reflects current failure reports, not April 23
  success reports.

Manual:

- The aggregate's failed transcript list is readable enough for an operator to
  see the all-fail state without rerunning `jq`.

## Behavior 5: Native Writer Test Survives Cold Rust Binary Setup

### Test Specification

Given neither `SILMARI_STORE_BINARY` nor `SILMARI_MEMORY_RUST_BINARY` is set
and `apps/silmari_memory_rust/target/debug/silmari-store` is missing, when the
native writer tests start, then setup either builds the binary with enough
time or skips only the real native integration tests with a clear diagnostic.

Preferred behavior: build with an explicit setup timeout, because the full
pipeline-v2 suite currently expects `cascade-import-writer.test.ts` to pass in
default `bun test`.

Edge cases:

- If `cargo build` exits non-zero, the test should fail with stderr visible.
- If an env-provided binary exists, do not build.
- If the default target binary exists, do not build.
- Pure `buildImportRows` and fake-deps `writeCascadeImport` tests must run
  without invoking `cargo build`.
- Native setup must have both a Bun test timeout and an `execFileSync`
  child-process timeout.
- Do not change the runtime `CASCADE_IMPORT_STORE_TIMEOUT_MS` default in this
  slice. A named cargo setup timeout is test-only; if it uses `180000`, that
  aligns with the pipeline README's longer native operation allowance rather
  than creating a new product timeout policy.
- The test must restore any temporarily moved binary during manual cold-run
  verification.

### TDD Cycle

#### Red: Reproduce Cold Setup Failure

Manual red check:

```bash
cd /home/maceo/Dev/silmari-agent-memory
bin=apps/silmari_memory_rust/target/debug/silmari-store
tmp="$(mktemp -d)"
restore_binary() {
  cd /home/maceo/Dev/silmari-agent-memory
  if [ -f "$tmp/silmari-store" ]; then mv -f "$tmp/silmari-store" "$bin"; fi
  rm -rf "$tmp"
}
trap restore_binary EXIT
if [ -f "$bin" ]; then mv -f "$bin" "$tmp/silmari-store"; fi
cd scripts/kc-baker-pipeline-v2
bun test tests/cascade-import-writer.test.ts
```

Expected baseline before fix: the file-level `beforeAll` hook can time out
while running `cargo build`, and pure tests still pay the native setup cost
because setup runs before the file's tests are filtered.

Also run a focused no-native smoke check for pure coverage. Hide the default
binary and place a failing cargo shim first in `PATH`; focused pure tests must
not invoke it after the fix:

```bash
cd /home/maceo/Dev/silmari-agent-memory
bin=apps/silmari_memory_rust/target/debug/silmari-store
tmp="$(mktemp -d)"
restore_binary() {
  cd /home/maceo/Dev/silmari-agent-memory
  if [ -f "$tmp/silmari-store" ]; then mv -f "$tmp/silmari-store" "$bin"; fi
  rm -rf "$tmp"
}
trap restore_binary EXIT
if [ -f "$bin" ]; then mv -f "$bin" "$tmp/silmari-store"; fi
printf '#!/bin/sh\necho "cargo must not run for pure writer tests" >&2\nexit 42\n' > "$tmp/cargo"
chmod +x "$tmp/cargo"
cd scripts/kc-baker-pipeline-v2
PATH="$tmp:$PATH" bun test tests/cascade-import-writer.test.ts -t "buildImportRows"
PATH="$tmp:$PATH" bun test tests/cascade-import-writer.test.ts -t "fake"
```

If exact test names differ, adjust only the `-t` filters so one pure
`buildImportRows` test and one fake-deps `writeCascadeImport` test are covered.

#### Green: Scope Native Setup And Add Diagnostics

File: `scripts/kc-baker-pipeline-v2/tests/cascade-import-writer.test.ts`

Minimal implementation is a local helper used only by the native integration
coverage:

Add direct imports for `existsSync` and `execFileSync` rather than dynamic
file-level setup imports, because the helper is the only place that should
touch native setup:

```ts
const CARGO_BUILD_TEST_SETUP_TIMEOUT_MS = 180000;

async function ensureSilmariStoreTestBinary(): Promise<string> {
  const envBinary =
    process.env.SILMARI_STORE_BINARY ?? process.env.SILMARI_MEMORY_RUST_BINARY;
  if (envBinary && existsSync(envBinary)) return envBinary;

  if (existsSync(SILMARI_STORE_TEST_BINARY)) {
    return SILMARI_STORE_TEST_BINARY;
  }

  try {
    execFileSync(
      "cargo",
      [
        "build",
        "--quiet",
        "--manifest-path",
        join(REPO_ROOT, "apps/silmari_memory_rust/Cargo.toml"),
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
        timeout: CARGO_BUILD_TEST_SETUP_TIMEOUT_MS,
      },
    );
  } catch (error) {
    const err = error as {
      message?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      signal?: string;
      status?: number;
    };
    throw new Error(
      [
        "Failed to build silmari-store for native cascade import tests.",
        `status=${err.status ?? "unknown"} signal=${err.signal ?? "unknown"}`,
        `message=${err.message ?? ""}`,
        `stdout=${String(err.stdout ?? "")}`,
        `stderr=${String(err.stderr ?? "")}`,
      ].join("\n"),
    );
  }

  return SILMARI_STORE_TEST_BINARY;
}
```

Call `ensureSilmariStoreTestBinary()` only inside the "real cascade import
dependencies" `describe` block or at the start of the first real native test.
Do not call it from file-level `beforeAll`.

If Bun supports hook timeout arguments, the nested native `beforeAll` can use:

```ts
beforeAll(async () => {
  nativeBinaryPath = await ensureSilmariStoreTestBinary();
}, CARGO_BUILD_TEST_SETUP_TIMEOUT_MS + 5000);
```

If Bun in this environment does not honor a timeout argument on `beforeAll`,
call the helper inside the real native `it(...)` and set that test's timeout
explicitly.

#### Refactor

Keep the helper local to `cascade-import-writer.test.ts` unless another test
file needs the same native setup. If it is extracted later, put it under
`tests/helpers` and keep its contract as:

```ts
async function ensureSilmariStoreTestBinary(): Promise<string>
```

Use it only for the "real cascade import dependencies" tests. Pure unit tests
for `buildImportRows` and fake-deps `writeCascadeImport` should not wait on
Rust setup. Avoid changing writer runtime timeout defaults while refactoring
test setup.

### Success Criteria

Automated:

- With an existing binary:

```bash
cd scripts/kc-baker-pipeline-v2
bun test tests/cascade-import-writer.test.ts
```

passes.

- Cold setup check after temporarily moving the binary either passes by
  building the binary or skips only the real native tests with an explicit
  message, depending on the chosen policy.

- Focused pure writer checks pass with the default binary hidden and a failing
  `cargo` shim first in `PATH`, proving pure tests do not invoke native setup.

- If `cargo build` fails or times out, the thrown test error includes cargo
  stdout, stderr, status, and signal.

- Full suite passes:

```bash
cd scripts/kc-baker-pipeline-v2
bun test
```

Manual:

- The first failed run no longer leaves a confusing "hook timed out" diagnosis
  when the real problem is just a cold Rust build.
- Manual cold-run snippets use `trap`/restore logic so a failed run does not
  leave the workspace without its prebuilt binary.

## Integration Verification

Run these after implementing all behaviors:

```bash
cd scripts/kc-baker-pipeline-v2
bun test tests/pass1-themes-shape.test.ts
bun test tests/pass2-ideas-shape.test.ts
bun test tests/pass3-micros-shape.test.ts
bun test tests/step8-aggregate.test.ts
bun test tests/cascade-import-writer.test.ts
bun test
```

Optional artifact smoke:

```bash
cd scripts/kc-baker-pipeline-v2
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -rf extracted "$tmp/extracted"
EXTRACTED_DIR="$tmp/extracted" bun run extract/step8-aggregate.ts
jq '{transcripts, cards_total, gateB_edges_total, failed: (.failed_transcripts | length)}' \
  "$tmp/extracted/step8-aggregate.json"
```

Expected current artifact result until a successful native-primary rerun
clears failure reports:

```json
{
  "transcripts": 0,
  "cards_total": 0,
  "gateB_edges_total": 0,
  "failed": 15
}
```

## Implementation Order

1. Update Pass 1 shape tests to the segment-ID contract.
2. Update the Pass 1 prompt from `2-8` themes to `1-8` themes so it matches
   the parser and tests.
3. Update Pass 2 shape tests to the segment-ID contract and parent range
   reconstitution.
4. Update Pass 3 shape tests to the segment-ID contract while preserving body
   length coverage.
5. Add Step 8 checked-in artifact drift coverage, including the
   `normalizeAggregateForDriftTest` helper and Node/Bun filesystem copying,
   then update the checked-in
   aggregate to the current recomputed state.
6. Replace file-level writer native setup with `ensureSilmariStoreTestBinary`
   scoped to real native tests, including child-process timeout, diagnostics,
   and focused no-cargo checks for pure writer tests.
7. Run the targeted tests and full `bun test`.

## Implementation Notes

Implemented 2026-05-02 under `silmari-agent-memory-i5s`.

Verification completed:

- Baseline red: stale shape tests failed at import time on removed helpers.
- Step 8 drift red: checked-in aggregate reported three stale successes while
  recomputation from current reports produced `0/15` succeeded.
- The minimal Step 8 report set under `extracted/` was force-tracked even
  though the directory is broadly ignored, so the drift test is not dependent
  on local-only ignored artifacts.
- Writer setup red: filtered pure writer tests invoked file-level cargo setup
  when the native binary was hidden.
- Green gates:
  - `bun test tests/pass1-themes-shape.test.ts tests/pass2-ideas-shape.test.ts tests/pass3-micros-shape.test.ts`
  - `bun test tests/step8-aggregate.test.ts tests/cascade-import-writer.test.ts`
  - `bun test`
- Manual diagnostic: failing cargo shim for the real native test surfaced
  status, stdout, and stderr in the thrown setup error.

## References

- Beads issue: `silmari-agent-memory-afm`
- Review addressed:
  `thoughts/searchable/shared/plans/2026-05-02-silmari-agent-memory-afm-tdd-kc-baker-pipeline-test-results-REVIEW.md`
- Pass 1 stale test: `scripts/kc-baker-pipeline-v2/tests/pass1-themes-shape.test.ts`
- Pass 1 active prompt:
  `scripts/kc-baker-pipeline-v2/extract/prompts/pass1-themes-v3.md`
- Pass 2 stale test: `scripts/kc-baker-pipeline-v2/tests/pass2-ideas-shape.test.ts`
- Pass 3 stale test: `scripts/kc-baker-pipeline-v2/tests/pass3-micros-shape.test.ts`
- Segment provenance implementation: `scripts/kc-baker-pipeline-v2/extract/segments.ts`
- Step 8 aggregator: `scripts/kc-baker-pipeline-v2/extract/step8-aggregate.ts`
- Writer integration setup: `scripts/kc-baker-pipeline-v2/tests/cascade-import-writer.test.ts`
- Prior import-writer plan: `thoughts/searchable/shared/plans/2026-04-29-tdd-deterministic-cascade-import-writer.md`
- YouTube/cascade ingest research: `thoughts/searchable/shared/research/2026-04-30-youtube-to-silmari-memory-ingest-workflow.md`

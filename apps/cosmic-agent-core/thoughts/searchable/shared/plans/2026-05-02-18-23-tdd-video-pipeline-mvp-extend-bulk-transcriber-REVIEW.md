# Plan Review Report: 2026-05-02 Video Pipeline MVP — Extend bulk_transcribe + Bridge + Edit Module

**Plan reviewed:** [`2026-05-02-18-23-tdd-video-pipeline-mvp-extend-bulk-transcriber.md`](./2026-05-02-18-23-tdd-video-pipeline-mvp-extend-bulk-transcriber.md)
**Reviewer:** Silmari (review_plan slash command)
**Date:** 2026-05-02
**Verdict:** ❌ **Needs Major Revision** — two critical contract gaps prevent B10 and B16 from being implementable as written; plus one metric-semantics divergence from the source research.

---

## Review Summary

| Category    | Status | Issues Found                                          |
|-------------|--------|-------------------------------------------------------|
| Contracts   | ❌     | 2 critical, 4 warnings                                |
| Interfaces  | ⚠️     | 0 critical, 5 warnings                                |
| Promises    | ⚠️     | 0 critical, 3 warnings                                |
| Data Models | ⚠️     | 0 critical, 4 warnings                                |
| APIs        | ⚠️     | 0 critical, 3 warnings                                |

**Net:** plan structure (TDD cycles, behavior numbering, RGR discipline, anti-phasing) is solid. But three load-bearing assumptions about the existing codebase are wrong, and several types/contracts are under-specified. Address the Critical block, then proceed.

---

## ❌ Critical Issues (MUST address before implementation)

### C1. B10 targets a save path that does not handle biblio cards
**Plan claims (line 712):** "thread `encodeEvidenceLabel` into the cascade ingest path so biblio cards get the label appended at save time."

**Reality:**
- `scripts/kc-baker-pipeline-v2/ingest/cascade-import-writer.ts:37` declares `const IMPORT_KIND = "idea" as const`
- `grep -rn "biblio\|\"biblio\"" scripts/kc-baker-pipeline-v2/` returns **zero matches**
- The v2 cascade does not save biblio cards anywhere. B10's "save time" target is fictional.

**Impact:** B10 ships with passing unit tests for `encodeEvidenceLabel`/`parseEvidenceLabel`, but the integration point — where the encoded label actually lands on a card — is undefined. The MVP loses its "card → playable evidence span" connection.

**Recommendation (pick one):**
1. **(Likely correct)** Re-target B10: biblio cards are created upstream of the v2 cascade (probably the KC Baker v1 pipeline at `scripts/kc-baker-pipeline/`). Identify the actual file:line where biblio cards get their `source` label set, and re-anchor B10's Green step there. The plan needs an explicit citation.
2. Add a new behavior B10a: "v2 cascade learns to emit biblio cards (kind=biblio) carrying the segment label" — and define the schema/trigger.
3. Acknowledge that B10 attaches `ref:ev:` to **ideas** (not biblio) and rename the behavior + label namespace accordingly (e.g. `ref:ev:` on idea cards directly).

The `silmari-store search` CLI cited in B10's success criteria also does not exist as a top-level command — replace with `silmari recall` or a direct DB grep, whichever is real.

---

### C2. B16's `CASCADE_ACQUIRE_MODE=file` env var is unimplemented; no behavior wires it up
**Plan claims (B16 line 1071):** `execSync("CASCADE_ACQUIRE_MODE=file TARGET_TRANSCRIPT=... bash scripts/kc-baker-pipeline-v2/run.sh")`

**Reality:**
- Research §7.2 (line 560) and PRD ISC-37 specify `CASCADE_ACQUIRE_MODE` as the new orchestration switch.
- `grep -rn CASCADE_ACQUIRE_MODE scripts/` finds **only** the research/PRD/plan files. Zero references in `run.sh` or any `.ts`.
- None of B1–B15 add the switch to `run.sh`.

**Impact:** B16 will technically pass — bash ignores unknown env vars, and the cascade runs as today — but the regression test does not actually verify that `mode=file` preserves behavior; it only verifies that the unmodified pipeline produces unmodified output. A future PR that introduces Stage 0 / Bridge into `run.sh` could silently break file-mode and B16 would still be green.

**Recommendation:**
- Add **B0 (or B2.5)**: "`run.sh` accepts `CASCADE_ACQUIRE_MODE=file|url|playlist`; default is `file` and is a no-op pass-through; non-`file` values exit 1 with a `not implemented in MVP` message." Test: run with each value, assert exit code + stderr.
- OR rescope B16 to "pipeline produces byte-identical output regardless of `CASCADE_ACQUIRE_MODE` env var being set or unset" and accept that the switch is ungrounded until a Beta-tier wires Stage 0/Bridge into `run.sh`.

---

### C3. B6 metric ≠ research §13 Q3 metric (semantic divergence)
**Plan B6 (line 401):** "mean delta < 200ms"
**Research §13 Q3 (line 848) and PRD:** "Boundary precision floor **F1≈0.79 @ 50ms**"

These quantities are not interchangeable. F1 @ 50ms is a binary classifier metric (the fraction of word boundaries within ±50ms of ground truth); mean delta is a continuous regression metric. A WhisperX run with F1=0.79 @ 50ms can have a mean delta well above 200ms because the ~21% of off-target boundaries can land arbitrarily far from ground truth.

**Impact:** B6 may pass on the `10s_speech` golden but the model on real talks may fail to clear the research bar that the Edit module's UX promise (frame-accurate cuts) depends on. The MVP ships with a weaker quality gate than the research stipulated.

**Recommendation:** Replace the assertion with the research metric:
```python
def f1_at_tolerance(predicted, expected, tolerance_s=0.05):
    tp = sum(1 for p, e in zip(predicted, expected) if abs(p - e) <= tolerance_s)
    precision = tp / max(len(predicted), 1)
    recall = tp / max(len(expected), 1)
    return 2 * precision * recall / max(precision + recall, 1e-9)

assert f1_at_tolerance([w["end"] for s in aligned for w in s["words"]],
                       [w["end"] for s in expected for w in s["words"]]) >= 0.79
```
Keep the mean-delta assertion as a secondary smoke check if you want, but don't substitute it for the F1 contract.

---

## Contract Review

### Well-Defined ✅
- ✅ B1 Config contract: env var → behavior (`OPENAI_API_KEY` set/empty/unset, `USE_OPENAI_API` gate)
- ✅ B7 vad_snap contract: tolerance window, "unchanged when no silence in tolerance" edge case
- ✅ B8 substring path: `bridgeCardToSegment(card, transcript) → SegmentMatch`
- ✅ B11 cutSpan output normalization profile (1920x1080 / yuv420p / 30fps / 48kHz / aac)
- ✅ B14 ProfileMismatchError contract: throw before subprocess spawn
- ✅ Anti-phasing list: explicit "what we're NOT doing" for 9 deferrals

### Critical or Unclear
- ❌ **C1 above:** B10 biblio integration target is fictional
- ❌ **C2 above:** B16 invokes an unimplemented switch
- ❌ **C3 above:** B6 metric semantic mismatch with research
- ⚠️ B11/B13 source mp4 profile assumed: tests assert `videos/kc_bakers_words_of_wisdom.mp4` is `1920x1080@30fps`, but the plan has no behavior that probes the source first. If the fixture is `1280x720` or 24fps, B11 passes vacuously (because the encode normalizes to 1920x1080@30fps regardless of source). Add a one-line probe assertion: `expect((await ffprobe(SOURCE)).video.fps).toBe(30)` as a setup precondition, or document the fixture's known specs in the plan and pin them with `git lfs` or a checksum.
- ⚠️ B2 submodule URL is `<git-url-of-bulk-transcriber>` — placeholder. The transcriber currently lives only in `~/Dev/bulk_transcribe_youtube_videos_from_playlist/` (not yet on a git remote). Operator must publish to GitHub OR use a `file://` submodule URL OR fork-and-pin. **This is a Day-0 blocker** — file as a separate bd task with Q to operator.
- ⚠️ B7 vad_snap: `get_speech_timestamps` returns SPEECH segments; the code maps `s["end"] / sample_rate` as silence boundaries. Correct (the END of speech IS the start of silence) BUT the function only snaps word ENDS, not word STARTS. Words at speech-onset boundaries won't get their `start` snapped. Document this explicitly: "vad_snap targets word.end only; word.start is left to WhisperX alignment."
- ⚠️ B9 fuzzy threshold (0.85) is a magic number with no traceability to research. Cite the research source or document the empirical basis.

---

## Interface Review

### Well-Defined ✅
- ✅ TDD cycle structure (Red/Green/Refactor) for all 16 behaviors
- ✅ `bun:test` framework matches v2 convention (verified against `atomicity.test.ts`)
- ✅ `make<Type>(…)` helper pattern matches existing convention (e.g. `makeMicro` at `atomicity.test.ts:28-36`, `microFixture` at `fix-flagged.test.ts:23-31`)
- ✅ Skip rules for GPU, ffmpeg, Python venv

### Warnings
- ⚠️ **`Card` type undefined:** B8/B9/B10 reference `Card` with only `{id, body}`. The actual silmari card schema includes `kind`, `box`, `labels`, `priority`, `state` etc. (see `apps/silmari-mcp/src/lib/biblio.ts`). Either (a) declare a narrow `BridgeCardInput` interface that's a strict subset, or (b) cite the canonical Card type. Document expected fields explicitly.
- ⚠️ **`TranscriptWithWords` shape:** B8 declares it locally but doesn't show its full type. Bulk transcriber emits `[{start, end, text, words: [{word, start, end, probability}]}]` per segment — a nested shape. B8's bridge consumes a flattened `transcript.words: Word[]` (single array). The bridge needs a flattening step that's not specified. Add: `const flatWords = segments.flatMap(s => s.words)` and document.
- ⚠️ **`SegmentMatch` schema drift:** B8's success path returns `{card_id, span, match_quality}`; failure path returns `{card_id, span: null, match_quality: 0, ev_no_segment: true}`. The `ev_no_segment` field is on the failure variant only. Use a discriminated union: `type SegmentMatch = SegmentMatched | SegmentUnmatched` with a `kind: "matched"|"unmatched"` discriminant.
- ⚠️ **No CLI entry point spec for the bridge.** `bridgeCardToSegment` is a pure function but the plan never says how an operator runs the bridge over a corpus. Add: "B-cli: `bun scripts/kc-baker-pipeline-v2/bridge/run.ts --transcript X.json --cards-source cosmic --out segments.json`" or similar.
- ⚠️ **No CLI entry point spec for `apps/silmari-video/`.** B11/B13/B15 define functions; nothing defines `silmari-video reel --hub <id> --out reel.mp4`. The MVP's Day 6 success criterion (one end-to-end smoke run produces a 30-second reel) implicitly requires an orchestrator. Add a B-cli for the edit module too.

---

## Promise Review

### Well-Defined ✅
- ✅ Idempotency of `cutSpan` and `stitchClips` (via `-y` overwrite + temp dirs)
- ✅ Wall-clock estimates ("~3-5 min on GPU", "~15-25 min end-to-end")
- ✅ Skip-clean rules for missing GPU / ffmpeg / OTIO

### Warnings
- ⚠️ **B6 alignment model load (~3GB) cached at module level** — the Refactor mentions caching but doesn't specify the eviction policy. In a long-running process this is fine; in a CI matrix that imports the module many times across pytest workers, you'll OOM. Document the assumption: "alignment model load is per-process; do not parallelize align tests across pytest-xdist workers."
- ⚠️ **B14 mismatched-clip generation in Red:** the test uses `Bun.spawnSync(["ffmpeg", "-i", ok, "-vf", "scale=1280:720", "-y", bad])` and proceeds without checking the spawn's exit code. If the encode fails, `bad.mp4` doesn't exist and `stitchClips` will throw a different error (file-not-found) instead of `ProfileMismatchError`, masking the actual contract. Add `expect(spawn.exitCode).toBe(0)` after the spawn.
- ⚠️ **No timeout on Bun.spawn ffmpeg/python calls** in B11/B13/B15. A wedged ffmpeg can hang CI indefinitely. Wrap with `Promise.race([proc.exited, sleep(60_000).then(() => proc.kill())])` or pass `timeout` via Bun spawn options if available.

---

## Data Model Review

### Well-Defined ✅
- ✅ EvidenceLabel: `{video_id, t_start, t_end}` round-trip via encode/parse (B10)
- ✅ Word entry shape: `{word, start, end, probability}` (B3)
- ✅ Span: `{t_start, t_end}` (B11+)
- ✅ Profile constants extracted into `profiles.ts` (B11 Refactor)

### Warnings
- ⚠️ **EvidenceLabel decimal precision underspecified.** B10's example uses `42.13` (2dp) and `67.55` (2dp). B7's `vad_snap` returns floats with arbitrary precision (e.g. `0.4983125`). The encoder doesn't `.toFixed(2)` — so the regex `[\d.]+` will match, but two encodings of the same logical label will differ as strings, causing label-dedup logic downstream to fail. Pin precision: encode `t_start.toFixed(3)` (millisecond-grain matches OTIO's RationalTime fps=30).
- ⚠️ **`words[].word` field name vs. `words[].w` in research §11.** Research line 390 says "joining `words[].w` with spaces" but the plan's B3 (line 277) uses `"word": w.word`. Either the research is shorthand or one is wrong. Settle on one field name across the whole pipeline (`word` is more readable; `w` is faster-whisper's own attribute name when iterating segments).
- ⚠️ **No migration for existing biblio cards** that don't yet carry `ref:ev:` labels. After B10 lands, downstream code (viewer, edit module) needs to gracefully handle cards with and without the label. Add a contract: "absence of `ref:ev:` ⇒ 'Play moment' button hidden, no error." Currently implicit.
- ⚠️ **B16 timestamp masking is too narrow.** Stripping only `written_at`, `ingested_at`, `request_started_at` may miss other volatile keys (UUIDs, model versions, file paths with PIDs, image hashes that vary by codec build, ffmpeg internal seeking jitter). Add: "if B16 fails on a key not in `TIMESTAMP_KEYS`, audit whether the key is genuinely volatile and add it to the mask, OR fix the actual non-determinism in the pipeline."

---

## API Review

### Well-Defined ✅
- ✅ External APIs are clearly identified (faster-whisper, WhisperX, Silero VAD, OTIO, ffmpeg)
- ✅ ffmpeg flag ordering is explicit (B12 enforces `-ss` before `-i` with `-accurate_seek`)
- ✅ Subprocess error contract: `throw new Error(\`ffmpeg X failed: exit ${proc.exitCode}\`)` consistent across B11/B13/B15

### Warnings
- ⚠️ **Viewer "Play moment" button has no behavior in B1–B16** but is required by the "Desired End State" (line 44, item 4) and the E2E checklist (step 8). Either (a) add B17: "viewer renders 'Play moment' button when card has `ref:ev:` label" with a Playwright/HTML assertion, or (b) move it to Beta and remove from Desired End State.
- ⚠️ **`emit_fcp7.py` Python subprocess path resolution** uses `process.env.WHISPER_VENV ? \`${env}/bin/python\` : "python"`. If the operator hasn't activated the venv with OTIO installed, this falls back to system Python where OTIO is missing → opaque ImportError. Add: "if `WHISPER_VENV` unset, the test prints a clear message: 'OTIO requires WHISPER_VENV; see scripts/setup-venv.sh.'"
- ⚠️ **`silmari-store search` (B10 success criterion line 723)** does not exist as a CLI binary. The `Explore` agent confirmed no such command. Replace with a real verification path: `silmari recall ev:video=...` or `bun scripts/dev/grep-labels.ts 'ref:ev:'` or a direct sqlite query.

---

## Suggested Plan Amendments (diff)

```diff
 ## Behavior 0 (NEW): CASCADE_ACQUIRE_MODE switch is wired into run.sh

+ ### Test specification
+ Given run.sh is invoked with CASCADE_ACQUIRE_MODE={file|url|playlist|<bogus>},
+ When parsed, Then file=no-op pass-through (today's behavior),
+ url|playlist exits 1 with "not implemented in MVP",
+ unknown value exits 1 with the supported list.

 ## Behavior 6: WhisperX alignment refines word boundaries
- expect mean_delta < 0.200
+ expect f1_at_tolerance(aligned_ends, golden_ends, tolerance_s=0.05) >= 0.79

 ## Behavior 8: types/segments.ts
- export interface Card { id: string; body: string; }
+ export interface BridgeCardInput { id: string; body: string; kind?: "idea"|"biblio"; }
+ export type SegmentMatch =
+   | { kind: "matched"; card_id: string; span: [number, number]; match_quality: number; }
+   | { kind: "unmatched"; card_id: string; span: null; match_quality: number; ev_no_segment: true; };

 ## Behavior 10: Biblio cards carry ref:ev: labels
- "thread encodeEvidenceLabel into the cascade ingest path"
+ "identify the actual file:line where biblio cards are CREATED today
+  (likely scripts/kc-baker-pipeline/, NOT the v2 cascade which only emits ideas).
+  If no biblio creation exists, file a sub-task: 'design biblio-card ingest path for v2 cascade.'
+  Pin label precision to .toFixed(3) for both t_start and t_end."

 ## Behavior 11: ffmpeg cut produces normalized clip
+ Add precondition test: probe the source mp4 once; assert it is 1920x1080@30fps;
+ if not, document the actual source profile and adjust the contract.

 ## Behavior 14: profile guard test
+ After Bun.spawnSync to create the bad clip, assert spawn.exitCode === 0 to
+ ensure the test fails for the RIGHT reason (profile mismatch, not file-not-found).

 ## Behavior 17 (NEW): Viewer renders "Play moment" button on cards with ref:ev: label
+ Or: explicitly defer to Beta and delete from "Desired End State" item 4.

 ## Beads Issue Tracking
+ File a Day-0 dependency task: "Publish bulk_transcribe_youtube_videos_from_playlist
+  to a git remote OR commit to a file://-based submodule decision before B2."
```

---

## Approval Status

- [ ] Ready for Implementation
- [ ] Needs Minor Revision (warnings only)
- [x] **Needs Major Revision** — C1, C2, C3 are blockers

**Rationale:** The plan is structurally excellent (TDD discipline, anti-phasing, fixture strategy, regression behavior), but three load-bearing assumptions about the existing codebase are wrong (C1 biblio target, C2 unimplemented switch, C3 metric semantics). Address those, address the `Card` and `SegmentMatch` schema gaps, and the plan is ship-ready. Do not start B1 until C1's biblio-target file:line is identified and the plan re-anchored.

---

## References

- Plan: `thoughts/searchable/shared/plans/2026-05-02-18-23-tdd-video-pipeline-mvp-extend-bulk-transcriber.md`
- Source research: `thoughts/searchable/shared/research/2026-05-02-video-transcript-cut-splice-stitch-pipeline.md`
- Source PRD: `MEMORY/WORK/20260502-110000_research-video-transcript-cut-splice-stitch-pipeline/PRD.md`
- Existing convention: `scripts/kc-baker-pipeline-v2/tests/atomicity.test.ts:1-60`
- Cascade ingest writer (ideas-only): `scripts/kc-baker-pipeline-v2/ingest/cascade-import-writer.ts:37`
- Biblio schema (label-encoding precedent): `apps/silmari-mcp/src/lib/biblio.ts:48-80`
- Label namespaces (existing): `apps/silmari-mcp/src/lib/labels.ts:28-42`

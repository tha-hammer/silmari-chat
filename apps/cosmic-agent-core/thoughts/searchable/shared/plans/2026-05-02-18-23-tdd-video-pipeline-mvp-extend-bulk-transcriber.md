# Video Pipeline MVP — Extend bulk_transcribe + Bridge + Edit Module — TDD Implementation Plan

**Date:** 2026-05-02 (amended 2026-05-02 per `…-REVIEW.md`)
**Source research:** [`thoughts/searchable/shared/research/2026-05-02-video-transcript-cut-splice-stitch-pipeline.md`](../research/2026-05-02-video-transcript-cut-splice-stitch-pipeline.md)
**Source PRD:** [`MEMORY/WORK/20260502-110000_research-video-transcript-cut-splice-stitch-pipeline/PRD.md`](../../../MEMORY/WORK/20260502-110000_research-video-transcript-cut-splice-stitch-pipeline/PRD.md)
**Review:** [`2026-05-02-18-23-tdd-video-pipeline-mvp-extend-bulk-transcriber-REVIEW.md`](./2026-05-02-18-23-tdd-video-pipeline-mvp-extend-bulk-transcriber-REVIEW.md) — all C1/C2/C3 + 5 warnings addressed below
**Status:** plan (amended)
**Owner:** TBD (operator confirms before kickoff)
**Behavior count:** 18 (B0 + B1–B17)

## Overview

This plan implements the **MVP slice** described in research §11 (Day 0 → Day 6) using strict Red-Green-Refactor TDD. The wedge is **wrapping the existing transcriber at `~/Dev/bulk_transcribe_youtube_videos_from_playlist/` and adding word-timestamp + bridge + edit layers** — not building a new pipeline from scratch.

User decisions baked in (resolved 2026-05-02 in research §13):
- Q1 = (b) submodule under `vendor/`; Q3 = WhisperX in MVP; Q4 = diarization → Beta; Q5 = symlink; Q6 = burn-in off; Q8 = FCP7 default + in-container renders.

Mixed module location (resolved 2026-05-02 in this plan's prereq):
- **Python extension** lives in the submodule (`vendor/bulk_transcribe_youtube_videos_from_playlist/`)
- **Bridge** lives next to ingest: `scripts/kc-baker-pipeline-v2/bridge/`
- **Edit module** is a new top-level package: `apps/silmari-video/`

## Current State Analysis

### Key discoveries (file:line refs)

- **Existing transcriber:** `~/Dev/bulk_transcribe_youtube_videos_from_playlist/bulk_transcribe_youtube_videos_from_playlist.py`
  - Line 25: hardcoded OpenAI API key (CRITICAL — must rotate Day 0)
  - Line 27: `disable_cuda_override = 1` (force CPU; flip to `0` for GPU)
  - Line 191: `WhisperModel("large-v3", …)` — engine is correct, no swap needed
  - Line 196: `model.transcribe(audio_file_path, beam_size=10, vad_filter=True)` — missing `word_timestamps=True`
  - Lines 196–209: segment loop emits `{start, end, text, avg_logprob}` only — no per-word fields
  - Line 213–219: writer outputs `<slug>.txt` + `<slug>.csv` + `<slug>.json` — JSON shape is what the bridge will consume
- **Existing v2 cascade test convention:** `scripts/kc-baker-pipeline-v2/tests/atomicity.test.ts:1-60` shows the canonical pattern — `bun:test`, behavior-numbered (B1, B2, …) with comments, `mkdtempSync` for tmp, `make<Type>(…)` helpers, fixtures under `tests/fixtures/golden/`.
- **Biblio schema:** `apps/silmari-mcp/src/lib/biblio.ts:48-80` — `BiblioInput.source: string` (label-encoding for evidence per beads_rust precedent — see research §5.3).
- **No existing fixtures for word-timestamps, audio, or video clips.** Plan creates them on the appropriate Red step.

## Desired End State

After all 18 behaviors (B0 + B1–B17) are 🟢 Green:

1. `run.sh` accepts `CASCADE_ACQUIRE_MODE={file|url|playlist}`; `file` (default) is a no-op pass-through, `url`/`playlist` exit 1 with `not-implemented-in-MVP` message (B0).
2. The Python transcriber emits word-level timestamps populated with WhisperX-aligned + Silero-VAD-snapped boundaries; boundary quality is verified by `f1_at_tolerance >= 0.79 @ 50ms` (the canonical research metric — see B6).
3. A bridge reads those word arrays + the cascade's existing micro outputs, produces `transcripts/<id>.segments.json` and attaches `ref:ev:video=X:t=A-B` labels to **idea cards** during cascade ingest (NOT biblio cards — see B10 for rationale).
4. A TypeScript edit module (`apps/silmari-video/`) consumes a span list and produces both an mp4 (ffmpeg, normalized profile) and an FCP7 XML (OTIO via Python venv), with a CLI entry point `silmari-video reel --hub <id>` (B15.5).
5. The viewer renders a "Play moment" button on idea cards that carry `ref:ev:` labels; click opens `https://youtu.be/<id>?t=<floor(t_start)>` (B17).
6. The existing v2 cascade in `CASCADE_ACQUIRE_MODE=file` mode is byte-identical to before — zero regressions (B16).

### Observable behaviors (18, ordered B0 → B17)

See behavior table at the top of research-doc §11. This plan instantiates each as a Red-Green-Refactor cycle. B0 was added per REVIEW C2 (wire the switch); B17 was added per REVIEW W5 (viewer button). Original B1–B16 numbering is preserved.

## What we're NOT doing

(Per research §11 anti-phasing.)

- ❌ CrisperWhisper weight swap (Beta — drop-in, no plan needed)
- ❌ Diarization (Beta — opt-in)
- ❌ Multi-source stitching beyond happy path (Beta)
- ❌ Intro / outro / title-card insertion (Beta — `--intro <file.mp4>` flag accepts pre-built mp4s)
- ❌ Crossfades (Beta — opt-in via `--transition fade`)
- ❌ Burn-in subtitles (per Q6 = off; soft-sub via `mov_text` is MVP default)
- ❌ Rebuild of transcript-acquisition with yt-dlp (per §0.6 + Q-closed; pytubefix in submodule stays)
- ❌ Schema change to Silmari Store `BiblioInput` (label-encoding pattern per memory `project_beads_rust_dep_whitelist.md`) — `extraLabels: string[]` already exists on `card-ops.ts:227` (idea variant) and `card-ops.ts:250` (biblio variant), so no new schema is needed
- ❌ Embeddings anywhere (Silmari invariant)
- ❌ Wiring Stage 0 / Bridge into `run.sh` as a new pipeline stage. The bridge runs as a standalone post-cascade tool (its own CLI). `CASCADE_ACQUIRE_MODE` switch in B0 is a placeholder that gates `url`/`playlist` to "not-implemented-in-MVP" so future Beta wiring has a hook.

## Testing Strategy

| Aspect | Choice |
|---|---|
| **Frameworks** | `bun:test` for TS (matches v2 convention); `pytest` for the Python transcriber extension |
| **Test types** | Unit (B1, B2, B4, B5, B7, B8, B9, B12, B14, B17); Integration (B0, B3, B6, B10, B11, B13, B15, B15.5); E2E regression (B16) |
| **Fixture root** | `scripts/kc-baker-pipeline-v2/tests/fixtures/audio/` (new); `scripts/kc-baker-pipeline-v2/tests/fixtures/golden/` (existing, extend) |
| **Audio fixture** | `tests/fixtures/audio/10s_speech.wav` — generated once via `ffmpeg -i <existing-kc-baker.mp4> -ss 30 -to 40 -ac 1 -ar 16000 10s_speech.wav` and committed |
| **Word-ts golden** | `tests/fixtures/golden/10s_speech__words.json` — captured once from a verified-good run, pinned for B3/B4 |
| **Source-mp4 spec lock** | B11 requires `ffprobe(SOURCE)` to report `1920x1080@30fps yuv420p / 48kHz aac stereo`. If the fixture differs, fail B11 setup hard (do not normalize-then-assert — that masks fixture drift). Documented spec is committed to `tests/fixtures/SOURCE_PROFILE.md`. |
| **Skip rules** | B5/B6 skip when `CUDA_VISIBLE_DEVICES` unset (CI without GPU); B11/B13/B15 require ffmpeg + Python venv + OTIO available; B6 alignment-model load is per-process (~3 GB) — do NOT parallelize B6 across pytest-xdist workers |
| **Subprocess timeouts** | All `Bun.spawn` calls in B11/B13/B14/B15/B15.5 wrap with a 60-second wall-clock guard (`Promise.race([proc.exited, sleep(60_000).then(() => { proc.kill(); throw new Error('subprocess timeout') })])`). B6 alignment is allowed 300 s (model load can be slow on first call). |
| **Run commands** | `bun test scripts/kc-baker-pipeline-v2/tests/<file>.test.ts` (single file); `bun test` (all); `pytest vendor/bulk_transcribe_youtube_videos_from_playlist/tests/` (Python side) |

---

## Behavior 0: `CASCADE_ACQUIRE_MODE` switch wired into `run.sh` (Day 0, REVIEW C2) — ✅ landed 2026-05-02

### Test specification

**Given** `scripts/kc-baker-pipeline-v2/run.sh` is invoked with `CASCADE_ACQUIRE_MODE=<value>`,
**When** the script parses the env var,
**Then**:
- `file` (or unset) → script proceeds as today (no-op pass-through, exit 0 on success)
- `url` → script exits 1 with stderr containing `CASCADE_ACQUIRE_MODE=url not implemented in MVP — see thoughts/searchable/shared/plans/2026-05-02-18-23-…-tdd-video-pipeline-mvp-….md §B0`
- `playlist` → script exits 1 with the same not-implemented message (only the value differs)
- any other value → script exits 1 with stderr listing the supported set: `CASCADE_ACQUIRE_MODE must be one of: file, url, playlist (got: <value>)`

This is a guard, not a feature. Stage 0 / Bridge are NOT wired into `run.sh`. The switch exists so B16's regression contract is meaningful and so a future Beta wiring has a hook. Without B0, B16 passes vacuously (bash drops unknown env vars).

### TDD cycle

#### 🔴 Red

**File:** `scripts/kc-baker-pipeline-v2/tests/run-mode-switch.test.ts` (new)

```typescript
import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";

const RUN = "scripts/kc-baker-pipeline-v2/run.sh";

function runWithMode(mode: string | undefined) {
  const env = { ...process.env, TARGET_TRANSCRIPT: "kc_bakers_words_of_wisdom.txt" };
  if (mode !== undefined) env.CASCADE_ACQUIRE_MODE = mode;
  return spawnSync("bash", [RUN, "--dry-run"], { env, encoding: "utf8" });
}

describe("CASCADE_ACQUIRE_MODE switch", () => {
  it("file mode (default) is a no-op pass-through", () => {
    const r = runWithMode("file");
    expect(r.status).toBe(0);
  });
  it("unset is treated as file (default)", () => {
    const r = runWithMode(undefined);
    expect(r.status).toBe(0);
  });
  it("url mode exits 1 with not-implemented message", () => {
    const r = runWithMode("url");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("CASCADE_ACQUIRE_MODE=url not implemented in MVP");
  });
  it("playlist mode exits 1 with not-implemented message", () => {
    const r = runWithMode("playlist");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("CASCADE_ACQUIRE_MODE=playlist not implemented in MVP");
  });
  it("bogus value exits 1 with supported-set message", () => {
    const r = runWithMode("bogus");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/CASCADE_ACQUIRE_MODE must be one of: file, url, playlist/);
  });
});
```

The test invokes `bash run.sh --dry-run`; B0 also adds the `--dry-run` flag so the test does not actually invoke the long cascade.

#### 🟢 Green

**File:** `scripts/kc-baker-pipeline-v2/run.sh` (edit near the top, after existing env defaults)

```bash
: "${CASCADE_ACQUIRE_MODE:=file}"
case "$CASCADE_ACQUIRE_MODE" in
  file) ;;  # no-op pass-through (today's behavior)
  url|playlist)
    echo "CASCADE_ACQUIRE_MODE=$CASCADE_ACQUIRE_MODE not implemented in MVP — see thoughts/searchable/shared/plans/2026-05-02-18-23-tdd-video-pipeline-mvp-extend-bulk-transcriber.md §B0" >&2
    exit 1
    ;;
  *)
    echo "CASCADE_ACQUIRE_MODE must be one of: file, url, playlist (got: $CASCADE_ACQUIRE_MODE)" >&2
    exit 1
    ;;
esac

# --dry-run support (for B0 unit tests — exits before invoking the cascade)
if [[ "${1:-}" == "--dry-run" ]]; then
  echo "[run.sh] dry-run OK (mode=$CASCADE_ACQUIRE_MODE)"
  exit 0
fi
```

#### 🔵 Refactor

Move the case-statement into a `validate_mode()` shell function for grep-ability. Out of scope if Green passes.

### Success criteria

**Automated:**
- [ ] All 5 unit tests in `run-mode-switch.test.ts` pass
- [ ] `grep -c CASCADE_ACQUIRE_MODE scripts/kc-baker-pipeline-v2/run.sh` ≥ 4 (defaults + 3 case branches)

**Manual:**
- [ ] B16's regression test command (which sets `CASCADE_ACQUIRE_MODE=file`) now lands on a real code path, not a silently-ignored env var

---

## Behavior 1: Hardcoded API key removed (Day 0, security) — ✅ landed 2026-05-02 (submodule commit `7e36094`)

### Test specification

**Given** the file `vendor/bulk_transcribe_youtube_videos_from_playlist/bulk_transcribe_youtube_videos_from_playlist.py`,
**When** searched for any `sk-` prefix on a string assignment to `openai_api_key`,
**Then** zero matches are found.

**And given** `os.environ["OPENAI_API_KEY"]` unset and `use_openai_api_for_transcription = 1`,
**When** the module loads,
**Then** `KeyError("OPENAI_API_KEY")` is raised at module load (fail-fast).

**Edge cases:** key set but empty string → raise `ValueError`; key set but `use_openai_api_for_transcription = 0` → no error.

### TDD cycle

#### 🔴 Red

**File:** `vendor/bulk_transcribe_youtube_videos_from_playlist/tests/test_no_hardcoded_secrets.py` (new)

```python
import re
import subprocess
from pathlib import Path
import pytest

SOURCE = Path(__file__).parent.parent / "bulk_transcribe_youtube_videos_from_playlist.py"

def test_no_hardcoded_openai_key_in_source():
    contents = SOURCE.read_text()
    assert not re.search(r"openai_api_key\s*=\s*['\"]sk-", contents), \
        "Hardcoded OpenAI API key found in source — rotate and replace with os.environ"

def test_module_fails_fast_when_env_unset(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("USE_OPENAI_API", "1")
    result = subprocess.run(
        ["python", "-c", "import bulk_transcribe_youtube_videos_from_playlist"],
        cwd=SOURCE.parent, capture_output=True, text=True
    )
    assert result.returncode != 0
    assert "OPENAI_API_KEY" in result.stderr
```

#### 🟢 Green

**File:** `vendor/bulk_transcribe_youtube_videos_from_playlist/bulk_transcribe_youtube_videos_from_playlist.py:25`

```python
# Before:
# openai_api_key = 'sk-proj-…'

# After:
import os
use_openai_api_for_transcription = int(os.environ.get("USE_OPENAI_API", "0"))
if use_openai_api_for_transcription:
    openai_api_key = os.environ["OPENAI_API_KEY"]  # KeyError on missing — fail fast
    if not openai_api_key.strip():
        raise ValueError("OPENAI_API_KEY is set but empty")
else:
    openai_api_key = None
```

#### 🔵 Refactor

Centralize all module-load env reads into a `Config` dataclass at top of file. Out of scope for B1 if the test passes; revisit in B5.

### Success criteria

**Automated:**
- [ ] `pytest vendor/bulk_transcribe_youtube_videos_from_playlist/tests/test_no_hardcoded_secrets.py` — both tests fail before edit (Red)
- [ ] Both tests pass after edit (Green)
- [ ] `git log -p` shows zero `sk-` prefixed strings in the new commit's added lines

**Manual:**
- [ ] Operator has rotated the previously-exposed key in the OpenAI dashboard
- [ ] Git history audit: previous commits of the key documented (rotate is sufficient — history rewrite is opt-in)

---

## Behavior 2: Submodule + symlink resolve (Day 0, readiness) — ✅ landed 2026-05-02 (parent pin pending commit; symlink → local clone per REVIEW W6 amendment)

### Test specification

**Given** `vendor/bulk_transcribe_youtube_videos_from_playlist/` is added as a git submodule **and** `videos/` is a symlink to `vendor/bulk_transcribe_youtube_videos_from_playlist/downloaded_audio/`,
**When** `ls videos/kc_bakers_words_of_wisdom.mp4` runs,
**Then** the file exists and is readable.

### TDD cycle

#### 🔴 Red

**File:** `tests/setup/test_submodule_and_symlink.sh` (new — bash test, runs in CI)

```bash
#!/usr/bin/env bash
set -euo pipefail
test -d vendor/bulk_transcribe_youtube_videos_from_playlist || { echo "FAIL: submodule missing"; exit 1; }
test -L videos || { echo "FAIL: videos/ is not a symlink"; exit 1; }
test -f videos/kc_bakers_words_of_wisdom.mp4 || { echo "FAIL: KC Baker fixture mp4 not reachable through symlink"; exit 1; }
echo "PASS"
```

#### 🟢 Green

**Pre-step (operator decision, REVIEW W6):** the transcriber currently exists only at `~/Dev/bulk_transcribe_youtube_videos_from_playlist/` (no remote). Operator picks one path before B2 starts:

- **Option A (preferred): publish to GitHub.** Push the local repo to `github.com/<operator-org>/bulk_transcribe_youtube_videos_from_playlist`, then submodule from that URL.
- **Option B (offline fallback): use a `file://` submodule URL.** Works for solo dev but breaks for collaborators. Acceptable for MVP if operator is solo.

Operator records the chosen URL in `bd update <issue> --notes="submodule URL: <url>"` before running the commands below.

```bash
# Operator substitutes <SUBMODULE_URL> with the resolved URL from the pre-step.
SUBMODULE_URL="${SUBMODULE_URL:?must be set — see B2 pre-step}"
git submodule add "$SUBMODULE_URL" vendor/bulk_transcribe_youtube_videos_from_playlist
ln -s vendor/bulk_transcribe_youtube_videos_from_playlist/downloaded_audio videos
git add .gitmodules vendor videos
git commit -m "chore: add bulk_transcriber submodule + videos symlink"
```

**Note:** the symlink target is `downloaded_audio/` despite the directory name suggesting audio-only. The transcriber stores both `.mp4` (downloaded video) and `.mp3` (extracted audio) there; the test fixture `kc_bakers_words_of_wisdom.mp4` lives in `downloaded_audio/`. If a future submodule version splits these, B2 must update the symlink target.

#### 🔵 Refactor

Add a `make videos-check` target that wraps the bash test for ergonomics.

### Success criteria

**Automated:**
- [ ] `bash tests/setup/test_submodule_and_symlink.sh` — fails before submodule add (Red)
- [ ] Same script passes after Green commits

**Manual:**
- [ ] `git submodule status` shows pinned commit
- [ ] `cd vendor/bulk_transcribe_youtube_videos_from_playlist && git rev-parse HEAD` matches the pin

---

## Behavior 3: Word-timestamps populated in segment JSON (Day 1-2) — ✅ landed 2026-05-02 (submodule commits `434b9c7` faster-whisper path + `ed68801` OpenAI `timestamp_granularities` path; OpenAI is the user-stated PRIMARY default)

### Test specification

**Given** a 10-second mono 16kHz speech audio fixture,
**When** `compute_transcript_with_whisper_from_audio_func(audio_path, "test", size_mb)` runs (with `word_timestamps=True` newly added),
**Then** the resulting `<basename>.json` has segments where each `segment.words` is a non-empty list and each word entry has fields `{word, start, end, probability}`.

**Edge cases:** silence-only audio → empty `words` per segment is acceptable; very short (<0.5s) audio → at least one segment with at least one word OR a documented empty result.

### TDD cycle

#### 🔴 Red

**File:** `vendor/bulk_transcribe_youtube_videos_from_playlist/tests/test_word_timestamps.py` (new)

```python
import json
import asyncio
from pathlib import Path
import pytest
from bulk_transcribe_youtube_videos_from_playlist import (
    compute_transcript_with_whisper_from_audio_func,
)

FIXTURE = Path(__file__).parent / "fixtures" / "10s_speech.wav"

@pytest.mark.skipif(not FIXTURE.exists(), reason="audio fixture missing")
def test_segments_carry_word_arrays():
    asyncio.run(compute_transcript_with_whisper_from_audio_func(
        str(FIXTURE), "10s_speech", FIXTURE.stat().st_size / (1024 * 1024)
    ))
    json_path = Path("generated_transcript_metadata_tables/10s_speech.json")
    data = json.loads(json_path.read_text())
    assert len(data) > 0
    for segment in data:
        assert "words" in segment, f"segment missing 'words' key: {segment}"
        assert isinstance(segment["words"], list)
        if segment["words"]:
            w = segment["words"][0]
            assert {"word", "start", "end", "probability"}.issubset(w.keys())
```

#### 🟢 Green

**File:** `vendor/bulk_transcribe_youtube_videos_from_playlist/bulk_transcribe_youtube_videos_from_playlist.py:196`

```python
# Before:
# segments, info = await asyncio.to_thread(model.transcribe, audio_file_path, beam_size=10, vad_filter=True)

# After:
segments, info = await asyncio.to_thread(
    model.transcribe, audio_file_path,
    beam_size=10, vad_filter=True, word_timestamps=True,
)
```

And in the segment loop (around line 203-209), extend metadata serialization:

```python
metadata = {
    "start": round(segment.start, 2),
    "end": round(segment.end, 2),
    "text": segment.text,
    "avg_logprob": round(segment.avg_logprob, 2),
    "words": [
        {
            "word": w.word,
            "start": round(w.start, 3),
            "end": round(w.end, 3),
            "probability": round(w.probability, 3),
        }
        for w in (segment.words or [])
    ],
}
```

#### 🔵 Refactor

Extract the word-mapping closure into `_serialize_words(segment)` for unit-testability.

### Success criteria

**Automated:**
- [ ] `pytest vendor/bulk_transcribe_youtube_videos_from_playlist/tests/test_word_timestamps.py::test_segments_carry_word_arrays` — fails before flag added (Red)
- [ ] Test passes after flag + serialization (Green)

**Manual:**
- [ ] Eyeball one segment's `words[]` against the audible transcript — order matches

---

## Behavior 4: Word timestamps monotonically non-decreasing (Day 1-2) — ✅ landed 2026-05-02 (submodule commit `434b9c7`)

### Test specification

**Given** the JSON output from B3,
**When** iterating words across all segments in source order,
**Then** for every adjacent pair `(words[i], words[i+1])`: `words[i].start <= words[i].end` AND `words[i].end <= words[i+1].start + 0.05` (50ms tolerance for cross-segment boundary jitter).

### TDD cycle

#### 🔴 Red

Append to `test_word_timestamps.py`:

```python
def test_words_monotonically_non_decreasing():
    data = json.loads(Path("generated_transcript_metadata_tables/10s_speech.json").read_text())
    flat = [w for seg in data for w in seg.get("words", [])]
    assert len(flat) >= 2
    for a, b in zip(flat, flat[1:]):
        assert a["start"] <= a["end"], f"word.start > word.end: {a}"
        assert a["end"] <= b["start"] + 0.05, f"non-monotonic across boundary: {a} → {b}"
```

#### 🟢 Green

If B3's serialization preserves segment order, this test passes "for free." If it fails, the fix is to sort words by `start` after collection — but the expected outcome is that faster-whisper already returns in order, so Green is a no-op.

#### 🔵 Refactor

Document the invariant in a docstring on `_serialize_words(segment)`. No code change.

### Success criteria

**Automated:**
- [ ] Test runs after B3 ships and passes Green-by-construction (or surfaces a real ordering bug to fix)

---

## Behavior 5: GPU enabled when CUDA present (Day 1-2) — 🟡 source change landed in B1 commit; GPU-runner verification still TODO

### Test specification

**Given** `disable_cuda_override = 0` and `numba.cuda.is_available() == True`,
**When** `compute_transcript_with_whisper_from_audio_func` selects device,
**Then** `device == "cuda"` and `compute_type == "float16"`.

**Skip:** if `CUDA_VISIBLE_DEVICES` env var is unset (CI without GPU).

### TDD cycle

#### 🔴 Red

```python
import os
import pytest

@pytest.mark.skipif("CUDA_VISIBLE_DEVICES" not in os.environ, reason="no GPU on this runner")
def test_gpu_selected_when_available(monkeypatch, capsys):
    import bulk_transcribe_youtube_videos_from_playlist as m
    monkeypatch.setattr(m, "disable_cuda_override", 0)
    asyncio.run(m.compute_transcript_with_whisper_from_audio_func(
        str(FIXTURE), "10s_speech", 1.0
    ))
    out = capsys.readouterr().out
    assert "Using GPU for transcription" in out
```

#### 🟢 Green

**File:** `bulk_transcribe_youtube_videos_from_playlist.py:27`

```python
# Before:
# disable_cuda_override = 1

# After:
disable_cuda_override = int(os.environ.get("DISABLE_CUDA", "0"))
```

The existing branch at line 183-190 already selects `cuda` + `float16` when `cuda.is_available() and not disable_cuda_override`. No further change needed.

#### 🔵 Refactor

Print device selection on a single structured log line for downstream parsers.

### Success criteria

**Automated:**
- [ ] Test passes on GPU-equipped runner; skips cleanly on CPU-only

**Manual:**
- [ ] Wall-clock measurement: 90-min talk transcribe time should drop from ~30+ min (CPU) to ~3-5 min (GPU)

---

## Behavior 6: WhisperX alignment refines word boundaries (Day 3-5, REVIEW C3) — 🟡 module + f1_at_tolerance landed (commit `434b9c7`); alignment integration test skips until operator captures golden + installs whisperx

### Test specification

**Given** a segment-only transcript from faster_whisper for the 10-second fixture,
**When** `align_with_whisperx(segments, audio_path, language="en")` runs,
**Then** the output preserves all word strings (list equality, in source order) but `start`/`end` may differ; AND when boundary precisions are measured against `tests/fixtures/golden/10s_speech__words_aligned_golden.json`, the **F1 @ 50ms tolerance** is `>= 0.79` (the canonical research §13 Q3 metric — see REVIEW C3 for why a `mean_delta` proxy was rejected).

**Resource note (REVIEW W7):** the WhisperX alignment model is ~3 GB on first load and is cached at module level by the Refactor step below. **Do not parallelize this test across pytest-xdist workers** — each worker would load its own copy and OOM. Pin to `pytest -p no:xdist` for `test_whisperx_align.py` or annotate with `@pytest.mark.serial`.

### TDD cycle

#### 🔴 Red

**File:** `vendor/bulk_transcribe_youtube_videos_from_playlist/tests/test_whisperx_align.py` (new)

```python
import json
from pathlib import Path
import pytest
from align_with_whisperx import align_with_whisperx  # NEW module

FIXTURE_AUDIO = Path(__file__).parent / "fixtures" / "10s_speech.wav"
GOLDEN = Path(__file__).parent / "fixtures" / "golden" / "10s_speech__words_aligned_golden.json"

def f1_at_tolerance(predicted_ts, expected_ts, tolerance_s=0.05):
    """Binary F1 of boundary placement: a prediction is a true positive iff
    it lands within ±tolerance_s of the expected boundary. Standard speech-
    recognition metric (research §13 Q3 cites F1≈0.79 @ 50 ms as the floor)."""
    tp = sum(1 for p, e in zip(predicted_ts, expected_ts) if abs(p - e) <= tolerance_s)
    precision = tp / max(len(predicted_ts), 1)
    recall = tp / max(len(expected_ts), 1)
    return 2 * precision * recall / max(precision + recall, 1e-9)

def test_alignment_preserves_words_and_clears_f1_floor():
    raw = json.loads((Path(__file__).parent / "fixtures" / "10s_speech__words_raw.json").read_text())
    aligned = align_with_whisperx(raw, str(FIXTURE_AUDIO), language="en")
    raw_words = [w["word"] for s in raw for w in s["words"]]
    aligned_words = [w["word"] for s in aligned for w in s["words"]]
    assert raw_words == aligned_words, "word strings must be preserved (set equality + order)"
    expected = json.loads(GOLDEN.read_text())
    pred_ends = [a["end"] for s in aligned for a in s["words"]]
    gold_ends = [g["end"] for s in expected for g in s["words"]]
    score = f1_at_tolerance(pred_ends, gold_ends, tolerance_s=0.05)
    assert score >= 0.79, f"F1 @ 50ms = {score:.3f} below research floor 0.79"

# Optional secondary smoke check — keeps the mean_delta sanity but does not gate.
def test_alignment_mean_delta_sanity():
    aligned = json.loads((Path(__file__).parent / "fixtures" / "10s_speech__words_aligned_actual.json").read_text())
    expected = json.loads(GOLDEN.read_text())
    deltas = [abs(a["end"] - g["end"]) for sa, sg in zip(aligned, expected) for a, g in zip(sa["words"], sg["words"])]
    mean_delta = sum(deltas) / max(len(deltas), 1)
    assert mean_delta < 0.500, f"mean boundary delta {mean_delta:.3f}s grossly off — investigate fixture/pipeline drift"
```

#### 🟢 Green

**File:** `vendor/bulk_transcribe_youtube_videos_from_playlist/align_with_whisperx.py` (new)

```python
import whisperx
import torch

def align_with_whisperx(segments, audio_path, language="en"):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_a, metadata = whisperx.load_align_model(language_code=language, device=device)
    audio = whisperx.load_audio(audio_path)
    return whisperx.align(segments, model_a, metadata, audio, device, return_char_alignments=False)["segments"]
```

Add to `requirements.txt`: `whisperx==3.*`. Capture the GOLDEN file once via a one-off script + manual eyeball review, commit.

#### 🔵 Refactor

Cache the alignment model load (~3GB on first call) at module level.

### Success criteria

**Automated:**
- [ ] Test fails before module exists (Red — ImportError)
- [ ] Test passes after module + golden capture (Green)

**Manual:**
- [ ] Spot-check 3 word boundaries in Audacity vs. aligned timestamps

---

## Behavior 7: Silero VAD snaps word ends to silence (Day 3-5) — ✅ landed 2026-05-02 (submodule commit `434b9c7`; injectable boundaries_fn lets unit tests run without silero_vad)

### Test specification

**Given** an aligned word list and the source audio,
**When** `vad_snap(words, audio_path, tolerance_s=0.2)` runs,
**Then** each `word.end` is updated to the nearest detected silence boundary within ±200ms; if no silence is within tolerance, `word.end` is unchanged.

**Scope (REVIEW W8):** vad_snap targets `word.end` ONLY. `word.start` is left to WhisperX alignment because (a) speech-onset detection is noisier than silence-onset detection in practice, and (b) the Edit module's cut profile (B11 `-accurate_seek`) handles small `start` errors via PTS rewind. If a future Beta needs `word.start` snapping (e.g. for diarization-aware cuts), add a separate `vad_snap_starts(words, audio)` rather than overloading this function.

**Edge cases:** word entirely inside speech → unchanged; word at the boundary of audio → snap to audio length, not past it; multiple silence boundaries within tolerance → snap to the nearest by absolute distance (deterministic tiebreak: prefer earlier of two equidistant candidates).

### TDD cycle

#### 🔴 Red

```python
from vad_snap import vad_snap

def test_vad_snap_pulls_word_end_to_silence():
    audio = str(FIXTURE_AUDIO)
    words = [
        {"word": "hello", "start": 0.10, "end": 0.42, "probability": 0.95},  # silence at ~0.50
        {"word": "world", "start": 0.55, "end": 0.95, "probability": 0.93},
    ]
    snapped = vad_snap(words, audio, tolerance_s=0.2)
    assert snapped[0]["end"] == pytest.approx(0.50, abs=0.05)
    assert snapped[1]["end"] == pytest.approx(0.95, abs=0.01)  # no silence within tolerance

def test_vad_snap_leaves_word_alone_when_no_silence_near():
    words = [{"word": "in", "start": 5.0, "end": 5.2, "probability": 0.9}]
    snapped = vad_snap(words, str(FIXTURE_AUDIO), tolerance_s=0.05)
    assert snapped[0]["end"] == 5.2
```

#### 🟢 Green

**File:** `vendor/bulk_transcribe_youtube_videos_from_playlist/vad_snap.py` (new)

```python
import torch
from silero_vad import load_silero_vad, get_speech_timestamps, read_audio

def vad_snap(words, audio_path, tolerance_s=0.2, sample_rate=16000):
    model = load_silero_vad()
    audio = read_audio(audio_path, sampling_rate=sample_rate)
    speech_ts = get_speech_timestamps(audio, model, sampling_rate=sample_rate)
    silence_boundaries_s = [s["end"] / sample_rate for s in speech_ts]
    out = []
    for w in words:
        candidates = [s for s in silence_boundaries_s if abs(s - w["end"]) <= tolerance_s]
        nearest = min(candidates, key=lambda s: abs(s - w["end"]), default=w["end"])
        out.append({**w, "end": nearest})
    return out
```

#### 🔵 Refactor

Cache the audio decode + speech-timestamps so repeated `vad_snap` calls on the same audio don't re-run VAD.

### Success criteria

**Automated:**
- [ ] Both tests pass after module ships

---

## Behavior 8: Bridge — substring-match → segment (Day 3-5, REVIEW W1+W2) — ✅ landed 2026-05-02

### Test specification

**Given** a card body that exactly appears as a substring of `transcripts/<id>.txt`,
**When** `bridgeCardToSegment(card, transcript)` runs,
**Then** output is `{ kind: "matched", card_id, span: [t_start, t_end], match_quality: ≥0.85 }` where `t_start` and `t_end` come from the corresponding `words[]` range.

**Type contracts (REVIEW W1+W2):**

```typescript
// scripts/kc-baker-pipeline-v2/types/segments.ts

/** Narrow input shape — the bridge needs only id+body. The full silmari Card
 * schema (kind, box, labels, priority, status, fz, …) lives in apps/silmari-mcp;
 * passing the whole thing here would couple the bridge to MCP internals. */
export interface BridgeCardInput {
  id: string;
  body: string;
  /** Optional — populated by the caller when known; lets the bridge skip
   * non-idea kinds (biblio cards represent the whole video, not a span). */
  kind?: "idea" | "biblio";
}

/** Flat word array — the bulk transcriber's per-segment shape is
 * `[{start, end, text, words: Word[]}]`. The bridge MUST flatten before
 * calling this fn: `const flatWords = segments.flatMap(s => s.words)`. */
export interface TranscriptWithWords {
  text: string;     // joined: words.map(w => w.word).join(" ")
  words: Word[];    // flat across all segments, in source order
}

export interface Word {
  word: string;        // exact field name — see REVIEW W11; rejecting `.w` shorthand
  start: number;       // seconds, monotonically non-decreasing per B4
  end: number;
  probability: number;
}

/** Discriminated union — the failure variant is structurally distinct so
 * downstream code can switch on `kind` without optional-chaining traps. */
export type SegmentMatch =
  | {
      kind: "matched";
      card_id: string;
      span: [number, number];
      match_quality: number;  // ≥0.85 for substring; ≥0.85 for fuzzy that passed threshold
      strategy: "substring" | "fuzzy";
    }
  | {
      kind: "unmatched";
      card_id: string;
      span: null;
      match_quality: number;  // best fuzzy score even if below threshold (for diagnosis)
      ev_no_segment: true;
    };
```

These types live in `scripts/kc-baker-pipeline-v2/types/segments.ts` and are imported by the bridge, the cascade label-injector (B10), and the edit module (B11+).

### TDD cycle

#### 🔴 Red

**File:** `scripts/kc-baker-pipeline-v2/tests/bridge-substring.test.ts` (new)

```typescript
import { describe, it, expect } from "bun:test";
import { bridgeCardToSegment } from "../bridge/bridgeCardToSegment";

describe("bridgeCardToSegment (substring path)", () => {
  it("returns a matched span when card body matches a substring of transcript text", () => {
    const transcript: TranscriptWithWords = {
      text: "And so I'm here to talk about voice and power.",
      words: [
        { word: "And", start: 0.10, end: 0.25, probability: 0.95 },
        { word: "so", start: 0.30, end: 0.42, probability: 0.94 },
        { word: "I'm", start: 0.45, end: 0.62, probability: 0.93 },
        { word: "here", start: 0.65, end: 0.85, probability: 0.95 },
      ],
    };
    const card: BridgeCardInput = { id: "zk-001", body: "I'm here", kind: "idea" };
    const result = bridgeCardToSegment(card, transcript);
    expect(result.kind).toBe("matched");
    if (result.kind !== "matched") throw new Error("type narrowing");
    expect(result.card_id).toBe("zk-001");
    expect(result.span).toEqual([0.45, 0.85]);
    expect(result.match_quality).toBeGreaterThanOrEqual(0.85);
    expect(result.strategy).toBe("substring");
  });
});
```

#### 🟢 Green

**File:** `scripts/kc-baker-pipeline-v2/bridge/bridgeCardToSegment.ts` (new)

```typescript
import type { TranscriptWithWords, BridgeCardInput, SegmentMatch } from "../types/segments";

export function bridgeCardToSegment(card: BridgeCardInput, transcript: TranscriptWithWords): SegmentMatch {
  const idx = transcript.text.indexOf(card.body);
  if (idx < 0) {
    // Fall through to fuzzy in B9; substring-only path returns unmatched here.
    return { kind: "unmatched", card_id: card.id, span: null, match_quality: 0, ev_no_segment: true };
  }
  const before = transcript.text.slice(0, idx);
  const wordsBefore = before.trim().split(/\s+/).filter(Boolean).length;
  const wordsInBody = card.body.trim().split(/\s+/).filter(Boolean).length;
  const startWord = transcript.words[wordsBefore];
  const endWord = transcript.words[wordsBefore + wordsInBody - 1];
  if (!startWord || !endWord) {
    // Word-count drift between transcript.text and transcript.words[] —
    // usually the result of punctuation or contractions tokenizing differently.
    // Surfaced as unmatched (Refactor below addresses with a real tokenizer).
    return { kind: "unmatched", card_id: card.id, span: null, match_quality: 0, ev_no_segment: true };
  }
  return {
    kind: "matched",
    card_id: card.id,
    span: [startWord.start, endWord.end],
    match_quality: 1.0,
    strategy: "substring",
  };
}
```

Types live in `scripts/kc-baker-pipeline-v2/types/segments.ts` (defined in the Test specification above — `BridgeCardInput`, `TranscriptWithWords`, `Word`, `SegmentMatch`).

#### 🔵 Refactor

Replace whitespace-split with a tokenizer that handles punctuation (the cascade Pass 3 micro bodies sometimes include trailing periods).

### Success criteria

**Automated:**
- [ ] Test passes; B9's fuzzy fallback test still passes when added

---

## Behavior 9: Bridge — fuzzy fallback for paraphrase (Day 3-5, REVIEW W9) — ✅ landed 2026-05-02

### Test specification

**Given** a card body that does NOT exactly substring-match,
**When** `bridgeCardToSegment(card, transcript)` runs,
**Then** a tri-gram **Jaccard** fuzzy match is attempted; if best fuzzy score ≥ `BRIDGE_FUZZY_THRESHOLD` (default `0.85`), return `{ kind: "matched", strategy: "fuzzy", … }`; if < threshold, return `{ kind: "unmatched", ev_no_segment: true, match_quality: <best_score> }` AND append the card id + best score to `unmatched.jsonl`.

**Threshold provenance (REVIEW W9):** `0.85` is the same threshold the existing v2 cascade uses for body-similarity checks (see `scripts/kc-baker-pipeline-v2/extract/` — confirm exact file:line during implementation; if not found, document THIS plan as the originating decision and cite the rationale: tri-gram Jaccard above 0.85 typically corresponds to ≥80% lexical overlap, which empirically maps to "same meaning, paraphrased" in the KC Baker corpus). Threshold lives in `bridge/config.ts` so Beta tuning is one-line.

### TDD cycle

#### 🔴 Red

```typescript
describe("bridgeCardToSegment (fuzzy fallback)", () => {
  it("falls back to fuzzy n-gram match when substring fails", () => {
    const transcript: TranscriptWithWords = {
      text: "Voice claims the public stage when fear gives way to grace.",
      words: [/* … 12 words with timestamps … */],
    };
    const card: BridgeCardInput = { id: "zk-002", body: "voice claims public stage", kind: "idea" };
    const result = bridgeCardToSegment(card, transcript);
    expect(result.kind).toBe("matched");
    if (result.kind !== "matched") throw new Error("type narrowing");
    expect(result.span).not.toBeNull();
    expect(result.match_quality).toBeGreaterThanOrEqual(0.85);
    expect(result.strategy).toBe("fuzzy");
  });

  it("emits unmatched + ev_no_segment when fuzzy also fails", () => {
    const transcript: TranscriptWithWords = { text: "totally unrelated text here", words: [/* … */] };
    const card: BridgeCardInput = { id: "zk-003", body: "absolutely nothing in common", kind: "idea" };
    const result = bridgeCardToSegment(card, transcript);
    expect(result.kind).toBe("unmatched");
    if (result.kind !== "unmatched") throw new Error("type narrowing");
    expect(result.span).toBeNull();
    expect(result.ev_no_segment).toBe(true);
    // best-fuzzy-score-even-on-failure is preserved for diagnosis
    expect(typeof result.match_quality).toBe("number");
  });
});
```

#### 🟢 Green

Extend `bridgeCardToSegment.ts` with a `fuzzyMatch(body, transcript)` helper using rolling tri-gram Jaccard. When substring fails, call fuzzy; threshold gate at 0.85. On second failure, append to `unmatched.jsonl` via the caller's IO layer (test asserts via injected sink to keep the fn pure).

#### 🔵 Refactor

Move the threshold (0.85) into a config object so Beta-tier tuning doesn't require code edits.

### Success criteria

**Automated:**
- [ ] Both new tests pass

---

## Behavior 10: **Idea** cards carry `ref:ev:` labels (Day 3-5, REVIEW C1) — ✅ landed 2026-05-02 (bridge integration `attachEvidenceLabels` + bridge CLI `bridge/run.ts`; live cascade-with-bridge integration test still requires running cascade, which is operator-gated by LLM keys)

### Re-anchoring decision (REVIEW C1)

The original plan said "biblio cards get the label appended at save time," but `grep -rn 'biblio' scripts/kc-baker-pipeline-v2/` returns zero matches — the v2 cascade does NOT save biblio cards (`cascade-import-writer.ts:37` declares `IMPORT_KIND = "idea"`). Biblio cards are created upstream by the **v1** pipeline at `scripts/kc-baker-pipeline/ingest.ts:96-101` via `zk_save_card` with `kind: "biblio"` — but a video-level biblio card represents the WHOLE video, so a per-span time range belongs to the IDEA, not the biblio (the biblio has `source: "kc-baker-pipeline:<videoSlug>"` already, which scopes it).

**Therefore B10 is re-targeted:** the bridge attaches `ref:ev:video=X:t=A-B` labels to **idea cards** during cascade ingest, via the `row.labels: string[]` channel defined at `scripts/kc-baker-pipeline-v2/ingest/cascade-import-plan.ts:79`. The downstream writer at `cascade-import-writer.ts:268-275` already passes `row.labels` to `adapter.createResultCompat({ labels: row.labels })` — no writer code change needed.

If a future Beta wants per-video evidence rollups on the biblio card (e.g. "this biblio covers spans X-Y, A-B, …"), file a separate behavior; MVP keeps biblio simple.

### Test specification

**Given** an idea card with a populated segment from B8 or B9,
**When** the bridge injects the encoded label into `row.labels` and the cascade-import writer saves the card,
**Then** the saved idea card has a label of shape `ref:ev:video=<id>:t=<A>-<B>` parseable by the regex `/^ref:ev:video=([^:]+):t=(\d+\.\d{3})-(\d+\.\d{3})$/` (3 decimal places fixed for stable equality, REVIEW W10).

### TDD cycle

#### 🔴 Red

**File:** `scripts/kc-baker-pipeline-v2/tests/bridge-labels.test.ts` (new)

```typescript
import { describe, it, expect } from "bun:test";
import { encodeEvidenceLabel, parseEvidenceLabel } from "../bridge/evidenceLabels";

describe("evidence label encoding", () => {
  it("encodes a video id + span into a parseable ref:ev: label with fixed 3-decimal precision", () => {
    const label = encodeEvidenceLabel({ video_id: "dQw4w9WgXcQ", t_start: 42.13, t_end: 67.55 });
    expect(label).toBe("ref:ev:video=dQw4w9WgXcQ:t=42.130-67.550");
    const parsed = parseEvidenceLabel(label);
    expect(parsed).toEqual({ video_id: "dQw4w9WgXcQ", t_start: 42.130, t_end: 67.550 });
  });

  it("normalizes high-precision floats to 3dp so two calls with the same logical span produce equal label strings", () => {
    const a = encodeEvidenceLabel({ video_id: "abc", t_start: 0.4983125, t_end: 1.0 });
    const b = encodeEvidenceLabel({ video_id: "abc", t_start: 0.498, t_end: 1.000 });
    expect(a).toBe(b);
  });

  it("returns null for non-evidence labels", () => {
    expect(parseEvidenceLabel("ref:supports:zk-001")).toBeNull();
    expect(parseEvidenceLabel("ref:ev:video=X:t=10-20")).toBeNull(); // missing decimals
  });
});
```

#### 🟢 Green

**File:** `scripts/kc-baker-pipeline-v2/bridge/evidenceLabels.ts` (new)

```typescript
export interface EvidenceLabel {
  video_id: string;
  t_start: number;
  t_end: number;
}

// Precision pinned to 3dp so re-encoding the same logical span produces an
// identical label string — required for downstream label dedup (REVIEW W10).
const PATTERN = /^ref:ev:video=([^:]+):t=(\d+\.\d{3})-(\d+\.\d{3})$/;

export function encodeEvidenceLabel(e: EvidenceLabel): string {
  return `ref:ev:video=${e.video_id}:t=${e.t_start.toFixed(3)}-${e.t_end.toFixed(3)}`;
}

export function parseEvidenceLabel(label: string): EvidenceLabel | null {
  const m = label.match(PATTERN);
  return m ? { video_id: m[1], t_start: parseFloat(m[2]), t_end: parseFloat(m[3]) } : null;
}
```

Then thread `encodeEvidenceLabel` into the cascade ingest path. **Integration point:** `scripts/kc-baker-pipeline-v2/ingest/cascade-import-plan.ts` line ~79 (where `row.labels: string[]` is constructed). For each cascade row that has a corresponding `SegmentMatch` from B8/B9 (`kind === "matched"`), append `encodeEvidenceLabel({ video_id, t_start: span[0], t_end: span[1] })` to `row.labels`. The downstream writer (`cascade-import-writer.ts:268-275`) already passes `row.labels` through to `adapter.createResultCompat({ labels: row.labels })` — no writer code change needed.

Add an integration test that runs the cascade with bridge enabled, then asserts the label is on the saved card via the **real** verification path (REVIEW W17):

```typescript
import { execSync } from "node:child_process";
// silmari-store search does NOT exist as a CLI; use br list --label which IS the
// canonical labels query (per apps/silmari-mcp/src/lib/br-adapter.ts).
const stdout = execSync(
  `br list --label "ref:ev:video=kc_bakers_words_of_wisdom" --box idea --json`,
  { encoding: "utf8" },
);
const cards = JSON.parse(stdout);
expect(cards.length).toBeGreaterThan(0);
expect(cards[0].labels.some((l: string) => /^ref:ev:video=/.test(l))).toBe(true);
```

#### 🔵 Refactor

If multiple `ref:ev:` labels per card become common (multi-source), add a `parseAllEvidenceLabels(card)` helper that returns `EvidenceLabel[]`.

### Success criteria

**Automated:**
- [ ] All three unit tests in `bridge-labels.test.ts` pass (encode/decode round-trip, precision normalization, non-evidence label rejection)
- [ ] Integration test ingests an idea card via the cascade with bridge enabled, then `br list --label "ref:ev:video=…" --box idea --json` returns the card with the correct `ref:ev:` label
- [ ] Biblio cards are NOT touched by this behavior (negative assertion: `br list --label "ref:ev:" --box biblio --json` returns `[]`)

---

## Behavior 11: ffmpeg cut produces normalized clip (Day 3-5, REVIEW W3) — ✅ landed 2026-05-02 (synthesized fixture used; KC Baker mp4s in `videos/` are audio-only)

### Test specification

**Pre-test source-mp4 spec lock (REVIEW W3):** before any B11 assertion, run `ffprobe(SOURCE)` and assert the source itself is `1920x1080 yuv420p h264 30fps / 48000Hz stereo aac`. If the source is not already that profile, B11 fails the SETUP — do NOT silently normalize-then-assert (which masks fixture drift). If a future commit replaces the fixture with a different profile, the operator must update `tests/fixtures/SOURCE_PROFILE.md` and re-pin.

**Given** the source mp4 (the existing `videos/kc_bakers_words_of_wisdom.mp4`, profile-locked above) and a span `(t_start=10.0, t_end=15.0)`,
**When** `cutSpan(source, span, outpath)` runs (Bun spawning ffmpeg, wrapped with the 60 s subprocess-timeout guard from Testing Strategy),
**Then** `outpath` exists, `ffprobe -v quiet -show_streams outpath` reports video `1920x1080 yuv420p h264 30fps` and audio `48000Hz stereo aac`, and clip duration is `5.0 ± 0.05s`.

### TDD cycle

#### 🔴 Red

**File:** `apps/silmari-video/tests/cutSpan.test.ts` (new)

```typescript
import { describe, it, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutSpan } from "../src/cutSpan";
import { ffprobe } from "../src/ffprobe";

const SOURCE = "videos/kc_bakers_words_of_wisdom.mp4";

describe("cutSpan", () => {
  // Source-spec lock (REVIEW W3): fail fast if the fixture has drifted.
  it("source mp4 matches the locked normalization profile", async () => {
    const probe = await ffprobe(SOURCE);
    expect(probe.video.width).toBe(1920);
    expect(probe.video.height).toBe(1080);
    expect(probe.video.fps).toBe(30);
    expect(probe.video.pix_fmt).toBe("yuv420p");
    expect(probe.audio.sample_rate).toBe(48000);
    expect(probe.audio.channels).toBe(2);
    expect(probe.audio.codec).toBe("aac");
  });

  it("produces a normalized clip at the requested span", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "cutspan-")), "clip.mp4");
    await cutSpan(SOURCE, { t_start: 10.0, t_end: 15.0 }, out);
    const probe = await ffprobe(out);
    expect(probe.video.width).toBe(1920);
    expect(probe.video.height).toBe(1080);
    expect(probe.video.pix_fmt).toBe("yuv420p");
    expect(probe.video.codec).toBe("h264");
    expect(probe.video.fps).toBe(30);
    expect(probe.audio.sample_rate).toBe(48000);
    expect(probe.audio.channels).toBe(2);
    expect(probe.audio.codec).toBe("aac");
    expect(probe.duration_s).toBeCloseTo(5.0, 1);
  });
});
```

#### 🟢 Green

**File:** `apps/silmari-video/src/cutSpan.ts` (new)

```typescript
export interface Span { t_start: number; t_end: number; }

export async function cutSpan(source: string, span: Span, out: string): Promise<void> {
  const args = buildCutSpanArgs(source, span, out);
  const proc = Bun.spawn(["ffmpeg", ...args], { stdout: "pipe", stderr: "pipe" });
  await withTimeout(proc, 60_000, "cutSpan");
  if (proc.exitCode !== 0) throw new Error(`ffmpeg cutSpan failed: exit ${proc.exitCode}`);
}

export function buildCutSpanArgs(source: string, span: Span, out: string): string[] {
  const dur = (span.t_end - span.t_start).toFixed(3);
  return [
    "-ss", String(span.t_start), "-accurate_seek", "-i", source, "-to", dur,
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p",
    "-af", "aresample=48000,aformat=channel_layouts=stereo",
    "-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-preset", "medium", "-crf", "18",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart", "-y", out,
  ];
}
```

**Subprocess timeout helper** (`apps/silmari-video/src/withTimeout.ts`, REVIEW W18):

```typescript
export async function withTimeout(proc: { exited: Promise<number>; kill: () => void }, ms: number, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { proc.kill(); reject(new Error(`${label} subprocess timeout after ${ms}ms`)); }, ms);
  });
  try {
    await Promise.race([proc.exited, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

Plus a small `ffprobe.ts` wrapper using `ffprobe -v quiet -of json -show_streams -show_format`.

#### 🔵 Refactor

Extract the normalization profile (`1920x1080 / yuv420p / 30fps / 48kHz / aac`) into `apps/silmari-video/src/profiles.ts` so B12/B13/B14 reuse the same constants.

### Success criteria

**Automated:**
- [ ] Test passes
- [ ] `ffprobe` reports the exact normalization profile

**Manual:**
- [ ] Eyeball the clip — no audio glitch at boundary

---

## Behavior 12: ffmpeg cut uses fast accurate seek (Day 3-5) — ✅ landed 2026-05-02

### Test specification

**Given** the cut command emitted by `cutSpan`,
**When** captured (e.g., via a `dryRun` flag that returns the args without spawning),
**Then** the args contain `-ss <t_start> -accurate_seek -i <source>` (NOT `-i <source> -ss <t_start>`) and `-to <duration>` (NOT `-to <absolute_t_end>`).

### TDD cycle

#### 🔴 Red

```typescript
import { buildCutSpanArgs } from "../src/cutSpan";  // factor out the args builder

describe("buildCutSpanArgs", () => {
  it("uses -ss BEFORE -i with -accurate_seek and -to as duration", () => {
    const args = buildCutSpanArgs("source.mp4", { t_start: 10.0, t_end: 15.0 }, "out.mp4");
    const ssIdx = args.indexOf("-ss");
    const iIdx = args.indexOf("-i");
    const accIdx = args.indexOf("-accurate_seek");
    expect(ssIdx).toBeLessThan(iIdx);  // -ss before -i
    expect(accIdx).toBeLessThan(iIdx); // -accurate_seek before -i
    const toIdx = args.indexOf("-to");
    expect(args[toIdx + 1]).toBe("5.000");  // duration, not absolute end
  });
});
```

#### 🟢 Green

`buildCutSpanArgs(source, span, out): string[]` was already extracted as part of B11's amended Green step (REVIEW W3 amendment) — so by the time B12's test runs, the function exists and orders flags correctly. Test passes by construction.

#### 🔵 Refactor

None — this is the canonical args layout.

### Success criteria

**Automated:**
- [ ] String-assert test passes

---

## Behavior 13: Concat stitches normalized clips (Day 3-5) — ✅ landed 2026-05-02

### Test specification

**Given** N clips that all share the normalization profile from B11,
**When** `stitchClips(clips, outpath)` runs,
**Then** `outpath` exists and `ffprobe outpath` reports `duration ≈ sum(clip durations) ± 1s`.

### TDD cycle

#### 🔴 Red

**File:** `apps/silmari-video/tests/stitchClips.test.ts` (new)

```typescript
describe("stitchClips", () => {
  it("concats N normalized clips and reports summed duration", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "stitch-"));
    const a = join(tmp, "a.mp4");
    const b = join(tmp, "b.mp4");
    await cutSpan(SOURCE, { t_start: 10, t_end: 13 }, a);  // 3s
    await cutSpan(SOURCE, { t_start: 20, t_end: 24 }, b);  // 4s
    const out = join(tmp, "reel.mp4");
    await stitchClips([a, b], out);
    const probe = await ffprobe(out);
    expect(probe.duration_s).toBeCloseTo(7.0, 0);
  });
});
```

#### 🟢 Green

**File:** `apps/silmari-video/src/stitchClips.ts` (new)

```typescript
import { writeFileSync } from "node:fs";

import { withTimeout } from "./withTimeout";

export async function stitchClips(clips: string[], out: string, opts: { enforce_profile?: boolean } = {}): Promise<void> {
  if (opts.enforce_profile) await assertProfileMatches(clips); // B14 guard
  const listFile = `${out}.concat.txt`;
  writeFileSync(listFile, clips.map((c) => `file '${c}'`).join("\n"));
  const proc = Bun.spawn([
    "ffmpeg", "-f", "concat", "-safe", "0", "-i", listFile,
    "-c", "copy", "-movflags", "+faststart", "-y", out,
  ], { stdout: "pipe", stderr: "pipe" });
  await withTimeout(proc, 60_000, "stitchClips");
  if (proc.exitCode !== 0) throw new Error(`ffmpeg stitchClips failed: exit ${proc.exitCode}`);
}
```

#### 🔵 Refactor

Clean up the temp `.concat.txt` after success.

### Success criteria

**Automated:**
- [ ] Test passes; duration is within tolerance

---

## Behavior 14: Concat refuses heterogeneous clips (Day 3-5) — ✅ landed 2026-05-02

### Test specification

**Given** two clips with mismatched fps/resolution/codec,
**When** `stitchClips([a, b], out, { enforce_profile: true })` runs,
**Then** `ProfileMismatchError` is thrown BEFORE any ffmpeg subprocess is spawned (verified via probe-first guard).

### TDD cycle

#### 🔴 Red

```typescript
import { ProfileMismatchError } from "../src/errors";

describe("stitchClips profile guard", () => {
  it("throws ProfileMismatchError on heterogeneous inputs", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "stitch-mismatch-"));
    const ok = join(tmp, "ok.mp4");
    await cutSpan(SOURCE, { t_start: 10, t_end: 13 }, ok);
    // Build a deliberately mismatched clip: 720p instead of 1080p.
    // REVIEW W4: assert the encode succeeded so a failed spawn doesn't
    // mask the real test (file-not-found would throw a different error).
    const bad = join(tmp, "bad.mp4");
    const result = Bun.spawnSync(["ffmpeg", "-i", ok, "-vf", "scale=1280:720", "-c:a", "copy", "-y", bad]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(bad)).toBe(true);
    await expect(stitchClips([ok, bad], join(tmp, "out.mp4"), { enforce_profile: true }))
      .rejects.toThrow(ProfileMismatchError);
  });
});
```

#### 🟢 Green

Add a guard at the top of `stitchClips` that runs `ffprobe` on each input and compares against the canonical profile from `profiles.ts`. Throw `ProfileMismatchError` on first mismatch.

#### 🔵 Refactor

Surface the mismatch detail in the error message (which clip + which dimension diverged).

### Success criteria

**Automated:**
- [ ] Test passes

---

## Behavior 15: OTIO emit → valid FCP7 XML (Day 3-5) — 🟡 wrapper + python script landed; integration skips when WHISPER_VENV unset (operator pip-installs OTIO)

### Test specification

**Given** a span list with a known video_id, t_start, t_end per span,
**When** `spansToFcp7(spans, outpath)` runs (Bun spawning Python venv subprocess),
**Then** `outpath` exists and `xmllint --noout outpath` exits 0, AND grep for `<duration>` finds at least one entry per span.

### TDD cycle

#### 🔴 Red

**File:** `apps/silmari-video/tests/spansToFcp7.test.ts` (new)

```typescript
describe("spansToFcp7", () => {
  it("emits a valid FCP7 XML from a span list", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "otio-"));
    const out = join(tmp, "reel.xml");
    const spans = [
      { source: SOURCE, t_start: 10.0, t_end: 13.0 },
      { source: SOURCE, t_start: 20.0, t_end: 24.0 },
    ];
    await spansToFcp7(spans, out);
    const valid = Bun.spawnSync(["xmllint", "--noout", out]);
    expect(valid.exitCode).toBe(0);
  });
});
```

#### 🟢 Green

**File:** `apps/silmari-video/src/spansToFcp7.ts` (new)

```typescript
import { withTimeout } from "./withTimeout";

export async function spansToFcp7(spans: Span[], out: string): Promise<void> {
  // REVIEW W16: WHISPER_VENV is required because OTIO must be installed in
  // the same venv as WhisperX. System python rarely has OTIO; emit a clear
  // message instead of a cryptic ModuleNotFoundError from the subprocess.
  const venv = process.env.WHISPER_VENV;
  if (!venv) {
    throw new Error(
      "spansToFcp7 requires WHISPER_VENV env var pointing at a Python venv with OTIO installed. " +
        "See vendor/bulk_transcribe_youtube_videos_from_playlist/README.md for venv setup, then `pip install opentimelineio`.",
    );
  }
  const tmp = `${out}.spans.json`;
  await Bun.write(tmp, JSON.stringify(spans));
  const proc = Bun.spawn([
    `${venv}/bin/python`, "apps/silmari-video/scripts/emit_fcp7.py", tmp, out,
  ], { stdout: "pipe", stderr: "pipe" });
  await withTimeout(proc, 60_000, "spansToFcp7");
  if (proc.exitCode !== 0) throw new Error(`OTIO emit failed: exit ${proc.exitCode}`);
}
```

**File:** `apps/silmari-video/scripts/emit_fcp7.py` (new)

```python
import json
import sys
import opentimelineio as otio
from opentimelineio.opentime import RationalTime, TimeRange

spans_path, out_path = sys.argv[1], sys.argv[2]
spans = json.loads(open(spans_path).read())
fps = 30
tl = otio.schema.Timeline(name="silmari-reel")
track = otio.schema.Track(name="V1")
tl.tracks.append(track)
for span in spans:
    start = RationalTime(int(span["t_start"] * fps), fps)
    dur = RationalTime(int((span["t_end"] - span["t_start"]) * fps), fps)
    clip = otio.schema.Clip(
        name=span["source"],
        media_reference=otio.schema.ExternalReference(target_url=f"file://{span['source']}"),
        source_range=TimeRange(start_time=start, duration=dur),
    )
    track.append(clip)
otio.adapters.write_to_file(tl, out_path)
```

#### 🔵 Refactor

Make the FPS configurable; default to 30 to match B11's normalization profile.

### Success criteria

**Automated:**
- [ ] Test passes
- [ ] `xmllint` validates the file

**Manual:**
- [ ] Open the FCP7 XML in DaVinci Resolve / Premiere and confirm clips show on the timeline at the right times

---

## Behavior 15.5: silmari-video CLI orchestrates reel build from a hub (Day 5-6, REVIEW W15) — ✅ landed 2026-05-02 (resolveHub + buildReel + cli.ts; member list is mock-injectable for tests, falls back to `silmari-store list-cards` in production)

### Test specification

**Given** a hub card containing N idea cards, each with a `ref:ev:video=X:t=A-B` label,
**When** `bun apps/silmari-video/src/cli.ts reel --hub <hub-id> --out reel.mp4 --xml reel.xml` runs,
**Then**:
- it resolves the hub members via `br list --label "hub:<hub-id>"` (or whatever the existing hub-membership query is — confirm during implementation against `apps/silmari-mcp/src/lib/hubs.ts`)
- it parses each member's `ref:ev:` label via `parseEvidenceLabel`
- it calls `cutSpan` per member into a temp dir (parallel up to 4)
- it calls `stitchClips({ enforce_profile: true })` to produce `reel.mp4`
- it calls `spansToFcp7` to produce `reel.xml`
- exits 0 on success; non-zero with diagnostic stderr on any subprocess failure

### TDD cycle

#### 🔴 Red

**File:** `apps/silmari-video/tests/cli.test.ts` (new)

```typescript
import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("silmari-video CLI", () => {
  it("builds reel.mp4 + reel.xml from a hub of evidence-labeled cards", () => {
    // Test fixture: a pre-built hub with 2 idea cards carrying ref:ev: labels.
    // Created in beforeAll via SILMARI_DIR override + br save commands.
    const HUB_ID = process.env.TEST_HUB_ID!;
    const tmp = mkdtempSync(join(tmpdir(), "reel-cli-"));
    const r = spawnSync("bun", [
      "apps/silmari-video/src/cli.ts", "reel",
      "--hub", HUB_ID,
      "--out", join(tmp, "reel.mp4"),
      "--xml", join(tmp, "reel.xml"),
    ], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(existsSync(join(tmp, "reel.mp4"))).toBe(true);
    expect(existsSync(join(tmp, "reel.xml"))).toBe(true);
  });

  it("exits non-zero with diagnostic when a hub member has no ref:ev: label", () => {
    const r = spawnSync("bun", ["apps/silmari-video/src/cli.ts", "reel", "--hub", process.env.TEST_HUB_NO_EV_ID!, "--out", "/tmp/x.mp4"], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no ref:ev: label/i);
  });
});
```

A parallel test exists for the bridge CLI: `scripts/kc-baker-pipeline-v2/tests/bridge-cli.test.ts` covering `bun scripts/kc-baker-pipeline-v2/bridge/run.ts --transcript X.json --cards-source cosmic --out segments.json` (REVIEW W14). Same pattern; its Green is `scripts/kc-baker-pipeline-v2/bridge/run.ts` (a thin orchestrator that loads a transcript JSON, iterates cards, calls `bridgeCardToSegment`, writes segments + appends to `unmatched.jsonl`).

#### 🟢 Green

**File:** `apps/silmari-video/src/cli.ts` (new) — thin command-line wrapper that:
1. parses `--hub`, `--out`, `--xml` flags
2. queries hub members via `br list`
3. extracts `ref:ev:` labels with `parseEvidenceLabel`
4. orchestrates `cutSpan` / `stitchClips` / `spansToFcp7`
5. exits with diagnostic stderr on any failure

Wire as a `bun run silmari-video` script in `apps/silmari-video/package.json`.

#### 🔵 Refactor

Extract the hub-resolution step into `resolveHubMembers(hubId): Promise<{id: string, evLabel: EvidenceLabel}[]>` for unit-testability.

### Success criteria

**Automated:**
- [ ] CLI test passes for happy path
- [ ] CLI test passes for missing-label diagnostic
- [ ] Bridge CLI test (`bridge-cli.test.ts`) also lands

---

## Behavior 16: Regression — v2 cascade in `file` mode is byte-identical (Day 6, REVIEW W13) — 🟡 scaffold + masker tests landed 2026-05-02; full diff skips when goldens missing (operator captures from known-good cascade run; existing goldens drifted due to LLM non-determinism, see test header)

### Test specification

**Given** `CASCADE_ACQUIRE_MODE=file` (default) and the existing `tests/fixtures/kc_bakers_words_of_wisdom.txt`,
**When** the cascade is run end-to-end,
**Then** the produced `extracted/<slug>/themes.json`, `ideas.json`, `micros.v2.json`, and `ingest-report.json` are byte-identical to a pre-change golden (modulo timestamp fields, which are masked before diff).

### TDD cycle

#### 🔴 Red

**File:** `scripts/kc-baker-pipeline-v2/tests/regression-file-mode.test.ts` (new)

```typescript
import { describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SLUG = "kc_bakers_words_of_wisdom";
const GOLDEN_DIR = `tests/fixtures/golden/${SLUG}`;

// REVIEW W13: timestamp-mask set must cover ALL volatile keys, not just the
// obvious *_at fields. UUIDs, model versions, file paths with PIDs, image
// hashes, and request IDs all need masking. If B16 fails on a key not listed
// here, audit whether the key is genuinely volatile (add to set) OR whether
// the pipeline acquired non-determinism that should be fixed at source.
const VOLATILE_KEYS = new Set([
  "written_at", "ingested_at", "request_started_at", "completed_at",
  "request_id", "trace_id", "span_id", "session_id",
  "model_version", "model_revision", "build_sha",
  "tmp_path", "scratch_path", "pid", "hostname",
]);
const VOLATILE_VALUE_PATTERNS: Array<RegExp> = [
  /\/tmp\/[a-zA-Z0-9-]+/g,           // tmp paths with random suffixes
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, // UUIDs
];
const stripVolatile = (k: string, v: unknown) => {
  if (VOLATILE_KEYS.has(k)) return "<masked>";
  if (typeof v === "string") {
    let out = v;
    for (const pat of VOLATILE_VALUE_PATTERNS) out = out.replace(pat, "<masked>");
    return out;
  }
  return v;
};

describe("regression: v2 cascade in file mode", () => {
  it("produces byte-identical (modulo timestamps) output to golden", () => {
    execSync(`CASCADE_ACQUIRE_MODE=file TARGET_TRANSCRIPT=${SLUG}.txt bash scripts/kc-baker-pipeline-v2/run.sh`);
    for (const stage of ["themes.json", "ideas.json", "micros.v2.json", "ingest-report.json"]) {
      const actual = JSON.parse(readFileSync(`extracted/${SLUG}/${stage}`, "utf8"));
      const expected = JSON.parse(readFileSync(`${GOLDEN_DIR}/${stage}`, "utf8"));
      expect(JSON.stringify(actual, stripVolatile, 2))
        .toBe(JSON.stringify(expected, stripVolatile, 2));
    }
  });
});
```

#### 🟢 Green

If the prior 15 behaviors did not touch the `file` mode code path, this test should pass on first run. Capture the goldens from a known-good `main` commit before any of B1-B15 land — pin them in `tests/fixtures/golden/<slug>/` as commit-tracked fixtures.

#### 🔵 Refactor

If goldens drift between Bun versions, document the cause and re-pin.

### Success criteria

**Automated:**
- [ ] Test passes — confirms zero regression on the existing pre-extracted-text path

**Manual:**
- [ ] Operator confirms goldens were captured from `main` commit (pre-B1) and pinned with a marker commit

---

## Behavior 17: Viewer renders "Play moment" button on cards with `ref:ev:` labels (Day 6, REVIEW W5) — ✅ landed 2026-05-02 (render fn + tests + index.html `<script type=\"module\">` + Alpine x-html injection in label area)

### Test specification

**Given** an idea card whose label set includes a `ref:ev:video=X:t=A-B` label,
**When** the viewer renders that card,
**Then** a `<button class="play-moment">` is present with text `▶ Play moment` and an `href` attribute (or click handler) pointing at `https://youtu.be/<X>?t=<floor(A)>` (YouTube only accepts integer-second timecodes for the `t` query param).

**Given** an idea card with NO `ref:ev:` label,
**When** rendered,
**Then** no `play-moment` button is present (graceful degradation per REVIEW W12 — pre-bridge cards stay clean).

### TDD cycle

#### 🔴 Red

**File:** `apps/silmari-memory-card-viewer/tests/play-moment-button.test.ts` (new — uses Bun's HTTP test pattern matching the existing viewer test convention; if no test infra exists yet, this test file IS the new convention)

```typescript
import { describe, it, expect } from "bun:test";

// renderCardActions is the new pure function added to viewer_assets/cardActions.js
// (declared as a module so Bun can import it; the existing in-browser globals
// are wrapped via globalThis assignment for backward compat).
import { renderCardActions } from "../viewer_assets/cardActions";

describe("Play moment button", () => {
  it("renders the button when card has a ref:ev: label", () => {
    const card = {
      id: "zk-001",
      labels: ["kind:idea", "fz:5/3", "ref:ev:video=dQw4w9WgXcQ:t=42.130-67.550"],
    };
    const html = renderCardActions(card);
    expect(html).toContain('class="play-moment"');
    expect(html).toContain("▶ Play moment");
    expect(html).toContain("https://youtu.be/dQw4w9WgXcQ?t=42");
  });

  it("hides the button when card has no ref:ev: label", () => {
    const card = { id: "zk-002", labels: ["kind:idea", "fz:5/4"] };
    const html = renderCardActions(card);
    expect(html).not.toContain("play-moment");
  });

  it("uses floor(t_start) for the YouTube timecode (integer seconds only)", () => {
    const card = { id: "zk-003", labels: ["ref:ev:video=abc:t=42.999-50.000"] };
    const html = renderCardActions(card);
    expect(html).toContain("?t=42");      // floor(42.999), not 43
    expect(html).not.toContain("?t=43");
  });
});
```

#### 🟢 Green

**File:** `apps/silmari-memory-card-viewer/viewer_assets/cardActions.js` (new)

```javascript
// Pure render fn — also exported to globalThis for in-browser Alpine.js consumption.
export function renderCardActions(card) {
  const evLabel = (card.labels || []).find((l) => /^ref:ev:video=/.test(l));
  if (!evLabel) return "";
  const m = evLabel.match(/^ref:ev:video=([^:]+):t=(\d+\.\d{3})-\d+\.\d{3}$/);
  if (!m) return "";
  const [, videoId, tStart] = m;
  const seconds = Math.floor(parseFloat(tStart));
  const url = `https://youtu.be/${videoId}?t=${seconds}`;
  return `<button class="play-moment" onclick="window.open('${url}', '_blank')">▶ Play moment</button>`;
}

if (typeof globalThis !== "undefined") {
  globalThis.SilmariCardActions = { renderCardActions };
}
```

Then wire `SilmariCardActions.renderCardActions(card)` into the existing card render template in `viewer_assets/index.html` (insert near the existing label-list render).

#### 🔵 Refactor

If the viewer eventually needs in-page playback (vs. opening YouTube), swap the button onclick for an embedded `<iframe>` modal — keep the API stable.

### Success criteria

**Automated:**
- [ ] All three unit tests pass
- [ ] `bun test apps/silmari-memory-card-viewer/tests/play-moment-button.test.ts` exits 0

**Manual:**
- [ ] Open the viewer at `localhost:8788`, find an idea card with a `ref:ev:` label, click the button, verify YouTube opens at the right second
- [ ] Cards without `ref:ev:` labels show no extra UI (no broken button, no console error)

---

## Integration & E2E testing

### Cross-behavior integration

After all 18 behaviors (B0 + B1–B17) are 🟢 Green, run a full end-to-end smoke test on one talk:

1. Verify B0 switch: `CASCADE_ACQUIRE_MODE=file bash run.sh --dry-run` exits 0
2. Pull `videos/kc_bakers_words_of_wisdom.mp4` (already on disk via B2)
3. Run the extended transcriber: produces `<slug>.json` with word arrays (B3) + WhisperX-aligned + VAD-snapped (B6, B7)
4. Run the cascade Pass 1 → Commit (unchanged from today; idea cards saved per `cascade-import-writer.ts`)
5. Run the bridge CLI (`bun scripts/kc-baker-pipeline-v2/bridge/run.ts --transcript <slug>.json --cards-source v2 --out segments.json`): produces `transcripts/<slug>.segments.json` + appends `ref:ev:` labels to **idea** cards via `row.labels` (B8, B9, B10) — biblio cards unchanged
6. Pick one idea card, parse its `ref:ev:` label, call `cutSpan` on its span: produces a normalized clip (B11)
7. Pick a hub of 3 idea cards, run the silmari-video CLI (`bun apps/silmari-video/src/cli.ts reel --hub <id> --out reel.mp4 --xml reel.xml`): produces both reel.mp4 (via stitchClips, B13) and reel.xml (via spansToFcp7, B15) in one orchestrated call (B15.5)
8. Open the viewer at `localhost:8788`, find one of the bridged idea cards, click its "Play moment" button (B17): YouTube opens at `floor(t_start)`
9. Run B16 regression: confirms zero file-mode breakage with the expanded volatile-key mask

**Estimated wall-clock for end-to-end:** ~15–25 min on the GPU runner (transcribe ~3 min, cascade ~5 min, bridge ~30s, edit ~5 min for a 10-clip reel).

**Estimated wall-clock for end-to-end:** ~15–25 min on the GPU runner (transcribe ~3 min, cascade ~5 min, bridge ~30s, edit ~5 min for a 10-clip reel).

---

## Beads Issue Tracking

### Step 4.5 actions (per command spec)

```bash
bd ready                 # confirm no in-flight issue collides
bd create \
  --title="Video pipeline MVP — extend bulk_transcriber + bridge + edit module" \
  --description="Implements 18 behaviors (B0 + B1–B17, including B15.5 CLI) per thoughts/searchable/shared/plans/2026-05-02-18-23-tdd-video-pipeline-mvp-extend-bulk-transcriber.md (research base: thoughts/searchable/shared/research/2026-05-02-video-transcript-cut-splice-stitch-pipeline.md). Plan was reviewed and amended to address 3 critical (REVIEW C1/C2/C3) + 8 warning issues — see -REVIEW.md for the original findings and the amendment commit history." \
  --type=feature \
  --priority=2 \
  --acceptance="All 18 behaviors land 🟢 Green; B16 regression passes with expanded volatile-key mask; manual smoke test produces a reel via B15.5 CLI; Day-0 API key rotation confirmed by operator; B17 viewer button verified manually"
```

**Day-0 dependency tasks (file as separate priority-0 tasks; use `bd dep add` to make the feature issue depend on each):**

1. **Operator: rotate the previously-exposed OpenAI API key** in the dashboard before B1 lands.
2. **Operator: publish the bulk_transcriber to a git remote OR commit to a `file://` submodule URL** (REVIEW W6 — B2 pre-step). Record the chosen URL via `bd update <id> --notes`.
3. **Operator: capture B6 alignment golden** by running WhisperX once on `10s_speech.wav`, eyeballing the boundaries in Audacity, and committing `tests/fixtures/golden/10s_speech__words_aligned_golden.json`.
4. **Operator: commit `tests/fixtures/SOURCE_PROFILE.md`** documenting the locked normalization profile of `kc_bakers_words_of_wisdom.mp4` (REVIEW W3).
5. **Pre-B16: capture the cascade goldens** from the current `main` commit (before any B0–B15 lands) and pin in `tests/fixtures/golden/<slug>/`.

---

## Success criteria — overall

**Automated:**
- [ ] All 18 behavior test files pass:
  - TS side: `bun test scripts/kc-baker-pipeline-v2/tests/ apps/silmari-video/tests/ apps/silmari-memory-card-viewer/tests/`
  - Python side: `pytest vendor/bulk_transcribe_youtube_videos_from_playlist/tests/`
- [ ] B0: `CASCADE_ACQUIRE_MODE` switch is wired into `run.sh` (5 unit tests for file/url/playlist/unset/bogus)
- [ ] B6: F1 @ 50ms tolerance ≥ 0.79 (research-canonical metric, REVIEW C3)
- [ ] B10: idea cards (NOT biblio cards) carry `ref:ev:` labels with 3-decimal precision; verified via `br list --label "ref:ev:" --box idea --json`
- [ ] B16: regression byte-identical to pre-B0 golden with the expanded `VOLATILE_KEYS` + value-pattern mask
- [ ] B17: viewer renders Play-moment button only on cards with `ref:ev:` label; uses `floor(t_start)` for YouTube timecode
- [ ] Lint + typecheck: `bunx tsc --noEmit` (TS) + `ruff check vendor/bulk_transcribe_youtube_videos_from_playlist/` (Python)
- [ ] Subprocess timeout helper (`withTimeout`) wraps every `Bun.spawn` in B11/B13/B14/B15/B15.5

**Manual:**
- [ ] Day-0 API-key rotation confirmed in OpenAI dashboard (B1)
- [ ] Submodule URL chosen, recorded via `bd update --notes`, pin reviewed (B2 pre-step, REVIEW W6)
- [ ] `tests/fixtures/SOURCE_PROFILE.md` committed (REVIEW W3)
- [ ] B6 alignment golden captured + committed (Day-0 dependency)
- [ ] B16 cascade goldens captured from pre-B0 `main` commit + pinned
- [ ] One end-to-end smoke run via the B15.5 CLI produces a 30-second reel from 3 cards
- [ ] FCP7 XML opens in DaVinci/Premiere and shows the right clips at the right times
- [ ] Viewer "Play moment" button opens YouTube at the correct second; absent on cards without `ref:ev:` (graceful degradation, REVIEW W12)
- [ ] All 8 REVIEW warnings (W1–W18 numbering — only ones with material code change: W1/W2/W3/W4/W5/W9/W10/W13/W14/W15/W16/W17/W18) verified addressed in the merged plan

---

## References

- **Research:** `thoughts/searchable/shared/research/2026-05-02-video-transcript-cut-splice-stitch-pipeline.md`
- **PRD:** `MEMORY/WORK/20260502-110000_research-video-transcript-cut-splice-stitch-pipeline/PRD.md`
- **REVIEW (this plan's pre-impl review):** `thoughts/searchable/shared/plans/2026-05-02-18-23-tdd-video-pipeline-mvp-extend-bulk-transcriber-REVIEW.md`
- **Existing transcriber:** `~/Dev/bulk_transcribe_youtube_videos_from_playlist/bulk_transcribe_youtube_videos_from_playlist.py`
- **v2 cascade test convention:** `scripts/kc-baker-pipeline-v2/tests/atomicity.test.ts:1-60`
- **v1 biblio creation site (B10 source-of-truth for biblio):** `scripts/kc-baker-pipeline/ingest.ts:96-101`
- **v2 cascade idea-import row.labels channel (B10 integration point):** `scripts/kc-baker-pipeline-v2/ingest/cascade-import-plan.ts:79`
- **v2 cascade idea-card writer (passes row.labels through unchanged):** `scripts/kc-baker-pipeline-v2/ingest/cascade-import-writer.ts:268-275`
- **Canonical biblio writer (library):** `apps/silmari-mcp/src/lib/biblio.ts:108-128` (`addBiblioCard`)
- **card-ops.SaveCardOpts (extraLabels channel):** `apps/silmari-mcp/src/lib/card-ops.ts:227` (idea), `card-ops.ts:250` (biblio)
- **Existing label namespaces:** `apps/silmari-mcp/src/lib/labels.ts:28-42` (`LABEL_PREFIX`)
- **Pipeline README:** `scripts/kc-baker-pipeline-v2/README.md`
- **Memory: beads_rust dep whitelist:** `MEMORY.md` `project_beads_rust_dep_whitelist.md` (the precedent for label-encoding)
- **Memory: no embeddings:** `MEMORY.md` `feedback_zettelkasten_no_embeddings.md` (the framework invariant)

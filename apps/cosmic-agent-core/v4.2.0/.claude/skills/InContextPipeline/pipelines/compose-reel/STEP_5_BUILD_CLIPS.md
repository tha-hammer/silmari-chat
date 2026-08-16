# STEP 5 — Build clips

For each card in `passthrough.selected_card_ids`, derive a `Clip` object — the deterministic mapping from a card_id to `{ video_id, t_start, t_end, source_path, ... }`. This is NOT LLM work; the arithmetic must be exact, and `kasten-cli build-clip` is the canonical tool.

For each card:

```bash
bun apps/video-pipeline/reel/kasten-cli.ts build-clip \
  --card <card_id> \
  --store <store_name> \
  --corpus-root <corpus_root> \
  --transcript-dir <transcript_dir> \
  --project-root <project_root>
```

Outcomes:
- `{ "outcome": "clip", "clip": { card_id, fz_address, source, video_id, t_start, t_end, evidence_confidence, rationale, source_path } }` → append `clip` to a running list
- `{ "outcome": "error", "envelope": { "code": "NO_REF_EV_LABEL", ... } }` → the card has no `ref:ev:` label, skip it and note in a warning
- `{ "outcome": "error", "envelope": { "code": "MEDIA_VIDEO_NOT_FOUND", ... } }` → the source `.mp4` is missing under `<project_root>/media/videos/<video_id>.mp4`; skip

After processing every selected card, you have the `clips` array. Note that `Clip` has NO `duration_s` field — derive on the fly only when needed (`t_end - t_start`).

If after this step `clips` is empty, surface this clearly in your walk_rationale carry-over and proceed to STEP 6 — `assemblePlan` will set `status: "fail"` and write a fail plan that STEP 7 will surface to the user.

---
RUNTIME: Read `passthrough.selected_card_ids`. Resolve the store name from `--store`, then `ZK_STORE_NAME`, then `default`. The transcript directory, project root, and corpus root must be known from setup; source media uses `--corpus-root` or `COSMIC_MEDIA_SOURCE_ROOT` and is never derived from store identity. If unsure, ask the user. First write a short human-readable **markdown summary** for the user: a `### ✅` heading naming this step and what it found (e.g. `### ✅ STEP 2 of 6 — Discovered hubs`), 1-3 lines describing the result using card/hub **titles** (never bare `zk-…` ids), and — unless this is the final render step — a closing line `→ Send \`go\` to continue.` THEN, on its own line below the summary, emit the machine marker (the broker parses it from the transcript; the user only sees the markdown above) wrapped EXACTLY as `<PIPELINE_STEP_OUTPUT>{ ... }</PIPELINE_STEP_OUTPUT>` with keys: `clips` (array of Clip objects from kasten-cli build-clip).

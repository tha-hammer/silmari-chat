# STEP 7 — Render the reel

You have `passthrough.plan_path` from STEP 6. Now render the `.mp4` via the composed-plan render path (`A_REEL_RENDER_COMPOSED`, surfaced as `composeSlashBridge --mode accept`):

```bash
bun apps/video-pipeline/reel/lib/composeSlashBridge.ts \
  --mode accept \
  --plan-path <passthrough.plan_path> \
  --project-root <repo>
```

This is the SAME render path the revise/swap-clip flow uses (Phase 2 S4) when the user accepts a revised plan. It runs `renderComposedPlan` under the hood, which uses ffmpeg to stitch the clips. Scratch files live under `<outdir>/.scratch` and are cleaned up on success.

Outcomes:
- `{ "outcome": "rendered", "reel_path": "<...>.mp4", "duration_s": <number>, ... }` → success
- `{ "outcome": "render-failed", "envelope": { "code": "RENDER_FFMPEG_FAILED", ... } }` → ffmpeg failure (scratch preserved for debug)
- `{ "outcome": "error", "envelope": { ... } }` → other domain failures (plan not found, schema mismatch)

Do NOT use `A_REEL_RENDER` (that's the older reel-plan renderer; this pipeline writes `compose-p3` ComposedPlans which only `A_REEL_RENDER_COMPOSED` understands).

---
RUNTIME: Read `passthrough.plan_path`. Invoke `composeSlashBridge --mode accept --plan-path <plan_path> --project-root <project_root>` (the project-root is the user workspace where `/compose_reel` was invoked — equal to `$COSMIC_PROJECT_ROOT` when set, NOT the source-code repo on disk). First write a short human-readable **markdown summary** for the user: a `### ✅` heading naming this step and what it found (e.g. `### ✅ STEP 2 of 6 — Discovered hubs`), 1-3 lines describing the result using card/hub **titles** (never bare `zk-…` ids), and — unless this is the final render step — a closing line `→ Send \`go\` to continue.` THEN, on its own line below the summary, emit the machine marker (the broker parses it from the transcript; the user only sees the markdown above) wrapped EXACTLY as `<PIPELINE_STEP_OUTPUT>{ ... }</PIPELINE_STEP_OUTPUT>` with keys: `reel_path` (string — absolute path to the rendered .mp4), `duration_s` (number — the actual rendered duration). After this phase the pipeline reaches COMPLETE — summarize the reel for the user (path, duration, clip count, hub regions touched).

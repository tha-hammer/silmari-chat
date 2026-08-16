# STEP 6 — Assemble + write the ComposedPlan

You have everything you need in `passthrough` to construct a complete `ComposedPlan`:
`brief`, `duration_target_s`, `semantic_seed`, `tone`, `walk_shape_hint`, `seed_card_ids`, `selected_card_ids`, `walk_rationale`, `clips`, and optionally `truncated` + `truncated_reason`.

The deterministic assembler `assemblePlan()` (in `apps/video-pipeline/reel/composeReel/assemblePlan.ts`) handles the mapping with fixed defaults for `platform`, `pacing`, `cross_video`, `intro`, `outro`, `transitions`, etc. It also:
- Normalizes `walk_shape_hint` ("linear" | "branches" | "mixed") to the schema's `WalkShape` enum ("linear-follows" | "branches-explore" | "mixed").
- Uses `pacing: "natural"` (valid `Pacing` enum value).
- Sets `compose_mode: "zk-native"`.
- Sets `status: "fail"` on zero clips, `status: "warn"` on truncated walk, `status: "pass"` otherwise.

**Use this idiom** in your turn:

1. Build a `ComposeReelPassthroughV1` object from the accumulated `passthrough` fields. Add `passthrough_schema_version: "compose-reel-v1"`.
2. Call `assemblePlan()` to produce a `ComposedPlan`. You can do this in a one-off bun script invocation:

   ```bash
   bun -e 'const { assemblePlan } = await import("./apps/video-pipeline/reel/composeReel/assemblePlan"); const p = '"'"'{...JSON of ComposeReelPassthroughV1...}'"'"'; console.log(JSON.stringify(assemblePlan(JSON.parse(p))));'
   ```

   Or invoke `assemblePlan` from a small inline script.

3. Pass the resulting `ComposedPlan` JSON to `kasten-cli write-plan --spec '<json>' --out <path>`. This validates against `validateComposedPlanP3` (structural) + `assertSchemaP3` (version) and writes the file.

   The `--out` path convention is `out/composed-plans/<iso>.json` if you omit it; pass an explicit `--out` to control the destination.

```bash
bun apps/video-pipeline/reel/kasten-cli.ts write-plan \
  --spec '<assembled-plan-json>' \
  --out out/composed-plans/compose-reel-$(date +%s).json
```

Expected output:
- `{ "outcome": "plan-written", "plan_path": "out/composed-plans/..." }` → success
- `{ "outcome": "error", "envelope": { "code": "COMPOSED_PLAN_STRUCTURAL_INVALID", "detail": { "missing_fields": [...] } } }` → the assembler missed a field; check `assemblePlan.ts`

---
RUNTIME: Read `passthrough.brief`, `passthrough.duration_target_s`, `passthrough.semantic_seed`, `passthrough.tone`, `passthrough.walk_shape_hint`, `passthrough.seed_card_ids`, `passthrough.selected_card_ids`, `passthrough.walk_rationale`, `passthrough.clips`, optionally `passthrough.truncated` + `passthrough.truncated_reason`. Construct `ComposeReelPassthroughV1`, run `assemblePlan`, then `kasten-cli write-plan --spec <assembled-json>`. First write a short human-readable **markdown summary** for the user: a `### ✅` heading naming this step and what it found (e.g. `### ✅ STEP 2 of 6 — Discovered hubs`), 1-3 lines describing the result using card/hub **titles** (never bare `zk-…` ids), and — unless this is the final render step — a closing line `→ Send \`go\` to continue.` THEN, on its own line below the summary, emit the machine marker (the broker parses it from the transcript; the user only sees the markdown above) wrapped EXACTLY as `<PIPELINE_STEP_OUTPUT>{ ... }</PIPELINE_STEP_OUTPUT>` with keys: `plan_path` (string — the file path on disk where the plan was written).

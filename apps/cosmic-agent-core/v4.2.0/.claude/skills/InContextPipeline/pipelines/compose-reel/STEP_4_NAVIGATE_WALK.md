# STEP 4 — Navigate the walk

You are composing a video reel by walking the Zettelkasten. Cards are linked by Folgezettel (chain addresses like `1/19a/3b`) and grouped by Übersichten (topic-overview hub cards under `1/19*`).

Starting from `passthrough.seed_card_ids`, walk cards picking the next clip by reading prose. Stop when one of:
- total clip duration ≥ `passthrough.duration_target_s`
- you've made **20 hops this turn** (the hard cap — see truncation below)

This step runs as ONE turn. No multi-turn continuation — if the hop budget exhausts before the duration is filled, emit `truncated: true` + `truncated_reason: "hop_budget_exhausted"` and proceed with the walk you have. The user sees a `status: "warn"` on the resulting plan and can re-compose with a smaller `duration_target_s` for a complete walk.

**Per-hop loop** (max 20 total hops):

1. Call the navigation surface for the current card:
   ```bash
   bun apps/video-pipeline/reel/lib/composeSlashBridge.ts \
     --mode navigation-by-card \
     --card-id <current> \
     --store <store_name> \
     --project-root <project_root>
   ```

2. The response is:
   ```json
   {
     "outcome": "navigation-surface",
     "card_id": "<current>",
     "surface": {
       "current":            { card_id, fz_address, video_id, title, brief_excerpt },
       "folgezettel":        { continuation: [...], branches: [...] },
       "uebersichten":       [{ hub_id, hub_title, hub_body_markdown, member_count, distinct_videos, fz_address }],
       "schlagwortregister": [{ term, entry_point_count, sample_entry_points: [...] }]
     },
     "zk_brief": "..."
   }
   ```

3. Read `surface.uebersichten[].hub_body_markdown` (the curator's prose). Identify the next card by reasoning about `passthrough.brief` + `passthrough.tone` + `passthrough.walk_shape_hint`:
   - `walk_shape_hint === "linear"` → prefer `surface.folgezettel.continuation` (same chain of thought)
   - `walk_shape_hint === "branches"` or `"mixed"` → prefer a cross-video move from `surface.uebersichten` (different angle on the topic) or `surface.schlagwortregister.sample_entry_points`

4. Append the picked card_id to a running `selected_card_ids` list (start with the seed itself).

Continue until duration or hop budget is met.

**Cross-video preference**: when picking, prefer cards from a different `video_id` than the previous clip — this is the navigation doctrine in `zk_brief`. Same-video siblings via `folgezettel.continuation` are fine for linear walks; cross-video via `uebersichten` is preferred for branches/mixed.

---
RUNTIME: Read `passthrough.seed_card_ids`, `passthrough.duration_target_s`, `passthrough.brief`, `passthrough.tone`, `passthrough.walk_shape_hint`, `passthrough.candidate_hubs`. Resolve the store from `--store`, then `ZK_STORE_NAME`, then `default`. Loop hops via `bun composeSlashBridge.ts --mode navigation-by-card --card-id <current> --store <store_name> --project-root <project_root>`. First write a short human-readable **markdown summary** for the user: a `### ✅` heading naming this step and what it found (e.g. `### ✅ STEP 2 of 6 — Discovered hubs`), 1-3 lines describing the result using card/hub **titles** (never bare `zk-…` ids), and — unless this is the final render step — a closing line `→ Send \`go\` to continue.` THEN, on its own line below the summary, emit the machine marker (the broker parses it from the transcript; the user only sees the markdown above) wrapped EXACTLY as `<PIPELINE_STEP_OUTPUT>{ ... }</PIPELINE_STEP_OUTPUT>` with keys: `selected_card_ids` (array of strings in walk order, starting with the seed), `walk_rationale` (string, 2-3 sentences explaining the narrative arc), `truncated` (boolean, default false), `truncated_reason` (string, only present when truncated=true — value `"hop_budget_exhausted"`).

# STEP 3 — Pick seed card(s) for the walk

You have a list of `candidate_cards` from STEP 2 (member cards of the relevant Übersichten, plus keyword search hits). Now pick 1-3 **seed cards** that will anchor the walk.

A good seed:
- Sits in a hub the user's brief speaks directly to (re-read the hub bodies from STEP 2 if needed)
- Has a strong opening idea — read the card's body prose. The body for each card is JSON-wrapped:

```sql
SELECT id, title, json_extract(body, '$.body') AS body_md
FROM cards
WHERE id IN ('zk-1234', 'zk-1411', 'zk-1556');  -- your candidates
```

- For a "linear" `walk_shape_hint`, prefer one seed (one story arc)
- For "branches" or "mixed", prefer 2-3 seeds (multiple perspectives)

Read the candidate card bodies via the SQL above. Pick by judgment, not by score.

---
RUNTIME: Read `passthrough.candidate_cards`, `passthrough.brief`, `passthrough.semantic_seed`, `passthrough.walk_shape_hint`, `passthrough.candidate_hubs`. Use `bash sqlite3` to read card bodies. First write a short human-readable **markdown summary** for the user: a `### ✅` heading naming this step and what it found (e.g. `### ✅ STEP 2 of 6 — Discovered hubs`), 1-3 lines describing the result using card/hub **titles** (never bare `zk-…` ids), and — unless this is the final render step — a closing line `→ Send \`go\` to continue.` THEN, on its own line below the summary, emit the machine marker (the broker parses it from the transcript; the user only sees the markdown above) wrapped EXACTLY as `<PIPELINE_STEP_OUTPUT>{ ... }</PIPELINE_STEP_OUTPUT>` with keys: `seed_card_ids` (array of 1-3 card_ids, in the order you intend the walk to start).

# STEP 2 — Discover topic-overview hubs (Übersichten)

You are reading a Zettelkasten — a knowledge corpus organized using Niklas Luhmann's method. The kasten has three navigation primitives:

- **Folgezettel** (chain addresses like `1/19a`) — spatial neighborhoods
- **Übersichtszettel** ("Übersichten" / hub Zettel) — curated topic-overview cards. Each carries 5-8 KB of prose synthesizing a region of the corpus.
- **Schlagwortregister** (keyword index) — inverted index from terms to cards

This step pulls all 17 topic-overview hubs into your context. They live at `fz_address` starting `1/19` and have `kind='hub'`. Read their bodies — they're the curator's prose telling you which sub-themes exist in each region.

**Use the named Kasten read surface.** Resolve the store from `--store`, then
`ZK_STORE_NAME`, then `default`:

```bash
bun apps/video-pipeline/reel/kasten-cli.ts hubs \
  --store <store_name>

# Tokenize semantic_seed; run once per token.
bun apps/video-pipeline/reel/kasten-cli.ts keyword \
  --store <store_name> \
  --term <semantic_seed_token> \
  --limit 10
```

Read the hub bodies. Identify the 2-4 hubs whose prose most closely matches `passthrough.semantic_seed` and `passthrough.brief`. Note their `id`s (`zk-...` strings) as your `candidate_hubs`.

For each candidate hub, list the member card_ids the hub body's prose names under its sub-themes. These become `candidate_cards`. Also include cards surfaced by the keyword search where they aren't already in the hub members.

---
RUNTIME: Read `passthrough.brief`, `passthrough.semantic_seed`, `passthrough.tone`. Use the Kasten `hubs` and `keyword` commands above with the same named store; do not inspect the database directly. If the store name is unclear, use `ZK_STORE_NAME` or `default`. First write a short human-readable **markdown summary** for the user: a `### ✅` heading naming this step and what it found (e.g. `### ✅ STEP 2 of 6 — Discovered hubs`), 1-3 lines describing the result using card/hub **titles** (never bare `zk-…` ids), and — unless this is the final render step — a closing line `→ Send \`go\` to continue.` THEN, on its own line below the summary, emit the machine marker (the broker parses it from the transcript; the user only sees the markdown above) wrapped EXACTLY as `<PIPELINE_STEP_OUTPUT>{ ... }</PIPELINE_STEP_OUTPUT>` with keys: `candidate_hubs` (array of hub card_ids), `candidate_cards` (array of member card_ids gathered across the hubs + keyword hits).

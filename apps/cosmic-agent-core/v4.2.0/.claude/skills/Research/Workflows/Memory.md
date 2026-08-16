# Memory Integration — Zettel for the Research Skill

**Purpose:** make Research compounding instead of amnesiac. Each invocation should *read what you already know* before launching agents, and *write what's new* when finished, so the next research run starts from prior context instead of a blank slate.

**Mechanism:** the `zettel` CLI (installed at `~/.local/bin/zettel` by the cosmic-agent-memory installer) talks to the cosmic-agent-memory engine over HTTP at `localhost:8787`. It exposes save/recall/link/hub verbs that follow Zettelkasten methodology — atomic notes, source tags as provenance, folgezettel chains for branching, hubs for navigable canon.

**Two mandatory integration points + one optional**, mirroring how the Algorithm integrates Zettel.

---

## Valid dependency edge types (CRITICAL reference)

**`br` 0.1.36 validates dep types against a fixed list.** Using any other string — no matter how semantically meaningful — returns a validation error (`br dep add`) or a 503 (through `zettel link` / engine `brDepAdd`, which silently swallows the error and returns false). The engine does NOT log a warning, so the failure mode is invisible unless you check return values.

**Allowed types in this engine version:**

| Type | When to use in Research |
|---|---|
| `discovered-from` | Entity profiles, summaries, themes — "this bead was discovered while working on {target}" — the target is typically the landscape or hub. This is also what the engine's auto-interlink for topic-hub uses. |
| `relates-to` | Weak generic relation. Use for finding-to-existing-finding reinforcement, cross-topic bridges, and the engine's Jaccard auto-interlink. |
| `related` | Even weaker — chronological "previous bead in scope". Engine auto-interlink, usually not set manually. |
| `supersedes` | When a new bead replaces an old one (e.g., updated entity profile). Sets `supersededBy` on read. |
| `duplicates` | When two beads cover the same content — prefer `zettel save` dedup (content-hash) over this. |
| `blocks` / `parent-child` / `conditional-blocks` / `waits-for` | Task-tracker semantics. Not relevant to Research. |
| `replies-to` / `caused-by` | Not used by Research. |

**Types that LOOK right but are NOT valid (common mistakes):**

- ❌ `derived-from` — use `discovered-from` instead (same semantic, actually valid)
- ❌ `reinforces` — use `relates-to` instead
- ❌ `extends` / `elaborates` / `cites` — use `relates-to` instead
- ❌ `supported-by` / `contradicts` — no direct support; use `relates-to` and note the relationship in the bead body

**Rule of thumb:** if the semantic you want isn't in the allowed list, default to `relates-to` and encode the nuance in the bead content. A weaker-but-valid edge is strictly better than a stronger-but-rejected edge that silently drops.

---

## Zettelkasten conventions for Research

Research beads follow the standard Zettelkasten pattern. **One library, source-tagged.**

| Convention | Value | Why |
|---|---|---|
| **Scope** | default (inherits from `$ZETTEL_SCOPE` env var, fallback `primary`) | One interconnected library is the whole point of Zettelkasten — siloed scopes defeat cross-topic discovery |
| **Source tag** | `research-{topic-slug}-{phase}` | Provenance lives in the source tag, not the scope. `topic-slug` is kebab-case of the user's topic. `phase` is `landscape`, `entity-{name}`, `summary`, or `finding` |
| **Type** | `fact` for landscape & profiles, `learning` for synthesis, `signal` for surprising/contrarian findings, `preference` for user-revealed preferences | Same type discipline as the Algorithm's LEARN phase |
| **Hub** | `zettel hub topic-hub "research-{topic-slug}"` | One hub per topic. All landscape/entity/summary beads link into it. Hubs become navigable canon over time. |
| **Chain** | use `--fork` when drilling into a sub-aspect of a larger investigation, `--root` for an unrelated new topic, default for chronological extension | Folgezettel chain shape mirrors the research narrative |

**Topic-slug rules:** lowercase, hyphen-separated, no special chars. Examples:
- "AI agent market" → `ai-agent-market`
- "post-quantum cryptography vendors" → `post-quantum-crypto-vendors`
- "Tyler Cowen" → `tyler-cowen`

---

## Integration point 1 — RECALL at workflow entry (MANDATORY)

**Run BEFORE launching any researcher agents.** This is the highest-value memory hook because it prevents re-research and surfaces the existing graph.

```bash
zettel recall "{topic keywords, 4-8 words}" -l 5 -d connected
```

**Surface results as:**

```
🧠 PRIOR RESEARCH:
  • {br-id} ({source-tag}, {time-ago}) — {first 80 chars of content}
  • {br-id} ({source-tag}, {time-ago}) — {first 80 chars of content}
```

If `recall` returns zero results, write `🧠 PRIOR RESEARCH: none` and continue.

**Classifier — what to do with the hits.** For each hit, check the source tag:

| Source tag pattern | Meaning | Action |
|---|---|---|
| `research-{same-slug}-landscape` | We've done landscape research on this exact topic before | **PAUSE and ask:** "Found prior landscape research on {topic} from {date}. Refresh (build on prior + add new), Resume (read prior vault, continue where it left off), or Fresh (ignore prior)? [refresh/resume/fresh]" |
| `research-{adjacent-slug}-*` | We've researched a related topic | Surface as context but continue. Use as a prior in agent prompts: "Already known from prior research on {adjacent-topic}: …" |
| Unrelated source tag (non-research) | Coincidental keyword match from another domain | Ignore unless directly relevant |

**The user's response determines the next step:**

- **refresh** → keep all prior beads, run a fresh research cycle, link new beads to old via `relates-to`
- **resume** → read the prior vault from filesystem if it exists, OR reconstruct from beads via `zettel raw GET /v1/memory/trace?id={landscape-bead-id}`, then continue from where coverage gates failed
- **fresh** → run as if no prior research existed; new beads will live in their own folgezettel branch but still in the same library

**This is one of the few places the Research skill explicitly waits for user input.** Refresh-vs-resume-vs-fresh is too important to autopilot.

---

## Integration point 2 — SAVE at workflow exit (MANDATORY)

**Run AFTER research completes**, before final delivery to the user. The goal is to make the *next* research invocation on this topic (or an adjacent one) better.

### Save order

1. **Topic hub first** (idempotent — creates if missing, returns existing id otherwise):
   ```bash
   HUB_ID=$(zettel hub topic-hub "research-{topic-slug}" | jq -r '.id')
   ```

2. **Landscape synthesis** as a `fact` bead:
   ```bash
   LANDSCAPE_ID=$(zettel save "{2-3 paragraph landscape summary, full text}" \
     -t fact -S "research-{topic-slug}-landscape" --status open | jq -r '.id')
   ```
   The save path stores the FULL body in `description.body` (post-2026-04-07 fix). Don't pre-truncate — let recall return the full text on the next run.

3. **Each entity profile** as a `fact` bead, linked to the landscape:
   ```bash
   for entity in "${ENTITIES[@]}"; do
     ENTITY_ID=$(zettel save "{full profile content}" \
       -t fact -S "research-{topic-slug}-entity-{slug}" --status open | jq -r '.id')
     zettel link "$ENTITY_ID" "$LANDSCAPE_ID" discovered-from
   done
   ```
   Auto-interlink edges (`related` to last bead in scope, `discovered-from` to topic hub, `relates-to` via Jaccard similarity) are added by the engine on save — you don't need to set them manually.

4. **Surprising/contrarian findings** as `signal` beads — but **only if novel**. Run a recall first to dedupe:
   ```bash
   zettel recall "{finding keywords}" -l 3 -d flat
   # If a hit already covers this finding, link instead of saving:
   #   zettel link {new-finding-id} {existing-id} relates-to
   # Otherwise:
   zettel save "{finding}" -t signal -S "research-{topic-slug}-finding" --status open
   ```

5. **Final summary** as a `learning` bead, linked to landscape:
   ```bash
   SUMMARY_ID=$(zettel save "{executive synthesis, full text}" \
     -t learning -S "research-{topic-slug}-summary" --status open | jq -r '.id')
   zettel link "$SUMMARY_ID" "$LANDSCAPE_ID" discovered-from
   ```

### Capture IDs in the vault

Write the saved bead ids into the filesystem vault's `INDEX.md` under a `## Memory beads` section, so the filesystem and the bead store stay cross-referenced:

```markdown
## Memory beads
- Hub: {hub-id}
- Landscape: {landscape-id}
- Summary: {summary-id}
- Profiles:
  - {entity-name}: {entity-id}
  - ...
- Findings: {finding-id-1}, {finding-id-2}, ...
```

### What NOT to save

- **Raw search results** — the agents already returned them, the synthesis is what matters
- **URLs** — those go in the vault's `Sources` section, not as beads (URL beads pollute search)
- **Per-iteration progress** — Deep Investigation iterations should accumulate into the same beads via update, not spawn new ones each loop
- **Empty/null findings** — "no surprising findings" is not a signal bead; just skip

---

## Integration point 3 — per-entity RECALL during Deep Investigation (OPTIONAL)

**Use this in Deep Investigation Step 4 (Investigate)**, before deep-diving an entity. The goal: catch entities that have been researched in a *different* investigation (e.g., the same vendor showed up in two unrelated landscape studies).

```bash
zettel recall "{entity_name}" -l 3 -d connected
```

If a hit comes back with source tag `research-*-entity-{matching-slug}`, surface as `⚠️ PRIOR ENTITY PROFILE: {br-id}` and:

1. Read the existing profile via `zettel raw GET /v1/memory/trace?id={br-id}`
2. **Skip the redundant deep-dive** if the profile is < 30 days old AND covers the template fields you'd otherwise generate
3. Otherwise, treat the existing profile as priors — pass them to the researcher agents so they can update/extend rather than re-derive

This prevents the "same entity, three vaults, three identical profiles" pattern.

---

## Failure mode handling

If `zettel status` returns `available: false`, or any zettel call fails:

1. Log it ONCE in the workflow output: `⚠️ Memory unavailable — research running without zettel integration`
2. Skip both RECALL and SAVE phases
3. **Never block Research progress on memory unavailability.** The engine is best-effort, the research is mandatory.

The most common failure mode on a client install is the engine not running. A 1-line preflight catches it cheaply:

```bash
zettel status >/dev/null 2>&1 || { echo "⚠️ Memory unavailable, skipping zettel integration"; export RESEARCH_SKIP_MEMORY=1; }
```

Workflows should check `$RESEARCH_SKIP_MEMORY` before each `zettel` call.

---

## Per-mode integration matrix

| Workflow | RECALL | SAVE | per-entity RECALL |
|---|---|---|---|
| `QuickResearch.md` | ✅ MANDATORY | ❌ skip (too lightweight to justify writes) | — |
| `StandardResearch.md` | ✅ MANDATORY | ✅ MANDATORY (landscape + summary only — no entity profiles in standard mode) | — |
| `ExtensiveResearch.md` | ✅ MANDATORY | ✅ MANDATORY (landscape + summary + each angle's findings as facts) | — |
| `DeepInvestigation.md` | ✅ MANDATORY (in Step 0) | ✅ MANDATORY (per Step — landscape in Step 1, profiles in Step 4, summary in Step 5) | ✅ OPTIONAL (in Step 4 before each deep-dive) |
| Content-extraction workflows (Fabric, Retrieve, Enhance, ExtractKnowledge, WebScraping, YoutubeExtraction, ClaudeResearch, InterviewResearch, AnalyzeAiTrends, ExtractAlpha) | ❌ not yet | ❌ not yet | — |

Content-extraction workflows are deferred — they don't fit the "research a topic" pattern cleanly. Revisit if a use case emerges.

---

## Why this design

**Zettelkasten methodology** — atomic notes, dense interlinking, source-tagged provenance, hubs for navigation. Research findings ARE the canonical Zettelkasten use case. Every research bead should be a permanent note in the same library, not siloed by scope.

**Default scope** — using the install's default scope (not a `research-*` scope) means research beads share the same Jaccard similarity graph as everything else. A research bead about "AI agent frameworks" can auto-link to a session bead about "agent-ui debugging" without us writing explicit edges. The graph builds itself.

**Source tag as differentiator** — `source:research-{topic}-{phase}` is enough to filter when you want only research beads (`zettel recall "..." -s default --source-prefix research-`), and absent when you want the cross-topic view.

**Hubs for canonical topics** — once a topic has 3+ research runs (refresh cycles), the topic hub becomes a navigable index. Future recalls on related topics will surface the hub first, which is exactly the centrality behavior Luhmann's Zettelkasten was designed for.

**Filesystem vault stays** — we're not removing `~/.claude/MEMORY/RESEARCH/{date}_{topic}/`. The vault is the human-readable artifact; the bead store is the machine-queryable index. They cross-reference each other via the `## Memory beads` section in `INDEX.md`.

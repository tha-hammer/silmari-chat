# Extract Workflow

Extract dynamic, content-adaptive wisdom from any content source.

## Input Sources

| Source | Method |
|--------|--------|
| YouTube URL | `fabric -y "URL"` to get transcript |
| Article URL | WebFetch to get content |
| File path | Read the file directly |
| Pasted text | Use directly |

## Execution Steps

### Step 1: Get the Content

Obtain the full text/transcript. For YouTube, use `fabric -y "URL"` to extract transcript. Save to a working file if large.

### Step 2: Deep Read

Read the entire content. Don't extract yet. Notice:
- What domains of wisdom are present?
- What made you stop and think?
- What's genuinely novel vs. commonly known?
- What would {PRINCIPAL.NAME} highlight if he were reading this?
- What quotes land perfectly?

### Step 3: Select Dynamic Sections

Based on your deep read, pick 5-12 section names. Rules:
- Section names must be conversational, not academic
- Each must have at least 3 quality bullets
- Always include "Quotes That Hit Different" if source has quotable moments
- Always include "First-Time Revelations" if genuinely new ideas exist
- Be SPECIFIC — "Agentic Engineering Philosophy" not "Technology Insights"

### Step 4: Extract Per Section

For each section, extract 3-15 bullets. Apply tone rules from SKILL.md:
- 8-20 words, flexible for clarity
- Specific details, not vague summaries
- Speaker's words when they're good
- No hedging language
- Every bullet worth telling someone about

### Step 5: Add Closing Sections

Always append:
1. **One-Sentence Takeaway** (15-20 words)
2. **If You Only Have 2 Minutes** (5-7 essential points)
3. **References & Rabbit Holes** (people, projects, books, tools mentioned)

### Step 6: Quality Check

Run the quality checklist from SKILL.md before delivering.

### Step 7: Output

Present the complete extraction in the format specified in SKILL.md.

### Step 7.5: Save to Disk (canonical location)

Write the wisdom-extract markdown to `~/.claude/AAI-USER/WISDOM/`. This is a symlink to `AAI/USER/WISDOM/` in the silmari-agent-memory repo — the canonical home for all ExtractWisdom output. **Do NOT write to `MEMORY/WORK/`** — that path is reserved for Algorithm-run PRDs.

Two layouts depending on content type:

**Series (recurring podcast / talk series / book chapters):**
- Path: `~/.claude/AAI-USER/WISDOM/{series-slug}/{episode-slug}.md`
- Series slug: `{topic-or-show}-{year}` (e.g. `ai-that-works-2026`) or `{author-lastname}-{book-slug}`
- Episode slug: whatever uniquely identifies it within the series (date-prefixed if dated)
- If the series has 3+ episodes, also write/update `~/.claude/AAI-USER/WISDOM/{series-slug}/INDEX.md` with a coverage table and cross-cutting themes

**Singleton (one-off video / article / talk):**
- Path: `~/.claude/AAI-USER/WISDOM/{YYYY-MM-DD}_{kebab-slug}.md`
- Date is publication date; fall back to extraction date if unknown
- No INDEX needed for singletons

**File header convention** (every wisdom file starts with these three lines):
```markdown
# EXTRACT WISDOM: {Title}
> {one-line description}
>
> {source URL} · {ref/series/episode} · {date}
---
```

For YouTube content, use the canonical `https://www.youtube.com/watch?v=...` URL form, not `youtu.be/...`.

See `~/.claude/AAI-USER/WISDOM/README.md` for the full convention doc — including what does NOT belong in WISDOM (PROJECTS, TELOS, MARKETING, BUSINESS, MEMORY/WORK).

### Step 8: Anchor + Save to Silmari

Bibliographic anchors and derived ideas live in different boxes. Mint the anchor first, then save each insight as an idea linked back to it:

1. **Mint the biblio anchor.** Pass the canonical source URL (the YouTube URL, article URL, podcast episode page) plus a short citation:
   ```
   mcp__silmari__zk_biblio_mint({
     source: "https://youtu.be/{videoId}",   // or the canonical article/episode URL
     citation: "{Author/Show} — {Title} ({Year})",
     notes: "{one-line summary of what this source is}"
   })
   ```
   Returns `{biblioId, created}`. Capture `biblioId`. Calling mint twice with the same `source` returns the same `biblioId` — the tool dedups on a hash of the source URL.

   **Do NOT use `zk_save_card` with `kind=biblio`** — that path is gated to `system-hook` tier and will reject from agent context. `zk_biblio_mint` is the sanctioned authoring path.

2. **Save each insight as an idea card.** For each bullet/extraction worth retaining, save with `kind=idea` (or `learning` / `fact` / `signal` / `decision` / `preference` per SKILL.md's tone rules):
   ```
   mcp__silmari__zk_save_card({
     body: "{the insight, 8-20 words or longer for nuance}",
     kind: "idea",
     trunk: 5,                                  // or whichever trunk fits the domain
     mode: "continue",
     source: "{the same canonical URL passed to mint above}"
   })
   ```
   Capture each returned `id`.

3. **Link each idea back to the biblio.** Once both ends exist:
   ```
   mcp__silmari__zk_biblio_link_source({
     ideaId: "{idea card id}",
     biblioId: "{biblioId from step 1}"
   })
   ```
   This emits the `ref:derives-from:<biblioId>` edge that makes `zk_biblio_ideas_for_source` and `zk_biblio_sources_for_idea` queries return populated results.

**Single-source rule:** every idea card extracted from one piece of content shares the same `biblioId`. Two pieces of content (two YouTube videos, two articles) get two distinct biblio anchors — never conflate them.

**No body-tag fallback.** Earlier ContentAnalysis runs improvised by saving anchors as `kind=idea` with a `[biblio]` body marker. That fallback existed because `zk_biblio_mint` did not. It does now. Do not use the body-tag pattern.

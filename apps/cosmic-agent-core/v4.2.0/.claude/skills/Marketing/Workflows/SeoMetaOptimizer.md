---
name: SeoMetaOptimizer
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Triggered when the user wants to audit, optimize, or generate meta titles and descriptions for a website, a set of URLs, or a CSV export from tools like Ahrefs or Screaming Frog. Also triggers on mentions of SEO metadata, title tags, meta descriptions, SERP optimization, or improving search snippets.
---

# SeoMetaOptimizer

Optimize title tags and meta descriptions at scale. Accepts a CSV export (from Ahrefs, Screaming Frog, Semrush, etc.) or a website URL (crawls via sitemap or link discovery), then applies a multi-stage optimization pipeline with grammar validation, duplicate detection, and brand-aware formatting.

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required for any voice-sensitive output
- `ICP.md` — required when the workflow targets an audience
- `Positioning.md` — required for content that takes a stance
- `Terminology.md` — required for any externally-visible copy (product/feature names, capitalization)
- `NoFlyList.md` — required for any content that names customers
- `VoiceProfiles/{Name}.md` — only if the user names an author

For each required asset, check the frontmatter `populated:` field after reading.
If `populated: false`, the asset is a stub.

Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand
output, and missing context is exactly what produces generic AI slop.

## Instructions

### 1. Gather context

Before optimizing, ask the user for:

- **Brand name** — used in title suffixes (e.g., "| BrandName")
- **Brand description** — one sentence, used when generating descriptions from scratch
- **Website URL** — the target site (for crawling) or just context (for CSV input)
- **Input source** — either a URL to crawl or a CSV file path

Optional:
- **Audit CSV** — existing SEO audit (Ahrefs, Screaming Frog) with organic traffic data for prioritization
- **Custom terminology** — `Terminology.md` from pre-flight provides the canonical product names and capitalization to enforce in metadata

### 2. Crawl or ingest

**From CSV:**
1. Read the provided CSV
2. Map columns to url, current_title, current_description (ask user if column mapping is ambiguous)
3. If an audit CSV is also provided, join on URL to get organic traffic data

**From URL:**
1. Check for sitemap.xml at the root domain
2. Parse all page URLs from the sitemap
3. For each page, extract the current `<title>` and `<meta name="description">` tags
4. Build a working CSV with columns: url, current_title, current_description

### 3. Optimize titles

Apply a progressive strategy chain — try each technique in order, stop when the title fits within 60 characters:

1. **Full title + brand suffix** — `Original Title | Brand` (if ≤60 chars, done)
2. **Apply text shortenings** — common abbreviations + brand suffix
3. **Grammar-aware truncation** — truncate at a natural break point + brand suffix
4. **Drop brand suffix** — use the title alone if brand pushes it over
5. **Parenthetical unpacking** — remove parenthetical asides
6. **Aggressive truncation** — truncate at colon/dash boundaries

At every step, validate against grammar rules:
- No trailing commas, prepositions, or articles
- No sentence fragments
- No dangling conjunctions
- Technical terms capitalized correctly (PostgreSQL, AWS, Kubernetes, etc. — cross-reference `Terminology.md` for brand-specific terms)

### 4. Optimize descriptions

For each page:
- Target 120–160 characters
- Include the primary keyword/topic naturally
- End with a complete sentence (no truncation mid-thought)
- If the current description is missing or very short, generate one from the page content
- Match the brand voice (refer to `BrandVoice.md` from pre-flight)

### 5. Detect duplicates

Flag any titles or descriptions that are identical or near-identical across pages. Group duplicates and suggest differentiation.

### 6. Generate output

Produce a CSV with columns:
- `url`
- `current_title`, `optimized_title`, `title_changed` (boolean)
- `current_description`, `optimized_description`, `description_changed` (boolean)
- `page_type` (blog, docs, landing, product, etc.)
- `organic_traffic` (if audit data was provided)

Optionally, organize output into `by_section/` subdirectories (blog, docs, website, learn) if the site has clear sections.

Save to the current working directory or user-specified path.

### 7. Validate

Run a final validation pass and report:
- Title length violations (>60 chars)
- Description length violations (<120 or >160 chars)
- Grammar issues
- Remaining duplicates
- Total pages audited, total changes made

Target: **zero issues** in the final output.

## Output requirements

- **Title length:** ≤60 characters (the SERP truncation threshold).
- **Description length:** 120–160 characters.
- **Grammar:** No trailing commas, prepositions, articles, or dangling conjunctions. No sentence fragments. Complete sentences only.
- **Capitalization:** Technical terms and brand-specific product names must follow `Terminology.md`.
- **Brand suffix format:** `Title | Brand` (pipe-separated). Drop the suffix only when length forces it.
- **Voice:** Match `BrandVoice.md`. If the user names an author, also load `VoiceProfiles/{Name}.md`.
- **Output file:** CSV with the columns enumerated in Step 6, saved to the user-specified path (or cwd if none given).

## Title-optimization rules (inline)

The original Tiger skill referenced an external `title-optimization-rules` doc. The essentials, kept here so this workflow is self-contained:

**Shortening dictionary (apply in step 3.2 before truncation):**
- "and" → "&"
- "with" → "w/"
- "versus" → "vs."
- "for example" → "e.g."
- "Introduction to" → "Intro to"
- "Comprehensive Guide" → "Guide"
- "Step-by-Step" → "Step-by-Step" (keep — readability beats shortening)
- "How to" stays — strong CTR signal

**Grammar rules (validate after every transform):**
- A title must not end with: `,` `:` `;` `-` or any preposition/article (`of`, `to`, `in`, `for`, `with`, `a`, `an`, `the`, `and`, `or`).
- A title must not start with a conjunction (`And`, `But`, `Or`).
- Capitalization: title case for human-language words; preserve exact casing for technical terms (PostgreSQL, JavaScript, AWS, Kubernetes, GraphQL, etc.) and brand-specific terms from `Terminology.md`.
- Parenthetical asides `(...)` are droppable in step 3.5.
- Colon/dash separators `: -` are valid truncation boundaries in step 3.6 — truncate before them, not after.

**Validation criteria for the final pass:**
- 100% of titles ≤60 chars.
- 100% of descriptions in 120–160 char range.
- 0 grammar violations.
- 0 unresolved duplicate clusters.

## Dependencies

- **Required:** Network access (for URL crawling mode).
- **Required (assets):** `BrandVoice.md`, `Terminology.md` from `~/.claude/AAI/USER/MARKETING/`.
- **Optional (assets):** `ICP.md`, `Positioning.md`, `NoFlyList.md`, `VoiceProfiles/{Name}.md`.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with
brand context swapped to local AAI/USER/MARKETING/ files. Originally based on
[djforge/seo-meta-optimizer](https://github.com/djforge/seo-meta-optimizer).

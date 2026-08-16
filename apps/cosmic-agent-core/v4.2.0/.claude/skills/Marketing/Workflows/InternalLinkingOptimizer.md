---
name: InternalLinkingOptimizer
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Analyze and optimize internal link structure to improve site architecture, distribute page authority, and help search engines understand content relationships. Triggered when the user asks to fix internal links, improve site architecture, optimize link structure, distribute page authority, create an internal linking strategy, find orphan pages, or mentions that pages have no links pointing to them. Also triggered when the user mentions link equity, content silos, topic clusters, anchor text optimization, or crawl depth issues. For meta title and description optimization, see SeoMetaOptimizer.
---

# InternalLinkingOptimizer

Analyze a site's internal link structure and provide actionable recommendations to improve SEO through strategic internal linking. Helps distribute authority, establish topical relevance, and improve crawlability.

## When to use this workflow

- Improving site architecture for SEO
- Distributing authority to important pages
- Fixing orphan pages with no internal links
- Creating topic cluster internal link strategies
- Optimizing anchor text for SEO
- Recovering pages that have lost rankings
- Planning internal links for new content

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required for any voice-sensitive output (anchor text style, on-brand link copy)
- `ICP.md` — required for prioritizing pages by audience match
- `Positioning.md` — required when topic clusters / pillar choice depend on stance
- `Terminology.md` — required for anchor text and any externally-visible copy
- `NoFlyList.md` — required for any content that names customers

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

### 1. Gather input

Ask the user to provide:

1. **Key page URLs that need more internal links** — specific pages to focus on
2. **Content categories or topic clusters** — how the site's content is organized (or should be)
3. **Any existing link structure documentation** — crawl exports, link maps, or notes on current architecture
4. **Site domain and sitemap URL** — the canonical domain (e.g., `https://www.example.com/`) and the sitemap location if known
5. **Relevant prior content URLs/pastes** — paste a list of known content URLs, or point to a CSV/file the workflow can read. The local substrate has no published-content index, so the user-supplied list (plus the sitemap) is the only verified source of URLs.

### 2. Build verified URL inventory

Before analyzing link structure, build a complete inventory of real, verified URLs. This prevents suggesting broken links with incorrect path prefixes (e.g., missing `/learn/` or `/blog/`).

**Step 2a: User-provided URL list**

Use the URLs and topic clusters gathered in Step 1 as the primary source. If the user supplied a CSV, sitemap export, or pasted list of URLs, parse it into a working inventory. Treat these as candidate-verified — they came from the user, who knows the site.

If the user did not supply a list, ask explicitly for one before proceeding. Do not invent URLs.

**Step 2b: Sitemap fetch (secondary source)**

If the user supplied a sitemap URL (or you can derive one — typically `<domain>/sitemap.xml`), fetch and parse it to catch pages the user-provided list may have missed:

```
fetch <user-supplied sitemap URL>
```

If the response is a `<sitemapindex>` (an index of child sitemaps rather than direct `<url>` entries), fetch each child `<sitemap><loc>` entry and collect all `<loc>` entries from those child sitemaps.

Parse all `<loc>` entries and merge with the user-provided list. The sitemap is the authoritative source for URL paths — if a slug appears in both sources, prefer the sitemap's URL format.

If the sitemap fetch fails or returns an error (404, timeout, malformed XML), proceed with the user-provided list only and note the limitation in the output.

**Step 2c: Merge and deduplicate**

Combine the user-provided list and sitemap entries into a single verified URL inventory. Deduplicate by slug (the path segment after the last `/`). Every URL in this inventory must:

- Be a full URL starting with `https://` (never `http://`)
- Include the correct path prefix (`/learn/`, `/blog/`, `/docs/`, etc.) as the site uses
- Use the canonical domain the user provided

**This inventory is the only source for link suggestions in all subsequent steps.** Do not suggest any URL that is not in this inventory.

### 3. Analyze current internal link structure

Map the current internal linking patterns across the provided pages. **Only reference URLs from the verified inventory (Step 2).**

```markdown
## Internal Link Structure Analysis

### Overview

**Domain**: [domain]
**Total Pages Analyzed**: [X]
**Total Internal Links**: [X]
**Average Links per Page**: [X]

### Link Distribution

| Links per Page | Page Count | Percentage |
|----------------|------------|------------|
| 0 (Orphan) | [X] | [X]% |
| 1-5 | [X] | [X]% |
| 6-10 | [X] | [X]% |
| 11-20 | [X] | [X]% |
| 20+ | [X] | [X]% |

### Top Linked Pages

| Page | Internal Links | Authority | Notes |
|------|----------------|-----------|-------|
| [URL 1] | [X] | High | [notes] |
| [URL 2] | [X] | High | [notes] |
| [URL 3] | [X] | Medium | [notes] |

### Under-Linked Important Pages

| Page | Current Links | Traffic | Recommended Links |
|------|---------------|---------|-------------------|
| [URL 1] | [X] | [X]/mo | [X]+ |
| [URL 2] | [X] | [X]/mo | [X]+ |

**Structure Score**: [X]/10
```

### 4. Identify orphan pages

Find pages with no internal links pointing to them.

```markdown
## Orphan Page Analysis

### Orphan Pages Found: [X]

| Page | Traffic | Priority | Recommended Action |
|------|---------|----------|-------------------|
| [URL 1] | [X]/mo | High | Link from [pages] |
| [URL 2] | [X]/mo | Medium | Add to navigation |
| [URL 3] | 0 | Low | Consider deleting/redirecting |

### Fix Strategy

**High Priority Orphans** (have traffic/rankings):
1. [URL] - Add links from: [relevant pages]

**Medium Priority Orphans** (potentially valuable):
1. [URL] - Add to category/tag page

**Low Priority Orphans** (consider removing):
1. [URL] - Redirect to [better page]
```

### 5. Analyze anchor text distribution

Review anchor text patterns and flag issues (generic anchors, over-optimization, same anchor to multiple pages).

```markdown
## Anchor Text Analysis

### Current Anchor Text Patterns

| Anchor Text | Count | Target Pages | Assessment |
|-------------|-------|--------------|------------|
| "click here" | [X] | [X] pages | Not descriptive |
| "read more" | [X] | [X] pages | Not descriptive |
| "[exact keyword]" | [X] | [page] | May be over-optimized |
| "[descriptive phrase]" | [X] | [page] | Good |

### Anchor Text Recommendations

For each flagged page, suggest 3-4 anchor text variations:
- Exact match (10-20% of anchors)
- Partial match (30-40%)
- Branded (10-20%)
- Natural (20-30%)

**Anchor Score**: [X]/10
```

### 6. Create topic cluster link strategy

Map current pillar/cluster links, recommend link structure, and list specific links to add.

> **Reference**: See the [linking templates](./InternalLinkingOptimizer_LinkingTemplates.md) for the topic cluster link strategy template.

### 7. Find contextual link opportunities

Analyze each page for topic-relevant link opportunities and prioritize high-impact additions. **Every suggested link must exist in the verified URL inventory from Step 2.**

> **Reference**: See the [linking templates](./InternalLinkingOptimizer_LinkingTemplates.md) for the contextual link opportunities template.

### 8. Optimize navigation and footer links

Analyze main/footer/sidebar/breadcrumb navigation and recommend pages to add or remove.

> **Reference**: See the [linking templates](./InternalLinkingOptimizer_LinkingTemplates.md) for the navigation optimization template.

### 9. Generate link implementation plan

Produce an executive summary, current state metrics, phased priority actions (weeks 1-4+), implementation guide, and tracking plan.

> **Reference**: See the [linking templates](./InternalLinkingOptimizer_LinkingTemplates.md) for the full implementation plan template.

## Validation checkpoints

### Input validation
- Pre-flight asset reads completed (no stubs blocking)
- Target pages or topic clusters clearly defined
- If optimizing a specific page, page URL or content provided
- User-provided URL list (or sitemap) supplied for the verified inventory

### URL verification (enforced across all steps)
- **Every suggested URL** must exist in the verified inventory built in Step 2
- All URLs must be full URLs starting with `https://` — never `http://`, never relative paths
- All URLs must include the correct path prefix (`/learn/`, `/blog/`, `/docs/`, etc.) as the site uses
- All internal URLs must use the canonical domain the user provided
- If a URL cannot be verified against the user-provided list or the sitemap, do not suggest it

### Output validation
- Every recommendation cites specific data points (not generic advice)
- All link suggestions include source page, target page, and recommended anchor text
- Orphan page lists include URLs and recommended actions
- Source of each data point clearly stated (sitemap, crawl data, or user-provided list)

## Output requirements

- Use the templates in `InternalLinkingOptimizer_LinkingTemplates.md` verbatim for steps 6-9.
- Architecture model recommendations cite the relevant section of `InternalLinkingOptimizer_LinkArchitecturePatterns.md`.
- The final implementation plan ends with a tracking checklist the user can copy into their issue tracker.

## Reference docs

- [Link Architecture Patterns](./InternalLinkingOptimizer_LinkArchitecturePatterns.md) — Architecture models (hub-and-spoke, silo, flat, pyramid, mesh), anchor text diversity framework, link equity flow model, and measurement frameworks
- [Linking Templates](./InternalLinkingOptimizer_LinkingTemplates.md) — Output templates for steps 6-9 (topic clusters, contextual opportunities, navigation, implementation plan)
- [Linking Example](./InternalLinkingOptimizer_LinkingExample.md) — Full worked example for internal linking opportunities

## Tips for success

1. **Quality over quantity** — add relevant links, not random ones
2. **User-first thinking** — links should help users navigate
3. **Vary anchor text** — avoid over-optimization
4. **Link to important pages** — distribute authority strategically
5. **Regular audits** — internal links need maintenance as content grows

## Related workflows

- `SeoMetaOptimizer` — Optimize title tags and meta descriptions
- `/marketing` — Build the brand-voice and positioning context this workflow consumes
- `ContentReviewer` — Review content quality including link structure

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand context swapped to local AAI/USER/MARKETING/ files. Underlying methodology based on [aaron-he-zhu/seo-geo-claude-skills](https://github.com/aaron-he-zhu/seo-geo-claude-skills) internal-linking-optimizer.

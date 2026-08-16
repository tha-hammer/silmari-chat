---
name: SeoTechAudit
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Run a rigorous technical SEO audit from Ahrefs crawl exports (or live API crawl) and produce a Markdown report plus an XLSX action plan, with every issue scored by business impact and platform-aware fix instructions.
---

# SeoTechAudit

You are a senior technical SEO consultant. Your job is to take crawl data (uploaded
or fetched via API), run a rigorous multi-layered analysis, and deliver findings
that are prioritized by actual business impact rather than abstract severity scores.

The output is always two deliverables:
1. A **Markdown report** with executive summary, categorized findings, and strategic recommendations
2. An **XLSX spreadsheet** with every issue, its priority score, estimated effort, affected URLs, and clear fix instructions

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`. A site
audit is mostly technical, but the prioritization and fix-recommendation language
should match the user's brand context when present.

- `BrandVoice.md` — used for the tone of the executive summary and strategic recommendations
- `ICP.md` — used to weight which page types matter most (revenue/lead-gen pages)
- `Positioning.md` — used to align strategic recommendations with the user's stance
- `NoFlyList.md` — used so report copy avoids prohibited claims/customers

For each asset, check the frontmatter `populated:` field after reading.
If `populated: false`, the asset is a stub.

Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is
on-brand output, and missing context is exactly what produces generic AI slop.

(For SEO audits specifically: if `ICP.md` and `Positioning.md` are stubs, the
business-impact dimension of scoring collapses to a generic checklist — which is
the failure mode the methodology exists to avoid. Still bootstrap.)

## Instructions

This workflow has the same five-phase structure as the source skill.

## Table of Contents

1. [Phase 1: Data Ingestion](#phase-1-data-ingestion)
2. [Phase 2: Context Discovery](#phase-2-context-discovery)
3. [Phase 3: Analysis Engine](#phase-3-analysis-engine)
4. [Phase 4: Business Impact Scoring](#phase-4-business-impact-scoring)
5. [Phase 5: Output Generation](#phase-5-output-generation)

---

## Phase 1: Data Ingestion

The workflow supports three data paths. Ask the user which applies and proceed accordingly.

### Path A: User uploads Ahrefs crawl data (most common)

Ahrefs Site Audit data comes in two export formats. Auto-detect which format you are receiving.

#### Format 1: Pages export (`pages.csv`)

A flat CSV with one row per URL. Key columns: URL, HTTP Code, Title, Description, H1, Canonical URL, Word Count.

When receiving this format:
1. Read the CSV headers
2. Confirm the Ahrefs column signature (`URL` + `HTTP Code`)
3. Normalize column names to the internal schema
4. **Check JS rendering status** (see "JS Rendering Check" below)
5. Report back: "I detected this as an Ahrefs Site Audit pages export with [X] URLs. Shall I proceed?"

#### Format 2: All Issues export (directory of CSVs)

A directory containing one CSV per issue type, exported from Ahrefs Site Audit "All Issues" view. This is the richer format since Ahrefs has already categorized issues by severity.

**Structure:**
- Each file is named `{Severity}-{indexable-}?{IssueName}.csv` (e.g., `Error-404_page.csv`, `Warning-indexable-Low_word_count.csv`)
- Severity levels: `Error`, `Warning`, `Notice`
- Files with `-links` suffix contain source pages linking to affected URLs (not the issues themselves)
- Files are **UTF-16 encoded, tab-separated** (not standard UTF-8 comma-separated)
- An `index.txt` file lists all CSVs in the export
- Columns vary per issue type but share common fields: `PR`, `URL`, `Title`, `HTTP status code`, `Organic traffic`

When receiving this format:
1. Detect the directory structure (multiple CSVs + `index.txt`)
2. Read `index.txt` to inventory all issue files
3. Parse each non-`-links` CSV: extract severity from filename, read URLs and issue-specific columns
4. Optionally parse `-links` CSVs for source page context (which pages link to broken URLs, etc.)
5. Build a unified issue list with severity, issue type, affected URLs, and all available metadata
6. **Check JS rendering status** (see "JS Rendering Check" below)
7. Report back: "I detected an Ahrefs All Issues export with [X] issue types ([Y] Errors, [Z] Warnings, [W] Notices) covering [N] unique URLs. Shall I proceed?"

**Column mapping**: Read `SeoTechAudit_DataIngestion.md` (sibling sidecar) for the complete column mapping logic for both formats.

### JS Rendering Check

After loading data from either format, check whether JavaScript rendering was enabled during the Ahrefs crawl. This is critical for sites built on client-side frameworks (Next.js, React, Vue, Angular, Gatsby) where key SEO elements (H1, title, content) are rendered by JavaScript.

**How to detect:**
- In pages.csv: check the `Is rendered page` column. If it exists and all values are `false`, JS rendering was not enabled.
- In All Issues exports: check the `is_rendered` / `Is rendered page` column in any issue CSV. If all values are `false`, JS rendering was not enabled.

**If JS rendering was NOT enabled:**
- Warn the user: "This crawl was run without JavaScript rendering. Your site uses [detected platform, e.g. Next.js], which renders key SEO elements (H1 tags, page content, titles) client-side. Issues like missing H1, low word count, and duplicate content may be false positives. **Recommendation:** Re-run the Ahrefs Site Audit with JS rendering enabled (Settings > JavaScript rendering > On) for accurate results. Proceed anyway?"
- If the user chooses to proceed, add a prominent caveat to the report header noting that findings may include JS rendering false positives.
- Flag individual checks that are most affected by missing JS rendering: Heading Analysis, Content Quality Signals, Duplicate Content Detection, Title Tag Analysis.

**If JS rendering WAS enabled** (or the site does not use a client-side framework): proceed normally with no caveat.

### Path B: API-based crawl

Read `SeoTechAudit_ApiCrawling.md` (sibling sidecar) for full implementation details.

Supported APIs:
- **Firecrawl**: Full site crawl with JS rendering, returns markdown + HTML
- **DataForSEO On-Page API**: Per-page on-page analysis via MCP tools
- **Ahrefs API/MCP**: If the user has the Ahrefs MCP server connected

Ask the user:
1. Which crawl service they want to use (or if they have an API key / MCP server for one)
2. The target URL/domain
3. Any crawl limits (page count, depth)
4. Whether JavaScript rendering is needed

Then execute the crawl, wait for completion, and normalize the returned data into the same internal schema.

### Path C: Hybrid / Multi-Source Merge

Users may want to supplement an Ahrefs file export with live API checks. The workflow handles this through a dedicated merge pipeline.

**How multi-source merging works:**

The `merge_datasets()` function in `SeoTechAudit_analyze_crawl.py` resolves conflicts and fills gaps using a three-step strategy:

1. **Partition URLs** into three buckets: primary-only, secondary-only, and overlap (same URL in both sources).
2. **Resolve conflicts** on overlapping URLs. For "freshness-sensitive" fields (status_code, indexability, canonical, meta_robots, redirect_url, response_time), the source with the more recent crawl timestamp wins. If timestamps are unavailable, the primary source takes precedence.
3. **Backfill gaps.** For "enrichment" fields (word_count, inlinks, unique_inlinks, outlinks, crawl_depth, link_score, readability_score, text_ratio, page_size_bytes, co2_mg, near_duplicate_match, semantic_similarity_score), missing values in the winning row are filled from the other source.

Every merged row gets a `_source` column (primary, secondary, or merged) and a `_merge_notes` column documenting exactly which fields came from where.

**CLI usage:**
```bash
python SeoTechAudit_analyze_crawl.py \
  --input ahrefs_pages.csv \
  --secondary api_crawl.csv \
  --merge-strategy freshest \
  --output results.json
```

Merge strategies:
  - `freshest` (default): Most recent timestamp wins on conflict fields
  - `primary`: Primary source always wins on conflicts, secondary only backfills gaps

---

## Phase 2: Context Discovery

Before running any analysis, you need to understand what you are auditing. This context shapes how you prioritize everything later.

### Automatic detection (from crawl data)

Analyze the crawl data to infer:
- **Platform**: Look for signatures in URLs, meta generators, response headers (Shopify, WordPress, Wix, Squarespace, Magento, custom, headless/SPA, etc.)
- **Site type**: Ecommerce (product/collection URLs), Blog/Publisher (article/post URLs), SaaS (app/pricing/docs URLs), Local business, Marketplace, etc.
- **Scale**: Total pages, URL depth distribution, number of unique templates/page types
- **Geographic targeting**: hreflang presence, language in URLs, country TLDs
- **Content structure**: Blog vs product vs category vs landing page ratios

### Ask the user to confirm/supplement

After auto-detection, present your findings and ask:
- "Is this correct? Anything I should know about the business model or revenue pages?"
- "Which pages drive the most revenue or leads?" (this is critical for impact scoring)
- "Are there any known issues or areas you are particularly concerned about?"
- "Do you have access to Google Search Console or Analytics data to supplement the crawl?"

Cross-reference user answers against `ICP.md` and `Positioning.md` from the
Pre-flight reads — those files often already identify the highest-value page
types and the audience whose journey those pages serve.

Store this context because it feeds directly into Phase 4 (business impact scoring).

---

## Phase 3: Analysis Engine

This is the core of the audit. Read `SeoTechAudit_AnalysisModules.md` (sibling sidecar) for the complete specification of every check.

The analysis runs across **10 audit categories**, each containing multiple specific checks:

### Category 1: Crawlability & Accessibility
- Robots.txt analysis (blocked critical resources, overly restrictive rules)
- XML sitemap validation (present, referenced in robots.txt, no errors, freshness)
- HTTP status code distribution (4xx, 5xx, soft 404s)
- Redirect analysis (chains, loops, temporary vs permanent, redirect targets)
- Crawl depth distribution (pages beyond depth 3 need attention)
- Orphan pages (pages with zero internal inlinks)
- Crawl budget signals (response times, large pages, parameter URLs)
- URL structure and cleanliness (parameters, session IDs, uppercase, special characters)

### Category 2: Indexability & Index Management
- Indexability status distribution (indexable vs non-indexable and why)
- Canonical tag audit (missing, self-referencing, conflicting, cross-domain)
- Meta robots and X-Robots-Tag directives (noindex, nofollow patterns)
- Pagination handling (rel=next/prev, parameter-based, load-more/infinite scroll)
- Duplicate content detection (near-duplicates via hash comparison, thin content clusters)
- Parameter handling (URL parameters creating duplicate content)

### Category 3: On-Page SEO Elements
- Title tag analysis (missing, duplicate, too long/short, keyword presence, brand format)
- Meta description analysis (missing, duplicate, too long/short, compelling copy signals)
- Heading hierarchy (missing H1, multiple H1s, H1 matching title, heading structure)
- Content quality signals (word count distribution, thin pages, text-to-HTML ratio)
- Internal linking patterns (link equity distribution, hub pages, isolated clusters)
- Keyword cannibalization detection (multiple pages targeting same terms based on titles/H1s)
- Image optimization (missing alt text, oversized images, modern format usage)

### Category 4: Site Architecture & Internal Linking
- Site depth analysis and visualization
- Click depth from homepage to key pages
- Internal link distribution (pages with too few or too many links)
- Navigation structure assessment
- Breadcrumb implementation
- Faceted navigation and filter handling (for ecommerce)
- Content silos and topical clustering

### Category 5: Performance & Core Web Vitals
- Page size distribution (HTML, total transferred bytes)
- Response time analysis (slow pages, server performance)
- CO2 and sustainability metrics (if available in crawl data)
- Core Web Vitals guidance (LCP, INP, CLS best practices by platform)
- Resource optimization recommendations (based on page weight data)

### Category 6: Mobile & Rendering
- Mobile alternate links and responsive signals
- Viewport and mobile-friendliness indicators
- JavaScript rendering concerns (if SPA/framework detected)
- AMP implementation (if present)

### Category 7: Structured Data & Schema
- Schema markup presence and types detected
- Missing schema opportunities by page type (Product, Article, FAQ, LocalBusiness, etc.)
- Platform-specific schema recommendations (e.g. Shopify product schema gaps)

### Category 8: Security & Protocol
- HTTPS implementation (mixed content, HTTP pages remaining)
- HSTS headers
- Security headers assessment

### Category 9: International SEO
- Hreflang implementation audit (if present)
- Language targeting consistency
- Regional URL structure

### Category 10: AI & Future Readiness
- llms.txt presence and quality
- Content extractability (can AI models parse the key content from HTML?)
- Structured data completeness for AI-generated answers
- Semantic HTML usage

---

## Phase 4: Business Impact Scoring

This is what separates a useful audit from a generic checklist dump. Read `SeoTechAudit_ImpactScoring.md` (sibling sidecar) for the full methodology.

Every issue gets scored on three dimensions:

1. **SEO Impact** (1-10): How much does this issue affect search visibility?
   - Based on: number of affected URLs, page importance (homepage > deep page), type of issue (indexability > cosmetic)

2. **Business Impact** (1-10): How much revenue or leads are at risk?
   - Based on: context from Phase 2 (revenue pages, business model), traffic potential of affected pages, conversion proximity

3. **Fix Effort** (1-10, where 1 = easiest): How hard is this to fix?
   - Based on: platform detected (Shopify fix vs custom code), number of pages affected, whether it needs dev work or is CMS-configurable

**Priority Score** = (SEO Impact × 0.4) + (Business Impact × 0.4) + ((10 - Fix Effort) × 0.2)

This means high-impact, easy-to-fix issues rise to the top automatically.

### Platform-Aware Recommendations

The fix instructions adapt based on the detected platform:
- **Shopify**: Reference specific Shopify admin paths, theme liquid files, app recommendations
- **WordPress**: Reference specific plugins (Yoast, RankMath), theme functions, .htaccess
- **Wix**: Reference Wix SEO settings, limitations, workarounds
- **Custom/Headless**: Reference server configuration, framework-specific approaches
- **Magento**: Reference admin configuration, extension recommendations

---

## Phase 5: Output Generation

### Markdown Report Structure

Generate the report following this exact structure:

```
# Technical SEO Audit Report: [Domain]
**Audit Date**: [Date]
**Audited By**: AI Technical SEO Audit (powered by [crawl tool used])
**Total URLs Analyzed**: [count]
**Platform Detected**: [platform]
**Site Type**: [type]

## Executive Summary
[3-5 paragraph overview: overall health score out of 100, top 3 critical issues,
top 3 quick wins, and the single most impactful recommendation]

## Health Score Breakdown
| Category | Score | Issues Found | Critical |
[table for each of the 10 categories]

## Critical Issues (Priority Score 8+)
[Each issue with: description, affected URLs count, example URLs, business impact explanation, fix instructions]

## High Priority Issues (Priority Score 6-7.9)
[Same format]

## Medium Priority Issues (Priority Score 4-5.9)
[Same format]

## Low Priority Issues (Priority Score <4)
[Same format]

## Quick Wins
[Issues with high impact but low effort, regardless of category]

## Strategic Recommendations
[Platform-specific, business-context-aware strategic advice]

## Appendix: Full URL Issue Matrix
[Reference to the XLSX for the complete data]
```

When writing the executive summary and strategic recommendations, match the tone
defined in `BrandVoice.md` from Pre-flight, and avoid any phrasing or customer
references prohibited by `NoFlyList.md`.

### XLSX Spreadsheet Structure

Generate the XLSX spreadsheet using `openpyxl` (via pandas `to_excel`). The workbook contains these sheets:

1. **Executive Dashboard**: Health scores, issue counts by category, priority distribution chart
2. **All Issues**: Every issue with columns: Issue ID, Category, Issue Title, Severity, SEO Impact, Business Impact, Fix Effort, Priority Score, Affected URL Count, Example URLs, Fix Instructions, Platform-Specific Notes
3. **URL-Level Detail**: Every URL with its issues: URL, Status Code, Indexability, Title, H1, Word Count, Inlinks, Crawl Depth, Issues Found (comma-separated)
4. **Quick Wins**: Filtered view of high-impact, low-effort items
5. **Redirect Map**: All redirects with chains mapped out
6. **Duplicate Content**: Near-duplicate page clusters
7. **Action Plan**: Timeline-based implementation plan (Week 1-2: Critical, Week 3-4: High, Month 2: Medium)

---

## Execution Flow

When this workflow triggers, follow this sequence:

### Step 0: Intake Questionnaire

Before touching any data, ask the user these questions. Present them as a single numbered list and wait for answers before proceeding.

1. **What data do you have?** "Are you uploading an Ahrefs export (Pages CSV or All Issues directory), or would you like me to crawl the site via API (Firecrawl, DataForSEO, Ahrefs MCP)?"
2. **Was JavaScript rendering enabled?** "Did you enable JavaScript rendering in the Ahrefs crawl settings? (Settings > JavaScript rendering > On). This matters for sites built on React, Next.js, Vue, Angular, or Gatsby — without it, many issues will be false positives."
3. **What does this site do?** "What's the business model? (ecommerce, SaaS, lead gen, publisher, etc.) Which pages drive the most revenue or leads?"
4. **What platform is the site on?** "Do you know the CMS or framework? (Shopify, WordPress, Wix, custom, headless, etc.) I'll auto-detect from the data too, but knowing upfront helps."
5. **Any known concerns?** "Are there specific issues you're already aware of or areas you want me to focus on?"
6. **Supplementary data?** "Do you have Google Search Console or Analytics data to layer in? This helps me weight issues by actual traffic impact."

If the user answers inline with their initial message (e.g. "here's my Ahrefs export, it's a Shopify store"), skip questions they've already answered. Only ask what's still unknown.

### Execution environment

This workflow can run the Python analysis script (`SeoTechAudit_analyze_crawl.py`)
directly via Bash, generate XLSX files, and handle large crawl datasets (thousands
of URLs). For small-to-medium sites (under ~200 URLs), the analysis can also be
performed manually by reading the uploaded CSV data and applying the audit checks
from `SeoTechAudit_AnalysisModules.md` directly.

### Steps 1-6: Core Audit

1. **Ingest data**: Use Path A, B, or C from Phase 1
2. **Discover context**: Run auto-detection, confirm with user (Phase 2). Cross-reference against intake answers and Pre-flight assets.
3. **Run analysis**: Execute all 10 categories from Phase 3
   - Read `SeoTechAudit_AnalysisModules.md` for detailed check specifications
   - Use `SeoTechAudit_analyze_crawl.py` for automated data processing
4. **Score and prioritize**: Apply Phase 4 scoring to every issue found
   - Read `SeoTechAudit_ImpactScoring.md` for scoring calibration
5. **Generate outputs**: Create both deliverables per Phase 5
   - Use `openpyxl` (via pandas) to generate the XLSX spreadsheet
   - If the user requests a Word document, use `python-docx` to generate it
6. **Present and discuss**: Share the outputs, highlight the top findings, offer to dive deeper into any area

---

## Output requirements

- **Never produce a generic checklist**. Every finding must reference actual data from the crawl with specific URLs and numbers.
- **Context is everything**. A missing meta description on a blog post matters less than one on a product page that drives revenue.
- **Platform awareness saves time**. Do not recommend .htaccess changes to a Shopify user.
- **Explain the "so what"**. For every issue, explain what happens if it is not fixed in business terms, not just SEO jargon.
- **Be honest about severity**. Not everything is critical. Over-escalating destroys trust.
- **Adapt to scale**. A 50-page brochure site needs different advice than a 500,000-page ecommerce store.
- **Brand alignment**. Executive summary and strategic recommendations follow `BrandVoice.md` and respect `NoFlyList.md`.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with
brand context swapped to local AAI/USER/MARKETING/ files.

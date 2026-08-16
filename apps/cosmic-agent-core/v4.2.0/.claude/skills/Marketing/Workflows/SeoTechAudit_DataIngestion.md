# Data Ingestion Reference

## Column Mapping and Normalization

All crawl data is normalized into a standard internal schema. This reference defines how to map columns from Ahrefs exports and API sources.

## Internal Schema

These are the normalized column names used throughout the analysis:

| Internal Field | Type | Description |
|---|---|---|
| url | string | Full URL including protocol |
| content_type | string | MIME type (text/html, application/json, etc.) |
| status_code | integer | HTTP response code |
| status_text | string | HTTP status text (OK, Not Found, etc.) |
| indexability | string | Indexable / Non-Indexable |
| indexability_reason | string | Why non-indexable (noindex, canonicalized, etc.) |
| title | string | Page title tag content |
| title_length | integer | Character count of title |
| title_pixel_width | integer | Pixel width of title in SERPs |
| meta_description | string | Meta description content |
| meta_description_length | integer | Character count of meta description |
| meta_keywords | string | Meta keywords (legacy) |
| h1 | string | First H1 tag content |
| h1_length | integer | Character count of H1 |
| h2 | string | First H2 tag content |
| meta_robots | string | Meta robots directive |
| x_robots_tag | string | X-Robots-Tag header value |
| canonical | string | Canonical link element URL |
| rel_next | string | Pagination next URL |
| rel_prev | string | Pagination prev URL |
| word_count | integer | Number of words on page |
| text_ratio | float | Text to HTML ratio percentage |
| page_size_bytes | integer | Page size in bytes |
| transferred_bytes | integer | Transferred size in bytes |
| response_time | float | Server response time in seconds |
| crawl_depth | integer | Clicks from seed URL |
| folder_depth | integer | Number of path segments in URL |
| inlinks | integer | Total internal inlinks |
| unique_inlinks | integer | Unique internal inlinks |
| outlinks | integer | Total outlinks from page |
| external_outlinks | integer | External outlinks |
| redirect_url | string | Target URL if redirect |
| redirect_type | string | Redirect type (301, 302, meta, JS) |
| language | string | Page language detected |
| hash | string | Content hash for duplicate detection |
| last_modified | string | Last-Modified header value |
| http_version | string | HTTP/1.1 or HTTP/2 |
| co2_mg | float | CO2 emissions estimate in mg |
| readability_score | float | Flesch Reading Ease score |
| sentence_count | integer | Number of sentences |
| near_duplicate_match | string | URL of closest near-duplicate |
| near_duplicate_count | integer | Number of near-duplicates |
| spelling_errors | integer | Spelling error count |
| grammar_errors | integer | Grammar error count |
| link_score | float | Internal PageRank / link equity score |
| semantic_similarity_url | string | Most semantically similar page |
| semantic_similarity_score | float | Similarity score (0-1) |

---

## Ahrefs Column Mapping

### Ahrefs Site Audit (pages.csv)

Detection signature: Headers contain "URL" AND "HTTP Code"

```
URL -> url
HTTP Code -> status_code
Title -> title
Description -> meta_description
H1 -> h1
Canonical URL -> canonical
Word Count -> word_count
Internal Links In -> inlinks
Depth -> crawl_depth
```

### Ahrefs All Issues Export (directory of CSVs)

Detection signature: A directory containing an `index.txt` file and multiple CSVs with filenames matching `{Error|Warning|Notice}-*.csv`.

**Encoding:** UTF-16 with BOM, tab-separated. Must be decoded before parsing:
```python
# Python
df = pd.read_csv(filepath, sep='\t', encoding='utf-16')

# CLI
iconv -f UTF-16 -t UTF-8 file.csv
```

**Filename parsing:**

The filename encodes severity, indexability scope, and issue type:
```
Error-404_page.csv                              -> severity: error, issue: 404 page
Warning-indexable-Low_word_count.csv             -> severity: warning, scope: indexable, issue: low word count
Notice-indexable-Title_tag_changed.csv           -> severity: notice, scope: indexable, issue: title tag changed
Error-indexable-Orphan_page_(has_no_incoming_internal_links).csv -> severity: error, scope: indexable, issue: orphan page
```

Files ending in `-links.csv` contain the **source pages** that link to affected URLs (e.g., which pages link to a 404). These are not issues themselves but provide context for fix instructions. Parse them separately.

**Common columns across most issue CSVs:**

```
PR -> priority_rank (Ahrefs internal priority)
URL -> url
Title -> title
Content type -> content_type
Is rendered page -> is_rendered
HTTP status code -> status_code
Organic traffic -> organic_traffic
Depth -> crawl_depth
Is indexable page -> indexability (convert true/false to Indexable/Non-Indexable)
No. of all inlinks -> inlinks
First found at -> first_found_at
```

**Issue-specific columns (vary by issue type):**

| Issue Type | Additional Columns |
|---|---|
| Redirects (302, 3XX, chains) | Redirect URL, Redirect URL code, Redirect chain URLs, Redirect chain URLs codes, Is redirect loop, No. of redirect inlinks |
| Duplicate content | Canonical URL, Canonical URL code, Content hash, No. of pages having the same content, Meta description, H1, No. of canonical inlinks |
| Performance (slow page) | Size (bytes), Time to first byte (ms), Loading time (ms) |
| Content quality (low word count) | No. of content words, Meta description, H1 |
| Orphan pages | Referenced in sitemaps, No. of href/redirect/canonical/hreflang/pagination/CSS/IMG/JS inlinks |
| HTTPS mixed content | Internal outlinks, Internal outlinks codes, No. of internal outlinks |
| Structured data | Schema items, Structured data issues |
| Meta/title issues | Meta description, H1 (when relevant to the issue) |

**Link context files (`-links` suffix) column mapping:**

```
Link type -> link_type
Is nofollow -> is_nofollow
Source URL -> source_url
Source HTTP status code -> source_status_code
Target URL -> target_url (the affected URL)
Target HTTP status code -> target_status_code
Anchor -> anchor_text
Is source canonical -> is_source_canonical
Is source noindex -> is_source_noindex
Is link internal -> is_internal
```

**Building the unified issue list:**

1. Parse each non-`-links` CSV in the directory
2. Extract severity from filename prefix (`Error` = critical/high, `Warning` = medium/high, `Notice` = low/medium)
3. Extract issue name from filename (replace underscores with spaces, strip severity prefix and `-indexable-` scope)
4. For each row, create an issue record: `{url, severity, issue_type, scope, status_code, organic_traffic, ...issue-specific fields}`
5. Deduplicate URLs that appear across multiple issue files (a single URL can have multiple issues)
6. Optionally enrich with `-links` data to show which pages link to broken/redirected URLs

**Mapping Ahrefs severities to audit priority:**

| Ahrefs Severity | Default SEO Impact | Notes |
|---|---|---|
| Error | 7-10 | Start at 7, adjust up based on affected URL importance and organic traffic |
| Warning | 4-7 | Start at 5, adjust based on context |
| Notice | 1-4 | Start at 2, adjust up if the notice affects high-traffic pages |

The `indexable-` scope prefix in filenames indicates the issue specifically affects indexable pages, which typically warrants a higher business impact score.

---

## API-Based Crawl Data Normalization

### Firecrawl Response Mapping

Firecrawl returns page data in this structure per page:
```
markdown: string (full page content as markdown)
html: string (raw HTML)
metadata:
  title: string
  description: string
  language: string
  sourceURL: string
  statusCode: number
links: array of URLs found on page
```

Map to internal schema:
```
metadata.sourceURL -> url
metadata.statusCode -> status_code
metadata.title -> title
metadata.description -> meta_description
metadata.language -> language
```

For fields not provided by Firecrawl (H1, canonical, word count, etc.), parse the HTML content:
- Extract H1 from first <h1> tag in HTML
- Extract canonical from <link rel="canonical"> in HTML
- Calculate word count from the markdown content
- Extract meta robots from <meta name="robots"> in HTML
- Calculate page_size_bytes from len(html.encode('utf-8'))

### DataForSEO On-Page API Mapping

If the user has DataForSEO tools available, use the `instant_pages` tool:
```
meta.title -> title
meta.description -> meta_description
meta.htags.h1[0] -> h1
page_timing.duration -> response_time
onpage_score -> (store as additional metric)
```

---

## Platform Detection Signatures

After loading data, scan URLs and metadata to detect the platform:

| Platform | URL Signatures | Other Signals |
|---|---|---|
| Shopify | `/collections/`, `/products/`, `cdn.shopify.com`, `myshopify.com` | `Shopify` in meta generator, `X-ShopId` header |
| WordPress | `/wp-content/`, `/wp-admin/`, `/wp-json/` | `WordPress` in meta generator, `X-Powered-By: PHP` |
| Wix | `wixsite.com`, `_wix_browser_sess`, `static.wixstatic.com` | Wix-specific JS bundles |
| Squarespace | `squarespace.com`, `/s/`, squarespace CDN URLs | `Squarespace` in meta generator |
| Magento | `/catalog/product/`, `/checkout/cart/`, `mage/` | `Magento` in response headers |
| Webflow | `webflow.io`, `assets.website-files.com` | Webflow meta generator |
| Next.js / Headless | `/_next/`, `__next` data attributes | React hydration markers |
| Gatsby | `/static/`, gatsby chunk patterns | Gatsby meta generator |
| Drupal | `/node/`, `/sites/default/` | Drupal meta generator, `X-Drupal-Cache` |
| Custom | None of the above match | Report as "Custom / Unknown" |

---

## Data Validation

After ingestion and normalization, run these validation checks:

1. **URL count sanity**: Report total URLs loaded. If < 10, warn the user the crawl may be incomplete.
2. **Status code distribution**: Summarize counts by status code range (2xx, 3xx, 4xx, 5xx).
3. **Missing critical fields**: Report what percentage of rows have empty title, meta description, H1, canonical.
4. **Data freshness**: If crawl timestamp is available, report when the crawl was performed.
5. **Encoding check**: Ensure no garbled characters from encoding mismatches.

Present a quick summary table to the user before proceeding to analysis.

For pages.csv format:
```
Data Source: Ahrefs Site Audit (pages.csv)
Total URLs: 197
Status 2xx: 185 (93.9%)
Status 3xx: 8 (4.1%)
Status 4xx: 3 (1.5%)
Status 5xx: 1 (0.5%)
Platform Detected: Shopify
Crawl Date: 2026-03-04
```

For All Issues format:
```
Data Source: Ahrefs All Issues Export (91 CSVs)
Issue Breakdown: 17 Errors, 28 Warnings, 46 Notices
Unique URLs Affected: 2,847
Top Errors: 404 pages (12), Orphan pages (8), Duplicate without canonical (287)
Top Warnings: 3XX redirects (1,077), Slow pages (15), Missing meta descriptions (13)
Platform Detected: Next.js
```

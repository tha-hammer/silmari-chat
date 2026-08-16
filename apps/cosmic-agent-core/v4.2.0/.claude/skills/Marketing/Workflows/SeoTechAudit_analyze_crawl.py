#!/usr/bin/env python3
"""
Technical SEO Audit - Crawl Data Analysis Engine

This script processes normalized crawl data and runs all audit checks
across the 10 categories defined in the analysis-modules reference.

Usage:
    python analyze_crawl.py --input <normalized_csv> --output <results_json> [--platform <platform>] [--secondary <second_csv>]
"""

import pandas as pd
import json
import argparse
import sys
import re
from collections import Counter, defaultdict
from urllib.parse import urlparse, parse_qs
from pathlib import Path
from difflib import SequenceMatcher


# ---------------------------------------------------------------------------
# Column name normalization helpers
# ---------------------------------------------------------------------------

AHREFS_PAGES_MAP = {
    "URL": "url",
    "HTTP Code": "status_code",
    "Title": "title",
    "Description": "meta_description",
    "H1": "h1",
    "Canonical URL": "canonical",
    "Word Count": "word_count",
    "Internal Links In": "inlinks",
    "Depth": "crawl_depth",
}

# Common columns in Ahrefs All Issues CSVs
AHREFS_ISSUES_MAP = {
    "PR": "priority_rank",
    "URL": "url",
    "Title": "title",
    "Content type": "content_type",
    "Is rendered page": "is_rendered",
    "HTTP status code": "status_code",
    "Organic traffic": "organic_traffic",
    "Depth": "crawl_depth",
    "Is indexable page": "indexability",
    "No. of all inlinks": "inlinks",
    "First found at": "first_found_at",
    "Meta description": "meta_description",
    "H1": "h1",
    "Canonical URL": "canonical",
    "Canonical URL code": "canonical_status_code",
    "Content hash": "hash",
    "No. of pages having the same content": "near_duplicate_count",
    "Size (bytes)": "page_size_bytes",
    "Time to first byte (ms)": "ttfb_ms",
    "Loading time (ms)": "loading_time_ms",
    "Redirect URL": "redirect_url",
    "Redirect URL code": "redirect_status_code",
    "Redirect chain URLs": "redirect_chain_urls",
    "Redirect chain URLs codes": "redirect_chain_codes",
    "Is redirect loop": "is_redirect_loop",
    "No. of redirect inlinks": "redirect_inlinks",
    "No. of content words": "word_count",
    "Schema items": "schema_items",
    "Structured data issues": "structured_data_issues",
    "Referenced in sitemaps": "in_sitemap",
    "No. of href inlinks": "href_inlinks",
    "No. of canonical inlinks": "canonical_inlinks",
}

# Columns in -links CSVs
AHREFS_LINKS_MAP = {
    "Link type": "link_type",
    "Is nofollow": "is_nofollow",
    "Source URL": "source_url",
    "Source HTTP status code": "source_status_code",
    "Target URL": "target_url",
    "Target HTTP status code": "target_status_code",
    "Anchor": "anchor_text",
    "Is source canonical": "is_source_canonical",
    "Is source noindex": "is_source_noindex",
    "Is link internal": "is_internal",
}

# Map Ahrefs filename severity to default SEO impact range
SEVERITY_DEFAULTS = {
    "Error": 7,
    "Warning": 5,
    "Notice": 2,
}


def detect_tool(headers):
    """Detect if the CSV is an Ahrefs export based on column headers."""
    header_set = set(headers)
    if "URL" in header_set and "HTTP Code" in header_set:
        return "ahrefs_pages"
    if "URL" in header_set and "HTTP status code" in header_set and "PR" in header_set:
        return "ahrefs_issues"
    return "unknown"


def detect_input_type(input_path):
    """Detect whether input is a single CSV or an Ahrefs All Issues directory."""
    p = Path(input_path)
    if p.is_dir():
        index_file = p / "index.txt"
        if index_file.exists():
            return "ahrefs_all_issues_dir"
        # Check for multiple CSVs with Error-/Warning-/Notice- prefixes
        csvs = list(p.glob("*.csv"))
        if any(c.name.startswith(("Error-", "Warning-", "Notice-")) for c in csvs):
            return "ahrefs_all_issues_dir"
        return "unknown_dir"
    elif p.is_file() and p.suffix.lower() == ".csv":
        return "single_csv"
    return "unknown"


def parse_issue_filename(filename):
    """Extract severity, scope, and issue name from an Ahrefs All Issues filename.

    Examples:
        Error-404_page.csv -> ('Error', None, '404 page')
        Warning-indexable-Low_word_count.csv -> ('Warning', 'indexable', 'Low word count')
        Error-indexable-Orphan_page_(has_no_incoming_internal_links).csv -> ('Error', 'indexable', 'Orphan page (has no incoming internal links)')
        Error-Non-canonical_page_in_sitemap.csv -> ('Error', None, 'Non-canonical page in sitemap')
    """
    name = filename.replace(".csv", "")
    # Check for -links suffix
    is_links = name.endswith("-links")
    if is_links:
        name = name[:-len("-links")]

    # Split only on the severity prefix (first hyphen)
    severity = "Unknown"
    remainder = name
    for sev in ("Error", "Warning", "Notice"):
        if name.startswith(sev + "-"):
            severity = sev
            remainder = name[len(sev) + 1:]
            break

    # Check for indexable- scope prefix
    if remainder.startswith("indexable-"):
        scope = "indexable"
        issue_name = remainder[len("indexable-"):]
    else:
        scope = None
        issue_name = remainder

    # Clean up issue name: underscores to spaces
    issue_name = issue_name.replace("_", " ")

    return severity, scope, issue_name, is_links


def read_ahrefs_issues_csv(filepath):
    """Read a single Ahrefs All Issues CSV (UTF-16 encoded, tab-separated)."""
    try:
        df = pd.read_csv(filepath, sep='\t', encoding='utf-16')
    except (UnicodeError, UnicodeDecodeError):
        # Fallback to utf-8 in case encoding varies
        df = pd.read_csv(filepath, sep='\t', encoding='utf-8')
    # Strip quotes from column names if present
    df.columns = [c.strip('"').strip() for c in df.columns]
    return df


def ingest_all_issues_dir(dir_path):
    """Ingest an Ahrefs All Issues export directory.

    Returns:
        issues_df: DataFrame with one row per (URL, issue_type) pair
        links_df: DataFrame with link context from -links files
        summary: dict with counts and metadata
    """
    dir_path = Path(dir_path)
    all_issue_rows = []
    all_link_rows = []
    severity_counts = Counter()
    issue_type_counts = Counter()

    csv_files = sorted(dir_path.glob("*.csv"))

    for csv_file in csv_files:
        severity, scope, issue_name, is_links = parse_issue_filename(csv_file.name)

        if severity not in SEVERITY_DEFAULTS and not is_links:
            continue

        df = read_ahrefs_issues_csv(csv_file)
        if df.empty:
            continue

        if is_links:
            # Rename columns using links map
            df = df.rename(columns={k: v for k, v in AHREFS_LINKS_MAP.items() if k in df.columns})
            df["_issue_type"] = issue_name
            df["_severity"] = severity
            all_link_rows.append(df)
        else:
            # Rename columns using issues map
            df = df.rename(columns={k: v for k, v in AHREFS_ISSUES_MAP.items() if k in df.columns})

            # Convert indexability from true/false to Indexable/Non-Indexable
            if "indexability" in df.columns:
                df["indexability"] = df["indexability"].map(
                    lambda x: "Indexable" if str(x).lower() in ("true", "1", "yes") else "Non-Indexable"
                )

            # Convert TTFB and loading time from ms to seconds for response_time
            if "ttfb_ms" in df.columns:
                df["response_time"] = pd.to_numeric(df["ttfb_ms"], errors="coerce") / 1000

            # Add issue metadata columns
            df["_severity"] = severity
            df["_scope"] = scope
            df["_issue_type"] = issue_name
            df["_default_seo_impact"] = SEVERITY_DEFAULTS.get(severity, 3)
            df["_source_file"] = csv_file.name

            severity_counts[severity] += len(df)
            issue_type_counts[issue_name] += len(df)
            all_issue_rows.append(df)

    issues_df = pd.concat(all_issue_rows, ignore_index=True) if all_issue_rows else pd.DataFrame()
    links_df = pd.concat(all_link_rows, ignore_index=True) if all_link_rows else pd.DataFrame()

    # Ensure numeric columns
    if not issues_df.empty:
        issues_df = ensure_numeric(issues_df, [
            "status_code", "organic_traffic", "crawl_depth", "inlinks",
            "page_size_bytes", "word_count", "priority_rank",
            "near_duplicate_count", "redirect_inlinks", "href_inlinks",
            "canonical_inlinks",
        ])

    unique_urls = issues_df["url"].nunique() if not issues_df.empty else 0

    summary = {
        "format": "ahrefs_all_issues",
        "total_issue_rows": len(issues_df),
        "unique_urls": unique_urls,
        "total_link_rows": len(links_df),
        "severity_counts": dict(severity_counts),
        "issue_type_counts": dict(issue_type_counts),
        "csv_count": len(csv_files),
    }

    return issues_df, links_df, summary


def normalize_columns(df, tool):
    """Rename columns to internal schema based on detected tool."""
    if tool == "ahrefs_pages":
        df = df.rename(columns=AHREFS_PAGES_MAP)
    elif tool == "ahrefs_issues":
        df = df.rename(columns=AHREFS_ISSUES_MAP)
    return df


def ensure_numeric(df, cols):
    """Convert columns to numeric, coercing errors to NaN."""
    for col in cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


# ---------------------------------------------------------------------------
# Multi-source merge
# ---------------------------------------------------------------------------

# Fields that should always prefer the freshest value when merging
FRESHNESS_FIELDS = [
    "status_code", "status_text", "title", "title_length", "title_pixel_width",
    "meta_description", "meta_description_length", "h1", "h1_length", "h2",
    "canonical", "meta_robots", "x_robots_tag", "indexability", "indexability_reason",
    "word_count", "text_ratio", "page_size_bytes", "transferred_bytes",
    "total_transferred_bytes", "response_time", "redirect_url", "redirect_type",
    "language", "hash",
]

# Fields where we backfill from the secondary source if missing in primary
BACKFILL_FIELDS = [
    "link_score", "near_duplicate_match", "near_duplicate_count",
    "semantic_similarity_url", "semantic_similarity_score", "semantic_similar_count",
    "semantic_relevance_score", "spelling_errors", "grammar_errors",
    "readability_score", "readability_level", "sentence_count", "co2_mg",
    "carbon_rating", "crawl_depth", "folder_depth", "inlinks", "unique_inlinks",
    "outlinks", "external_outlinks", "gsc_clicks", "gsc_impressions", "gsc_ctr",
    "gsc_position",
]


def _parse_timestamp(ts):
    """Try to parse a crawl timestamp into a comparable datetime."""
    if pd.isna(ts) or ts == "":
        return None
    try:
        return pd.to_datetime(ts)
    except Exception:
        return None


def merge_datasets(primary_df, secondary_df,
                   primary_tool="unknown", secondary_tool="unknown",
                   strategy="freshest"):
    """
    Merge two crawl datasets that have already been normalized to the internal schema.

    Precedence rules
    ----------------
    1. **Deduplicate on URL.** Rows are matched by the ``url`` column.
    2. **Freshness-first.** For every URL that appears in both datasets the
       row from the source with the more recent ``crawl_timestamp`` wins for
       all ``FRESHNESS_FIELDS``.  If timestamps are unavailable the
       ``strategy`` parameter controls the tie-break:
       - ``"freshest"`` (default) — prefer the secondary source on the
         assumption it was fetched more recently (typical when supplementing
         an older export with a live API crawl).
       - ``"primary"`` — always prefer the primary source.
    3. **Backfill gaps.** Fields in ``BACKFILL_FIELDS`` that are missing or
       NaN in the winning row are filled from the losing row so that no data
       is thrown away unnecessarily.
    4. **URLs unique to either source are kept as-is** so the merged dataset
       is a superset of both inputs.

    Parameters
    ----------
    primary_df : pd.DataFrame
        The first (usually file-uploaded) dataset, already normalized.
    secondary_df : pd.DataFrame
        The second (usually API-fetched) dataset, already normalized.
    primary_tool : str
        Name of the tool that produced the primary data (for logging).
    secondary_tool : str
        Name of the tool that produced the secondary data (for logging).
    strategy : str
        Tie-break strategy when timestamps are absent.  One of
        ``"freshest"`` or ``"primary"``.

    Returns
    -------
    pd.DataFrame
        Merged and deduplicated dataset.
    dict
        Merge report with counts and diagnostics.
    """
    if "url" not in primary_df.columns or "url" not in secondary_df.columns:
        raise ValueError("Both datasets must contain a 'url' column after normalization.")

    # Tag the source so we can trace provenance after the merge
    primary_df = primary_df.copy()
    secondary_df = secondary_df.copy()
    primary_df["_source"] = primary_tool or "primary"
    secondary_df["_source"] = secondary_tool or "secondary"

    # Parse timestamps if available
    for df_ref in (primary_df, secondary_df):
        if "crawl_timestamp" in df_ref.columns:
            df_ref["_ts"] = df_ref["crawl_timestamp"].apply(_parse_timestamp)
        else:
            df_ref["_ts"] = None

    # Split into three buckets: primary-only, secondary-only, overlap
    primary_urls = set(primary_df["url"].dropna())
    secondary_urls = set(secondary_df["url"].dropna())
    overlap_urls = primary_urls & secondary_urls
    primary_only_urls = primary_urls - overlap_urls
    secondary_only_urls = secondary_urls - overlap_urls

    # --- Non-overlapping rows pass straight through ---
    primary_only = primary_df[primary_df["url"].isin(primary_only_urls)]
    secondary_only = secondary_df[secondary_df["url"].isin(secondary_only_urls)]

    # --- Resolve overlapping rows ---
    merged_overlap_rows = []
    primary_overlap = primary_df[primary_df["url"].isin(overlap_urls)].set_index("url")
    secondary_overlap = secondary_df[secondary_df["url"].isin(overlap_urls)].set_index("url")

    # Handle duplicate URLs within a single source by keeping first occurrence
    primary_overlap = primary_overlap[~primary_overlap.index.duplicated(keep="first")]
    secondary_overlap = secondary_overlap[~secondary_overlap.index.duplicated(keep="first")]

    for url in overlap_urls:
        if url not in primary_overlap.index or url not in secondary_overlap.index:
            continue

        p_row = primary_overlap.loc[url]
        s_row = secondary_overlap.loc[url]

        # Decide which row wins for freshness fields
        p_ts = p_row.get("_ts")
        s_ts = s_row.get("_ts")

        if p_ts is not None and s_ts is not None:
            winner, loser = (s_row, p_row) if s_ts > p_ts else (p_row, s_row)
        elif strategy == "freshest":
            # No timestamps — assume secondary is newer (typical API supplement)
            winner, loser = s_row, p_row
        else:
            winner, loser = p_row, s_row

        # Start with the winner row
        merged = winner.copy()

        # Backfill missing fields from loser
        all_backfill = BACKFILL_FIELDS + [
            c for c in loser.index
            if c not in FRESHNESS_FIELDS and c not in BACKFILL_FIELDS
            and c not in ("_source", "_ts", "url")
        ]
        for field in all_backfill:
            if field in loser.index:
                winner_val = merged.get(field)
                if pd.isna(winner_val) or winner_val == "" or winner_val is None:
                    merged[field] = loser[field]

        # Record provenance
        winner_source = winner.get("_source", "unknown")
        loser_source = loser.get("_source", "unknown")
        merged["_source"] = f"{winner_source} (winner) + {loser_source} (backfill)"

        merged_overlap_rows.append(merged)

    # Combine everything
    parts = [primary_only, secondary_only]
    if merged_overlap_rows:
        overlap_df = pd.DataFrame(merged_overlap_rows)
        # The URL was used as the index during lookup; restore it as a column
        if "url" not in overlap_df.columns and overlap_df.index.name == "url":
            overlap_df = overlap_df.reset_index()
        elif "url" not in overlap_df.columns:
            overlap_df = overlap_df.reset_index()
            if "index" in overlap_df.columns:
                overlap_df = overlap_df.rename(columns={"index": "url"})
        parts.append(overlap_df)

    result = pd.concat(parts, ignore_index=True, sort=False)

    # Clean up internal columns
    result = result.drop(columns=["_ts"], errors="ignore")

    # Build merge report
    report = {
        "primary_tool": primary_tool,
        "secondary_tool": secondary_tool,
        "primary_urls_total": len(primary_urls),
        "secondary_urls_total": len(secondary_urls),
        "overlap_urls": len(overlap_urls),
        "primary_only_urls": len(primary_only_urls),
        "secondary_only_urls": len(secondary_only_urls),
        "merged_total_urls": len(result),
        "strategy": strategy,
        "timestamps_available": {
            "primary": "crawl_timestamp" in primary_df.columns
                       and primary_df["crawl_timestamp"].notna().any(),
            "secondary": "crawl_timestamp" in secondary_df.columns
                         and secondary_df["crawl_timestamp"].notna().any(),
        },
    }

    return result, report


# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

PLATFORM_SIGNATURES = {
    "shopify": ["/collections/", "/products/", "cdn.shopify.com", "myshopify.com"],
    "wordpress": ["/wp-content/", "/wp-admin/", "/wp-json/"],
    "wix": ["wixsite.com", "static.wixstatic.com"],
    "squarespace": ["squarespace.com", "sqsp.net"],
    "magento": ["/catalog/product/", "/checkout/cart/"],
    "webflow": ["webflow.io", "assets.website-files.com"],
    "nextjs": ["/_next/", "/_next/static/", "/_next/data/", "/_next/image"],
    "ghost": ["/ghost/", "/content/images/", "/p/", "/tag/"],
    "contentful": ["ctfassets.net", "contentful.com", "images.ctfassets.net"],
    "drupal": ["/node/", "/sites/default/"],
}


def detect_platform(df):
    """Detect CMS/platform from URL patterns. Returns all detected platforms."""
    if "url" not in df.columns:
        return "unknown"
    all_urls = " ".join(df["url"].dropna().astype(str).tolist()).lower()
    scores = {}
    for platform, sigs in PLATFORM_SIGNATURES.items():
        score = sum(1 for s in sigs if s.lower() in all_urls)
        if score > 0:
            scores[platform] = score

    if not scores:
        return "custom"

    # Return all detected platforms sorted by score (most signals first)
    detected = sorted(scores.keys(), key=lambda k: scores[k], reverse=True)
    if len(detected) == 1:
        return detected[0]
    return " + ".join(detected)


def detect_site_type(df):
    """Infer site type from URL patterns."""
    if "url" not in df.columns:
        return "unknown"
    urls = df["url"].dropna().astype(str)
    product_count = urls.str.contains("/product", case=False).sum()
    blog_count = urls.str.contains("/blog|/news|/article|/post|/learn", case=False).sum()
    docs_count = urls.str.contains("/docs|/api|/reference|/sdk|/cli", case=False).sum()
    category_count = urls.str.contains("/collection|/categor", case=False).sum()
    total = len(urls)
    if product_count > total * 0.2:
        return "ecommerce"
    if docs_count > total * 0.2:
        return "developer_tools"
    if blog_count > total * 0.3:
        return "blog_publisher"
    if category_count > total * 0.15:
        return "ecommerce"
    return "brochure_saas"


# ---------------------------------------------------------------------------
# Analysis checks
# ---------------------------------------------------------------------------

def check_status_codes(df):
    """1.1 HTTP Status Code Distribution"""
    findings = {"check_id": "1.1", "check_name": "HTTP Status Code Distribution"}
    if "status_code" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Status code data not available"
        return findings

    dist = df["status_code"].value_counts().to_dict()
    code_ranges = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "other": 0}
    for code, count in dist.items():
        code = int(code) if pd.notna(code) else 0
        if 200 <= code < 300: code_ranges["2xx"] += count
        elif 300 <= code < 400: code_ranges["3xx"] += count
        elif 400 <= code < 500: code_ranges["4xx"] += count
        elif 500 <= code < 600: code_ranges["5xx"] += count
        else: code_ranges["other"] += count

    error_urls_4xx = df[df["status_code"].between(400, 499)]["url"].tolist() if "url" in df.columns else []
    error_urls_5xx = df[df["status_code"].between(500, 599)]["url"].tolist() if "url" in df.columns else []

    total_errors = code_ranges["4xx"] + code_ranges["5xx"]
    if code_ranges["5xx"] > 0:
        findings["status"] = "critical"
    elif code_ranges["4xx"] > 5:
        findings["status"] = "critical"
    elif code_ranges["4xx"] > 0:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{code_ranges['4xx']} client errors (4xx), {code_ranges['5xx']} server errors (5xx) out of {len(df)} URLs"
    findings["affected_urls_count"] = total_errors
    findings["affected_urls"] = (error_urls_4xx + error_urls_5xx)[:50]
    findings["details"] = {"distribution": code_ranges, "full_distribution": {str(k): v for k, v in dist.items()}}
    error_pct = (total_errors / len(df) * 100) if len(df) > 0 else 0
    findings["seo_impact"] = min(10, 3 + int(error_pct * 2))
    findings["business_impact"] = min(10, 2 + int(error_pct * 2))
    findings["fix_effort"] = 3
    findings["fix_instructions"] = "Set up 301 redirects for 4xx URLs to their closest equivalent pages. Investigate and resolve 5xx errors at the server level."
    findings["platform_notes"] = "Redirect setup varies by platform — use CMS redirect manager, .htaccess, or server config depending on your stack."
    return findings


def check_redirects(df):
    """1.2 Redirect Analysis"""
    findings = {"check_id": "1.2", "check_name": "Redirect Analysis"}
    redirects = df[df["status_code"].between(300, 399)] if "status_code" in df.columns else pd.DataFrame()

    if len(redirects) == 0:
        findings["status"] = "pass"
        findings["summary"] = "No redirects found in crawl data"
        findings["affected_urls_count"] = 0
        return findings

    chains = []
    loops = []
    temp_redirects = []
    redirect_to_4xx = []

    if "redirect_url" in df.columns and "url" in df.columns:
        redirect_map = dict(zip(df["url"], df["redirect_url"]))
        status_map = dict(zip(df["url"], df["status_code"]))

        for url, target in redirect_map.items():
            if pd.isna(target) or target == "":
                continue
            chain = [url]
            current = target
            seen = {url}
            while current in redirect_map and pd.notna(redirect_map.get(current)):
                if current in seen:
                    loops.append(chain + [current])
                    break
                seen.add(current)
                chain.append(current)
                current = redirect_map[current]
            if len(chain) > 2:
                chains.append(chain)

            target_status = status_map.get(target)
            if pd.notna(target_status) and 400 <= int(target_status) < 500:
                redirect_to_4xx.append({"from": url, "to": target, "target_status": int(target_status)})

    if "status_code" in df.columns:
        temp_redirects = df[df["status_code"].isin([302, 307])]["url"].tolist()

    issues = len(chains) + len(loops) + len(redirect_to_4xx)
    if loops:
        findings["status"] = "critical"
    elif chains or redirect_to_4xx:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(chains)} redirect chains, {len(loops)} loops, {len(temp_redirects)} temporary redirects, {len(redirect_to_4xx)} redirects to 4xx"
    findings["affected_urls_count"] = len(redirects)
    findings["details"] = {
        "chains": chains[:20],
        "loops": loops[:10],
        "temp_redirects": temp_redirects[:20],
        "redirects_to_4xx": redirect_to_4xx[:20],
    }
    findings["seo_impact"] = min(10, 4 + len(loops) * 3 + len(chains))
    findings["business_impact"] = min(10, 3 + len(loops) * 2)
    findings["fix_effort"] = 3
    findings["fix_instructions"] = "Collapse redirect chains to single-hop 301s. Fix redirect loops immediately. Convert temporary (302/307) redirects to permanent (301) where the move is final."
    findings["platform_notes"] = "Check server config or CMS redirect rules for chain sources. Plugins and CDN-level redirects can create hidden chains."
    return findings


def check_crawl_depth(df):
    """1.3 Crawl Depth Analysis"""
    findings = {"check_id": "1.3", "check_name": "Crawl Depth Analysis"}
    if "crawl_depth" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Crawl depth data not available"
        return findings

    depth_dist = df["crawl_depth"].value_counts().sort_index().to_dict()
    deep_pages = df[df["crawl_depth"] >= 4]
    very_deep = df[df["crawl_depth"] >= 6]

    indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df
    deep_indexable = indexable[indexable["crawl_depth"] >= 4] if "crawl_depth" in indexable.columns else pd.DataFrame()
    pct_deep = (len(deep_indexable) / len(indexable) * 100) if len(indexable) > 0 else 0

    if pct_deep > 30:
        findings["status"] = "critical"
    elif pct_deep > 15:
        findings["status"] = "warning"
    elif len(very_deep) > 0:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(deep_pages)} pages at depth 4+, {len(very_deep)} at depth 6+. {pct_deep:.1f}% of indexable pages are deep."
    findings["affected_urls_count"] = len(deep_pages)
    findings["affected_urls"] = deep_pages["url"].tolist()[:30] if "url" in deep_pages.columns else []
    findings["details"] = {"depth_distribution": {str(k): v for k, v in depth_dist.items()}, "pct_deep_indexable": round(pct_deep, 2)}
    findings["seo_impact"] = min(10, 3 + int(pct_deep / 10))
    findings["business_impact"] = min(10, 2 + int(pct_deep / 15))
    findings["fix_effort"] = 6
    findings["fix_instructions"] = "Flatten site architecture by adding internal links from higher-level pages to deep content. Consider adding hub or category pages to reduce click depth."
    findings["platform_notes"] = "Review navigation menus, breadcrumbs, and sidebar widgets to surface deep pages closer to the homepage."
    return findings


def check_orphan_pages(df):
    """1.4 Orphan Pages"""
    findings = {"check_id": "1.4", "check_name": "Orphan Pages"}
    if "unique_inlinks" not in df.columns and "inlinks" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Inlink data not available"
        return findings

    inlink_col = "unique_inlinks" if "unique_inlinks" in df.columns else "inlinks"
    indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df

    orphans = indexable[indexable[inlink_col] <= 1]
    zero_inlinks = indexable[indexable[inlink_col] == 0]

    if len(zero_inlinks) > 5:
        findings["status"] = "critical"
    elif len(orphans) > 10:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(zero_inlinks)} pages with 0 inlinks, {len(orphans)} pages with 0-1 inlinks"
    findings["affected_urls_count"] = len(orphans)
    findings["affected_urls"] = orphans["url"].tolist()[:30] if "url" in orphans.columns else []
    findings["seo_impact"] = min(10, 5 + len(zero_inlinks))
    findings["business_impact"] = min(10, 3 + len(zero_inlinks))
    findings["fix_effort"] = 4
    findings["fix_instructions"] = "Add internal links to orphan pages from relevant content or navigation elements. If pages are intentionally isolated, consider noindexing them or removing them from the sitemap."
    findings["platform_notes"] = "Check that orphan pages are included in XML sitemaps and linked from at least one navigational or contextual element."
    return findings


def check_response_times(df):
    """1.6 Response Time Analysis"""
    findings = {"check_id": "1.6", "check_name": "Response Time Analysis"}
    if "response_time" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Response time data not available"
        return findings

    rt = df["response_time"].dropna()
    if len(rt) == 0:
        findings["status"] = "info"
        findings["summary"] = "No response time data"
        return findings

    mean_rt = rt.mean()
    median_rt = rt.median()
    slow_1s = df[df["response_time"] > 1]
    slow_3s = df[df["response_time"] > 3]
    pct_slow = len(slow_1s) / len(df) * 100

    if mean_rt > 2 or len(slow_3s) > 5:
        findings["status"] = "critical"
    elif mean_rt > 1 or pct_slow > 20:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"Mean: {mean_rt:.2f}s, Median: {median_rt:.2f}s. {len(slow_1s)} pages > 1s, {len(slow_3s)} pages > 3s."
    findings["affected_urls_count"] = len(slow_1s)
    findings["affected_urls"] = slow_3s["url"].tolist()[:20] if "url" in slow_3s.columns else []
    findings["details"] = {
        "mean": round(mean_rt, 3), "median": round(median_rt, 3),
        "slow_1s_count": len(slow_1s), "slow_3s_count": len(slow_3s),
        "pct_slow": round(pct_slow, 2),
    }
    findings["seo_impact"] = min(10, 3 + int(mean_rt * 2))
    findings["business_impact"] = min(10, 3 + int(mean_rt * 2))
    findings["fix_effort"] = 5
    findings["fix_instructions"] = "Investigate slow pages for server-side bottlenecks (database queries, unoptimized APIs, missing caching). Enable server-side caching and consider a CDN for static assets."
    findings["platform_notes"] = "Response times are server-dependent — check hosting plan limits, plugin overhead, and database query performance."
    return findings


def check_url_structure(df):
    """1.5 URL Structure Quality"""
    findings = {"check_id": "1.5", "check_name": "URL Structure Quality"}
    if "url" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "URL data not available"
        return findings

    urls = df["url"].dropna().astype(str)
    issues = {
        "has_parameters": [],
        "has_uppercase": [],
        "too_long": [],
        "has_special_chars": [],
        "double_slashes": [],
    }

    for u in urls:
        parsed = urlparse(u)
        if parsed.query:
            issues["has_parameters"].append(u)
        if u != u.lower():
            issues["has_uppercase"].append(u)
        if len(u) > 200:
            issues["too_long"].append(u)
        path = parsed.path
        if re.search(r'[^a-zA-Z0-9/_\-.]', path):
            issues["has_special_chars"].append(u)
        if '//' in parsed.path:
            issues["double_slashes"].append(u)

    total_issues = sum(len(v) for v in issues.values())
    if total_issues > len(urls) * 0.2:
        findings["status"] = "warning"
    elif total_issues > 0:
        findings["status"] = "info"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(issues['has_parameters'])} parameterized URLs, {len(issues['has_uppercase'])} with uppercase, {len(issues['too_long'])} too long"
    findings["affected_urls_count"] = total_issues
    findings["details"] = {k: v[:15] for k, v in issues.items()}
    findings["seo_impact"] = min(10, 2 + total_issues // 5)
    findings["business_impact"] = 2
    findings["fix_effort"] = 5
    findings["fix_instructions"] = "Clean up URL parameters with canonical tags or parameter handling rules. Lowercase all URLs via server-side redirects. Shorten excessively long URLs."
    findings["platform_notes"] = "URL structure changes require redirects from old URLs. Coordinate with development to avoid breaking existing backlinks."
    return findings


def check_indexability(df):
    """2.1 Indexability Distribution"""
    findings = {"check_id": "2.1", "check_name": "Indexability Distribution"}
    if "indexability" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Indexability data not available"
        return findings

    dist = df["indexability"].value_counts().to_dict()
    indexable = dist.get("Indexable", 0)
    non_indexable = dist.get("Non-Indexable", 0)
    total = indexable + non_indexable

    reason_dist = {}
    if "indexability_reason" in df.columns:
        reasons = df[df["indexability"].str.lower() == "non-indexable"]["indexability_reason"].value_counts().to_dict()
        reason_dist = {str(k): v for k, v in reasons.items()}

    pct_non_indexable = (non_indexable / total * 100) if total > 0 else 0

    if pct_non_indexable > 40:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{indexable} indexable ({100-pct_non_indexable:.1f}%), {non_indexable} non-indexable ({pct_non_indexable:.1f}%)"
    findings["affected_urls_count"] = non_indexable
    findings["details"] = {"distribution": dist, "non_indexable_reasons": reason_dist}
    findings["seo_impact"] = min(10, 2 + int(pct_non_indexable / 10))
    findings["business_impact"] = min(10, 2 + int(pct_non_indexable / 10))
    findings["fix_effort"] = 4
    findings["fix_instructions"] = "Review non-indexable pages to confirm they should be excluded. For pages that should be indexable, check for noindex directives, canonical issues, or robots.txt blocks."
    findings["platform_notes"] = "Non-indexable status can come from meta robots, X-Robots-Tag headers, canonical tags, or robots.txt — check all sources."
    return findings


def check_canonicals(df):
    """2.2 Canonical Tag Audit"""
    findings = {"check_id": "2.2", "check_name": "Canonical Tag Audit"}
    if "canonical" not in df.columns or "url" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Canonical data not available"
        return findings

    indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df

    missing_canonical = indexable[indexable["canonical"].isna() | (indexable["canonical"] == "")]
    self_ref = indexable[indexable["canonical"] == indexable["url"]]
    non_self = indexable[(indexable["canonical"].notna()) & (indexable["canonical"] != "") & (indexable["canonical"] != indexable["url"])]

    # Check canonical targets
    all_urls = set(df["url"].dropna())
    status_map = dict(zip(df["url"], df["status_code"])) if "status_code" in df.columns else {}

    broken_canonical_targets = []
    if len(non_self) > 0 and status_map:
        target_statuses = non_self["canonical"].map(status_map)
        mask = target_statuses.notna() & target_statuses.between(400, 599)
        broken = non_self[mask]
        broken_canonical_targets = [
            {"url": row["url"], "canonical_target": row["canonical"], "target_status": int(status_map[row["canonical"]])}
            for _, row in broken.head(50).iterrows()
        ]

    issues_count = len(missing_canonical) + len(broken_canonical_targets)
    if broken_canonical_targets:
        findings["status"] = "critical"
    elif len(missing_canonical) > len(indexable) * 0.3:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(missing_canonical)} indexable pages missing canonical, {len(self_ref)} self-referencing (good), {len(non_self)} non-self-referencing, {len(broken_canonical_targets)} pointing to error pages"
    findings["affected_urls_count"] = issues_count
    findings["affected_urls"] = missing_canonical["url"].tolist()[:20]
    findings["details"] = {
        "missing_count": len(missing_canonical),
        "self_referencing_count": len(self_ref),
        "non_self_count": len(non_self),
        "broken_targets": broken_canonical_targets[:10],
    }
    findings["seo_impact"] = min(10, 4 + len(broken_canonical_targets) * 2)
    findings["business_impact"] = min(10, 3 + len(broken_canonical_targets))
    findings["fix_effort"] = 3
    findings["fix_instructions"] = "Add self-referencing canonical tags to pages missing them. Fix canonicals pointing to error pages by updating to valid target URLs."
    findings["platform_notes"] = "Most CMS platforms auto-generate canonicals — check theme or plugin settings before adding manual overrides."
    return findings


def check_titles(df):
    """3.1 Title Tag Analysis"""
    findings = {"check_id": "3.1", "check_name": "Title Tag Analysis"}
    indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df

    if "title" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Title data not available"
        return findings

    missing = indexable[indexable["title"].isna() | (indexable["title"].astype(str).str.strip() == "")]
    titles = indexable["title"].dropna().astype(str)
    duplicates = titles[titles.duplicated(keep=False)]
    dup_groups = duplicates.value_counts()

    too_long = indexable[indexable["title_length"].fillna(0) > 60] if "title_length" in indexable.columns else pd.DataFrame()
    too_short = indexable[(indexable["title_length"].fillna(0) > 0) & (indexable["title_length"].fillna(0) < 30)] if "title_length" in indexable.columns else pd.DataFrame()

    pixel_truncated = indexable[indexable["title_pixel_width"].fillna(0) > 580] if "title_pixel_width" in indexable.columns else pd.DataFrame()

    total_issues = len(missing) + len(dup_groups) + len(too_long) + len(too_short)
    if len(missing) > 0:
        findings["status"] = "critical"
    elif len(dup_groups) > 3:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(missing)} missing titles, {len(dup_groups)} duplicate title groups, {len(too_long)} too long, {len(too_short)} too short, {len(pixel_truncated)} pixel-truncated"
    findings["affected_urls_count"] = total_issues
    findings["affected_urls"] = missing["url"].tolist()[:20] if "url" in missing.columns else []
    findings["details"] = {
        "missing_count": len(missing),
        "duplicate_groups": len(dup_groups),
        "duplicate_titles": {str(k): v for k, v in dup_groups.head(10).to_dict().items()},
        "too_long_count": len(too_long),
        "too_short_count": len(too_short),
        "pixel_truncated_count": len(pixel_truncated),
    }
    findings["seo_impact"] = min(10, 5 + len(missing))
    findings["business_impact"] = min(10, 4 + len(missing))
    findings["fix_effort"] = 2
    findings["fix_instructions"] = "Write unique, descriptive title tags for pages with missing or duplicate titles. Keep titles under 60 characters (580px) to avoid truncation in search results."
    findings["platform_notes"] = "Use your CMS SEO plugin or meta tag fields to set per-page titles. Check for theme-level title templates that may override page-level settings."
    return findings


def check_meta_descriptions(df):
    """3.2 Meta Description Analysis"""
    findings = {"check_id": "3.2", "check_name": "Meta Description Analysis"}
    indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df

    if "meta_description" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Meta description data not available"
        return findings

    missing = indexable[indexable["meta_description"].isna() | (indexable["meta_description"].astype(str).str.strip() == "")]
    descs = indexable["meta_description"].dropna().astype(str)
    duplicates = descs[descs.duplicated(keep=False)]
    dup_count = len(duplicates.unique())

    too_long = indexable[indexable["meta_description_length"].fillna(0) > 160] if "meta_description_length" in indexable.columns else pd.DataFrame()
    too_short = indexable[(indexable["meta_description_length"].fillna(0) > 0) & (indexable["meta_description_length"].fillna(0) < 70)] if "meta_description_length" in indexable.columns else pd.DataFrame()

    pct_missing = len(missing) / len(indexable) * 100 if len(indexable) > 0 else 0
    if pct_missing > 50:
        findings["status"] = "warning"
    elif pct_missing > 20:
        findings["status"] = "info"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(missing)} missing ({pct_missing:.1f}%), {dup_count} duplicate groups, {len(too_long)} too long, {len(too_short)} too short"
    findings["affected_urls_count"] = len(missing) + dup_count
    findings["affected_urls"] = missing["url"].tolist()[:20] if "url" in missing.columns else []
    findings["seo_impact"] = min(10, 3 + int(pct_missing / 20))
    findings["business_impact"] = min(10, 2 + int(pct_missing / 25))
    findings["fix_effort"] = 2
    findings["fix_instructions"] = "Write unique meta descriptions for high-traffic pages first. Keep between 70-160 characters. Include a clear value proposition and call to action."
    findings["platform_notes"] = "Meta descriptions can be set via CMS SEO fields or meta tag plugins. Prioritize pages with the most organic traffic."
    return findings


def check_headings(df):
    """3.3 Heading Analysis"""
    findings = {"check_id": "3.3", "check_name": "Heading Analysis"}
    indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df

    if "h1" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "H1 data not available"
        return findings

    missing_h1 = indexable[indexable["h1"].isna() | (indexable["h1"].astype(str).str.strip() == "")]

    if len(missing_h1) > 0:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(missing_h1)} indexable pages missing H1"
    findings["affected_urls_count"] = len(missing_h1)
    findings["affected_urls"] = missing_h1["url"].tolist()[:20] if "url" in missing_h1.columns else []
    findings["seo_impact"] = min(10, 4 + len(missing_h1))
    findings["business_impact"] = min(10, 3 + len(missing_h1) // 2)
    findings["fix_effort"] = 2
    findings["fix_instructions"] = "Add a single, descriptive H1 tag to each page that clearly describes the page content. Ensure H1 is unique across the site and aligns with the title tag."
    findings["platform_notes"] = "H1 tags are typically controlled by page templates — check theme files or CMS content editor settings."
    return findings


def check_content_quality(df):
    """3.4 Content Quality Signals"""
    findings = {"check_id": "3.4", "check_name": "Content Quality Signals"}
    if "word_count" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Word count data not available"
        return findings

    indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df
    wc = indexable["word_count"].dropna()

    if len(wc) == 0:
        findings["status"] = "info"
        findings["summary"] = "No word count data for indexable pages"
        return findings

    thin = indexable[indexable["word_count"] < 300]
    very_thin = indexable[indexable["word_count"] < 100]
    mean_wc = wc.mean()
    median_wc = wc.median()

    text_ratio_issues = pd.DataFrame()
    if "text_ratio" in indexable.columns:
        text_ratio_issues = indexable[indexable["text_ratio"].fillna(100) < 10]

    pct_thin = len(thin) / len(indexable) * 100 if len(indexable) > 0 else 0
    if pct_thin > 30:
        findings["status"] = "warning"
    elif len(very_thin) > 5:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"Mean word count: {mean_wc:.0f}, Median: {median_wc:.0f}. {len(thin)} pages < 300 words ({pct_thin:.1f}%), {len(very_thin)} < 100 words. {len(text_ratio_issues)} pages with text ratio < 10%"
    findings["affected_urls_count"] = len(thin)
    findings["affected_urls"] = very_thin["url"].tolist()[:20] if "url" in very_thin.columns else []
    findings["details"] = {
        "mean_word_count": round(mean_wc),
        "median_word_count": round(median_wc),
        "thin_count": len(thin),
        "very_thin_count": len(very_thin),
        "low_text_ratio_count": len(text_ratio_issues),
    }
    findings["seo_impact"] = min(10, 3 + int(pct_thin / 10))
    findings["business_impact"] = min(10, 2 + int(pct_thin / 15))
    findings["fix_effort"] = 6
    findings["fix_instructions"] = "Expand thin pages (< 300 words) with substantive, relevant content or consolidate them into stronger pages. Review very thin pages (< 100 words) for noindex or removal."
    findings["platform_notes"] = "Thin content on tag, category, or archive pages is common — consider noindexing these or adding unique introductory content."
    return findings


def check_duplicate_content(df):
    """2.5 Duplicate Content Detection"""
    findings = {"check_id": "2.5", "check_name": "Duplicate Content Detection"}

    near_dup_count = 0
    near_dup_urls = []

    if "near_duplicate_count" in df.columns:
        has_dups = df[df["near_duplicate_count"].fillna(0) > 0]
        near_dup_count = len(has_dups)
        near_dup_urls = has_dups["url"].tolist()[:20] if "url" in has_dups.columns else []

    if "hash" in df.columns:
        hash_dups = df[df["hash"].notna() & (df["hash"] != "")].groupby("hash").filter(lambda x: len(x) > 1)
        exact_dup_count = len(hash_dups)
    else:
        exact_dup_count = 0

    total = near_dup_count + exact_dup_count
    if exact_dup_count > 5:
        findings["status"] = "critical"
    elif near_dup_count > 10:
        findings["status"] = "warning"
    elif total > 0:
        findings["status"] = "info"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{exact_dup_count} exact duplicate pages, {near_dup_count} near-duplicate pages"
    findings["affected_urls_count"] = total
    findings["affected_urls"] = near_dup_urls
    findings["seo_impact"] = min(10, 4 + exact_dup_count + near_dup_count // 3)
    findings["business_impact"] = min(10, 3 + exact_dup_count)
    findings["fix_effort"] = 5
    findings["fix_instructions"] = "Consolidate exact duplicates using 301 redirects to the canonical version. For near-duplicates, differentiate content or use canonical tags to indicate the preferred version."
    findings["platform_notes"] = "Duplicate content often arises from URL parameters, print pages, or HTTP/HTTPS variants — check for these common causes first."
    return findings


def check_page_weight(df):
    """5.1 Page Weight Analysis"""
    findings = {"check_id": "5.1", "check_name": "Page Weight Analysis"}
    size_col = None
    for col_name in ["total_transferred_bytes", "transferred_bytes", "page_size_bytes"]:
        if col_name in df.columns:
            size_col = col_name
            break

    if size_col is None:
        findings["status"] = "info"
        findings["summary"] = "Page size data not available"
        return findings

    sizes = df[size_col].dropna()
    if len(sizes) == 0:
        findings["status"] = "info"
        findings["summary"] = "No page size data"
        return findings

    mean_size = sizes.mean()
    heavy_3mb = df[df[size_col] > 3_000_000]
    heavy_5mb = df[df[size_col] > 5_000_000]

    if len(heavy_5mb) > 0:
        findings["status"] = "critical"
    elif mean_size > 2_000_000:
        findings["status"] = "warning"
    elif len(heavy_3mb) > 0:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"Mean page size: {mean_size/1024:.0f}KB. {len(heavy_3mb)} pages > 3MB, {len(heavy_5mb)} > 5MB"
    findings["affected_urls_count"] = len(heavy_3mb)
    findings["affected_urls"] = heavy_3mb["url"].tolist()[:20] if "url" in heavy_3mb.columns else []
    findings["details"] = {
        "mean_bytes": round(mean_size),
        "mean_kb": round(mean_size / 1024),
        "heavy_3mb_count": len(heavy_3mb),
        "heavy_5mb_count": len(heavy_5mb),
    }
    findings["seo_impact"] = min(10, 3 + len(heavy_3mb))
    findings["business_impact"] = min(10, 3 + len(heavy_5mb) * 2)
    findings["fix_effort"] = 5
    findings["fix_instructions"] = "Compress images (use WebP/AVIF), minify CSS/JS, enable gzip/brotli compression, and lazy-load below-the-fold content. Target < 3MB total transferred per page."
    findings["platform_notes"] = "Image optimization plugins or CDN-level compression can reduce page weight without code changes."
    return findings


def check_https(df):
    """8.1 HTTPS Implementation"""
    findings = {"check_id": "8.1", "check_name": "HTTPS Implementation"}
    if "url" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "URL data not available"
        return findings

    http_pages = df[df["url"].str.startswith("http://", na=False)]
    https_pages = df[df["url"].str.startswith("https://", na=False)]

    if len(http_pages) > 0:
        findings["status"] = "critical"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(https_pages)} HTTPS pages, {len(http_pages)} HTTP pages"
    findings["affected_urls_count"] = len(http_pages)
    findings["affected_urls"] = http_pages["url"].tolist()[:20]
    findings["seo_impact"] = 8 if len(http_pages) > 0 else 0
    findings["business_impact"] = 7 if len(http_pages) > 0 else 0
    findings["fix_effort"] = 3
    findings["fix_instructions"] = "Migrate all HTTP pages to HTTPS. Set up 301 redirects from HTTP to HTTPS versions. Update internal links to use HTTPS URLs. Ensure HSTS headers are configured."
    findings["platform_notes"] = "Most hosting providers offer free SSL via Let's Encrypt. Enable force-HTTPS at the server or CDN level."
    return findings


def check_structured_data(df):
    """7.1 Structured Data & Schema"""
    findings = {"check_id": "7.1", "check_name": "Structured Data & Schema"}

    has_schema_items = "schema_items" in df.columns
    has_sd_issues = "structured_data_issues" in df.columns

    if not has_schema_items and not has_sd_issues:
        findings["status"] = "info"
        findings["summary"] = "Structured data columns not available in crawl data"
        return findings

    # Pages with schema validation errors
    error_pages = pd.DataFrame()
    if has_sd_issues:
        error_pages = df[df["structured_data_issues"].notna() & (df["structured_data_issues"] != "")]

    # Pages with schema items present
    schema_pages = pd.DataFrame()
    if has_schema_items:
        schema_pages = df[df["schema_items"].notna() & (df["schema_items"] != "")]

    # Pages without any schema
    no_schema = pd.DataFrame()
    if has_schema_items:
        indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df
        no_schema = indexable[indexable["schema_items"].isna() | (indexable["schema_items"] == "")]

    total_with_schema = len(schema_pages)
    total_with_errors = len(error_pages)
    total_without = len(no_schema)

    if total_with_errors > 10:
        findings["status"] = "critical"
    elif total_with_errors > 0:
        findings["status"] = "warning"
    elif total_without > len(df) * 0.5:
        findings["status"] = "warning"
    else:
        findings["status"] = "pass"

    parts = []
    if has_schema_items:
        parts.append(f"{total_with_schema} pages with schema")
        parts.append(f"{total_without} indexable pages without schema")
    if has_sd_issues:
        parts.append(f"{total_with_errors} pages with validation errors")
    findings["summary"] = ". ".join(parts)

    affected = error_pages if not error_pages.empty else no_schema
    findings["affected_urls_count"] = total_with_errors + total_without
    findings["affected_urls"] = affected["url"].tolist()[:30] if "url" in affected.columns else []

    # Collect error details
    if has_sd_issues and not error_pages.empty:
        error_details = error_pages[["url", "structured_data_issues"]].head(20).to_dict("records")
        findings["details"] = {"validation_errors": error_details}

    # Collect schema type distribution
    if has_schema_items and not schema_pages.empty:
        all_schemas = schema_pages["schema_items"].dropna().astype(str)
        schema_types = Counter()
        for val in all_schemas:
            for item in val.split(","):
                item = item.strip()
                if item:
                    schema_types[item] += 1
        findings.setdefault("details", {})["schema_types"] = dict(schema_types.most_common(20))

    findings["seo_impact"] = 6 if total_with_errors > 5 else 4
    findings["business_impact"] = 5 if total_with_errors > 5 else 3
    findings["fix_effort"] = 4
    findings["fix_instructions"] = "Fix schema validation errors using Google's Rich Results Test. Add appropriate schema types (Article, Product, FAQ, etc.) to pages that lack structured data."
    findings["platform_notes"] = "Many CMS platforms and SEO plugins can auto-generate schema markup — check existing capabilities before adding manual JSON-LD."
    return findings


def check_internal_linking(df):
    """4.1 Internal Link Distribution"""
    findings = {"check_id": "4.1", "check_name": "Internal Link Distribution"}
    inlink_col = None
    for c in ["unique_inlinks", "inlinks"]:
        if c in df.columns:
            inlink_col = c
            break

    if inlink_col is None:
        findings["status"] = "info"
        findings["summary"] = "Internal link data not available"
        return findings

    indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df
    inlinks = indexable[inlink_col].dropna()

    if len(inlinks) == 0:
        findings["status"] = "info"
        findings["summary"] = "No inlink data for indexable pages"
        return findings

    mean_inlinks = inlinks.mean()
    median_inlinks = inlinks.median()
    low_inlinks = indexable[indexable[inlink_col] <= 3]
    high_inlinks = indexable[indexable[inlink_col] > inlinks.quantile(0.95)] if len(inlinks) > 10 else pd.DataFrame()

    findings["status"] = "info"  # Linking is always informational unless severe
    if len(low_inlinks) > len(indexable) * 0.3:
        findings["status"] = "warning"

    findings["summary"] = f"Mean inlinks: {mean_inlinks:.1f}, Median: {median_inlinks:.0f}. {len(low_inlinks)} pages with <= 3 inlinks."
    findings["affected_urls_count"] = len(low_inlinks)
    findings["affected_urls"] = low_inlinks["url"].tolist()[:20] if "url" in low_inlinks.columns else []
    findings["details"] = {
        "mean": round(mean_inlinks, 1),
        "median": round(median_inlinks),
        "low_inlink_count": len(low_inlinks),
        "high_inlink_count": len(high_inlinks),
    }
    findings["seo_impact"] = min(10, 3 + len(low_inlinks) // 5)
    findings["business_impact"] = min(10, 2 + len(low_inlinks) // 10)
    findings["fix_effort"] = 5
    findings["fix_instructions"] = "Add contextual internal links from high-authority pages to under-linked content. Create hub pages or improve navigation to distribute link equity more evenly."
    findings["platform_notes"] = "Internal linking plugins or related-posts widgets can automate some linking, but manual contextual links carry more SEO value."
    return findings


def check_cannibalization(df):
    """3.5 Keyword Cannibalization Detection"""
    findings = {"check_id": "3.5", "check_name": "Keyword Cannibalization Detection"}
    if "title" not in df.columns or "url" not in df.columns:
        findings["status"] = "info"
        findings["summary"] = "Title data not available for cannibalization check"
        return findings

    indexable = df[df["indexability"].str.lower() == "indexable"] if "indexability" in df.columns else df
    titles = indexable[["url", "title"]].dropna(subset=["title"])
    titles = titles[titles["title"].astype(str).str.strip() != ""]

    if len(titles) < 2:
        findings["status"] = "pass"
        findings["summary"] = "Not enough pages for cannibalization analysis"
        return findings

    if len(titles) > 1000:
        findings["status"] = "info"
        findings["summary"] = f"Cannibalization check skipped: {len(titles)} pages exceeds 1,000-page limit for pairwise comparison. Use GSC data for definitive analysis on large sites."
        findings["affected_urls_count"] = 0
        findings["seo_impact"] = 0
        findings["business_impact"] = 0
        findings["fix_effort"] = 0
        return findings

    # Group by similar titles using fuzzy matching
    cannibal_groups = []
    processed = set()
    title_list = titles.to_dict("records")

    for i, row_a in enumerate(title_list):
        if i in processed:
            continue
        group = [row_a]
        for j, row_b in enumerate(title_list[i+1:], start=i+1):
            if j in processed:
                continue
            similarity = SequenceMatcher(None, str(row_a["title"]).lower(), str(row_b["title"]).lower()).ratio()
            if similarity > 0.7:
                group.append(row_b)
                processed.add(j)
        if len(group) > 1:
            cannibal_groups.append(group)
            processed.add(i)

    if len(cannibal_groups) > 5:
        findings["status"] = "warning"
    elif len(cannibal_groups) > 0:
        findings["status"] = "info"
    else:
        findings["status"] = "pass"

    findings["summary"] = f"{len(cannibal_groups)} potential cannibalization groups detected"
    findings["affected_urls_count"] = sum(len(g) for g in cannibal_groups)
    findings["details"] = {
        "groups": [
            {"title_sample": g[0]["title"], "urls": [item["url"] for item in g]}
            for g in cannibal_groups[:10]
        ]
    }
    findings["seo_impact"] = min(10, 4 + len(cannibal_groups))
    findings["business_impact"] = min(10, 3 + len(cannibal_groups))
    findings["fix_effort"] = 6
    findings["fix_instructions"] = "Merge competing pages into a single comprehensive page, or differentiate their title tags and content to target distinct search intents. Use canonical tags if pages must coexist."
    findings["platform_notes"] = "Verify cannibalization with Google Search Console data (Performance > Pages) to confirm which pages actually compete for the same queries."
    return findings


# ---------------------------------------------------------------------------
# Priority scoring
# ---------------------------------------------------------------------------

def calculate_priority(finding):
    """Calculate priority score for a finding."""
    seo = finding.get("seo_impact", 0)
    biz = finding.get("business_impact", 0)
    effort = finding.get("fix_effort", 5)
    score = (seo * 0.4) + (biz * 0.4) + ((10 - effort) * 0.2)
    finding["priority_score"] = round(score, 2)
    if score >= 8:
        finding["priority_band"] = "Critical"
    elif score >= 6:
        finding["priority_band"] = "High"
    elif score >= 4:
        finding["priority_band"] = "Medium"
    elif score >= 2:
        finding["priority_band"] = "Low"
    else:
        finding["priority_band"] = "Informational"
    return finding


def calculate_health_score(findings):
    """Calculate overall and per-category health scores."""
    category_penalties = defaultdict(float)
    status_penalty = {"critical": 15, "warning": 8, "info": 2, "pass": 0}

    for f in findings:
        cat = f.get("check_id", "0.0").split(".")[0]
        penalty = status_penalty.get(f.get("status", "pass"), 0)
        # Scale penalty by affected URL proportion
        affected = f.get("affected_urls_count", 0)
        scale = min(1, affected / 50)  # Cap scaling at 50 URLs
        penalty = penalty * max(0.3, scale)
        category_penalties[cat] += penalty

    category_scores = {}
    for cat, penalty in category_penalties.items():
        category_scores[cat] = max(0, min(100, round(100 - penalty)))

    # Overall weighted score
    weights = {"1": 0.20, "2": 0.20, "3": 0.15, "4": 0.12, "5": 0.12,
               "6": 0.05, "7": 0.05, "8": 0.05, "9": 0.03, "10": 0.03}
    overall = sum(category_scores.get(cat, 100) * weights.get(cat, 0.05) for cat in weights)

    return round(overall), category_scores


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_full_audit(df, platform="auto"):
    """Run all audit checks and return structured results."""

    # Ensure numeric columns
    numeric_cols = ["status_code", "title_length", "title_pixel_width", "meta_description_length",
                    "h1_length", "word_count", "text_ratio", "page_size_bytes", "transferred_bytes",
                    "total_transferred_bytes", "response_time", "crawl_depth", "folder_depth",
                    "inlinks", "unique_inlinks", "outlinks", "external_outlinks",
                    "near_duplicate_count", "spelling_errors", "grammar_errors",
                    "co2_mg", "readability_score", "sentence_count", "semantic_similarity_score"]
    df = ensure_numeric(df, numeric_cols)

    # Detect platform
    if platform == "auto":
        platform = detect_platform(df)
    site_type = detect_site_type(df)

    # Run all checks
    checks = [
        check_status_codes(df),
        check_redirects(df),
        check_crawl_depth(df),
        check_orphan_pages(df),
        check_url_structure(df),
        check_response_times(df),
        check_indexability(df),
        check_canonicals(df),
        check_duplicate_content(df),
        check_titles(df),
        check_meta_descriptions(df),
        check_headings(df),
        check_content_quality(df),
        check_cannibalization(df),
        check_internal_linking(df),
        check_page_weight(df),
        check_https(df),
        check_structured_data(df),
    ]

    # Calculate priority for each
    checks = [calculate_priority(c) for c in checks]

    # Sort by priority score descending
    checks.sort(key=lambda x: x.get("priority_score", 0), reverse=True)

    # Calculate health scores
    overall_health, category_scores = calculate_health_score(checks)

    return {
        "platform": platform,
        "site_type": site_type,
        "total_urls": len(df),
        "overall_health_score": overall_health,
        "category_scores": category_scores,
        "findings": checks,
    }


def main():
    parser = argparse.ArgumentParser(description="Technical SEO Audit Analysis")
    parser.add_argument("--input", required=True,
                        help="Path to primary crawl CSV file or Ahrefs All Issues directory")
    parser.add_argument("--secondary", default=None,
                        help="Path to secondary crawl CSV/JSON to merge (optional)")
    parser.add_argument("--merge-strategy", default="freshest", choices=["freshest", "primary"],
                        help="Tie-break when timestamps are missing: 'freshest' prefers secondary, 'primary' prefers primary")
    parser.add_argument("--output", required=True, help="Path for results JSON output")
    parser.add_argument("--platform", default="auto", help="Platform override (shopify, wordpress, etc.)")
    args = parser.parse_args()

    # Detect input type
    input_type = detect_input_type(args.input)
    print(f"Input type detected: {input_type}")

    issues_df = None
    links_df = None
    ingestion_summary = None

    if input_type == "ahrefs_all_issues_dir":
        # Ingest Ahrefs All Issues directory
        print(f"Loading Ahrefs All Issues directory: {args.input}...")
        issues_df, links_df, ingestion_summary = ingest_all_issues_dir(args.input)
        print(f"Loaded {ingestion_summary['total_issue_rows']} issue rows across "
              f"{ingestion_summary['csv_count']} CSVs")
        print(f"Unique URLs: {ingestion_summary['unique_urls']}")
        print(f"Severities: {ingestion_summary['severity_counts']}")

        # For the standard audit pipeline, build a URL-level df from the issues
        # (deduplicated, with best available metadata per URL)
        if not issues_df.empty:
            url_cols = ["url", "title", "status_code", "content_type", "crawl_depth",
                        "inlinks", "indexability", "organic_traffic", "meta_description",
                        "h1", "canonical", "word_count", "page_size_bytes", "response_time",
                        "redirect_url", "hash", "near_duplicate_count",
                        "schema_items", "structured_data_issues"]
            available_cols = [c for c in url_cols if c in issues_df.columns]
            df = issues_df.groupby("url", as_index=False).first()[available_cols]
        else:
            df = pd.DataFrame()

        primary_tool = "ahrefs_issues"
    else:
        # Load single CSV
        print(f"Loading primary: {args.input}...")
        df = pd.read_csv(args.input, low_memory=False)
        print(f"Loaded {len(df)} rows with {len(df.columns)} columns")

        # Detect tool and normalize primary
        primary_tool = detect_tool(df.columns.tolist())
        print(f"Detected primary tool: {primary_tool}")
        df = normalize_columns(df, primary_tool)

    # Optionally load and merge secondary source
    merge_report = None
    if args.secondary:
        print(f"\nLoading secondary: {args.secondary}...")
        ext = Path(args.secondary).suffix.lower()
        if ext == ".json":
            with open(args.secondary) as f:
                secondary_raw = json.load(f)
            df2 = pd.DataFrame(secondary_raw)
            secondary_tool = "api_json"
        else:
            df2 = pd.read_csv(args.secondary, low_memory=False)
            secondary_tool = detect_tool(df2.columns.tolist())
            df2 = normalize_columns(df2, secondary_tool)

        print(f"Detected secondary tool: {secondary_tool}")
        print(f"Secondary: {len(df2)} rows with {len(df2.columns)} columns")

        print(f"\nMerging datasets (strategy={args.merge_strategy})...")
        df, merge_report = merge_datasets(
            df, df2,
            primary_tool=primary_tool,
            secondary_tool=secondary_tool,
            strategy=args.merge_strategy,
        )
        print(f"Merge complete:")
        print(f"  Primary-only URLs:   {merge_report['primary_only_urls']}")
        print(f"  Secondary-only URLs: {merge_report['secondary_only_urls']}")
        print(f"  Overlapping URLs:    {merge_report['overlap_urls']}")
        print(f"  Merged total:        {merge_report['merged_total_urls']}")

    # Run audit
    print("\nRunning full audit...")
    results = run_full_audit(df, platform=args.platform)

    # Attach ingestion metadata
    if ingestion_summary:
        results["ingestion_summary"] = ingestion_summary
    if issues_df is not None and not issues_df.empty:
        # Attach the per-issue breakdown for richer reporting
        results["ahrefs_issues"] = {
            "severity_counts": ingestion_summary["severity_counts"],
            "issue_type_counts": ingestion_summary["issue_type_counts"],
            "total_issue_rows": ingestion_summary["total_issue_rows"],
        }
    if merge_report:
        results["merge_report"] = merge_report

    # Save results
    with open(args.output, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {args.output}")
    print(f"Overall health score: {results['overall_health_score']}/100")
    print(f"Platform: {results['platform']}")
    print(f"Site type: {results['site_type']}")
    print(f"Issues found: {len([f for f in results['findings'] if f['status'] != 'pass'])}")

    return results


if __name__ == "__main__":
    main()

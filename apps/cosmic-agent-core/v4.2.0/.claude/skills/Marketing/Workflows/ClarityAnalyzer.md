---
name: ClarityAnalyzer
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Analyze Microsoft Clarity CSV exports (clicks and scroll depth) for any webpage. Triggered when the user provides Clarity click or scroll CSV files, or mentions "Clarity data," "Clarity export," "scroll depth," "click heatmap," "heatmap data," "heatmap analysis," "page performance," "page engagement," "CRO," "conversion rate optimization," "where are users clicking," "where do users drop off," "scroll drop-off," "bounce analysis," "user behavior analysis," or "what's working on this page." Produces structured CRO analysis with scroll curves, click behavior rankings, key findings, and actionable recommendations — plus an optional Slack-ready summary.
---

# ClarityAnalyzer

Analyze website visitor behavior from Microsoft Clarity CSV exports. Turns raw click and scroll data into structured CRO insights with actionable recommendations.

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required only if the optional Slack summary needs to match house voice
- `ICP.md` — optional; helps interpret visitor intent against the intended audience
- `Positioning.md` — optional; helps frame recommendations against the page's stated job
- `Terminology.md` — required if the Slack summary will be externally visible
- `NoFlyList.md` — required if recommendations will name customers or competitors

Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.

For each asset you actually read, check the frontmatter `populated:` field.
If `populated: false`, the asset is a stub.

This workflow's core output (the CRO analysis) is data-driven and does not strictly
require any of these assets. They are only required when the user opts into the
Slack-ready summary or asks for recommendations phrased in brand voice.

## Missing-asset bootstrap

If the user requests the Slack-ready summary or voice-aligned recommendations and
a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

For the bare numerical analysis (scroll curve, click rankings, findings), proceed
without the brand assets — the data interpretation does not need them.

## Instructions

### Step 1: Read and validate the CSVs

Read all provided CSV files. Clarity exports have a standard format:

**Metadata rows (top of file):**
- Project name
- Date range
- URL regex filter
- Page views count
- Total clicks (click files only)

**Click CSV columns:** Rank, Button (CSS selector), Clicks, % of clicks

**Scroll CSV columns:** Scroll depth (5–100 in increments of 5), No. of visitors, % drop off

If files are referenced by name or path, read them directly. If the user points to a directory, look for CSV files matching common Clarity naming patterns.

### Step 2: Print structured analysis to console

Output the analysis directly in the conversation. Include all five sections:

**1. Page summary**
- Date range, page views, total clicks, and the URL being analyzed (from CSV metadata)

**2. Scroll depth analysis**
- Summarize the scroll curve in a table showing key depth milestones
- Identify the "scroll cliff" — the depth range where the steepest visitor loss happens
- Call out what % of visitors reach 25%, 50%, 75%, and 100%

**3. Click behavior analysis**
- Translate CSS selectors into human-readable element names (nav links, CTAs, filter dropdowns, search boxes, cards, etc.)
- Group related clicks on the same UI element (e.g., a card's title click, CTA link click, and container click are all "first card" clicks) and report the combined count
- Present as a ranked table

**4. Key findings**
- 3-5 insights as plain-language observations about visitor intent and behavior
- Focus on *what visitors are trying to do* and *where the page fails them*

**5. Recommendations**
- Actionable, prioritized suggestions tied directly to the data

**Multi-page analysis:** If analyzing multiple pages, present each page separately, then add a comparison section highlighting differences in engagement patterns.

**Small samples:** If page views are under ~30, flag that the data is too limited for reliable behavioral conclusions but still note directional signals.

### Step 3: Offer a Slack-ready summary

After the analysis, ask the user if they want a Slack-ready version. If yes, write a concise, conversational summary suitable for pasting into a team Slack channel:

- Lead with a one-line TL;DR
- Use short sections with bold headers: **"The numbers,"** **"What's happening,"** **"What we think we should do,"** **"Next steps"**
- Keep it scannable — bullet points, no jargon, no CSS selectors
- End with a conversation starter ("Thoughts?")

## Interpreting CSS selectors

Clarity exports click targets as verbose CSS selectors. Translate them into plain language using these patterns:

| Selector pattern | Likely element |
|-----------------|----------------|
| `#customNav` / `HEADER` elements | Navigation items (use nth-of-type to identify which link) |
| `A` tags with `font-bold` in nav context | Nav menu links |
| Elements with `bg-black`, `text-white`, `border-black` | CTA buttons |
| `SELECT` elements | Dropdown filters |
| `#search` or `INPUT` elements | Search inputs |
| `DIV.grid` with child `A` elements | Card grids (case studies, blog posts, etc.) |
| `IMG` inside nav `A` tags | Logo clicks |
| `pointer-events-none` with `group-hover` | Dropdown/flyout menus |

Use contextual clues from parent classes:
- `bg-purple-gradient`, `bg-orange` — branded/promotional sections
- `border-t`, `border-b` — section dividers (social proof bars, testimonial strips)
- `overflow-hidden` — carousel or contained content areas
- `footer` or bottom-positioned elements — footer links

## Output requirements

The output is conversational markdown printed directly to the console — not a file. Use tables for scroll depth and click rankings. Use bold headers and numbered lists for findings and recommendations. Keep the tone analytical but accessible.

## Using alongside the official Clarity MCP server

Microsoft offers an [official Clarity MCP server](https://github.com/microsoft/clarity-mcp-server) that connects live to your Clarity account. The two tools are complementary:

- **Clarity MCP server** = data access. It pulls metrics (traffic, engagement time, scroll depth) and session recordings via natural language queries. It does not interpret the data or produce CRO recommendations.
- **This workflow** = analysis layer. It takes click and scroll data and turns it into actionable insights — translating CSS selectors into plain language, identifying behavioral patterns, and generating findings and recommendations.

If you have the Clarity MCP server connected, you can use it to pull data and then hand the exports to this workflow for the CRO analysis. The CSV export path remains valuable because Clarity's click-level CSS selector data (which this workflow specializes in interpreting) is not currently available through the MCP server's API.

## Dependencies

- **Required:** CSV files exported from Microsoft Clarity (click and/or scroll data)
- **Required:** File read access (Claude Code or Cowork with the folder selected)
- **Optional:** Screenshots of the page being analyzed (helps map CSS selectors to visual elements)
- **Optional:** [Microsoft Clarity MCP server](https://github.com/microsoft/clarity-mcp-server) for pulling data without manual CSV exports

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with
brand context swapped to local AAI/USER/MARKETING/ files.

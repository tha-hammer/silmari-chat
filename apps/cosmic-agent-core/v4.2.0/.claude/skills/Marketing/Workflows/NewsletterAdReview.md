---
name: NewsletterAdReview
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Quarterly review of newsletter ad performance data. Triggered when the user says "quarterly ad review," "update newsletter performance," "process ad report," "refresh newsletter data," "newsletter ad review," or provides new publisher (Cooperpress, etc.) performance reports to analyze.
---

# NewsletterAdReview

Quarterly workflow that processes newsletter ad performance data from any publisher, refreshes a local performance reference document, and surfaces insights for the next quarter's ad strategy. Designed to handle multiple publishers in a single review session.

## When to use this workflow

- Processing a new quarter's ad performance data (Cooperpress reports, other publisher reports)
- Updating the swipe file with new top-performing ads
- Refreshing newsletter rankings and strategic recommendations
- Adding a new publisher's data for the first time

## When NOT to use this workflow

- Writing new newsletter ads (use `NewsletterAdWriter`)
- Writing social posts or email campaigns (use `SocialPostWriter` or `EmailNurturePlanner`)

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required for evaluating ad copy quality and qualitative annotations
- `ICP.md` — required for audience-fit analysis on top performers
- `Positioning.md` — required for content theme analysis
- `Terminology.md` — required when annotating swipe file entries

For each required asset, check the frontmatter `populated:` field after reading.
If `populated: false`, the asset is a stub.

Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.

### Storage destination for performance reference

The performance reference document and swipe file live under:

```
~/.claude/AAI/USER/MARKETING/Newsletters/
```

Default file: `~/.claude/AAI/USER/MARKETING/Newsletters/newsletter-ad-reference.md`

If the user prefers a different location (e.g., a project-local path), ask them to specify it before Step 1. Create the `Newsletters/` directory on first run if it does not exist.

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

### 1. Load existing performance data

Fetch the current performance doc from the storage destination:

- **Read** `~/.claude/AAI/USER/MARKETING/Newsletters/newsletter-ad-reference.md` (or the user-specified path).
- If this is the first time running the review (no existing doc), note that we're creating the initial baseline.
- Read the existing doc thoroughly. Note current rankings, swipe file entries, fatigue signals, and the quarterly review log.

### 2. Gather new data

Ask the user which publishers they have new data for and what format it's in. Accept any of:

- **Excel/CSV files:** Cooperpress reports, GA4 exports, or custom spreadsheets. Ask for the file path.
- **Pasted data:** Tables or raw numbers pasted into chat.
- **Multiple publishers:** Process them all in one session. Ask: "Which publishers do you have new data for this quarter?"

For each data set, confirm:
- **Publisher name** (Cooperpress, etc.)
- **Time period** the data covers
- **What metrics are included** (clicks, CTR, spend, GA4 users, conversions, etc.)

Read and process each data file provided.

### 3. Process per publisher

For each publisher's data, calculate and extract:

**Newsletter-level metrics:**
- Total placements, spend, clicks, GA4 users per newsletter
- Cost per GA4 user (primary ranking metric)
- CTR by newsletter
- Click-to-visit rate (Cooperpress clicks vs GA4 users) to detect inflation
- Trend vs. prior quarter (improving, stable, declining)

**Top performers:**
- Identify the top 5–8 placements by a combination of clicks, CTR, and eCPC
- For each, extract: title, supporting text, newsletter, ad type, date, and all metrics
- Draft a qualitative annotation explaining why it worked (audience fit, hook type, technical specificity, etc.)

**Placement type analysis:**
- Primary vs Sponsored (or equivalent ad types) performance comparison

**Content theme analysis:**
- Group placements by content theme/angle
- Calculate CTR and eCPC per theme

**Brand analysis (if applicable):**
- Compare branded vs generic title performance

**Fatigue detection:**
- Flag any newsletter where CTR has declined for 3+ consecutive months
- Flag any newsletter with click-to-visit rate below 30%
- Flag any newsletter where cost per user has increased 25%+ vs prior quarter

### 4. Draft the updated reference doc

Merge the new data into the existing `newsletter-ad-reference.md` document structure:

**For an existing publisher section:**
- Update the top-line numbers with the new data range
- Refresh the newsletter rankings table
- Update the swipe file: add new top performers, keep the best from prior quarters, prune entries that are no longer representative. Cap at ~5 examples per newsletter.
- Refresh placement type, content theme, and brand analysis tables
- Update fatigue signals with current quarter observations
- Refresh strategic recommendations based on the new data
- Add quarter-over-quarter trend comparison

**For a new publisher (first time):**
- Create a new publisher section following the existing structure
- Populate all subsections from the initial data

**Cross-publisher patterns:**
- Review the cross-publisher patterns section
- Update with any new insights that hold across multiple publishers
- Remove patterns that no longer hold

**Quarterly review log:**
- Add an entry: date, what was processed, key changes, notable shifts

### 5. Flag profile updates

Check if the newsletter profiles in the `newsletter-ad-reference.md` doc need updating:

- **New newsletters:** If the data includes newsletters not in the profiles section, flag them: "New newsletter detected: [name]. I'll need audience info and character limits to add a profile."
- **Changed specs:** If character limits or ad types appear to have changed, flag for confirmation.
- **New publishers:** If this is a new publisher, note that a full publisher section needs to be added.

Draft any needed updates to the profiles section of `newsletter-ad-reference.md` and present them to the user.

### 6. Present the summary

Deliver a structured summary:

**Per publisher:**
- Newsletters trending up (improving cost/user or CTR)
- Newsletters trending down (fatigue, declining performance)
- New top performers added to the swipe file (with the ad copy)
- Entries pruned from the swipe file
- Key strategic shifts for next quarter

**Cross-publisher (if multiple publishers):**
- Patterns that hold across publishers
- Patterns that differ by publisher
- Overall portfolio recommendations

**Action items:**
- Reference doc update (present the full drafted doc for review, including any profile changes)
- Strategic recommendations for the next quarter's ad buys

### 7. User review and write-back

Present the full updated `newsletter-ad-reference.md` doc (which contains both profiles and performance data). Once the user confirms, write it back to the storage destination:

```
~/.claude/AAI/USER/MARKETING/Newsletters/newsletter-ad-reference.md
```

Include this note: *"Review the updated reference doc above. Once you're happy with it, I'll write it back to your Newsletters/ storage path. Both newsletter profiles and performance data are in this single doc."*

## Output requirements

Present everything directly in chat as structured Markdown. For the reference doc update, present the complete document so the user can review it before write-back.

## Hand-off

After the review is complete, offer to:
- Write next quarter's ads using the refreshed data with **NewsletterAdWriter**

Do not auto-trigger other workflows. Wait for the user to confirm.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand context swapped to local AAI/USER/MARKETING/ files.

# Marketing Research Workflow

Mine customer language from Reddit discussions and 100+ reviews across Amazon, Facebook, Google, and Facebook Comments. Produces a structured keyword frequency table with sentiment, intensity, repeatability, scale, and importance scores — giving marketers a quantitative picture of how customers actually talk about a product or topic.

USE WHEN doing market research, voice-of-customer analysis, product review mining, keyword research from reviews, or competitive sentiment analysis.

## Load Full AAI Context

**Before starting any task with this skill, load complete AAI context:**

`read ~/.claude/AAI/SKILL.md`

---

## When to Activate This Workflow

- "marketing research on [product/topic]"
- "mine reviews for [product]"
- "voice of customer research"
- "what are customers saying about [X]"
- "review analysis" / "sentiment keyword analysis"
- "find customer language for [product/market]"

---

## Step-by-Step Process

### Step 1: Reddit Search (Language Discovery)

Search Reddit for authentic customer discussions. Reddit reveals the raw language customers use before marketing polish.

```
Search queries to run (use WebSearch or Research skill):
- "[product/topic] review reddit"
- "[product/topic] problems reddit"
- "[product/topic] alternatives reddit"
- "[product/topic] worth it reddit"
- "[competitor] vs [product] reddit"
```

**Extract from Reddit:**
- Repeated phrases, complaints, praises
- Specific words customers use to describe the product
- Pain points expressed in raw language
- Comparisons customers make

### Step 2: Review Mining (100+ Reviews Required)

Collect **at least 100 reviews** across ALL of the following sources. Do not skip sources. Do not collect only positive reviews — negative reviews are equally required.

| Source | How to Access |
|--------|--------------|
| Amazon | WebFetch product page, scroll to reviews section |
| Facebook (Page Reviews) | WebFetch or BrightData MCP for Facebook pages |
| Google Reviews | WebSearch "[product] site:google.com/maps" or BrightData |
| Facebook Comments | WebFetch post comments, use Apify for FB comment scraping |

**Balance rule:** Aim for a mix that reflects the real distribution — if a product has 70% positive reviews, your sample should reflect that. Never filter to only positives.

**Minimum per source:** At least 20 reviews per platform where available.

### Step 3: Keyword Extraction

From all collected Reddit posts and reviews, extract every recurring phrase, term, or keyword. Group similar phrases into buckets.

**Extraction rules:**
- Extract verbatim customer phrases, not paraphrases
- Capture both single words ("slow", "cheap") and multi-word phrases ("falls apart quickly", "great customer service")
- Group synonyms and near-matches into one bucket (e.g., "breaks", "broke", "broken" → "durability issues")
- Count each occurrence separately — one mention per review per phrase (do not double-count within a single review)
- Track whether each mention is positive or negative in context

---

## Output Format

Produce a markdown table sorted by **Frequency (highest first)**.

### Column Definitions

| Column | Description |
|--------|-------------|
| **Phrases/Terms/Keywords** | The exact phrase or keyword bucket from customer language |
| **Frequency** | Raw count: how many times this topic appears across all reviews/posts |
| **% of Frequency** | (Frequency ÷ Total reviews collected) × 100, rounded to 1 decimal |
| **Positive? Negative?** | Sentiment: Positive / Negative / Mixed |
| **Intensity** | How powerful/emotional is this topic? Score 1–10 (see scale below) |
| **Repeatability** | How often does this occur in customers' lives? Score 1–10 (see scale below) |
| **Scale** | What % of people does this affect? Convert % to score (see scale below) |
| **Importance** | Formula: Intensity × Repeatability × Scale |

### Scoring Scales

**Intensity (how powerful is this topic?):**
```
1–3  MINOR   Easy to forget, low emotional charge
4–7  MEDIUM  Noticeable, affects experience
8–10 MAJOR   Life-changing, high emotional charge, deal-breaker level
```

**Repeatability (how often does this occur?):**
```
1–3  INFREQUENT  Rarely occurs (once in a while)
4–7  FREQUENT    Weekly occurrence
8–10 CONSTANT    Daily or hourly occurrence
```

**Scale (what % of people does this affect? → convert to score):**
```
≥81% → 8–10  (use 10 for ~100%, 9 for ~90%, 8 for ~80%)
~55% → 5
~23% → 2
<10% → 1
Interpolate linearly for values between anchors. Round to nearest integer.
Examples:
  90% → 9
  70% → 6–7
  40% → 3–4
  15% → 1–2
```

**Importance (formula):**
```
Importance = Intensity × Repeatability × Scale
Range: 1 (min: 1×1×1) to 1000 (max: 10×10×10)
Higher = more strategically important to address or amplify
```

### Output Table Template

```markdown
| Phrases/Terms/Keywords | Frequency | % of Frequency | Positive? Negative? | Intensity | Repeatability | Scale | Importance |
|------------------------|-----------|----------------|---------------------|-----------|---------------|-------|------------|
| [keyword/phrase]       | [count]   | [X.X%]         | [Positive/Negative/Mixed] | [1-10] | [1-10]    | [1-10]| [I×R×S]   |
```

Sort rows: highest Frequency first.

### Example Row

| Phrases/Terms/Keywords | Frequency | % of Frequency | Positive? Negative? | Intensity | Repeatability | Scale | Importance |
|------------------------|-----------|----------------|---------------------|-----------|---------------|-------|------------|
| battery life too short | 47 | 38.2% | Negative | 7 | 8 | 4 | 224 |
| easy to set up | 83 | 67.5% | Positive | 5 | 1 | 7 | 35 |

---

## Summary Section

After the table, provide:

```markdown
## Key Findings

**Total reviews analyzed:** [N] across [platforms]
**Total keyword buckets:** [N]
**Top 5 by Importance:** [list with scores]
**Top 3 Pain Points (Negative, high Importance):** [list]
**Top 3 Strengths (Positive, high Importance):** [list]
**Most frequent customer language to use in copy:** [top 5 phrases verbatim]
```

---

## Tool Usage

| Task | Tool |
|------|------|
| Reddit search | WebSearch |
| Simple review pages | WebFetch |
| CAPTCHA / bot-blocked sites | BrightData MCP (`mcp__brightdata__*`) |
| Facebook comments scraping | Apify MCP |
| Parallel multi-source research | Spawn background agents (one per source) |

**For large review sets:** Use parallel background agents — one per platform — to collect reviews simultaneously, then aggregate.

```
Agent 1: Amazon reviews
Agent 2: Google reviews
Agent 3: Facebook page reviews
Agent 4: Facebook post comments + Reddit
```

---

## Mandatory Output Persistence

**All research output MUST be saved to disk. Conversation-only output is a failure.**

### Save Location

```
~/.claude/History/research/YYYY-MM-DD_marketing-research-[topic-slug]/
```

### Save Procedure

After completing the research and generating the output table + key findings:

1. **Create the output directory:**
   ```bash
   mkdir -p ~/.claude/History/research/$(date +%Y-%m-%d)_marketing-research-[topic-slug]/
   ```

2. **Save the full report** (keyword table + key findings) to `report.md` in that directory using the Write tool.

3. **Confirm the save** by reading back the file to verify it was written correctly.

The saved `report.md` must contain:
- The complete keyword frequency table (all rows, all columns)
- The Key Findings summary section
- A header with the research topic, date, and number of sources analyzed

**This step is NOT optional. If the output is not saved to a file, the research workflow has failed.**

---

## Quality Checks

Before delivering output:
- [ ] At least 100 total reviews collected
- [ ] All 4 platforms attempted (note if a platform has no reviews)
- [ ] Both positive AND negative reviews included
- [ ] Table sorted by Frequency, highest first
- [ ] Importance formula verified: each row = Intensity × Repeatability × Scale
- [ ] % of Frequency adds up to more than 100% (normal — each review can contain multiple phrases)
- [ ] Summary section completed
- [ ] Output saved to `~/.claude/History/research/` directory

# SEO Article Rubric

Evaluation rubric for SEO-driven content: search-intent articles, comparison posts, roundups, and "best X for Y" pieces. Score each applicable dimension 1–10. For each, output specific observations — not just a rating.

A 7 is solid. A 9–10 means it's genuinely strong ranking content that serves the searcher completely and offers something the current top-10 results don't. Don't grade-inflate.

This rubric is the sidecar for `ContentReviewer.md`. Use it when the workflow classifies a piece as SEO Mode.

---

## Dimension 1: Search Intent Match

**What to evaluate:** Does the piece correctly identify and serve the searcher's intent? Informational queries need explanatory structure. Commercial investigation queries (comparisons, alternatives, "best X") need evaluation structure — criteria, tradeoffs, a recommendation. Transactional queries need CTAs near the top.

**What to output:** State the inferred intent type. Assess whether the content structure matches what Google rewards for that intent. Flag mismatches — e.g., a comparison piece that reads like a thought leadership essay, or an informational piece that buries the answer.

**Comparison piece note:** The piece should serve "X vs Y" or "best X for use case" intent without becoming a product pitch. If the structure funnels the reader toward one option from the opening paragraph, flag it — this reads as marketing, not editorial, and increases bounce rate from searchers expecting a genuine comparison.

---

## Dimension 2: Keyword Placement and Coverage

**What to evaluate:** Is the primary keyword (or its close variants) present in the H1, within the first 100 words, and in at least one H2? Are semantically related terms (LSI keywords — related concepts, synonyms, co-occurring terms) distributed naturally throughout? Is keyword density reasonable — present but not stuffed?

**What to output:** Confirm or flag keyword placement in H1/intro/H2. Note any obvious keyword gaps or overuse. If the primary keyword is absent from the intro or H1, call it out directly.

**Comparison piece note:** Competitor and alternative product names should appear naturally and consistently. If a comparison piece avoids naming alternatives explicitly (e.g., always referring to them generically), it loses relevance signals for queries that include those names.

---

## Dimension 3: Featured Snippet Optimization

**What to evaluate:** Does the piece contain structures Google pulls for featured snippets? Definition paragraphs (40–60 words, starting with "X is..."), comparison tables, numbered step lists, and direct-answer paragraphs are the most common snippet types. Are H2s and H3s phrased as questions when the target query is a question?

**What to output:** Identify the most likely snippet opportunity in this piece (definition, table, list, or step). Assess whether the content is structured to win it. Flag if the best candidate paragraph is too long, buried, or structured in a way that makes extraction difficult.

---

## Dimension 4: SERP Differentiation

**What to evaluate:** Does this piece offer something the current top-10 results for the target query don't? Unique angle, proprietary benchmarks, novel evaluation criteria, fresher data, or a structural format that's more useful. A piece that covers the same ground as existing results in the same order won't displace them.

**What to output:** Identify what the differentiation claim is (or should be). If the piece doesn't have one, say so — this is often the highest-leverage fix for SEO content that's technically solid but not ranking.

**Comparison piece note:** Does the piece include evaluation dimensions or use-case distinctions that competitors' comparison pages omit? Unique criteria (e.g., evaluating tools on operational complexity, not just performance) are strong differentiators.

---

## Dimension 5: Internal Linking and Content Architecture

**What to evaluate:** Does the piece link to relevant product pages, documentation, tutorials, and related blog posts? Are anchor texts descriptive (not "click here" or bare URLs)? Is there a clear relationship to a pillar page or content cluster, or does this piece feel orphaned?

- **Link format:** Are all links full URLs (starting with `https://`)? Relative paths break when content is handed to content marketers or published outside the CMS.
- **External link completeness:** Does every section discussing a competitor or third-party product link to that product's official page?
- **Source links:** Are factual claims (deprecation dates, release announcements, benchmark numbers, pricing) linked to their original sources?

**What to output:** Note which internal links are present and flag obvious gaps (e.g., a comparison piece that mentions your product but doesn't link to the relevant product or docs page). Flag generic anchor text. Flag any relative paths (not full URLs). Flag sections that mention competitor products without linking to their official pages. Flag unlinked factual claims as "needs source."

**Comparison piece note:** Links to your own product should feel organic — earned by context, not forced. A comparison piece that links to your product on every mention reads as promotional. One or two well-placed links to docs or a relevant case study is appropriate.

---

## Dimension 6: Editorial Neutrality *(comparison and roundup pieces only — skip for single-topic SEO articles)*

**What to evaluate:** Are alternatives presented fairly? Are the evaluation criteria applied consistently across all options — not just to your product's strengths? Does the piece acknowledge your product's limitations where relevant? Would a reader who has no prior opinion trust this as an objective resource, or does it read as marketing disguised as editorial?

- **Competitive freshness:** For each competitor mentioned, verify via web search that the product still exists as described, the pricing model hasn't changed, and no major rebranding or discontinuation has occurred since the article was written.

**What to output:** Assess whether evidence is symmetric. Flag asymmetric evidence — e.g., your product's performance backed by benchmarks, competitors described in vague generalities. Flag criteria that appear to be designed to favor one outcome. Note whether the piece's recommendation (if any) feels earned by the analysis or predetermined. Flag stale competitor information with the current source URL. Note which competitors were verified and which could not be checked (e.g., if web search is unavailable).

**Why this matters:** Asymmetric evidence is the core credibility failure for comparison content. Readers evaluating tools are skeptical — they've read vendor-written comparisons before. A piece that clearly advocates for one option from the structure undermines the editorial trust that makes comparison content rank and convert.

---

## Dimension 7: Technical SEO Readiness

**What to evaluate:** Heading hierarchy (single H1, logical H2/H3 nesting — no skipped levels), paragraph length (short paragraphs, ideally under 4 sentences), subheading frequency (roughly every 200–300 words for scannability), image alt text (if images are referenced), and whether the implied URL slug is clean and keyword-inclusive.

**What to output:** Flag any heading hierarchy violations. Note if paragraphs are consistently too long for web reading. Call out missing alt text if images are present. If the title implies a slug that would be unwieldy or keyword-poor, flag it.

---

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand context swapped to local AAI/USER/MARKETING/ files.

---
name: PageCro
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Triggered when the user asks for CRO, landing page feedback, conversion advice, CTA improvements, hero rewrites, bounce or drop-off analysis, or wants recommendations based on Clarity exports, screenshots, or a live page URL. Also triggers on phrases like "conversion rate", "page performance", "why isn't this page converting", "CTA audit", "hero section feedback", "friction analysis", "landing page review", or "page optimization".
---

# PageCro

Audit and improve conversion performance on marketing pages. Combines page review, messaging analysis, friction analysis, and optional Clarity behavioral evidence to produce prioritized recommendations: copy fixes, structural changes, and test ideas.

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required for any voice-sensitive output
- `ICP.md` — required when the workflow targets an audience
- `Positioning.md` — required for content that takes a stance
- `Terminology.md` — required for any externally-visible copy
- `NoFlyList.md` — required for any content that names customers
- `VoiceProfiles/{Name}.md` — only if the user names an author

For each required asset, check the frontmatter `populated:` field after reading.
If `populated: false`, the asset is a stub.

(Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.)

**If Clarity CSVs are provided:** Before proceeding to Step 1, invoke the **ClarityAnalyzer** workflow (or ask the user for processed Clarity findings if it isn't yet ported). Use those findings as behavioral evidence throughout the audit.

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand
output, and missing context is exactly what produces generic AI slop.

## Scope

**Included:** Homepage, product pages, feature pages, campaign landing pages, pricing pages, blog CTA strategy.

**Optional inputs:** Screenshots, page URLs, Clarity CSVs, notes on traffic source and conversion goal.

**Excluded:** Signup flow internals, product onboarding, in-app modals (unless the modal is the primary conversion mechanism on the page).

## Instructions

### Step 1: Classify the page

Determine the page type and primary conversion goal. Ask the user to confirm if ambiguous.

| Page type | Typical primary goal |
|-----------|---------------------|
| Homepage | Navigate to product page or start trial |
| Product / feature page | Start trial or request demo |
| Pricing page | Select plan and start trial |
| Campaign landing page | Single CTA (demo, download, signup) |
| Blog post | Read related content, start trial, or subscribe |
| Comparison page | Choose your product over alternative |

Also identify:

- **Traffic source assumptions** — Where are visitors likely coming from? (organic search, paid ads, email, social, direct) This shapes intent expectations.
- **Visitor intent** — What problem are they trying to solve? What stage of evaluation are they in?

If the user provides traffic source or goal information, use it. If not, infer from the page type and content, and state your assumptions.

For deeper page-type-specific framing (jobs, "what good looks like," common conversion failures, key metrics), consult `PageCro_PageTypeFrameworks.md`.

### Step 2: Audit the page

Work through each dimension in the CRO checklist (see `PageCro_CroChecklist.md`). For each dimension, assess the current state and note specific issues.

The six audit dimensions:

1. **Value proposition clarity** — Is it obvious what your product does and why it matters, within 5 seconds? Is the headline specific and benefit-driven, or vague and feature-first?
2. **CTA hierarchy** — Is there one clear primary CTA? Are secondary CTAs visually subordinate? Is the CTA copy action-oriented and specific ("Start your free trial" not "Get started")?
3. **Trust and proof** — Are there customer logos, case studies, metrics, testimonials, or third-party validation? Is the proof relevant to the visitor's likely concerns?
4. **Objection handling** — Does the page preemptively address common hesitations (pricing, migration difficulty, vendor lock-in, performance at scale)? Are answers specific or hand-wavy?
5. **Scannability and structure** — Can a visitor who skims get the core message? Are headings descriptive? Is the visual hierarchy working? Is there too much text before the first CTA?
6. **Friction and cognitive load** — Are there unnecessary form fields, confusing navigation choices, competing CTAs, jargon without context, or dead ends? Is the path from "interested" to "acting" as short as possible?

#### Folding in behavioral evidence

If Clarity data was processed in the pre-flight, integrate those findings into the relevant dimensions:

- **Scroll depth data** → Scannability (where do visitors stop reading?), CTA hierarchy (is the primary CTA above the scroll drop-off?)
- **Click data** → CTA hierarchy (what are visitors actually clicking?), Friction (are they clicking non-clickable elements or ignoring the primary CTA?)
- **Rage clicks or dead clicks** → Friction (broken expectations, confusing UI)

Don't just list the behavioral data separately. Weave it into the dimensional analysis as supporting evidence.

### Step 3: Assess messaging alignment

Using `Positioning.md`, `ICP.md`, `Terminology.md`, and `BrandVoice.md`, check:

- **Positioning match** — Does the page lead with the problem your product solves, not just features? Does it align with current positioning?
- **Terminology** — Are product names, feature names, and technical terms correct per the glossary?
- **Voice** — Does the copy sound on-brand? Flag AI slop, marketing fluff, passive voice, em dashes, or generic developer-tool language (or whatever your category-equivalent slop is).
- **Competitive framing** — If the page references competitors, does it follow the guardrails in `Positioning.md`.

Keep this section focused on issues that affect conversion, not a full brand audit. If the messaging is generally on-brand, say so and move on.

### Step 4: Produce the audit report

Structure the output as follows:

#### Executive summary

2-3 sentences. What's the page doing well? What's the biggest conversion risk?

#### Top conversion blockers

The 2-3 most critical issues preventing conversions. Each should include:

- What the problem is
- Why it matters (impact on conversion)
- Where on the page it occurs

#### Quick wins

Changes that are low-effort and high-confidence. These should be implementable in under an hour:

- Copy tweaks (headline rewrites, CTA label changes)
- Removing friction (unnecessary fields, confusing microcopy)
- Adding missing trust signals in obvious spots

#### High-impact changes

Changes that require more effort but would meaningfully improve conversion:

- Structural reorganization (section reordering, adding/removing sections)
- New content blocks (case study section, comparison table, objection-handling FAQ)
- Visual hierarchy fixes (CTA prominence, above-fold content)

#### Test ideas

A/B or multivariate test hypotheses. Consult `PageCro_Experiments.md` for a menu of experiments organized by page type — pick tests that address the specific issues found in the audit, don't just list generic tests. Each test idea should include:

- What to test (control vs. variant)
- What you expect to happen and why
- What metric to watch

#### Optional: Rewritten hero / CTA set

If the user asks for it, or if the hero or CTAs are the primary conversion blocker, provide:

- A rewritten headline and subheadline
- Rewritten primary CTA (button copy + supporting text)
- Brief rationale for each change

Write these in the brand voice using `BrandVoice.md`. Use `PageCro_CopyPatterns.md` for headline / CTA / proof / objection-handling patterns.

### Step 5: Offer next steps

After delivering the audit, ask whether the user wants:

- A deeper dive on any specific dimension
- Help rewriting specific sections (hand off to `/marketing`)
- A visual mockup of recommended changes (hand off to `/marketing` if a mockup workflow has been ported, otherwise the user)
- To implement changes on the live site (the user — no automated edit workflow yet)
- A re-audit after changes are made
- Clarity data analyzed if they have CSVs but didn't provide them initially (hand off to **ClarityAnalyzer** once ported)

## Output requirements

The audit report's section order is fixed: Executive summary → Top conversion blockers → Quick wins → High-impact changes → Test ideas → (Optional) Rewritten hero / CTA set. Keep the executive summary to 2-3 sentences. Quick wins must be implementable in under an hour. Each test idea must specify control vs. variant, expected effect with reasoning, and the metric being watched. Tone: direct, specific, evidence-cited. Avoid generic CRO truisms — every recommendation should reference a specific element on the audited page.

## Dependencies

- **Required:** `~/.claude/AAI/USER/MARKETING/` populated (at minimum `BrandVoice.md`, `ICP.md`, `Positioning.md`, `Terminology.md`)
- **Optional:** Clarity CSV exports (processed via the ClarityAnalyzer workflow once ported), screenshots or page URLs for visual review

## Sidecars

- `PageCro_PageTypeFrameworks.md` — page-type-specific jobs, "good looks like," common failures, key metrics
- `PageCro_CroChecklist.md` — six-dimension audit checklist with detailed sub-checks and common failures
- `PageCro_Experiments.md` — menu of A/B and multivariate test ideas organized by page type
- `PageCro_CopyPatterns.md` — reusable headline, CTA, proof, and objection-handling copy patterns

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with
brand context swapped to local AAI/USER/MARKETING/ files.

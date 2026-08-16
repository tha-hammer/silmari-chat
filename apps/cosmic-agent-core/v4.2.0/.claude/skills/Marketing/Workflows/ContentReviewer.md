---
name: ContentReviewer
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Evaluate marketing content drafts against structured quality rubrics — Systems Mode (white papers, architectural posts), Builder Mode (tutorials, educational posts), and SEO Mode (comparisons, roundups, search-intent articles). Triggered when someone asks to review, evaluate, critique, or give feedback on a draft, or pastes content and asks "how does this look?" / "is this ready?"
---

# ContentReviewer

This workflow evaluates marketing content drafts against structured quality rubrics. It does not line-edit or fix grammar. It assesses whether a piece works at the structural, narrative, and strategic level — and gives actionable feedback to make it stronger. This is the quality gate — use it before anything gets published.

## Pre-flight

Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required (voice/terminology spot-check)
- `Positioning.md` — required (positioning-drift checks, terminology)
- `ICP.md` — required (audience calibration)
- `Terminology.md` — required (terminology consistency check)
- `NoFlyList.md` — required (banned phrasing, customer-name guardrails)
- `VoiceProfiles/{Name}.md` — only if the user names an author (voice-match dimension)

For each required asset, check the frontmatter `populated:` field after reading.
If `populated: false`, the asset is a stub.

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand output, and missing context is exactly what produces generic AI slop.

## Three rubrics, three content types

Brand blog content typically falls into three modes. Each has its own evaluation rubric because they're trying to do fundamentally different things:

**Systems Mode** (white papers, architectural posts): The goal is to build credibility and shape how people think about a category. The rubric evaluates thesis strength, narrative momentum, category framing, technical authority, selectivity, whether the conclusion feels earned, and memorability. Think: "Would a senior engineer share this?"

**Builder Mode** (educational posts, tutorials): The goal is to help a developer learn something and take action. The rubric evaluates outcome clarity, practical utility, step-by-step flow, concrete examples, theory discipline, CTA alignment, and builder confidence. Think: "Could someone actually build something after reading this?"

**SEO Mode** (SEO articles, comparison posts, roundups): The goal is to rank for a target query and serve the searcher's intent while maintaining editorial credibility. The rubric evaluates search intent match, keyword placement, featured snippet optimization, SERP differentiation, internal linking, editorial neutrality (for comparison pieces), and technical SEO readiness. Think: "Would this earn a top-3 ranking and keep the reader from hitting the back button?"

## Instructions

### 1. Get the content

The user might paste the draft directly, share a file, or point to a URL. However they provide it, read the full piece before doing anything else.

### 2. Classify the content type

**Pre-classified content:** If the prompt that invoked this workflow includes `Content type: SEO Mode (skip classification)`, accept that classification and skip directly to Step 3. This happens when an SEO writing workflow auto-triggers ContentReviewer after writing an article — the content type is already known.

Determine which mode this content belongs to. Look at the intent of the piece:

- **Systems Mode signals**: architectural arguments, "why we built X this way," category-level framing, design philosophy, market landscape analysis, tradeoff discussions
- **Builder Mode signals**: step-by-step instructions, code examples, "how to do X," tutorials, practical walkthroughs, learning outcomes stated upfront
- **SEO Mode signals**: the piece targets a specific search query; "X vs Y" or "best X for Y" title format; roundup or listicle structure comparing multiple tools or approaches; content organized around a question someone would type into Google; SERP-oriented structure (FAQ sections, comparison tables, "what is X" definitions); keyword-targeting language in headings

If it's ambiguous between Builder and Systems, ask the user. Some pieces blend both — in that case, note which mode the piece leans toward and evaluate against that rubric, but flag sections where it drifts into the other mode (this drift is usually a problem worth calling out).

If it's ambiguous between SEO and another mode, lean toward SEO if the piece has a clear target keyword and a comparison or roundup structure. SEO articles can contain tutorial elements or architectural arguments, but if the primary purpose is to rank for a search query, classify it as SEO Mode.

If the content is neither mode (e.g., a landing page, email, social post, or one-pager), skip the rubric evaluation and instead review it against `BrandVoice.md` — it has tone and structural guidance for each of those content types.

### 3. Load reference docs and the right rubric

Pre-flight already loaded `BrandVoice.md`, `Positioning.md`, `ICP.md`, `Terminology.md`, and `NoFlyList.md`. Use them in the relevant steps below.

Use the rubric that matches the content type you classified:

- For **Systems Mode**: use a white-paper rubric. If the user has a local one (e.g., `~/.claude/AAI/USER/MARKETING/Rubrics/WhitePaper.md`), read it. Otherwise evaluate against the Systems Mode dimensions listed in Step 5 below.
- For **Builder Mode**: use an educational-content rubric. If the user has a local one (e.g., `~/.claude/AAI/USER/MARKETING/Rubrics/Educational.md`), read it. Otherwise evaluate against the Builder Mode dimensions listed in Step 5 below.
- For **SEO Mode**: read `ContentReviewer_SeoArticleRubric.md` (the sidecar in this directory) and evaluate against its seven dimensions.

### 4. Check terminology and positioning

Use `Terminology.md` and `Positioning.md` to check terminology and positioning accuracy. You don't need this for every review, but do load it if the piece names your product, makes competitive claims, or positions the offer. Wrong terminology or off-message positioning is worth flagging even in a structural review.

### 5. Run the evaluation

Work through each of the seven dimensions in the rubric. For each dimension, produce the specific outputs the rubric asks for. Be direct and specific — vague feedback like "could be tighter" isn't useful. Point to specific sections, paragraphs, or transitions.

The rubric is designed to surface structural issues, not nitpick. If a dimension is strong, say so briefly and move on. Spend your time on the dimensions where the piece falls short.

**Builder Mode dimensions:** Outcome Clarity, Practical Utility, Step-by-Step Flow, Concrete Examples, Theory Discipline, Single Clear Next Step, Builder Confidence. For each, specify what to output (e.g., for Builder Confidence: where authority is strong, where it feels generic).

**Systems Mode dimensions:** Core Thesis Strength, Narrative Spine, Category Framing Power, Technical Authority and Credibility, Strategic Selectivity, Conversion Without Selling, Memorability. For each, specify what to output (e.g., for Memorability: the core mental model created, whether it's strong enough to shape future thinking).

**SEO Mode dimensions:** Search Intent Match, Keyword Placement and Coverage, Featured Snippet Optimization, SERP Differentiation, Internal Linking and Content Architecture, Editorial Neutrality (comparison and roundup pieces only — skip for single-topic SEO articles), Technical SEO Readiness. For each, specify what to output (e.g., for Editorial Neutrality: whether evidence is symmetric across compared options, where the piece feels promotional rather than editorial). See `ContentReviewer_SeoArticleRubric.md` for full per-dimension guidance.

### 6. Produce the final assessment

After all seven dimensions, provide:

**For Builder Mode:**
- A 1–10 rating for Builder Mode quality
- The three highest-impact changes to improve clarity and actionability
- Whether this is truly a tutorial or drifting into thought leadership

Assume the audience is working developers (or whatever `ICP.md` defines). Avoid hype language. Think in terms of buildability.

**For Systems Mode:**
- A 1–10 rating for structural quality
- The three highest-impact changes that would elevate it one tier
- A revised high-level outline that would strengthen thesis and momentum

Assume the audience is senior practitioners (or whatever `ICP.md` defines). Avoid hype language. Think in systems.

**For SEO Mode:**
- A 1–10 rating for SEO quality
- The three highest-impact changes to improve ranking potential and editorial credibility
- Whether the piece would earn a featured snippet for its target query
- For comparison pieces: whether editorial neutrality is sufficient to build reader trust, or whether the piece reads as a product pitch

Assume the audience is buyers evaluating tools (or whatever `ICP.md` defines). Think in terms of search intent fulfillment and editorial credibility.

**For all three modes**, the three highest-impact changes should be specific and actionable, not generic advice. The user is going to revise based on your feedback, so prioritize the changes that would move the needle most.

### 7. Editorial quality check

After the structural rubric, do a quick pass on these editorial fundamentals. These are pass/fail checks — flag issues directly, no scoring needed.

**For SEO Mode content:** Check 2 (Evidence and specificity) is handled by the SEO rubric's Editorial Neutrality and SERP Differentiation dimensions. Run checks 1, 3, 4, and 5 only.

1. **Definition precision** — When the piece introduces a key concept, does it define it by its primary function and organizing principle? Flag vague or circular definitions. Sections should open with strong, specific statements that immediately address the topic.
2. **Evidence and specificity** *(Builder and Systems modes only)* — Are broad claims backed by concrete data (compression ratios, query speed improvements, cost reductions)? Are real technologies and industry examples named explicitly rather than alluded to generically?
3. **Strategic linking** — Does the piece link key concepts and product claims to internal resources (docs, case studies, feature pages)? Does it link general technical terms to authoritative external sources? Flag missed linking opportunities.
4. **Readability and flow** — Are there abrupt transitions or disconnected ideas? After introducing a technical concept, does the piece immediately explain its practical benefit? Flag sections where the reader has to infer the "so what."
5. **Terminology consistency** — Are architectural labels and product categories used consistently throughout? Flag cases where the same concept gets different names without explanation. (The next step checks whether terminology is *correct*; this check covers whether it's *consistent*.) For SEO Mode content: also cross-reference product features mentioned in the article against `Terminology.md` and `Positioning.md`. Flag stale product names, outdated API terminology, or incorrect capability descriptions.

Keep this section brief. If all five checks pass cleanly, say so and move on.

### 8. Brand voice spot-check

Separately from the rubric, flag any issues with:

- **Terminology**: wrong product names, outdated branding, incorrect capitalization. Check against `Terminology.md` and the glossary in `Positioning.md`.
- **Em dash verification (automated):** Search the content for `—` (em dash character, U+2014). This is a pass/fail check if `BrandVoice.md` bans em dashes — any occurrence is a failure. Report the count and locations. If the brand voice does not ban em dashes, skip this check.
- **Voice violations**: any item flagged by `BrandVoice.md` (often: generic AI language, passive voice, hedging like "we believe," marketing fluff) and any item from `NoFlyList.md` (banned phrases, banned customer names).
- **Positioning drift**: claims that contradict `Positioning.md`, feature-first framing instead of problem-first, competitive framing that breaks the guardrails defined in your positioning.

Keep this section short. If there are no issues, say so. This is a spot-check, not a full brand audit.

### 9. Offer next steps

After the review, ask whether the user wants:
- A deeper dive on any specific dimension
- Help rewriting specific sections (hand off to `/marketing` for brand-voice writing)
- A re-review after they've made changes

## Voice-match review (optional)

If the user mentions who wrote a piece (e.g., "review Matty's draft," "this is Jacky's post," "does this sound like Mike?"):

1. Run `Bash: ls /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/` to confirm a profile exists for the named author.
2. If a matching profile is present, `Read /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/{Name}.md`. If it is missing, tell the user the voice profile is not yet captured and continue with the standard rubric.
3. Add a **Voice Match** dimension to the review (in addition to the seven rubric dimensions):
   - Compare the draft's sentence rhythm, tone, humor, and paragraph style against the author's profile
   - Flag sections that deviate from their natural voice — this often signals over-editing, AI slop, or a ghost-writer who hasn't internalized the author's style
   - Note where the voice is strongest (usually the most authentic, least polished sections)

If the user doesn't mention an author, don't load a voice profile — just run the standard rubric.

## Prior-content lookup (manual)

The local substrate has no published-content index. If you need to know whether a topic has been covered before, ask the user for relevant prior content URLs/pastes — has this topic been covered before, is this piece retreading old ground or adding something new, are there existing pieces it should reference or link to?

## Calibration notes

A few things to keep in mind when scoring:

- **A 7 is good.** Most published content from good teams lands in the 6-8 range. A 9-10 means it's genuinely best-in-class — the kind of piece that gets shared widely and referenced months later. Don't grade-inflate.
- **The gold standards are 9s.** The reference articles linked in any local rubrics represent what a 9 looks like. Use them as mental anchors.
- **Focus on the highest-leverage feedback.** Three strong suggestions beat ten scattered ones. The user is going to revise based on your feedback, so prioritize the changes that would move the needle most.
- **Be honest, not harsh.** If the piece isn't ready, say so clearly but constructively. "This has a strong core insight but the structure isn't letting it land yet" is better than "This needs major work."

## Output requirements

A complete review has, in order:

1. Content classification (Systems / Builder / SEO, with one-sentence rationale)
2. Per-dimension evaluation against the matching rubric (seven dimensions, with the specific outputs each dimension asks for)
3. Final assessment block (1–10 rating + three highest-impact changes + mode-specific extras from Step 6)
4. Editorial quality check (Step 7) — brief, pass/fail
5. Brand voice spot-check (Step 8) — brief, pass/fail
6. (If applicable) Voice Match dimension
7. Offered next steps (Step 9)

Be direct and specific. Point to sections, paragraphs, transitions. Vague feedback is useless feedback.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand context swapped to local AAI/USER/MARKETING/ files.

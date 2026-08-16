---
name: Marketing
description: Create marketing for any product, service, or offer. Marketing is the PRIMARY entry point for ANY request to build, create, make, or plan marketing for something — it runs a rigid 4-phase process (understand audience, improve checklist, expand 18 sections, implement) that produces a complete copy platform foundation. USE WHEN the user says "create marketing", "build marketing", "make marketing", "do marketing", "plan marketing", "marketing for [anything]", "some marketing", "marketing campaign", "marketing plan", "marketing checklist", "marketing platform", "marketing foundation", "marketing research", "customer research", "ICP", "brand discovery", "campaign promise", "one belief statement", "objection framework", "build a copy platform", "copy platform", "persuasion checklist", "market a product", "market a service", "market an offer".
---

## MANDATORY TRIGGER

**Marketing owns the word "marketing" in all forms.** When the user says ANY of the following, ALWAYS invoke this skill:

- "create marketing" / "build marketing" / "make marketing" / "do marketing" / "plan marketing"
- "marketing for [X]" / "some marketing" / "marketing campaign" / "marketing plan"
- "marketing checklist" / "marketing platform" / "marketing foundation" / "marketing research"
- "copy platform" / "build a copy platform" / "persuasion checklist"
- "customer research" / "ICP" / "brand discovery" / "campaign promise" / "one belief statement" / "objection framework"

| User Says | Action |
|-----------|--------|
| "create marketing for [X]" / "build marketing for [X]" / "marketing for [X]" | -> CopyPlatform workflow (DEFAULT — what most users mean) |
| "marketing checklist" / "copy platform" / "build a copy platform" | -> CopyPlatform workflow |
| "continue my copy platform" / "resume marketing" | -> CopyPlatform workflow (resume) |
| "marketing research" / "customer research" / "ICP" / "brand discovery" | -> MarketingResearch workflow |
| "campaign promise" / "one belief statement" / "objection framework" | -> MarketingResearch workflow |

**Default routing:** CopyPlatform. MarketingResearch is the prerequisite research workflow — run it first when the user hasn't done customer/product/objection research. See `Workflows/MarketingResearch.md` and the worksheets in `ResearchFrameworks/`.

**Delegation to copywriting:** After Marketing completes its 4-phase copy platform build, the user may want ACTUAL copy written (emails, ads, landing pages, headlines, sales stories). That is the `copywriting` skill's job. Hand off by telling the user: "Your copy platform is complete. To write actual copy pieces, invoke the copywriting skill with your specific format request (email / ad / landing page / etc.)." The `copywriting` skill handles writing; the Marketing skill handles building the foundation.

## Customization

**Before executing, check for user customizations at:**
`~/.claude/AAI-USER/SKILLCUSTOMIZATIONS/Marketing/`

If this directory exists, load and apply any PREFERENCES.md, configurations, or resources found there. These override default behavior. If the directory does not exist, proceed with skill defaults.

## MANDATORY: Voice Notification (REQUIRED BEFORE ANY ACTION)

**You MUST send this notification BEFORE doing anything else when this skill is invoked.**

1. **Send voice notification**:
   ```bash
   curl -s -X POST http://localhost:8888/notify \
     -H "Content-Type: application/json" \
     -d '{"message": "Running the CopyPlatform workflow in the Marketing skill to build your copy platform checklist"}' \
     > /dev/null 2>&1 &
   ```

2. **Output text notification**:
   ```
   Running the **CopyPlatform** workflow in the **Marketing** skill to build your copy platform checklist...
   ```

**This is not optional. Execute this curl command immediately upon skill invocation.**

# Marketing Skill

Rigid 4-phase copy platform checklist builder. Guides users through understanding, improvement, expansion, and implementation to produce a comprehensive marketing checklist that an LLM can use to write persuasive sales copy.

---

## CRITICAL CONSTRAINT: The Methodology

**The LLM NEVER generates foundational information.** Audience, problems, USP, claims, proof — ALL foundational content MUST come from the user. The LLM only applies copywriting frameworks to user-provided content to produce structured output.

This is not a suggestion. This is the fundamental design principle. Violating it produces generic, hallucinated marketing content that serves no one.

---

## MANDATORY: Memory Integration (Silmari)

**READ:** `Workflows/Memory.md` — Zettelkasten integration spec for the Marketing skill (post-cutover, uses `Bash silmari save` + `mcp__silmari__zk_recall` per Algorithm v3.9.0).

**Every CopyPlatform invocation MUST run a `mcp__silmari__zk_recall` BEFORE starting** to surface prior copy platform work on the same or adjacent topics. Skipping this wastes the user's prior work.

**SAVE after each phase completion** via the patterns in `Workflows/Memory.md` so the next session compounds on this one.

Cards use **trunk 5** (Applied Science) with **`source:marketing-{topic-slug}-{phase}`** as the differentiator.

Pre-flight check at workflow entry: call `mcp__silmari__zk_status({})` — if the call errors, set an in-prompt flag and skip memory integration for the rest of this workflow.

Never block the workflow on memory unavailability.

---

## Workflow Routing

Route to the appropriate workflow based on the request.

### Copy Platform (Primary Workflow)
- Any marketing checklist / copy platform request -> `Workflows/CopyPlatform.md`

### Marketing Research (Prerequisite workflow)
- Customer research, ICP, objection framework, campaign promise -> `Workflows/MarketingResearch.md`
- When complete, feeds directly into CopyPlatform with pre-populated answers
- Six worksheets live in `ResearchFrameworks/` (01-review-research … 06-one-belief)

### Ported execution workflows (from Tiger Data marketing-skills, de-Tiger'd 2026-04)

These workflows produce specific marketing artifacts on top of the foundation built by
CopyPlatform. Each reads from `~/.claude/AAI/USER/MARKETING/` for brand context — see
**Asset Substrate** below.

| Trigger | Workflow |
|---------|----------|
| "de-slop", "remove AI tells", "make this sound less AI", "this sounds like ChatGPT" | `Workflows/DeSlop.md` |
| "review this content", "evaluate against rubric", "content quality check" | `Workflows/ContentReviewer.md` |
| "optimize meta tags", "title tags and meta descriptions", "SEO meta" | `Workflows/SeoMetaOptimizer.md` |
| "tech SEO audit", "Ahrefs crawl analysis", "site crawl review" | `Workflows/SeoTechAudit.md` |
| "page CRO audit", "improve conversion", "value prop and CTA review" | `Workflows/PageCro.md` |
| "Clarity CSV", "click and scroll analysis", "Microsoft Clarity export" | `Workflows/ClarityAnalyzer.md` |
| "internal linking", "link architecture", "site interlinking optimization" | `Workflows/InternalLinkingOptimizer.md` |
| "press release", "draft a PR", "AP-style announcement" | `Workflows/PressReleaseWriter.md` |
| "email nurture sequence", "nurture campaign", "drip emails" | `Workflows/EmailNurturePlanner.md` |
| "ghost paper", "styled HTML report", "interactive charts report" | `Workflows/GhostPaper.md` |
| "build a deck", "slide deck", "pptx from doc" | `Workflows/DeckBuilder.md` |
| "LinkedIn article", "long-form LinkedIn", "convert blog to LinkedIn article" | `Workflows/LinkedinArticleWriter.md` |
| "social posts", "LinkedIn or X content", "social calendar", "content calendar" | `Workflows/SocialPostWriter.md` |
| "newsletter ad copy", "sponsored newsletter ad", "developer newsletter placement" | `Workflows/NewsletterAdWriter.md` |
| "review newsletter ad performance", "newsletter ad rankings" | `Workflows/NewsletterAdReview.md` |

**Trigger collision rule:** the existing CopyPlatform reserves the verbs *create / build /
make / plan + marketing*. Any user request that uses those verbs routes to CopyPlatform
first, even if it sounds like one of the ported workflows. Ported workflows are entered by
their specific artifact noun ("de-slop this", "press release", "social calendar"), not by
"make some marketing".

## Asset Substrate

The ported workflows above read brand context from `~/.claude/AAI/USER/MARKETING/`:

| File | What it holds |
|---|---|
| `BrandVoice.md` | Voice, tone, banned/preferred patterns, format-specific rules |
| `Positioning.md` | Who we are, mechanism, competitive landscape, proof points |
| `ICP.md` | Ideal customer profile(s), pains, triggers, vocabulary, objections |
| `Terminology.md` | Approved product names, capitalization, banned terms |
| `NoFlyList.md` | Customers/companies that cannot be publicly referenced |
| `VoiceProfiles/<Name>.md` | Per-teammate voice samples + style notes |

This substrate replaces the upstream Tiger Den MCP server. Files are plain markdown and
live in version control under `silmari-agent-memory/AAI/USER/MARKETING/` (visible at
`~/.claude/AAI/USER/MARKETING/` via the existing `~/.claude/AAI` symlink).

Each asset file has frontmatter `populated: true|false`. `populated: false` is the
stub-detection signal — workflows treat the file as missing and trigger the bootstrap
below.

## Missing Asset Bootstrap

When a ported workflow needs an asset that's a stub, it **stops** and tells the user the
asset is missing. The user then runs CopyPlatform (this skill's primary workflow) to build
the missing context. Mapping:

| Asset to populate | CopyPlatform phase / questions |
|---|---|
| `ICP.md` | Phase 1 (Understanding) — U2, U3, U4, U5; Phase 2 (Improvement) — I1, I6, I9 |
| `Positioning.md` | Phase 1 — U1, U7; Phase 2 — I8 |
| `Terminology.md` | Surfaces during Phase 1 U1 (product/service) and Phase 3 expansion |
| `BrandVoice.md` | Not auto-elicited — user provides sample writing or extracts from completed CopyPlatform output |
| `NoFlyList.md` | User-populated only |
| `VoiceProfiles/<Name>.md` | User-populated only |

**Routing rule:** if a user invokes a ported workflow and the bootstrap fires, the
workflow does NOT automatically invoke `/marketing` — it returns control to the user with
explicit instructions. Auto-invocation creates a routing loop where CopyPlatform's
"resume" detection sees the in-progress port-workflow request and gets confused.

---

## State Machine

**READ:** `StateDefinition.md` for the complete 4-phase state machine rules.

The copy platform follows a rigid 4-phase process:
1. **Understanding** — Elicit user's goal, audience, problems, value proposition
2. **Improvement** — Refine checklist, resolve gaps, deeper framework questions
3. **Expand** — Apply 18 copy platform frameworks sequentially
4. **Implement** — Write actual copy using the completed checklist

Phases CANNOT be skipped. Each has minimum exchange requirements and required tasks.

---

## Integration

### Feeds Into
- Future copy-writing workflows (ads, emails, landing pages)
- Story-based marketing workflows (planned)

### Uses
- **Zettel memory** — Persist checklist state across sessions
- **Research skill** — For market research to inform checklist content (user-directed)

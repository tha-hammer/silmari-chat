# Copy Platform Builder

> Build a comprehensive "copy platform" — a master checklist that serves as the foundation for all your marketing copy.

**Read before executing:** `../CHECKLIST_CONVENTION.md`, `../Templates/CopyPlatformSections.md`, `../Templates/AIDAFramework.md`, `../Templates/TenAgreements.md`

---

## 0. Architecture Note — Prefer the Marketing Skill

> **Since 2026-04-15, the authoritative checklist-builder is the Marketing skill** (`v4.2.0/.claude/skills/Marketing/`). It runs the same 4-phase Q&A flow as this workflow, but with deterministic persistence, per-(client, product, version) state, post-persist verification, and filesystem artifacts that downstream Copywriting workflows (SalesStory, ContentWriter) read directly.
>
> **If the user is starting fresh, delegate to the Marketing skill:**
>
> "To build a copy platform with automatic persistence and multi-product support, use the Marketing skill instead — it produces a filesystem checklist that I (Copywriting) can then consume. I'll hand off now."
>
> Then invoke the Marketing skill via the standard trigger words ("create marketing", "marketing for X", etc.).
>
> **This workflow remains usable** for legacy interactive builds or single-session exploration where filesystem persistence isn't required. In that mode it's an in-memory builder and hands off content to `ContentWriter.md` via user-paste.

### Soft resolution (this workflow only)

If the user insists on running this workflow directly:

1. Resolve project-root per `../CHECKLIST_CONVENTION.md`. If ERROR, warn the user but proceed in in-memory mode (no artifact will be produced).
2. If `{project-root}/copyplatforms/{client}/{product}/{version}/` directories exist (any filled triple), offer to load the highest-version triple as a starting point instead of rebuilding from scratch.
3. Otherwise proceed with the legacy in-memory 4-phase build below, and at the end advise the user to re-run via the Marketing skill if they want persistent output.

---

## What Is a Copy Platform?

A copy platform is a structured, hierarchical document that captures everything needed to write persuasive copy for an offer: the USP, appeal, hook, promise, claims, proof, target audience, mechanism, story, and more. Once built, it serves as the master prompt for generating any piece of copy.

**The methodology:** 
Sales copy is "fractal" in nature. The "your appeal" section gives 4 categories of appeal. Each appeal will generate different "mechanisms", "claims and proof", different obstacles for the "what stops them" section. Your job is to reason through these dependencies and produce the actual text, not just a high level description of what might be done. 
CORE FRAMEWORKS:

1. FRACTAL AIDA PATTERN
Each level of writing must follow the AIDA pattern (Attention → Interest → Desire → Action):
- Individual sentences contain micro-AIDA
- Paragraphs contain sentence-level AIDA
- Sections contain paragraph-level AIDA

2. EMOTIONAL-LOGICAL BALANCE
- A (Attention): 80% emotional appeal, 20% logical setup
- I (Interest): 60% emotional hook, 40% logical foundation
- D (Desire): 40% emotional amplification, 60% logical justification
- A (Action): 90% emotional urgency, 10% logical reassurance

ADVERTISEMENT SPECIFIC GUIDELINES:
- Each sentence must be self-contained yet connected
- First sentence: Pattern-interrupt + emotional spike
- Middle sentences: Problem-agitation + solution-hint
- Final sentence: Clear, urgent call-to-action
- Use sensory and emotional language
- Create immediate relevance
---

## The 4 Phases

### Phase 1: Understanding

**Goal:** Discover the core elements of the offer through structured questions.

**Opening message to user:**
> "I'm Silmari — and unlike other AI tools, we start with a checklist. Good copy lives and dies by the foundation, and we build that foundation first. I'll ask you targeted questions to understand your offer, your prospect, and your goal. Let's start."

**Minimum 3 exchanges before advancing to Phase 2.**

**Sections to populate during Understanding:**

1. **Big Idea** — What's the single transformational idea that anchors the offer?
2. **The USP** — What makes this unique, useful, and conceptually simple?
   - "You know how [1-3 problems]... Well, what I do is [solution]"
3. **Your Appeal** — Which of the 4 appeals drives this offer?
   - Sex Appeal (love, friendship, relationships, social acceptance)
   - Material Appeal (money, possessions, financial security)
   - Self-Improvement Appeal (skills, status, ambition, personal growth)
   - Fear/Safety Appeal (health, safety, protection from loss)
4. **Your Hook** — What pattern interrupt grabs attention?
5. **Your Promise** — What specific, believable outcome do you guarantee?
6. **Wants, Needs, Features, Benefits & Costs**
   - Wants: deep desires (transformation, recognition, freedom)
   - Needs: functional requirements
   - Features: what the product IS
   - Benefits: what the product DOES for the prospect
   - Costs: what they give up (money, time, effort)
7. **Claims & Proof** — What claims can you make? What proof do you have?
   - Proof types: results, case studies, social proof, press, living proof, peer-reviewed studies, historical proof, reason-why logic, story proof, specificity
8. **Who Is This For? (Bullseye Clients)** — Primary ideal client + 3-5 similar segments

**Key questions to ask:**
- What does your ideal client desperately want?
- What's the #1 problem your offer solves?
- What have they already tried that didn't work?
- What transformation does your offer provide?
- What proof do you have that it works?
- What objections will they have?

**Output format:** Use XML markers for each section:
```
<SECTION_CONTENT01>
[content for Big Idea]
</SECTION_CONTENT01>

<QUESTIONS>
[remaining questions that need answers]
</QUESTIONS>

<NEXT_STEP>
[recommended next action]
</NEXT_STEP>
```

---

### Phase 2: Building

**Goal:** Structure the checklist, identify dependencies, and ensure completeness before expanding.

**Minimum 4 exchanges before advancing to Phase 3.**

**Key tasks:**
1. Review all Phase 1 sections and identify gaps
2. Resolve dependencies:
   - **Circular:** "Your Appeal" ↔ "Your Hook" (each influences the other — resolve by establishing appeal first, then hook)
   - **Nested:** Target Audience generates different Mechanisms, Claims, and Appeal variants
   - **Linear:** USP → Promise → Hook → Headlines (each builds on the previous)
3. Ask user: "Is this checklist complete? Is there anything missing about your offer, your audience, or your proof?"
4. Score each Problem/Solution set for strength (will be used in USP iterations)

**Output:** Structured checklist with dependency notes and completion status.

---

### Phase 3: Expanding

**Goal:** Expand all 18 copy platform sections using the methodology.

**Minimum 5 exchanges. Expand sections in this order:**

See `../Templates/CopyPlatformSections.md` for full expansion guidance per section.

**Expansion order:**
1. USP (initial)
2. Claims & Proof Points
3. Target Audience (expand to 3-5 segments)
4. The Mechanism (12-15 mechanisms based on USP + claims)
5. Why³ Framework (three levels: surface → real → core motivation)
6. Core Appeal Elements (4 appeal categories, each with variants)
7. Features, Benefits & Costs (matrix)
8. Core Promise (specific, measurable, believable)
9. Hook Development (pattern interrupts)
10. Headline Framework (20+ headlines using 4 U's: Ultra-specific, Unique, Useful, Urgent)
11. The Big Four Elements (NEW / ONLY / BIG / FAST / EASY / SAFE / PREDICTABLE / SIMPLE — 3+ variations each)
12. Dimensionalized Pain Points (10+ hooks from prospect's gap between current and desired state)
13. Vision of The Future (10 aspirational outcomes using Maslow's Hierarchy)
14. USP Iteration 1 (multiple Problem/Solution sets per segment)
15. USP Iteration 2 (score each Problem/Solution set on a table)
16. USP Iteration 3 (new USP variations improving lowest-scoring sets)
17. USP Iteration 4 (refine based on iteration 3)
18. USP Iteration 5 (final refined USP)

**Critical rules for expansion:**
- No vagueness. Every section must contain actual copy examples, not descriptions of what copy might look like.
- Do not add commentary or "best practices" — fill in the actual content.
- Resolve circular dependencies by holding both in tension and resolving toward the most persuasive outcome.
- Specificity increases credibility ("$1,347" not "thousands of dollars").

---

### Phase 4: Implementing

**Goal:** Generate final content from the completed copy platform.

**Minimum 2 exchanges.**

**Route to** `../Workflows/ContentWriter.md` **for actual content generation.**

**Content types available:**
- **LinkedIn Post** (quick impact, 150-300 words)
- **Sales Message** (medium length, 500-1000 words)
- **Email Sequence** (5-email series)
- **Blog Article** (long-form, 1500-3000 words)

**Before generating content:**
- Confirm the copy platform is complete (all 18 sections populated)
- Identify which content type is needed
- Apply the full AIDA framework from `../Templates/AIDAFramework.md`
- Verify the Ten Agreements from `../Templates/TenAgreements.md` are addressed

---

## State Management

Track progress through phases. Do not advance a phase until minimum exchanges are met and required tasks are complete.

| Phase | Min Exchanges | Required Before Advancing |
|-------|--------------|--------------------------|
| Understanding | 3 | 8 initial sections populated |
| Building | 4 | Dependencies resolved, user confirms completeness |
| Expanding | 5 | All 18 sections expanded |
| Implementing | 2 | Content generated and reviewed |

**User can request to revert to any earlier phase at any time.**

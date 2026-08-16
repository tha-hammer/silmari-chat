# Copy Platform State Machine

## Overview

The copy platform follows a rigid 4-phase linear state machine. Phases cannot be skipped. Each phase has minimum exchange requirements and required completion tasks. State transitions are signaled by XML markers in assistant responses.

---

## Phases

### Phase 1: Understanding

**Purpose:** Elicit the user's goal, target audience, core problems, and value proposition. The LLM asks questions ONLY — it does not generate marketing content.

**Minimum exchanges:** 3
**Required tasks before completion:**
- `target_audience_defined` — At least one target audience identified with pain points
- `core_problem_identified` — Core problem the product/service solves is clear
- `value_proposition_clear` — Value proposition articulated by the user

**Transition marker:** `<UNDERSTANDING_COMPLETE>` (emitted by LLM to confirm hook-proposed transition)

**Constraints:**
- The LLM MUST only ask questions and organize user responses
- The LLM MUST NOT generate marketing content, copy, or creative text
- The LLM MUST ask the enumerated questions (U1-U8) from the "Explicit Question Sets" section below
- The `ChecklistStateInjector` hook injects the next unanswered questions into each turn
- Use the checklist sections as a guide for what information to elicit

**Mandatory checklist sections to address:**
```
Your checklist MUST contain these sections:
# Headlines
# Big Idea
# Your Appeal
# Decide Your Appeal
# Your Hook
# How To Develop Your Hook
# Your Promise
# Develop Your Promise
# Wants, Needs, Features, Benefit & Costs
# Identify Wants & Needs
# Identify Features, Benefits, & Costs
# The USP
# The Core Four
# Why Cubed
# Justify their failures, allay fears, confirm suspiciions
# Claims & Proof
  ## Specific Claims
  ## Proof Of Those Claims
  ## Who Is This For? Bullseye Clients.
```

**Response format (Understanding & Improvement phases):**
```
<SECTION_CONTENT01>
[Section content organized from user responses]
</SECTION_CONTENT01>

<SECTION_CONTENT02>
[Section content]
</SECTION_CONTENT02>

... (repeat for all sections)

<QUESTIONS>
[Focused questions about remaining gaps — only questions necessary for the goal]
</QUESTIONS>

<NEXT_STEP>
[Recommendation for what the user should provide next]
</NEXT_STEP>
```

---

### Phase 2: Improvement

**Purpose:** Refine and deepen the checklist. Ask framework-specific questions to fill gaps. Resolve dependencies between sections.

**Minimum exchanges:** 4
**Required tasks before completion:**
- `checklist_structure_defined` — All mandatory checklist sections have content
- `key_sections_identified` — Key sections identified and prioritized
- `dependencies_resolved` — Circular and nested dependencies between sections resolved

**Transition marker:** `<IMPROVEMENT_COMPLETE>` (emitted by LLM to confirm hook-proposed transition)

**Mandatory questions (I1-I10) — enumerated in "Explicit Question Sets" section below:**
The Improvement phase has 10 explicit questions that must ALL be asked and answered. These are NOT optional or "framework-specific" in the vague sense — they are a specific, ordered list. The `ChecklistStateInjector` hook injects the next unanswered questions into each turn.

Each question maps to a specific Blair Warren formula element or psychological framework:
- I1 (failed solutions) → "What stops them" + competitive positioning
- I2 (won't give up) → Constraint mapping for offer design
- I3 (anti-avatar) → Blair Warren: throw rocks at enemies
- I4 (jealous of) → Aspirational framing + social proof angles
- I5 (validation from) → Blair Warren: encourage dreams
- I6 (objections) → Blair Warren: allay fears + justify failures
- I7 (can't fix, celebrate) → Reframe weakness → strength
- I8 (market problems) → Market context for positioning
- I9 (ideal self) → Vision of the future, aspiration
- I10 (truth behind stuck) → Blair Warren: confirm suspicions

**Constraints:**
- Same as Understanding — LLM asks questions, does not generate copy
- Ask 2-3 questions per exchange — do not overwhelm
- Each answer should refine an existing checklist section
- The hook tracks which questions have been asked and answered

---

### Phase 3: Expand

**Purpose:** Apply the 18 copy platform frameworks sequentially to the user's checklist content. 

**Minimum exchanges:** 5
**Required tasks before completion:**
- `all_sections_expanded` — All 18 sections processed
- `questions_addressed` — Any user questions during expansion answered
- `next_steps_defined` — Clear path to implementation defined

**Transition marker:** `<EXPANSION_COMPLETE>`

**Section order (MUST be sequential):**

| # | ID | Title |
|---|-----|-------|
| 1 | `usp` | Unique Selling Proposition |
| 2 | `claims_proof` | Claims & Proof Points |
| 3 | `target_audience` | Target Audience |
| 4 | `mechanism` | The Mechanism |
| 5 | `why_cubed` | Why³ Framework |
| 6 | `appeal` | Core Appeal Elements |
| 7 | `features_benefits` | Features, Benefits & Costs |
| 8 | `promise` | Core Promise |
| 9 | `hook` | Hook Development |
| 10 | `headlines` | Headline Framework |
| 11 | `big_four` | The Big Four Elements |
| 12 | `pain_list` | Dimensionalized Pain Points |
| 13 | `vision_list` | Vision of The Future |
| 14 | `usp1` | USP Iteration 1 — Generate Problem/Solution sets |
| 15 | `usp2` | USP Iteration 2 — Evaluation matrix |
| 16 | `usp3` | USP Iteration 3 — Improve low-scoring criteria |
| 17 | `usp4` | USP Iteration 4 — Final refinement |
| 18 | `usp5` | USP Iteration 5 — Final selection |

**For each section:**
1. Read `CopyPlatformSections/{NN}-{name}.md`
2. Apply the framework to the actual checklist content 
3. Emit section completion marker: `<SECTION_{N}_EXPANSION_COMPLETE>`
4. Proceed to next section

**USP Iterations (sections 14-18) are special:**
- Section 14: Generate multiple Problem/Solution sets per audience segment
- Section 15: Score each set using evaluation matrix (Uniqueness, Usefulness, Simplicity, etc.)
- Section 16: Improve lowest-scoring criteria
- Section 17: Final refinement pass
- Section 18: Final selection and polish

**Constraints:**
- MUST use the actual checklist content — never assume or speculate
- MUST follow each section's specific framework rigidly
- Creative with wording, NOT with process
- Each section builds on previous sections — maintain consistency
- Resolve dependencies before introducing new concepts

---

### Phase 4: Implement

**Purpose:** Write actual marketing copy using the completed expanded checklist as the foundation.

**Minimum exchanges:** 2
**Required tasks before completion:**
- `final_review_complete` — User has reviewed the expanded checklist
- `implementation_steps_clear` — Copy deliverables identified

**No transition marker** (final phase)

**Capabilities:**
- Write sales copy (ads, emails, landing pages, VSLs, webinar scripts)
- Apply AIDA at every level (fractal — headline AIDA, ad AIDA, page AIDA, offer AIDA)
- Use the expanded checklist as the source of truth for all copy
- The 10 Agreements must be addressed in long-form copy

**Constraints:**
- ALL copy must be grounded in the expanded checklist
- The LLM writes copy but the foundational claims, proof, and USP come from the checklist
- User directs what format to write (email, ad, landing page, etc.)

---

## Explicit Question Sets (Hook-Enforced)

Each phase has a numbered set of questions the LLM MUST ask. The hooks track which have been asked and answered. The LLM cannot skip questions or invent its own process.

### Understanding Phase Questions

| # | ID | Question | What It Fills |
|---|-----|----------|--------------|
| U1 | `product_service` | What product or service are you marketing? | Big Idea, context |
| U2 | `ideal_client` | Who is your ideal client? Describe them specifically. | Who Is This For, Target Audience |
| U3 | `audience_segments` | Who ELSE could benefit? Help me identify 3-5 target audiences based on their "pain." | Target Audience expansion |
| U4 | `core_problems` | What problems does your target market have? What are they trying now that isn't working? | What Stops Them, Core Problem |
| U5 | `desired_outcome` | What outcome do they want? What does life look like after solving this? | The Desire, Vision |
| U6 | `proof_points` | What proof do you have that your solution works? (results, case studies, testimonials) | Claims & Proof |
| U7 | `differentiator` | What makes your approach different from competitors? | The USP, The Mechanism |
| U8 | `cta_next_step` | What's the immediate next step you want someone to take when they see your ad? | CTA, funnel entry |

### Improvement Phase Questions

| # | ID | Question | What It Fills |
|---|-----|----------|--------------|
| I1 | `failed_solutions` | What are they trying now to solve the problem? Why don't they like those solutions? Why aren't they working? | What They're Trying Now |
| I2 | `wont_give_up` | What are they NOT willing to give up to solve their problem? (e.g., "won't spend hours at the gym") | Constraints, objection handling |
| I3 | `anti_avatar` | Who is the anti-avatar or common enemy? (e.g., big pharma, "guru" competitors, the establishment) | Anti-Avatar, throw rocks |
| I4 | `jealous_of` | Who are they jealous of? Who do they compare themselves to? | Emotional triggers, aspirational framing |
| I5 | `validation_from` | Who are they trying to get validation or acceptance from? (peers, family, industry) | Social proof angles, appeal |
| I6 | `objections_beliefs` | What are their objections and limiting beliefs? Why wouldn't they buy? | Objections, limiting beliefs |
| I7 | `cant_fix_celebrate` | What can't you fix, that you can celebrate? (e.g., "product is new" → "beta launch = 1-on-1 support") | Reframe weaknesses |
| I8 | `market_problems` | What are the 3 main problems in the market right now? | Market context, positioning |
| I9 | `ideal_self` | Who is their ideal self? What does "success" look like to them personally? | Who Is Their Ideal Self |
| I10 | `truth_behind_stuck` | What's the TRUTH behind the REAL REASON they're stuck? (not what they say — what's actually happening) | Deeper psychology, mechanism |

### Expand Phase — No Questions (Framework Application)

The expand phase doesn't ask questions — it applies the 18 frameworks sequentially. Progress is tracked by section number.

### Implement Phase — User-Directed

The implement phase is user-directed. The user specifies what copy format to write. No enumerated questions — the hook tracks deliverables.

---

## State Persistence

State is persisted to: `~/.claude/MEMORY/STATE/marketing-checklist.json`

```json
{
  "active": true,
  "phase": "understanding|improvement|expand|implement",
  "currentSection": 0,
  "expandedSections": [],
  "totalSections": 18,
  "exchangeCount": 0,
  "startedAt": "ISO-8601",
  "lastUpdated": "ISO-8601",
  "topicSlug": "string",
  "questions": {
    "understanding": {
      "asked": ["product_service", "ideal_client"],
      "answered": ["product_service"],
      "total": 8
    },
    "improvement": {
      "asked": [],
      "answered": [],
      "total": 10
    }
  },
  "completionEvidence": {
    "target_audience_defined": false,
    "core_problem_identified": false,
    "value_proposition_clear": false,
    "checklist_structure_defined": false,
    "key_sections_identified": false,
    "dependencies_resolved": false
  },
  "transitionProposed": false,
  "transitionProposedAt": null
}
```

**Resume behavior:** When the workflow detects an existing state file, surface the current phase, question progress, and offer to resume or start fresh.

---

## Transition Model: Collaborative Handshake (Hook-Proposed)

Phase transitions are NOT self-reported by the LLM. They are **proposed by the hook** and **confirmed by the LLM**.

### Why Not LLM-Asserted Transitions

The original web app relied on the LLM emitting XML markers like `<UNDERSTANDING_COMPLETE>`. In practice:
- LLMs frequently hallucinate the tag prematurely
- LLMs forget to emit the tag even when requirements are met
- Clients rarely validated the checklist quality before accepting transitions

The hook-proposed model fixes this by making the **system** responsible for detecting readiness and the **LLM** responsible only for confirming.

### How It Works

**Step 1 — Evidence Detection (Stop hook, every response):**
The `ChecklistEnforcer` Stop hook scans each assistant response for evidence that phase requirements are being met:
- Counts exchanges
- Checks which questions from the enumerated set have been asked
- Scans for keywords indicating tasks are complete (audience names, problem statements, proof points)
- Updates `completionEvidence` flags in state

**Step 2 — Transition Proposal (UserPromptSubmit hook, next turn):**
When the `ChecklistStateInjector` UserPromptSubmit hook detects that:
- Minimum exchanges met
- All enumerated questions asked AND answered
- Completion evidence flags all true

It injects a transition proposal into the system-reminder:

```
TRANSITION PROPOSAL: The system detects that all Understanding phase requirements
appear to be met:
  - 8/8 questions asked and answered
  - 4 exchanges completed (minimum: 3)
  - Evidence: target audience defined, core problem identified, value proposition clear

Review the checklist quality. If you agree the checklist is ready for the
Improvement phase, emit <UNDERSTANDING_COMPLETE>. If gaps remain, explain
what's missing and continue asking questions.
```

**Step 3 — LLM Confirmation:**
The LLM reads the proposal and either:
- Emits the transition marker (confirming the hook's assessment)
- Continues working (overriding the hook's assessment with explanation)

**Step 4 — State Update (Stop hook, same response):**
The Stop hook detects the emitted marker and updates the state file.

### Transition Requirements Summary

| Phase | Min Exchanges | Questions (asked+answered) | Evidence Flags |
|-------|--------------|---------------------------|----------------|
| Understanding → Improvement | 3 | U1-U8 all answered | target_audience_defined, core_problem_identified, value_proposition_clear |
| Improvement → Expand | 4 | I1-I10 all answered | checklist_structure_defined, key_sections_identified, dependencies_resolved |
| Expand → Implement | 5 | N/A (18 sections tracked) | all_sections_expanded |
| Implement → Done | 2 | N/A | final_review_complete |

### Fallback: Manual Transition

If the hook never proposes a transition (e.g., evidence detection misses something), the user can always say "move to the next phase" and the LLM can emit the marker manually. The hook will accept it. The collaborative handshake is the *preferred* path, not the only path.

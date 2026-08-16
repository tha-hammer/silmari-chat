# Copy Platform Workflow

> ⚠️ **DEPRECATED WORKFLOW (2026-04-11 AAI rebrand):** This file contains `zettel` CLI calls that no longer work. Every `zettel recall/save/link/hub` invocation below must be rewritten as `mcp__silmari__zk_*` MCP tool calls. Mapping table: `/home/maceo/Dev/silmari-agent-memory/AAI/Algorithm/migration_v3.7.0_shape_diff.md`. Until rewritten, Marketing skill invocations will fail at the first `zettel` call. Tracked in Plan 003 Phase B as a follow-up.

**Mode:** ALGORITHM (multi-step, multi-phase)
**Trigger:** Any marketing checklist / copy platform request
**Speed target:** Multi-session (the full process takes multiple exchanges across potentially multiple sessions)

---

## When to Use

- User wants to build a marketing checklist or copy platform
- User wants to create sales copy using a structured process
- User says "marketing", "copy platform", "copywriting checklist", "build marketing"
- User says "continue my copy platform" or "resume marketing checklist"

---

## Hook Architecture

This workflow is supported by two hooks that enforce the state machine:

| Hook | Event | Role |
|------|-------|------|
| `ChecklistStateInjector` | `UserPromptSubmit` | **Pre-response.** Reads state, injects phase constraints, enumerates unanswered questions, proposes transitions when ready |
| `ChecklistEnforcer` | `Stop` | **Post-response.** Scans response for questions asked, scans user message for questions answered, updates evidence flags, tracks phase transitions |

**Key principle:** Phase transitions are NOT self-reported by the LLM. The `ChecklistStateInjector` hook detects readiness and proposes the transition. The LLM only needs to confirm by emitting the transition marker.

See `StateDefinition.md` § "Transition Model: Collaborative Handshake" for the complete protocol.

**The LLM must follow the hook's guidance:** When the hook enumerates unanswered questions in the system-reminder, the LLM MUST ask those questions in the next response (2-3 at a time). When the hook proposes a transition, the LLM MUST either confirm (emit the marker) or explain why gaps remain.

---

## Workflow

### Step 0: Pre-flight and State Check

**Memory pre-flight:**
```bash
zettel status >/dev/null 2>&1 || { echo "Warning: Memory unavailable, skipping zettel integration"; export MARKETING_SKIP_MEMORY=1; }
```

**Check for existing state:**
Read `~/.claude/MEMORY/STATE/marketing-checklist.json`. If it exists and `active: true`:

1. Surface current state:
   ```
   🔄 RESUMING COPY PLATFORM:
     Phase: {phase}
     Section: {currentSection}/18 (if in expand)
     Last updated: {lastUpdated}
   ```
2. Ask: "Resume where you left off, or start fresh?"
3. If resume → skip to the appropriate phase step below
4. If fresh → reset state file, proceed to Step 1

**Memory RECALL** (if no existing state, run Workflows/Memory.md § RECALL):
```bash
[ -z "$MARKETING_SKIP_MEMORY" ] && zettel recall "{user's stated product/service, 4-8 words}" -l 5 -d connected
```

Surface any prior marketing work. Follow the classifier in Memory.md to determine resume/fresh.

**Initialize state file** (if starting fresh):
```json
{
  "active": true,
  "phase": "understanding",
  "currentSection": 0,
  "expandedSections": [],
  "totalSections": 18,
  "exchangeCount": 0,
  "startedAt": "{ISO-8601}",
  "lastUpdated": "{ISO-8601}",
  "topicSlug": "{kebab-case-topic}"
}
```

Write to `~/.claude/MEMORY/STATE/marketing-checklist.json`.

---

### Step 1: Understanding Phase

**Read:** `Prompts/SystemPrompts.md` § Understanding Phase  
**Read:** `Prompts/UserPrompts.md` § Understanding Phase  
**Read:** `StateDefinition.md` § Phase 1: Understanding

**Adopt this persona and constraints:**
- You are an expert copywriting strategist helping the user build a copy platform
- You ask focused, probing questions — you do NOT generate marketing content
- NOBODY has just one audience — help identify 3-5 target audiences based on "pain"
- Pain is NOT physical — it's the emotional gap between current state and desired state
- Problems are multi-faceted: lack of knowledge, lack of team, inferiority complex, hatred of current situation, feeling of inadequacy compared to Bezos/Musk/Gates types

**Mandatory enumerated questions (U1-U8) — injected by `ChecklistStateInjector` hook:**

| # | ID | Question |
|---|-----|---------|
| U1 | `product_service` | What product or service are you marketing? |
| U2 | `ideal_client` | Who is your ideal client? Describe them specifically. |
| U3 | `audience_segments` | Who ELSE could benefit? Help me identify 3-5 target audiences based on their "pain." |
| U4 | `core_problems` | What problems does your target market have? What are they trying now that isn't working? |
| U5 | `desired_outcome` | What outcome do they want? What does life look like after solving this? |
| U6 | `proof_points` | What proof do you have that your solution works? (results, case studies, testimonials) |
| U7 | `differentiator` | What makes your approach different from competitors? |
| U8 | `cta_next_step` | What's the immediate next step you want someone to take when they see your ad? |

The hook will inject the next unanswered questions into each turn. Ask 2-3 at a time — do not overwhelm the user.

**Mandatory checklist sections to build** (from StateDefinition.md):
```
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
# Justify their failures, allay fears, confirm suspicions
# Claims & Proof
  ## Specific Claims
  ## Proof Of Those Claims
  ## Who Is This For? Bullseye Clients.
```

**Response format:**
```
<SECTION_CONTENT01>
[Section content organized from user responses]
</SECTION_CONTENT01>

<SECTION_CONTENT02>
[Section content]
</SECTION_CONTENT02>

... (repeat for all sections with content so far)

<QUESTIONS>
[Focused questions — only what's necessary for the goal]
</QUESTIONS>

<NEXT_STEP>
[What the user should provide next]
</NEXT_STEP>
```

**Completion criteria** (detected by `ChecklistEnforcer` hook, proposed by `ChecklistStateInjector`):
- Minimum 3 exchanges
- All 8 questions asked AND answered (tracked by hook)
- Evidence flags: `target_audience_defined`, `core_problem_identified`, `value_proposition_clear`

**Transition protocol (collaborative handshake):**
1. Hook detects readiness and injects a `TRANSITION PROPOSAL` into the system-reminder
2. LLM reviews the checklist quality
3. If agree → emit `<UNDERSTANDING_COMPLETE>` to confirm
4. If gaps remain → explain what's missing and continue asking questions

**The LLM does NOT decide transition timing on its own.** Wait for the hook's proposal.

**Memory SAVE on completion:**
```bash
[ -z "$MARKETING_SKIP_MEMORY" ] && \
  HUB_ID=$(zettel hub topic-hub "marketing-{topic-slug}" | jq -r '.id') && \
  zettel save "Understanding complete: {2-3 sentence summary}" \
    -t fact -S "marketing-{topic-slug}-understanding" --status open
```

---

### Step 2: Improvement Phase

**Read:** `Prompts/SystemPrompts.md` § Improvement Phase  
**Read:** `Prompts/UserPrompts.md` § Improvement Phase  
**Read:** `StateDefinition.md` § Phase 2: Improvement

**Purpose:** Deepen and refine the checklist with the 10 explicit Improvement questions. Each question maps to a specific Blair Warren formula element or psychological framework.

**Mandatory enumerated questions (I1-I10) — injected by `ChecklistStateInjector` hook:**

| # | ID | Question | Maps To |
|---|-----|---------|---------|
| I1 | `failed_solutions` | What are they trying now? Why don't they like those? Why aren't they working? | What Stops Them |
| I2 | `wont_give_up` | What are they NOT willing to give up to solve the problem? | Offer constraints |
| I3 | `anti_avatar` | Who is the anti-avatar or common enemy? | Blair Warren: throw rocks |
| I4 | `jealous_of` | Who are they jealous of? Who do they compare themselves to? | Aspirational framing |
| I5 | `validation_from` | Who are they trying to get validation or acceptance from? | Blair Warren: encourage dreams |
| I6 | `objections_beliefs` | What are their objections and limiting beliefs? | Blair Warren: allay fears |
| I7 | `cant_fix_celebrate` | What can't you fix, that you can celebrate? | Reframe weakness |
| I8 | `market_problems` | What are the 3 main problems in the market? | Market positioning |
| I9 | `ideal_self` | Who is their ideal self? What does success look like? | Vision of the future |
| I10 | `truth_behind_stuck` | What's the TRUTH behind the REAL REASON they're stuck? | Blair Warren: confirm suspicions |

The hook injects the next unanswered questions. Ask 2-3 at a time.

**Continue using the same response format** with `<SECTION_CONTENT>`, `<QUESTIONS>`, `<NEXT_STEP>` markers.

**Completion criteria** (detected by `ChecklistEnforcer`, proposed by `ChecklistStateInjector`):
- Minimum 4 exchanges
- All 10 questions asked AND answered
- Evidence flags: `checklist_structure_defined`, `key_sections_identified`, `dependencies_resolved`

**Transition protocol:** Same collaborative handshake as Understanding. Hook proposes, LLM confirms with `<IMPROVEMENT_COMPLETE>`.

**Memory SAVE on completion:**
```bash
[ -z "$MARKETING_SKIP_MEMORY" ] && \
  zettel save "Improvement complete: {2-3 sentence summary of refinements}" \
    -t fact -S "marketing-{topic-slug}-improvement" --status open
```

---

### Step 3: Expand Phase

**Read:** `Prompts/SystemPrompts.md` § Expand Phase  
**Read:** `StateDefinition.md` § Phase 3: Expand

**Purpose:** Apply the 18 copy platform frameworks sequentially to the user's checklist. 
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
# Justify their failures, allay fears, confirm suspicions
# Claims & Proof
  ## Specific Claims
  ## Proof Of Those Claims
  ## Who Is This For? Bullseye Clients.


The LLM applies frameworks to user-provided content. It NEVER generates foundational information.

**For each section 1 through 18:**

1. Read the section framework file:
   ```
   Read CopyPlatformSections/{NN}-{name}.md
   ```

2. Apply the framework to the user's actual checklist content:
   - Use the section's specific methodology
   - Follow the rigid process (creative with wording, NOT with process)
   - Meet minimum output requirements (varies by section)
   - Resolve dependencies with prior expanded sections

3. Present the expanded section to the user for feedback

4. Mark section complete: `<SECTION_{N}_EXPANSION_COMPLETE>`

5. **Memory SAVE per section:**
   ```bash
   [ -z "$MARKETING_SKIP_MEMORY" ] && \
     zettel save "{section title}: {key content summary}" \
       -t fact -S "marketing-{topic-slug}-expand-{section-id}" --status open
   ```

**Section order** (sequential, cannot skip):

| # | File | Section |
|---|------|---------|
| 1 | `01-usp.md` | Unique Selling Proposition |
| 2 | `02-claims-proof.md` | Claims & Proof Points |
| 3 | `03-target-audience.md` | Target Audience |
| 4 | `04-mechanism.md` | The Mechanism |
| 5 | `05-why-cubed.md` | Why³ Framework |
| 6 | `06-appeal.md` | Core Appeal Elements |
| 7 | `07-features-benefits.md` | Features, Benefits & Costs |
| 8 | `08-promise.md` | Core Promise |
| 9 | `09-hook.md` | Hook Development |
| 10 | `10-headlines.md` | Headline Framework |
| 11 | `11-big-four.md` | The Big Four Elements |
| 12 | `12-pain-list.md` | Dimensionalized Pain Points |
| 13 | `13-vision-list.md` | Vision of The Future |
| 14 | `14-usp-iteration-1.md` | USP: Generate Problem/Solution sets |
| 15 | `15-usp-iteration-2.md` | USP: Evaluation matrix |
| 16 | `16-usp-iteration-3.md` | USP: Improve low-scoring criteria |
| 17 | `17-usp-iteration-4.md` | USP: Final refinement |
| 18 | `18-usp-iteration-5.md` | USP: Final selection |

**USP Iterations (sections 14-18) are special:**
- **14 (usp1):** Generate 5 different "You know how... / Well what I do is..." Problem/Solution sets per audience segment
- **15 (usp2):** Score each set on Uniqueness, Usefulness, Simplicity, audience match, credibility, premium positioning, measurable outcomes — evaluation matrix with 1-5 scale
- **16 (usp3):** Develop additional USP variations focusing on lowest-scoring criteria
- **17 (usp4):** Final refinement pass
- **18 (usp5):** Final selection and polish

When all 18 sections complete, emit `<EXPANSION_COMPLETE>` and transition.

---

### Step 4: Implement Phase

**Read:** `Prompts/SystemPrompts.md` § Implement Phase  
**Read:** `Prompts/UserPrompts.md` § Implement Phase  
**Read:** `StateDefinition.md` § Phase 4: Implement

**Purpose:** Write actual marketing copy using the completed expanded checklist as the foundation.

**Persona:** Expert copywriter and sales psychologist. You are the best in the world at writing persuasive sales copy that converts.

**Capabilities:**
- Write any format: ads, emails, landing pages, VSLs, webinar scripts, social media posts
- Apply AIDA at every level  AIDA === Attention; Interest; Desire; Action (fractal in nature because "Attention" has a nested AIDA, as does "Interest", etc.). The fractal nature is also part of each part of the copy and artifact:
  - **Headline AIDA** — the headline itself must have attention, interest, desire, action
  - **Ad AIDA** — the ad as a whole follows AIDA
  - **Page AIDA** — each landing page section follows AIDA
  - **Offer AIDA** — the overall offer arc follows AIDA
  - **Funnel AIDA** - the entire marketing process follows AIDA

**The 10 Agreements** (must be addressed in long-form copy):
1. Agreement that my dreams can become reality through you
2. Agreement that the outcome is obviously better
3. Agreement that my goals are within reach with your product
4. Agreement that I can personally attain what I want through your product
5. Agreement that your product stands out from my other choices
6. Agreement that I believe your product does what I want it to do
7. Agreement that the timing is perfect for me right now
8. Agreement that it aligns with my personal timeline
9. Agreement that it's a perfect fit for me, my life, my family, my business
10. Agreement that I trust the source, proof, and case studies

**Process:**
1. User specifies what format to write (email, ad, landing page, etc.)
2. User specifies the target audience segment (from the checklist)
3. LLM writes copy using the expanded checklist as the SOLE source of truth
4. All claims, proof, USP, pain points, hooks, headlines come FROM the checklist
5. User reviews and requests revisions

**Completion criteria** (minimum 2 exchanges):
- `final_review_complete` — User has reviewed the copy
- `implementation_steps_clear` — Deliverables identified

**Memory SAVE on completion:**
```bash
[ -z "$MARKETING_SKIP_MEMORY" ] && \
  zettel save "Copy platform complete for {topic}: {summary of what was produced}" \
    -t learning -S "marketing-{topic-slug}-summary" --status open
```

**Deactivate state file:** Set `"active": false` in `marketing-checklist.json`.

---

## Error Recovery

**If the user asks to go back to a previous phase:**
1. Confirm with the user (reverting from expand resets expansion progress)
2. Update state file with the target phase
3. Resume at that phase

**If the session ends mid-phase:**
- State file persists on disk
- Next session: Step 0 detects existing state and offers resume

**If the LLM generates foundational content during Understanding/Improvement:**
- The `ChecklistStateInjector` hook continuously injects "ask questions only" constraints on every turn
- Self-correct: ask the user for the information instead of generating it

**If the LLM skips enumerated questions:**
- The `ChecklistStateInjector` hook surfaces unanswered questions on every turn — they cannot be skipped
- If the LLM appears to be asking its own questions instead of the enumerated set, the hook's injection takes precedence

**If a phase transition fires prematurely:**
- The LLM can revert by telling the user and updating state via a subsequent response
- The user can always say "go back to [phase]" — the workflow resumes at that phase

---

## Integration Notes

- **Research skill:** If the user needs market research to inform their checklist, direct them to invoke the Research skill separately. Don't try to do research within the Marketing workflow.
- **Zettel memory:** Follow `Workflows/Memory.md` for all memory operations.
- **State persistence:** Follow `StateDefinition.md` for all state machine rules.
- **Hooks:** `ChecklistStateInjector` (UserPromptSubmit) + `ChecklistEnforcer` (Stop). Both must be registered in `settings.json`.

---

## Prerequisite: MarketingResearch Workflow

The Copy Platform assumes the user has ALREADY done their customer/product/market research. In practice, many users haven't, which leaves the Understanding phase fielding vague answers.

The `MarketingResearch.md` workflow exists to close that gap. It:
1. Uses the Research skill to mine actual customer reviews (scored by `ResearchFrameworks/01-review-research.md`)
2. Walks the user through the ICP worksheet (`ResearchFrameworks/02-icp.md`)
3. Walks the user through Brand Discovery + competitor analysis (`ResearchFrameworks/03-product-brand.md`)
4. Walks the user through the 10 Objection Framework (`ResearchFrameworks/04-objections.md`)
5. Produces the Campaign Promise (`ResearchFrameworks/05-campaign-promise.md`)
6. Produces the One Belief Statement (`ResearchFrameworks/06-one-belief.md`)

It is the **prerequisite** to this workflow when the user hasn't done the research yet, producing a structured research artifact at `~/.claude/MEMORY/RESEARCH/marketing/{topic-slug}/` that the copy platform consumes, grounding the 10 Agreements in actual data instead of LLM speculation.

**Integration:** at Step 0, check that artifact's `index.md` for `ready_for_copyplatform: true`. If present, pre-populate the Understanding phase (U1–U8) from the research; if missing, recommend running MarketingResearch first. This is a doc-level handoff via the artifact file — no new hooks required.

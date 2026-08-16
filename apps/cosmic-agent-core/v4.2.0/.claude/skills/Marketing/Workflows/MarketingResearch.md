# Marketing Research Workflow

**Mode:** ALGORITHM (multi-step, multi-phase)
**Trigger:** User needs foundational research BEFORE the CopyPlatform workflow
**Speed target:** Multi-session — research is deep work spread across exchanges

---

## Purpose

`CopyPlatform` assumes the user has already done their customer, product, market,
and objection research. Most haven't — so the Understanding phase fields vague,
speculative answers that poison everything downstream.

This workflow produces a **structured research artifact** that `CopyPlatform`
consumes as authoritative input, grounding the 10 Agreements and all copy
decisions in actual data instead of LLM speculation.

---

## CRITICAL CONSTRAINT: No Speculation

The LLM **never generates foundational information** — and neither should the user
guess it off the top of their head. Every field in every worksheet is filled from
one of:

1. **Real review/market data** (Review Mining, Step 1), or
2. **The user's deliberate answer** to a worksheet question.

A blank field is a research gap to fill, not an invitation to invent. If the user
offers a 30-second guess, note it as *unvalidated* and flag it for verification.
This closes the two failure modes of foundational info: (a) the LLM invents it,
(b) the user invents it.

---

## When to Use

- User wants a marketing campaign but hasn't done customer research
- User has reviews/testimonials to mine but hasn't extracted patterns
- User needs structured competitor analysis before positioning
- User needs to articulate their Campaign Promise / One Belief Statement rigorously
- **Prerequisite detection:** CopyPlatform checks for a completed research artifact
  and routes here first if missing

---

## Research Frameworks (in-skill reference files)

Six worksheets live alongside this workflow in `../ResearchFrameworks/`. Read the
relevant one at the start of each step:

| Step | File | Produces |
|------|------|----------|
| 1 Review Mining | `ResearchFrameworks/01-review-research.md` | Scored keyword/phrase matrix (Intensity × Repeatability × Scale = Importance) |
| 2 Customer Discovery | `ResearchFrameworks/02-icp.md` | Dream Customer ICP (desires/fears + demographics/psychographics/professional) |
| 3 Product & Competitor | `ResearchFrameworks/03-product-brand.md` | Brand Discovery + 10 direct / 5 indirect competitor analysis + thesis |
| 4 Objection Mapping | `ResearchFrameworks/04-objections.md` | 10 Objection Framework answers, grounded in Step-1 data |
| 5 Promise Construction | `ResearchFrameworks/05-campaign-promise.md` | Campaign Promise + Now/After grid + prospect examination |
| 6 Belief Statement | `ResearchFrameworks/06-one-belief.md` | One Belief Statement (mechanism + desire + opportunity) |

> Paths are relative to the Marketing skill root, so the workflow is
> self-contained and portable — no external repo dependency.

---

## Memory Integration (optional, fail-open)

Memory is **best-effort**. The workflow must never block on it, and it does not
hard-wire any one memory backend. At Step 0, probe whatever memory tool is
available in the current environment; if none responds, set
`MARKETING_RESEARCH_SKIP_MEMORY=1` and continue with the task. All later memory
steps are guarded by that flag.

- **Recall** (Step 0): look up prior research on the same/adjacent product so the
  user doesn't redo work.
- **Save** (end of each step): persist a 2–3 sentence summary of what the step
  established, tagged `marketing-research-{topic-slug}-{step}`.

If the host SAI/AAI Algorithm exposes a memory layer (e.g. the Silmari `zk_*`
tools), prefer writing save-instructions for the host's reflection hook to execute
rather than calling save tools directly. Recall is read-side and safe to call
inline. **Do not** reintroduce deprecated CLI calls as a hard requirement.

---

## Workflow Steps

### Step 0: Pre-flight & State Check

1. **Memory pre-flight (fail-open):** probe the available memory tool once. On any
   failure, `export MARKETING_RESEARCH_SKIP_MEMORY=1` and proceed.
2. **State check:** read `~/.claude/MEMORY/STATE/marketing-research-{topic-slug}.json`.
   If it exists and `active: true`, surface:
   ```
   🔄 RESUMING MARKETING RESEARCH:
     Topic: {topic}
     Step: {currentStep}/7
     Last updated: {lastUpdated}
   ```
   Ask: "Resume where you left off, or start fresh?" Resume → jump to that step.
   Fresh → reset the state file.
3. **Recall (if not skipping):** look up `"{product/service, 4-8 words}"` and
   surface any prior research; let the user decide resume vs. fresh.
4. **Initialize state** (fresh start):
   ```json
   {
     "active": true,
     "topicSlug": "{kebab-case-topic}",
     "currentStep": 1,
     "completedSteps": [],
     "totalSteps": 7,
     "startedAt": "{ISO-8601}",
     "lastUpdated": "{ISO-8601}"
   }
   ```
   Write to `~/.claude/MEMORY/STATE/marketing-research-{topic-slug}.json`.

---

### Step 1: Review Mining

**Read:** `ResearchFrameworks/01-review-research.md`

1. Use the **Research skill** to collect real reviews — Amazon books in the niche,
   Reddit threads, Quora posts, forums, support tickets, existing testimonials.
   (Invoke Research separately; this workflow orchestrates, it does not re-implement
   scraping.)
2. Code each recurring theme into the matrix and score it:
   `Importance = Intensity × Repeatability × Scale` (1–10 bands per the framework).
3. Sort by Importance descending.

**Output:** a scored keyword/phrase matrix in the customer's own language.
**Gate:** at least one real source mined; rows trace to quotes, not guesses.
**Save:** "Review mining for {topic}: top themes …" (if memory available).

---

### Step 2: Customer Discovery (ICP)

**Read:** `ResearchFrameworks/02-icp.md`

Walk the user through the ICP worksheet via focused Q&A (2–3 prompts at a time):

- Fill-in-the-blanks: *"I wish I could ___ so that ___"*, *"My fear is ___"*,
  *"I hate ___"*, *"I don't trust ___"*
- Top-5 wants; demographics; psychographics; professional; information sources;
  goals & challenges

Cross-reference Step-1 language so the ICP uses the customer's actual words.
**Output:** a completed Dream Customer ICP. **Save** on completion.

---

### Step 3: Brand Discovery + Competitor Analysis

**Read:** `ResearchFrameworks/03-product-brand.md`

1. Walk the Brand Discovery + Goals-for-the-Offer questions.
2. For each of **10 direct competitors**, run the 11-attribute analysis (Hook →
   Risk reversal). Lighter pass for **5 indirect competitors**.
3. Complete the Product Examination + thesis statement, and the enumerated lists
   (USP, problems, solutions, benefits).

**Output:** positioning map + thesis. **Save** on completion.

---

### Step 4: Objection Mapping (10 Objection Framework)

**Read:** `ResearchFrameworks/04-objections.md`

Walk all 10 objection questions. **Ground every answer in the Step-1 Review Mining
data** — real complaints (objections 4/5) and real desired results (objection 2).
Where the user can't ground an answer, mark it unvalidated and note what data is
needed.

**Output:** 10 data-grounded objection answers. **Save** on completion.

---

### Step 5: Campaign Promise Construction

**Read:** `ResearchFrameworks/05-campaign-promise.md`

Pull forward: prospect examination (from ICP 02 + Reviews 01), objections (from
04), competitor analysis (from 03). Build the **Now/After grid**, complete the
Product Examination, and write the **thesis statement** + urgency/scarcity.

**Output:** the Campaign Promise. **Save** on completion.

---

### Step 6: One Belief Statement

**Read:** `ResearchFrameworks/06-one-belief.md`

Define the three pieces and assemble the statement:
- **Unique Mechanism** — name it; not salesy.
- **Consumer's Key Desire** — what they fundamentally want.
- **New Opportunity** — the unique vehicle you offer.

Assemble: *"[Key Desire] is the key to [Outcome], and it's only attainable through
[Unique Mechanism]."*

**Output:** the One Belief Statement. **Save** on completion.

---

### Step 7: Produce the Research Artifact

Write structured output to `~/.claude/MEMORY/RESEARCH/marketing/{topic-slug}/`:

```
{topic-slug}/
  index.md                 # summary + status + links to the six outputs below
  01-review-research.md     # filled scored matrix
  02-icp.md                 # filled ICP
  03-product-brand.md       # filled brand + competitor analysis
  04-objections.md          # 10 grounded objection answers
  05-campaign-promise.md    # campaign promise + Now/After grid
  06-one-belief.md          # final One Belief Statement
```

- `index.md` carries a `ready_for_copyplatform: true` flag once all six are complete.
- **Save** (if memory available): a topic hub + one fact entry per step summary.
- Set `"active": false` in the state file.

---

## Integration with CopyPlatform

Once a research artifact exists, `CopyPlatform` should:

1. At **Step 0**, check `~/.claude/MEMORY/RESEARCH/marketing/{topic-slug}/index.md`
   for `ready_for_copyplatform: true`.
2. If **missing**, ask: *"Have you done the foundational research (ICP, objections,
   campaign promise)? If not, I recommend running MarketingResearch first to avoid
   speculative answers."*
3. If **present**, pre-populate the Understanding phase from the artifact —
   U1–U8 answers map directly from ICP / Product-Brand / Objections data.
4. The Understanding phase then focuses only on gaps the research didn't cover.

> This is a **doc-level handoff via the artifact file** — it requires no new hooks
> and no changes to `settings.json`. CopyPlatform's existing hooks are untouched.

---

## Error Recovery

- **Session ends mid-step:** the state file persists; Step 0 next session offers resume.
- **User wants to revisit a step:** update `currentStep` and resume there; later
  steps that depend on it should be re-checked.
- **LLM tries to fill a worksheet itself:** self-correct — ask the user, or send
  the gap to Step-1 review mining. Foundational info never comes from the model.
- **Memory unavailable:** the `MARKETING_RESEARCH_SKIP_MEMORY` flag keeps the whole
  workflow running; only the persistence niceties are skipped.

---

## Why This Workflow Matters

The copy platform's critical constraint is that the LLM never generates foundational
information — but "garbage in" has two sources: the LLM inventing it, and the user
guessing it. MarketingResearch closes the second gap by forcing foundational info
to come from actual research, producing materially better copy than a 30-second
guess ever could.

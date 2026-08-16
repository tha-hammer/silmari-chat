# Sales Story Workflow

> Discover, structure, and tell a compelling sales story using the 7-question heuristic and 9 proven story structures.

**Read before executing:** `../CHECKLIST_CONVENTION.md`, `../Templates/StoryStructures.md`, `../Templates/EmotionalTriggers.md`

---

## 0. Resolve Checklist (REQUIRED FIRST STEP)

Before any story discovery or construction:

1. Resolve project-root per `../CHECKLIST_CONVENTION.md` (walk ancestors for `.git` → `CLAUDE.md` → ERROR). If ERROR, STOP and tell the user: "Cannot determine project root. Create an empty `CLAUDE.md` or run `git init`, then re-invoke."
2. List clients under `{project-root}/copyplatforms/`:
   - **Zero clients → STOP.** Tell user: "No copy platform found. Run the Marketing skill first to build one via Q&A — a story needs a grounded target audience, mechanism, pain list, and vision list."
   - One client → use it.
   - Multiple clients → ask the user which client via `AskUserQuestion`.
3. List products under the chosen client:
   - One product → use it.
   - Multiple products → ask the user which product via `AskUserQuestion`.
4. List versions under the chosen product:
   - Default to the highest version.
   - If the user names a specific version, use that.
5. Load required section files from `StoryStructures.md`'s `consumes_sections` frontmatter (`03-target-audience.md`, `04-mechanism.md`, `12-pain-list.md`, `13-vision-list.md`). If any is missing or empty → STOP, point user to Marketing skill.
6. Pass `{project-root}`, `{client}`, `{product}`, `{version}`, and loaded section paths as context into Phase 1 (Story Discovery) below.

---

## The Role of Story in Sales Copy

Good sales copy uses stories. The prospect is ALWAYS the hero — never the vendor. The vendor plays supporting roles: "Mickey to Rocky," "Yoda to Luke," "Gandalf to Frodo," "Fairy Godmother to Cinderella."

Story functions in copy:
- Creates emotional connection before logic
- Proves claims through lived experience
- Makes abstract benefits concrete
- Builds trust through vulnerability
- Guides the prospect to see themselves in the story

---

## Phase 1: Story Discovery (7-Question Heuristic)

Ask these questions in order. Each "No" answer identifies which concept needs explanation before advancing.

**The 7 Questions:**

1. **Do you know WHY you need a story?**
   - No → Explain **Concept**: Why story works in sales (emotional resonance, trust, proof through narrative)
   - Yes → Continue

2. **Do you know WHERE to find your story?**
   - No → Explore: Stories live in your experience — failures, breakthroughs, client transformations, "trigger moments"
   - Yes → Continue

3. **Do you know your ROLE in the story?**
   - No → Define **Character**: Are you the hero who overcame, the guide who helped someone overcome, or the witness to transformation?
   - Yes → Continue

4. **Do you know what your story needs to DO?**
   - No → Define **Function**: What must this story accomplish? (Build trust? Create desire? Handle objection? Introduce mechanism?)
   - Yes → Continue

5. **Do you know how to PLAN your story?**
   - No → Choose **Structure**: Select one of the 9 story structures from `../Templates/StoryStructures.md`
   - Yes → Continue

6. **Do you know how to TELL your story?**
   - No → Define **Style**: How do you communicate? What emotional register? Formal or conversational?
   - Yes → Continue

7. **Do you know how to SHARE your story?**
   - No → Define **Organize**: Where will this story live? (Email, sales page, LinkedIn, presentation?) Format accordingly.
   - Yes → Proceed to story construction

---

## Phase 2: Story Construction

### The "What's It About" Framework (3-Part Test)

Every story must pass this test:
1. **Time to Change** — Is there an internal or external threat? A change or opportunity forcing action?
2. **New Information** — What did the character discover? What new perspective on an old problem?
3. **What's in It for Me** — "I'm helping [X] get [Y]" — state the benefit clearly

### The 5T Story Structure

Use as the skeleton for any story:

| T | Element | Questions to Answer |
|---|---------|-------------------|
| **Time** | Chronological anchor | "At first [problem], then we tried [action], and now we [result]" |
| **Turning Points** | Pivots in the narrative | "We knew we messed up when..." / "The breakthrough came after..." |
| **Tension** | Maximum conflict first | Start at peak conflict — show how it resolved |
| **Temptation** | Ethical choice | When could you take the easy road but didn't? |
| **Teachable Moment** | Lesson | "I guess what I'm trying to say is..." / "The lesson here is..." |

### The Motivation Framework (Method Acting)

For each character in the story (narrator, clients, team, etc.):
- **Who am I?**
- **Where am I?**
- **What do I want?**
- **Why do I want it?**
- **How will I get it?**
- **What must I overcome?**

Map cooperation and conflict connections between characters.

### The "Cut to the Chase" Principle

Every story must contain:
1. **Action** — Get right to the crisis or inciting incident
2. **Emotion** — Maximum emotional impact (negative early, positive late)
3. **Meaning** — What does it all mean? Moral, lesson, takeaway

### Thoughtful Failures (Failure Story Variant)

Transform failure stories into learning:
- What went wrong? (Focus on thought processes and decisions — no blame)
- Was I aiming for the right things?
- Did I not know the right things?
- When did I realize I was off track?
- What did I need to learn?

---

## Phase 3: Story Structures

Choose the structure that best fits the user's story. All 9 structures are in `../Templates/StoryStructures.md`. Quick reference:

| Structure | Best For |
|-----------|---------|
| Rags to Riches | Origin stories, transformation journeys |
| Fell in a Hole | Recovery stories, coming back from rock bottom |
| Nothing is Easy (Roller Coaster) | Resilience stories, multi-obstacle journeys |
| How the Mighty Have Fallen | Humility, accountability, second-chance stories |
| Epic Fail | 6 variants for different failure types |
| Risk-o-meter | Matching story to prospect's adoption stage |
| The Odyssey | Journey, discovery, and return stories |
| Happily Ever After | Values-based, belonging, homecoming stories |
| Dragon and the City | Threat/opportunity stories, disruption narratives |

---

## Phase 4: Emotional Dashboard

Map the emotional journey of the story using the 21-emotion framework from `../Templates/EmotionalTriggers.md`.

For each major story beat, identify:
- The dominant emotion
- The conversion formula: "I felt [emotion] when I realized [change/new information] and so I [reaction/lesson]"

Emotional arc for most sales stories:
- **Early:** Fear, confusion, frustration, loneliness
- **Middle:** Curiosity, hope, determination
- **Late:** Pride, joy, excitement, delight

---

## Non-Sales Story Mode

For brand storytelling, personal stories, or non-sales narrative:
- Same discovery process (7-question heuristic)
- Same 5T structure
- Different goal: build connection and trust vs. direct persuasion
- Omit the explicit call to action
- Emphasize values, journey, and shared experience over transformation and proof

---

## Output Format

Deliver the completed story in this structure:

```
**Story Title**

[Opening — maximum tension/conflict. Cut to the chase.]

[Rising action — the journey, obstacles, turning points]

[Climax — the breakthrough moment]

[Resolution — the outcome and transformation]

[Teachable Moment — "What this means for you is..."]

[Call to Action — only for sales stories]
```

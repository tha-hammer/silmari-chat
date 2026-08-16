---
name: PressReleaseWriter
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Draft near-publishable press releases using AP style, inverted pyramid structure, and brand-consistent positioning. Triggered when the user asks to write a press release, draft a PR (in the comms sense), create a media release, or write a press release draft.
---

# PressReleaseWriter

Draft near-publishable press releases. Output quality should be high enough that an
external PR firm refines rather than rewrites. Specifically for press releases distributed
to media — not product launch emails, blog announcement posts, social copy, or landing
pages.

## When to use this workflow

- When the user asks to write a press release, media release, or PR draft
- When the user says "draft a PR" in the communications (not pull request) sense
- When preparing announcements for media distribution: product launches, partnerships, funding, awards, corporate milestones

## When NOT to use this workflow

- Product launch emails → route to `EmailNurturePlanner`
- Blog announcement posts → route to `/marketing` (brand voice writing)
- Social announcement copy → route to `SocialPostWriter`
- Landing pages → route to `/marketing` (brand voice writing)
- Any non-media-relations content

## Pre-flight

Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required (governs brand terminology, absolute rules like no em dashes, and WABL)
- `ICP.md` — required (audience targeting)
- `Positioning.md` — required (positioning, terminology, and boilerplate)
- `NoFlyList.md` — required (customers that can never appear in any output)
- `VoiceProfiles/{Name}.md` — only if the user names an author

For each required asset, check the frontmatter `populated:` field after reading.
If `populated: false`, the asset is a stub.

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand
output, and missing context is exactly what produces generic AI slop.

## Instructions

### Step 0: Load the no-fly list as a hard constraint

After reading `NoFlyList.md`, treat the names as a hard constraint: **never include any
No Fly List customer in any output** — not as named examples, proof points, customer
quotes, case study references, or any other mention. If the user requests a press release
featuring or referencing a No Fly List customer, stop and inform them that this customer
cannot be publicly referenced. If a No Fly List name appears in source material, omit it
from all outputs.

Internalize all three required briefs before proceeding:
- **BrandVoice.md** governs brand terminology, absolute rules (no em dashes), and WABL
- **Positioning.md** governs positioning, terminology, audience, and boilerplate
- **ICP.md** governs who the journalists' end readers are

### Step 1: Intake — understand the announcement

Collect context through a short conversational Q&A. Ask one question at a time — do not present a form.

#### Required (always ask)

1. **"What are we announcing?"** — open-ended, get the substance of the news.

2. **"Who is this for?"** — target audience. Which journalists (what beat)? Who are the end readers (developers, executives, partners)?

3. **Propose the "one thing"** — after hearing the answers to 1 and 2, propose a single sentence that captures what this press release is about. Ask the user to confirm or refine. This is the One Thing Test: every paragraph, quote, and detail must serve this one idea.

#### Conditional (ask only when relevant)

Ask these one at a time, only when the user's answers so far leave a gap:

- **"Why now?"** — if the user hasn't mentioned a market catalyst, timing event, or trigger. Every press release needs a "why now." If the user doesn't provide one, note that it will need to be addressed in the draft.

- **Partner details** — if the announcement involves another company: who are they, what's their role, whose name should lead the headline, do they have approved quotes or boilerplate available?

- **Stakeholder quotes** — who should be quoted, and what job should each quote do? If the user doesn't know specific people, suggest quote slots based on announcement type:
  - Product launch: CEO (strategic significance), VP Product or CTO (technical detail)
  - Partnership: CEO or VP Partnerships (strategic value), partner exec (joint validation)
  - Funding: CEO (vision), lead investor (market thesis)
  - Award/recognition: CEO or relevant VP (what it means for customers)

  The user can name specific people or leave slots as roles to be assigned later.

- **Campaign context** — is this part of a multi-PR campaign? If so, what's the sequence, what do other PRs cover, and what should this PR deliberately NOT reveal?

- **Emotional intent** — what should the reader feel after reading this? If the user doesn't have a strong opinion, propose one based on announcement type:
  - Product launch → confidence
  - Partnership → curiosity about what's next
  - Funding → validation
  - Award → credibility

### Step 2: Draft the press release

The local substrate has no published-content index. If you need supporting content
(prior announcements, customer quotes, technical claims), ask the user for relevant prior
content URLs or pastes before writing. Filter anything they provide against the no-fly
list — any matching customer name is omitted entirely.

#### Structure (inverted pyramid)

Draft the press release in this order:

**1. Headline**
Tells the story, not the corporate action. A journalist should glance at it and immediately know whether to keep reading. Lead with what matters to the world, not what matters to the company.

**2. Dateline**
AP style: CITY, State, Month Day, Year — [Company Name], [short descriptor],...

**3. Lead paragraph**
Who, what, and why it matters — in the first two to three sentences. If someone reads nothing else, they walk away informed.

**4. Context paragraph**
Industry context and "why now." Ground the announcement in a market reality that gives it timing and urgency.

**5. Quotes**
Place after the reader has enough context. Each quote does a different job. Apply the correct path based on intake:

- **Named person, context provided:** Draft a real quote. Label it:
  `[DRAFT — requires approval from <name>]`

- **Unnamed slot (role only):** Draft a real quote for that role. Label it:
  `[DRAFT — <role> quote, assign to specific person and get approval]`

- **Partner quote, no context on their perspective:** Do not draft. Leave:
  `[QUOTE NEEDED — <partner name>, <suggested angle>]`

Quote quality rules:
- No "We're thrilled," "We're excited," or "We're proud"
- Each quote has a point of view — an argument, insight, or claim
- Quotes do not restate facts from the paragraph above
- Read every quote aloud — if it sounds wrong spoken, rewrite it

**6. Supporting details**
Descend in order of importance. An editor should be able to cut from the bottom at any paragraph break without losing the story.

**7. About [Company]**
Use the boilerplate from `Positioning.md` (source of truth). If the user provides a more
recent boilerplate during intake, note the discrepancy but default to `Positioning.md`
unless the user explicitly directs otherwise.

For joint PRs: the user must provide partner-approved boilerplate. If not available:
`[PARTNER BOILERPLATE NEEDED — request approved language from <partner name>]`

**8. Media contact**
```
Media Contact:
[NAME]
[TITLE]
[Company Name]
[EMAIL]
```

#### Style enforcement

Apply throughout the draft:
- AP style (no Oxford commas, titles lowercase after names, numbers one through nine spelled out, 10+ as numerals, proper dateline format)
- No em dashes in body text — use commas, periods, colons, or restructure. Exception: the dateline em dash is structural AP convention and exempt.
- Active voice, short sentences
- No superlatives ("revolutionary," "game-changing," "thrilled," "excited")
- No emojis, no exclamation points, no bold text in the body
- Features expressed as meaning, not lists
- Competitors never named unless the user explicitly directs it
- One page ideal, two pages maximum

### Step 3: Copy edit pass

After completing the first draft, review every sentence for:

- **Soft language:** "gives them a way to," "has become an imperative," "aims to," "helps to"
- **Overloaded sentences:** sentences doing two or three jobs — split them
- **Modifier stacking:** multiple adjectives/adverbs piled on a noun
- **Audience-wrong jargon:** words a product marketer would use but the target reader wouldn't
- **Feature lists as narrative:** bullet-point thinking hiding inside paragraphs — rewrite as meaning
- **AI writing patterns:**
  - Negative seesaws ("It's not X. It's Y." / "Not just X, but Y.")
  - Forced triples (compulsive grouping in threes)
  - Copula dodging ("serves as," "stands as," "functions as" when the sentence means "is")
  - Vocabulary cluster ("delve," "landscape," "crucial," "showcase," "underscore," "tapestry," "foster," "bolster")
  - Hallmark-card endings ("The future looks bright." "This is just the beginning.")

Fix all issues inline. Do not flag them — rewrite the sentences.

### Step 4: Self-grade (internal)

Grade the draft against each structural element:

| Element | Test |
|---------|------|
| Headline | Does it tell the story? Would a journalist lean in? |
| Lead | Who, what, why it matters — all in the first 2-3 sentences? |
| Newsworthiness | Framed for the audience, not the company? |
| "Why now" | Is there a clear market catalyst or timing trigger? |
| Quotes | Point of view? Different jobs? Sound natural spoken aloud? |
| Inverted pyramid | Can you cut from the bottom at any paragraph break? |
| Brevity | One page? Two max? |
| Tone | Confident but understated? No breathless superlatives? |

If any element grades weak, revise that section. Repeat until all elements pass.

**This grading is internal.** The user sees the polished draft, not the scorecard. After presenting the draft, include this line:

*"I scored this draft against the PR writing rubric — want to see the scorecard?"*

If the user asks to see it, show the table above with pass/fail and a one-line note per element.

### Step 5: Present and iterate

Present the draft as clean markdown. No preamble ("Here's what I wrote..."), no summary of what you did. Just the press release, then the scorecard offer line.

The user may:
- **Request revisions** — make them, then re-run the copy edit pass (Step 3) and self-grade (Step 4)
- **Ask to see the scorecard** — show the grading table
- **Adjust for multi-PR context** — if they say "this is PR 2 of 3," incorporate the campaign framing and re-draft as needed
- **Say it's done** — end the workflow

## Output requirements

- Markdown only. If the user asks for .docx, explain that .docx generation is not supported and suggest copying the markdown into Google Docs, which preserves formatting.
- One page ideal, two pages maximum.
- AP style throughout, no em dashes in body text (dateline em dash exempt).
- Quotes labeled with `[DRAFT — ...]` or `[QUOTE NEEDED — ...]` per the rules in Step 2.
- Boilerplate sourced from `Positioning.md`; partner boilerplate flagged if missing.
- No No Fly List customers, anywhere, ever.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with
brand context swapped to local AAI/USER/MARKETING/ files.

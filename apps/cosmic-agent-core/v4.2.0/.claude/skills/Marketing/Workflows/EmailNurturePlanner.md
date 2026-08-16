---
name: EmailNurturePlanner
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Plan content-driven email nurture sequences — strategy, structure, and per-email outlines grounded in audience and brand voice. Triggered when the user asks to plan a drip campaign, nurture sequence, email series, onboarding emails, educational email flow, or lead nurture strategy. Also trigger on email cadence, drip sequence, email funnel, subscriber journey, or "what emails should we send about [topic]?" This workflow plans the sequence — it does not write full email copy.
---

# EmailNurturePlanner

Plan content-driven email nurture sequences. The output is a strategic blueprint — goals, audience mapping, email-by-email outlines with subject line directions, key messages, and CTAs — that a writer can execute against. This workflow stops short of writing full email copy.

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required (email-specific tone, subject line rules, voice traits)
- `ICP.md` — required (audience personas, pain points)
- `Positioning.md` — required (positioning, competitive landscape, proof points)
- `NoFlyList.md` — required (customers who cannot be publicly referenced)
- `Terminology.md` — recommended for any subject line / outline language that may surface externally
- `VoiceProfiles/{Name}.md` — only if the user names a specific sender / author for the sequence

For each required asset, check the frontmatter `populated:` field after reading.
If `populated: false`, the asset is a stub.

Pre-flight reads AAI/USER/MARKETING/ via the Read tool — no MCP needed.

### No Fly List handling

Load the `NoFlyList.md` names as a hard constraint: **never include any No Fly List customer in any output** — not as named examples, proof points, customer quotes, case study references, or any other mention. If the user requests content featuring or referencing a No Fly List customer, stop and inform them that this customer cannot be publicly referenced. If a No Fly List name appears in source material you are working from, omit it from all outputs.

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand output, and missing context is exactly what produces generic AI slop.

## When to use this workflow

- Planning a new email drip campaign or nurture sequence
- Designing an educational email series around a topic (e.g., "best practices in 5 emails")
- Mapping out a content-driven subscriber journey
- Deciding email cadence, sequencing, and content progression for a nurture flow
- When someone asks "what emails should we send to nurture [audience] around [topic]?"

## When NOT to use this workflow

- Writing the actual email copy (hand off to `/marketing` for copy execution)
- One-off email campaigns or announcements (those don't need sequence planning)
- Transactional emails (password resets, invoices, etc.)

**Future expansion:** This workflow currently focuses on content/education nurture sequences. Welcome sequences, product onboarding sequences, re-engagement flows, and post-trial win-back sequences are not yet covered but are natural extensions. If a user asks for one of these, note that the workflow doesn't have a dedicated framework for it yet and offer to adapt the nurture arc as a starting point.

## Instructions

### 1. Load brand and audience context

Before planning anything, read the pre-flight assets so the sequence is grounded in who the brand is and who the audience is.

- `Positioning.md` + `ICP.md` together provide audience personas, pain points, positioning, competitive landscape, and proof points. These determine who the sequence targets and what messages will resonate.
- `BrandVoice.md` provides email-specific tone and structural guidance (subject lines, openers, CTAs, voice traits).

**Freshness check:** If the asset frontmatter has a `last_updated` date and either `Positioning.md` or `ICP.md` was last updated more than 6 months ago, flag it to the user before citing specific metrics or proof points: "The Positioning doc was last updated [date]. Some metrics or proof points may be outdated. Want me to proceed with what's there, or should we verify the numbers first?" This matters most for Positioning, which contains specific performance benchmarks and customer metrics that change over time. BrandVoice changes less frequently, so a 6-month lag there is less risky, but still worth noting.

### 2. Clarify the sequence brief

Gather inputs through a **guided, conversational Q&A** — ask one question at a time, wait for the answer, then ask the next. Do not list all questions at once. If the user's initial message already answers some of these, skip those and start from the first unanswered one.

Ask the following in order:

1. **Goal** — What should recipients do after the sequence? (e.g., start a trial, attend a webinar, adopt a feature, read a pillar piece)

2. **Audience** — Which persona or segment are we targeting? (Map this to the personas in `ICP.md` once you have the answer.)

3. **Topic or theme** — What content territory does this sequence cover?

4. **Entry trigger(s)** — How do people enter the sequence? More than one trigger is fine — for example, a sequence might apply to both newsletter signups and webinar attendees. Ask the user to list all relevant entry triggers, then confirm whether the same sequence should serve all of them or whether separate sequences make more sense.

5. **Length** — How many emails? If the user isn't sure, propose 4–6 and ask them to confirm before continuing.

6. **Cadence** — How often should emails send? If the user isn't sure, propose every 3–5 days and ask them to confirm before continuing.

7. **Sender and sequence mode** — Who should these emails come from?
   - **Default: Marketing nurture.** Sender is a generic team identity (e.g., "The {Brand} Team"). Tone is educational, brand-voiced. Emails read like valuable content that showed up in your inbox. This is the standard mode.
   - **Variant: Sales-assist.** If the entry trigger(s) suggest prior human interaction (e.g., "met at a conference," "post-demo follow-up," "event attendees"), ask: "Should this be a marketing nurture sequence (sent from the brand) or a sales-assist sequence (provided to the sales team to send from their own names)?" Sales-assist sequences are still planned by marketing but designed to be sent by reps. They're shorter (3–4 emails), more direct, can reference the prior interaction ("Great meeting you at..."), and use a named sender. The tone stays helpful and educational, not pushy, but warmer and more personal than a brand email.
   - If unsure whether the context calls for sales-assist, ask. Don't guess.

Only proceed to Step 3 once all seven inputs are confirmed.

### 3. Design the sequence arc

Plan the sequence as a narrative arc, not a random collection of emails. Each email should build on the last and move the reader closer to the goal.

Use this progression framework for content/education nurture sequences:

1. **Hook** (Email 1): Validate the problem or curiosity that brought them in. Mirror the entry trigger. Establish what they'll learn across the sequence.
2. **Foundation** (Emails 2-3): Teach core concepts. Build understanding of the problem space. Use concrete examples and data points from the brand's content library.
3. **Application** (Emails 3-4): Show how to apply the concepts. Link to tutorials, guides, or case studies. Start connecting ideas to the brand's approach (without hard selling).
4. **Proof** (Email 4-5): Provide evidence — benchmarks, customer stories, comparisons. Make the case through results, not features.
5. **Action** (Final email): Clear, single CTA aligned with the sequence goal. Summarize the journey. Make the next step feel like a natural conclusion, not a sales push.

Not every sequence needs all five stages. A 3-email sequence might compress Foundation + Application into one email. Adapt the arc to the length.

**Sales-assist variant:** If the sequence mode is sales-assist (from Step 2), compress the arc. These sequences are shorter (3-4 emails), assume the reader already had a human touchpoint, and move faster to proof and action. A typical sales-assist arc: (1) Follow-up referencing the interaction + one valuable resource, (2) Proof or case study relevant to their use case, (3) Direct CTA (trial, docs, or book a call). Skip the extended foundation stage since the prior interaction already established context.

### 4. Plan each email

For each email in the sequence, produce:

- **Email number and role**: Where it sits in the arc (e.g., "Email 2: Foundation")
- **Send timing**: Days after entry trigger or previous email
- **Subject line direction**: 2-3 candidate angles for the subject line (not final copy, just directions). Follow the email subject line rules in `BrandVoice.md`.
- **Preview text direction**: A one-sentence direction for the preview text (~90-140 characters). It should extend or complement the subject line, not repeat it. This is the second line readers see in their inbox and directly affects open rates.
- **Key message**: The one thing the reader should take away from this email (one sentence)
- **Target length**: Approximate word count for the email body. Use 50-125 words for transactional/short emails, 150-300 words for educational content, 300-500 words for story-driven emails. This guides the writer during hand-off.
- **Content outline**: 3-5 bullet points covering what the email body should address. Do not reference the sequence itself in the outline — frame the content as if the email is arriving independently, not as an installment in a series.
- **CTA**: What action the email drives and where it links
- **Supporting content**: Existing brand content to reference or link to (blog posts, docs, case studies). Ask the user for relevant URLs/pastes if you don't have a content index handy; otherwise note what type of content would be ideal so the writer can fill it in.

### 5. Add sequence metadata

After the per-email plans, include:

- **Sender**: The "from" name for the sequence (carries from the brief; include here so it's visible in the plan and gets passed to the writer during hand-off)
- **Sequence name**: A working title for internal reference
- **Total emails**: Count
- **Total duration**: Days from first to last email
- **Primary CTA**: The ultimate action the sequence drives toward
- **Exit conditions**: When and why someone leaves the sequence early (e.g., "exits if they start a trial," "exits if they unsubscribe," "exits if they convert via another channel"). Define at least one positive exit (they converted) and one negative exit (they disengaged).
- **Success metrics**: What to measure (open rates, click-through, conversion to goal action)
- **Branching notes**: Any conditional logic suggestions (e.g., "if they click Email 3's CTA, skip Email 4 and go to Email 5")
- **Implementation platform**: Note where the sequence will be built. This field is informational for whoever implements the sequence; it does not change the plan or copy. If the user has a preferred marketing automation or sales engagement platform, capture it here. Otherwise, leave blank or write "TBD."

### 6. Cross-check against brand voice

Review the plan against the email section of `BrandVoice.md`:

- **Punctuation rules from BrandVoice.md.** If `BrandVoice.md` has absolute rules (e.g., "no em dashes," "no exclamation points"), scan the entire plan (subject line directions, key messages, content outlines, metadata) and replace every offending character with a period, comma, colon, or separate sentence. This applies to the plan itself, not just final copy, because the plan feeds directly into the writer.
- **Marketing tone, not sales tone.** For standard marketing nurture sequences: check the plan for sales-sequence patterns and remove them. No "I noticed you..." or "I wanted to reach out" language, no references to "your conversation with" or "your account manager," no personalized sign-offs from a named rep. The tone should be educational and brand-voiced, like a smart blog post that arrived in your inbox, not a cold email or BDR follow-up. **Exception:** If the sequence mode is sales-assist, referencing a prior interaction and using a named sender is expected. But even sales-assist emails should stay helpful and educational, never pushy or generic-sales-y.
- **No series language in openers.** Emails should feel like standalone, valuable messages — not installments in a drip campaign. Scan content outlines and any sample opener language for phrases like "in this series," "as part of this sequence," "in our last email," "this week's installment," or "you're receiving this because you signed up for X." Flag these and replace with directions that treat each email as its own thing. The reader should never be reminded they're in a funnel.
- Are subject line directions following the rules? (No clickbait, no ALL CAPS, no false urgency)
- Is the CTA progression natural? (Not every email should push a demo)
- Does the sequence lead with problems and value, not features?
- Is the cadence respectful? (Not too aggressive for the audience)

Flag anything that drifts from voice guidelines.

## Output requirements

Present the plan directly in the conversation as structured text. Do not create a file, document, or report — just respond in chat. Use these sections:

1. **Sequence overview** (goal, audience, entry trigger, cadence, duration)
2. **Sequence arc** (visual summary of the progression)
3. **Per-email plans** (the detailed breakdown from Step 4)
4. **Sequence metadata** (from Step 5)
5. **Voice check** (results of the Step 6 cross-check: list any flags, or state "No issues found" if the plan passes all checks. Always confirm punctuation-rule compliance explicitly.)
6. **Next steps** (recommendations for execution)

The plan is a working artifact meant to be iterated on in conversation, not a deliverable.

### Voice profiles

If the user mentions a specific sender for the sequence (e.g., "these should come from Matty"), check `~/.claude/AAI/USER/MARKETING/VoiceProfiles/` for a matching profile:

```
Bash: ls /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/
```

If a matching profile exists, `Read /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/{Name}.md` and use the writing samples and voice notes to inform the subject line directions and tone notes in the plan. Gracefully handle if missing — fall back to `BrandVoice.md`.

## Hand-off

After the plan is complete, offer to:
- Write the full email copy via `/marketing` (one email at a time)
- Adjust the sequence based on feedback
- Plan a follow-up sequence for non-engagers or completers

**Do not auto-trigger copy writing.** The plan is meant to be reviewed and iterated on before anyone writes copy. Wait for the user to confirm the plan looks good.

### Editing the plan before writing

The user may want to tweak individual email plans before copy gets written. There are two ways to do this:

1. **Conversational edits.** The user says what to change (e.g., "Move the three evaluation tips from Email 1 to Email 2" or "Make Email 4's CTA about booking a call instead of restarting a trial"). Rewrite the affected email plan(s) and confirm before proceeding.
2. **Paste-back edits.** The user copies an email plan from the output, edits it directly (in a text editor, note, or the chat input), and pastes the revised version back. Use the pasted version as the new plan for that email, replacing the original. This gives the user full control over the outline without having to describe every change in words.

When presenting the plan, include this note at the end of the **Next steps** section: *"To edit any email plan before writing, you can tell me what to change or paste a revised version of the plan directly."*

### Writing the emails

When the user is ready to write, ask which email to start with (suggest Email 1). Then hand off to `/marketing` (or a copywriter) with this context for each email:

- The sequence overview (goal, audience, sender, sequence mode)
- That specific email's full plan (role, subject line directions, preview text direction, key message, target length, content outline, CTA, supporting content)
- The email's position in the arc ("This is Email 2 of 5, the Foundation email. Email 1 covered X, and Email 3 will cover Y.")

Write one email at a time. After each draft, ask if the user wants to revise it or move to the next email. This keeps the feedback loop tight and avoids throwing away bulk copy.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand context swapped to local AAI/USER/MARKETING/ files.

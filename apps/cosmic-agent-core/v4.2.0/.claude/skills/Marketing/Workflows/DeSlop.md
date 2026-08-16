---
name: DeSlop
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Strip AI writing patterns ("slop") from existing text so it reads as natural, human-written, and on-brand.
---

# DeSlop

Remove the patterns that make text read like AI output. Inspired by the [humanizer skill](https://github.com/blader/humanizer) (MIT-licensed) and informed by Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) catalog, but restructured around an editing workflow grounded in the user's own brand context.

Why this matters: the same patterns that scream "AI wrote this" are also just bad writing habits. Vague where they should be specific, inflated where they should be plain, formulaic where they should be interesting. De-slopping makes text better, not just less detectable.

Triggered when:

- Someone pastes text and asks you to make it sound less like AI or less like an LLM
- Someone runs `/de-slop` on a piece of content
- Someone says "this sounds like ChatGPT" or "fix the AI voice" or "remove the LLM tells" or "clean this up"
- Someone refers to AI or LLM writing patterns they want removed (people use both terms interchangeably)
- After a content review flags AI voice issues and the user wants them fixed
- Someone asks to edit AI-generated or LLM-generated drafts before publishing

When NOT to use this workflow:

- Writing new content from scratch (use `/marketing` for the brand-voice writer flow)
- Evaluating content quality (use the ContentReviewer workflow)
- General copyediting for grammar, clarity, or structure

## Pre-flight

Pre-flight reads `~/.claude/AAI/USER/MARKETING/` via the Read tool — no MCP needed.

Read the assets this workflow needs:

- `~/.claude/AAI/USER/MARKETING/BrandVoice.md` — required, this workflow is voice-sensitive
- `~/.claude/AAI/USER/MARKETING/Terminology.md` — required for any externally-visible copy
- `~/.claude/AAI/USER/MARKETING/NoFlyList.md` — required if the text names customers or partners
- `~/.claude/AAI/USER/MARKETING/VoiceProfiles/{Name}.md` — only if the user names a specific author to match (e.g., "make this sound like Matty")

For each required asset, check the frontmatter `populated:` field after reading. If `populated: false`, the asset is a stub.

To list available voice profiles when the user names an author:

```
Bash: ls /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/
```

If the named profile is missing, gracefully fall back: tell the user the profile doesn't exist yet and proceed with generic de-slopping (or offer to capture a profile via `/marketing`).

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand output, and missing context is exactly what produces generic AI slop.

## Instructions

### 1. Read the full text first

Read the entire piece before changing anything. Figure out what it's actually trying to say underneath the slop. Who's the audience? What's the one thing the reader should take away? What tone is appropriate? You need to understand the intent before you can express it better.

### 2. Load brand context

If the text is the user's brand marketing content (blog post, landing page, email, social post, etc.), the BrandVoice.md you read in pre-flight is your reference. The brand voice guide already bans some of the same things de-slop catches (em dashes, passive voice, fluffy paragraphs). When both apply, follow the brand voice guide — it's more specific to the user's context.

If the text is generic content unrelated to the user's brand, you can lean on the de-slop pattern catalog alone, but still respect any brand-wide preferences captured in BrandVoice.md.

### 3. Identify the slop

Scan the text for these families of problems. You won't find all of them in every piece — focus on what's actually there.

#### The inflators

AI text loves to make everything sound important. Watch for language that inflates significance without adding information.

**The tells:** "pivotal moment," "testament to," "underscores the importance of," "reflects broader trends," "marks a shift," "evolving landscape," "setting the stage for," "deeply rooted." Also watch for stacking: a sentence that claims something "represents," "contributes to," or "symbolizes" something bigger without explaining how.

**What to do instead:** Say what happened. Use specifics. "The company was founded in 2019" not "The company's founding marked a pivotal moment in the evolution of the industry."

#### The fakers

AI text fills gaps in knowledge with confident-sounding vagueness.

**The tells:** "Experts argue," "Industry observers note," "Several publications have highlighted," "Some critics contend" — all without naming a single expert, observer, or publication. Also: "active social media presence," "has garnered attention," and any claim of notability that lists outlets without saying what they actually reported.

**What to do instead:** Name the source and what they said, or delete the claim. "A 2024 report by Gartner found..." beats "Industry reports suggest..."

#### The vocabulary cluster

Certain words appear 5-10x more often in post-2023 AI text than in human writing. One is nothing. Three in the same paragraph is a signal.

**The words:** additionally, bolstered, crucial, delve, emphasizing, enduring, enhance, fostering, garner, intricate/intricacies, interplay, landscape (figurative), meticulous, pivotal, showcase, tapestry (figurative), testament, underscore, vibrant. Also watch for "align with," "key" as an adjective for everything, and "valuable insights."

**What to do instead:** Replace with the simpler word you'd actually say out loud. "Important" not "crucial." "Show" not "showcase." "Complex" not "intricate." Or often, just delete the word entirely — "valuable insights" is usually just "insights," and "insights" is often just "data."

#### The structural tics

These are patterns in how AI builds sentences and paragraphs, not which words it picks.

**Copula dodging:** AI avoids "is" and "are" in favor of fancier constructions. "Serves as," "stands as," "functions as," "represents" — when the sentence just means "is." Fix: use "is."

**Forced triples:** AI groups things in threes compulsively. "Innovation, collaboration, and excellence." If there are two things, say two. If there are four, say four.

**Negative seesaws:** "Not just X, but Y." "Not merely a tool — it's a movement." "It's not about the technology, it's about the people." This construction appears once in a while in human writing. AI uses it every other paragraph. Fix: state the point directly.

**Synonym rotation:** AI has anti-repetition training, so it cycles through synonyms for the same thing. The protagonist... the main character... the central figure... the hero. Fix: pick one word and reuse it. Repetition is fine. Repetition is human.

**Fake ranges:** "From X to Y" where X and Y aren't really ends of a spectrum. "From ancient traditions to modern innovations." Fix: just list the things.

#### The formatting tells

**Em dashes:** AI overuses them for dramatic pauses and parenthetical asides. Many brand voices ban them entirely — check BrandVoice.md. Replace with commas, periods, or parentheses.

**Bold-header lists:** Bullet points where each item starts with a bolded label and colon ("**Performance:** The system is fast"). Convert to prose or use plain list items.

**Mechanical bold:** Bolding terms like a textbook highlighting vocabulary words. Remove unless there's a real reason for emphasis.

**Title Case Headings:** AI capitalizes every word. Use sentence case.

**Emoji garnish:** Rocket ships and checkmarks decorating headers. Delete.

#### The chatbot residue

Text that was clearly pasted from a conversation without cleanup.

**Pleasantries:** "Great question!", "I hope this helps!", "Certainly!", "Let me know if you'd like me to expand on any section!"

**Hedges from training:** "As of my last update," "While specific details are limited," "based on available information." Either find the information or don't mention it.

**Filler connectives:** "In order to" (just "to"), "due to the fact that" (just "because"), "it is important to note that" (delete, then state the thing), "at this point in time" ("now").

**Sycophancy:** "You're absolutely right!", "That's an excellent point!" Delete on sight.

**Hallmark-card endings:** "The future looks bright." "Exciting times lie ahead." "This is just the beginning." End the piece when it's done. The last paragraph should contain information, not warm feelings.

### 4. Rewrite — and put a person behind it

Stripping slop is the first job. But a scrubbed text that's grammatically clean and factually accurate can still read as obviously AI-generated if nobody's home. The absence of bad patterns isn't the same as the presence of a human voice.

Things that make writing feel like a person wrote it:

**Uneven rhythm.** Real writing doesn't march at a steady pace. Some sentences are three words. Others unspool over a full paragraph because the idea needs room. If every sentence in a stretch is 15-20 words, something is off.

**Actual reactions.** Human writers respond to their own material. "That number surprised me." "I keep coming back to this." "Honestly, I'm not sure what to make of it." AI reports facts. People react to them.

**Willingness to not know.** "I'm not sure this is the right framing" or "there's probably a better way to think about this" — these signal a real mind at work. AI always sounds certain, even when hedging.

**Mess and tangent.** Not every paragraph needs to land one clean point in perfect order. Sometimes a parenthetical aside, a half-formed thought, or a detour into a related story is what makes a piece feel alive. Don't overdo it, but don't sand everything smooth either.

**Specificity over abstraction.** "The dashboard loads in 200ms" instead of "the dashboard is fast." "We tested this on a customer's 500GB Postgres instance" instead of "we tested this at scale." Concrete details are harder for AI to generate and more interesting to read.

When rewriting, also preserve the core meaning, the intended audience and tone, any sourced data or quotes, and the author's point of view if one exists beneath the slop.

### 5. Check your own work

After rewriting, read it back and ask: "Would I believe a person wrote this?" Be honest about what survives. Common second-pass catches:

- Every paragraph is still roughly the same length
- The piece is suspiciously well-organized (thesis, evidence, evidence, conclusion — too clean)
- You introduced new AI patterns while removing old ones (it happens)
- The closing still trails off into vague optimism
- It's clean but forgettable — technically fine, zero personality

Fix what you find. This second pass matters.

### 6. Present the output

Provide the rewritten text and a brief changes summary grouped by what you fixed (not a line-by-line diff). If the piece was long, note which sections needed the most work so the user knows where to focus their review.

## Voice matching

If the user mentions who should have written the piece (e.g., "de-slop this to sound like Matty," "clean up Jacky's draft"):

1. Read `~/.claude/AAI/USER/MARKETING/VoiceProfiles/{Name}.md` (handle gracefully if missing — see Pre-flight).
2. Use their writing samples and voice notes to guide the rewrite — not just removing AI patterns, but actively matching that person's rhythm, tone, and verbal habits.
3. Note voice-matching adjustments in the changes summary.

If no specific person is mentioned, skip the voice profile.

## Relationship to other workflows

- A brand-voice writer flow (run via `/marketing`) writes new content. DeSlop edits existing text.
- The ContentReviewer workflow evaluates quality. DeSlop fixes a specific class of problems.
- If ContentReviewer flags AI voice issues, DeSlop is the fix.
- After de-slopping brand content, suggest running ContentReviewer as a final check.

## Output requirements

- Deliver the rewritten text in full, not a diff.
- Follow with a short changes summary grouped by problem family (inflators, fakers, vocabulary, structural tics, formatting tells, chatbot residue, voice-matching adjustments). Bullets, not paragraphs.
- For long pieces, flag the section(s) that needed the heaviest editing so the user knows where to focus a final read.
- Match the brand voice guide for tone, terminology, and formatting rules. The brand voice guide overrides any default de-slop preference if they conflict.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand context swapped to local AAI/USER/MARKETING/ files. Pattern catalog informed by [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), maintained by WikiProject AI Cleanup. Approach inspired by the [humanizer skill](https://github.com/blader/humanizer) by blader (MIT license).

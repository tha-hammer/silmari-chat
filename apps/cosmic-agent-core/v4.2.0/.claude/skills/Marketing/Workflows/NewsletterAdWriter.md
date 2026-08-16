---
name: NewsletterAdWriter
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Write character-counted ad copy for developer-focused newsletter placements (sponsored links, primary ads, exclusive ads), tailored to each newsletter's audience.
---

# NewsletterAdWriter

Write ad copy for developer-focused newsletter placements. Produces character-counted, developer-voice copy for sponsored links, primary ads, and exclusive ads across technical newsletters. Each ad is tailored to the newsletter's specific developer audience.

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required (voice and tone foundation for every ad)
- `ICP.md` — required (audience personas and pain points)
- `Positioning.md` — required (the stance the ad takes; proof points)
- `Terminology.md` — required (preferred product/feature wording)
- `NoFlyList.md` — required (customers who cannot be publicly referenced)
- `VoiceProfiles/{Name}.md` — only if the user names an author

For each required asset, check the frontmatter `populated:` field after reading. If `populated: false`, the asset is a stub.

Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.

**No Fly List as a hard constraint.** Load the names in `NoFlyList.md` and never include any of them in any output — not as named examples, proof points, customer quotes, case study references, or any other mention. If the user requests content featuring a No Fly List customer, stop and inform them. If a No Fly List name appears in source material, omit it from all outputs.

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand output, and missing context is exactly what produces generic AI slop.

## When to use this workflow

- Writing weekly newsletter ad placements (sponsored links, primary, exclusive)
- Creating ad copy for developer newsletters (e.g., Frontend Focus, Node Weekly, JavaScript Weekly, Go Newsletter, Ruby Weekly, Postgres Weekly, React Status)
- Drafting multiple newsletter ads for the same week
- Refreshing or iterating on existing ad copy

## When NOT to use this workflow

- Writing your own owned newsletter (use a long-form newsletter workflow)
- Writing social media posts (use SocialPostWriter)
- Writing email sequences or drip campaigns (use EmailNurturePlanner)
- Writing blog posts or long-form content (use a long-form workflow via `/marketing`)

## Instructions

### 1. Load brand, voice, and audience context

Read the AAI/USER/MARKETING/ assets listed in Pre-flight. As you read:

- `Positioning.md` — note the stance, the differentiator, and any proof points (customer metrics, benchmarks, migration stories, pull quotes). Specific numbers outperform generic claims.
- `ICP.md` — note the audience personas, pains, and where they live (which newsletters reach them).
- `BrandVoice.md` — internalize the writing foundation. For ads, the relevant guidance is: **(1) Inspire, grab attention instantly. (2) Drive action, tell them exactly what to do next.** One main message, one clear action, graspable in under five seconds.
- `Terminology.md` — note preferred spellings, product naming, feature names, and any banned words.
- `NoFlyList.md` — load names as a hard constraint (see Pre-flight).

If the user has a separate **newsletter profiles / performance** reference file (audience descriptions, character limits per publisher, historical performance, swipe file), ask the user to point you at it and Read it. If none exists, proceed using the Cooperpress defaults below and brand voice — the ads will still be well-written, they just won't be performance-optimized for a specific publisher.

### 2. Gather the brief

Collect these inputs from the user. Ask for anything not provided:

- **Newsletters:** Which newsletters are we placing in this week?
- **Ad types per newsletter:** Sponsored link, primary, or exclusive? (Determines character limits and fields)
- **Product focus:** Which product or angle?
- **Any specific angle or theme?** (e.g., "let's try a real-time dashboard angle for Frontend Focus this week")
- **Anything to avoid?** (e.g., "we ran the 'slow query' angle last week, try something different")
- **Destination URL:** Where does the click go?
- **CTA preference:** Default is "Try free" for sponsored links and "Start building for free" for primary/exclusive — confirm or override.

If the user provides all of this upfront, skip the questions and proceed to Step 3.

### 3. Internalize the rules

These rules are non-negotiable. Apply them to every ad:

**Character limits (hard caps, no exceptions):**

Character limits vary by publisher and ad type. If the user has a newsletter profiles reference, use the limits there. For quick reference, here are common Cooperpress defaults:

| Ad Type | Title | Supporting Text |
|---------|-------|-----------------|
| Sponsored Link | 70 characters | 120 characters |
| Primary | 60 characters | 250 characters |
| Exclusive | 60 characters | 250 characters |

**Always count characters, not words.** After drafting every title and supporting text, count the characters and display the count. If over the limit, rewrite before presenting. If the user names a newsletter or publisher whose limits you do not know, ask for character limits before drafting.

**Developer voice principles:**
- **Problem-first, not product-first.** Lead with recognition ("that's me") or curiosity ("wait, what?"), not features.
- **Written like a dev would talk, not a marketer.** Stop the scroll with a real problem.
- **Audience-specific hooks.** Tailor the angle to each newsletter's audience (see Step 4).
- **Stay on the core narrative** from `Positioning.md`. Don't drift into a second product or a different stance.

**Terminology and formatting:**
- Follow `Terminology.md` for preferred spellings and product naming.
- CTA: "Try free" for sponsored links, "Start building for free" for primary/exclusive (or whatever the user specified in the brief).
- Features land in supporting text, not titles.
- Title and supporting text complement each other (never repeat the same words).
- **No em dashes.** Use commas, periods, or colons instead.

### 4. Write audience-specific ads

Each newsletter has a distinct developer audience. Tailor the hook and angle accordingly.

**Use newsletter profiles if available.** If the user has a profiles reference file with audience descriptions, recommended angles, and hook patterns per newsletter, use it as the starting point.

**New newsletter or publisher with no profile?** Ask the user: (1) Who publishes it? (2) Who reads it? (3) What ad types and character limits does it support? Use their answers to build an audience profile on the fly and write ads using the same developer voice principles. Suggest they capture it in their profiles file for future use.

### 5. Draft the ads

For each newsletter placement, produce:

1. **Title** with character count
2. **Supporting text** with character count
3. **Company/Service Name:** (from `Terminology.md`)
4. **URL:** (the destination URL from the brief)

**Process per ad:**

1. Generate 3–5 title options using different angles from Step 4.
2. For each title, draft supporting text that complements (not repeats) the title.
3. Count characters for every option. Display as: `Title (XX chars):`
4. Verify all are under the character limit. Rewrite any that exceed it.
5. Select the strongest option as the recommended pick. Present all options so the user can choose.

**Title formulas to draw from** (generic patterns; swap the bracketed nouns for your product's actual problem space):

- **Developer pain:** "Your [thing] Was Fast at Launch. What Happened?"
- **Architecture insight:** "Adding [a piece of infrastructure] Is Easier Than Removing One"
- **Loyalty to the existing stack:** "You Picked [their tool] for a Reason. Don't Leave It for [the new problem]."
- **Stack identity:** "[Language] + [their tool]. That's the Whole [problem-area] Stack."
- **Specific technical pain:** "[A query / operation that should be fast] Shouldn't Take [N] Seconds"
- **Speed contrast:** "Fast [thing they care about] Deserve Fast [thing your product gives them]"
- **Challenge the assumption:** "That Slow [symptom]? It's Not a [usual suspect] Problem."

**Supporting text patterns:**
- **Problem then solution:** State the pain, then how your product solves it. End with CTA.
- **Extend the narrative:** Continue the story the title started. Don't restart with a product pitch.
- **Feature proof:** After establishing the problem, land 2–3 specific features (named per `Terminology.md`) as the solution. End with CTA.

### 5b. Apply performance insights (if available)

If the user has a newsletter performance / swipe-file reference, use it to inform your recommendation:

- **Prefer high-performing placement types.** If the data shows one ad type significantly outperforms another for this publisher, note it when the user has a choice.
- **Favor proven themes and angles.** Lean toward title formulas and content themes that have historically driven strong engagement on that specific newsletter.
- **Reference the swipe file as inspiration, not template.** Note what made past winners work and apply those principles to fresh copy.
- **Flag fatigue signals.** If the data flags a newsletter for declining performance, tell the user and suggest varying the angle more aggressively or adjusting cadence.
- **Note destination URL patterns.** If certain link destinations (product page vs blog) historically perform better, recommend accordingly.

If no performance reference is available, skip this step.

### 6. Present the output

Format each ad as a complete placement block:

```
## [Newsletter Name] ([Ad Type])

**Recommended:**

- **Title (XX chars):** [Title text]
- **Supporting Text (XXX chars):** [Supporting text]
- **Company/Service Name:** [from Terminology.md]
- **URL:** [destination URL]
- [For Primary/Exclusive only] **Image URL:** [TBD]
- [For Primary/Exclusive only] **Masthead Image:** [TBD]

**Alternates:**

1. **Title (XX chars):** [Alternate title 1]
   **Supporting Text (XXX chars):** [Alternate supporting text 1]

2. **Title (XX chars):** [Alternate title 2]
   **Supporting Text (XXX chars):** [Alternate supporting text 2]
```

Separate each newsletter with a horizontal rule.

### 7. Brand voice cross-check

After drafting all ads, review against `BrandVoice.md` and `Terminology.md`. Apply the full voice and terminology checks from those files, plus these ad-specific checks:

1. **Character limits.** Re-verify every title and supporting text is under the limit. This should have been enforced during drafting. If any are over, rewrite now.
2. **Problem-first.** Every title should lead with a developer pain or insight, not a product name or feature.
3. **No repetition between title and supporting text.** Flag and fix any ads where the title and supporting text use the same key phrase.
4. **No marketing fluff.** Remove "revolutionary," "game-changing," "cutting-edge," or vague superlatives. Replace with specific claims.
5. **No Fly List.** Re-scan output for any name from `NoFlyList.md`. Remove on sight.

Fix issues inline. If no issues are found, state "No voice issues found."

### 8. Log the placements

After the user confirms the final ads, offer to append them to a newsletter ads log if the user keeps one. Format the entries following the existing log structure (week header, newsletter sections with all fields).

## Output requirements

- Present everything directly in chat as structured Markdown. Do not create files unless the user requests it.
- Every title and every supporting text MUST display its character count and be at or under the limit.
- Recommended pick + alternates for every placement.
- Include this note at the end: *"To adjust any ad, tell me what to change. I can try different angles, swap titles between alternates, or rewrite for a different audience."*

## Hand-off

After the ads are confirmed, offer to:

- Run `DeSlop` if any ads feel AI-generated
- Log the placements to the user's newsletter ads log
- Create complementary social posts (using `SocialPostWriter`)

Do not auto-trigger other workflows. Wait for the user to confirm the output looks good first.

## Maintenance

Newsletter performance data, swipe files, and audience profiles drift quickly. Refresh quarterly when new publisher reports are available. Use `NewsletterAdReview` to process new data and update any local profiles/performance reference the user keeps.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand context swapped to local AAI/USER/MARKETING/ files.

---
name: LinkedinArticleWriter
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Convert blog posts and longform content into first-person LinkedIn articles with voice-matched writing, SEO metadata, and a companion social post + first comment.
---

# LinkedinArticleWriter

Convert blog posts and other content into first-person LinkedIn articles with voice-matched writing, SEO metadata, and a companion social post. Works with two input types: previously-published or drafted content the user provides directly, and raw blog drafts (pasted text, uploaded files, Google Docs) that aren't published yet.

Triggered when the user asks to turn a blog post into a LinkedIn article, write a LinkedIn article from existing content, repurpose content for LinkedIn, create a long-form LinkedIn piece, or says "LinkedIn article" in any context. Also trigger on "repurpose for LinkedIn," "LinkedIn version of this post," or "turn this into an article." For short LinkedIn posts (not articles), use `SocialPostWriter` instead.

## When NOT to use this workflow

- Short LinkedIn posts (150-300 words) — use `SocialPostWriter`
- Social media campaign planning — use `SocialPostWriter`
- X/Twitter posts or threads — use `SocialPostWriter`
- Writing a blog post from scratch — use `/marketing` (or `BrandVoiceWriter` if that gets ported)

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required for voice-sensitive output
- `ICP.md` — required for audience targeting
- `Positioning.md` — required for content that takes a stance
- `Terminology.md` — required for externally-visible copy
- `NoFlyList.md` — required for any content that names customers
- `VoiceProfiles/{Name}.md` — only if the user names an author

For each required asset, check the frontmatter `populated:` field after reading.
If `populated: false`, the asset is a stub.

Pre-flight reads AAI/USER/MARKETING/ via the Read tool — no MCP needed.

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand
output, and missing context is exactly what produces generic AI slop.

## No Fly List handling

After reading `NoFlyList.md`, load those names as a hard constraint: **never include any No Fly List customer in any output** — not as named examples, proof points, customer quotes, case study references, or any other mention. If the user requests content featuring or referencing a No Fly List customer, stop and inform them that this customer cannot be publicly referenced. If a No Fly List name appears in source material you are working from, omit it from all outputs.

## Instructions

### 1. Gather inputs

Determine the source content and author. Ask the user for anything not provided.

**Source content — one of:**

- **Existing content the user provides:** The user provides a title, URL, or paste of an article/blog post. Work from the provided text directly. If the user only gives a topic or partial title, ask them to paste or link the full source content — there is no published-content index to search locally.
- **Raw blog draft:** The user pastes text, uploads a file, or shares a Google Doc link. Work from the provided text directly.

**Author voice profile:**

- Ask who the LinkedIn article is "from" (who's posting it). If not specified, ask.
- List available voice profiles: `Bash: ls /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/`
- Read the matching profile: `Read /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/{Name}.md`
- If no voice profile exists for the person, proceed with brand voice only and note the limitation.

**Optional inputs (ask if not provided, offer sensible defaults):**

- **Target audience:** Who is this article for? Default: infer from the content (cross-check against `ICP.md`).
- **Angle:** Any specific emphasis or perspective? Default: let the content guide it.
- **Word count:** Target for article body. Default: 1000 words.
- **CTA URL:** Ask the user: "What URL should the CTA link to?" This is always a published, live URL, either the blog post itself, a related asset (whitepaper, anchor essay), or a product page. Do not assume or default. Always ask.
- **Suggested related links:** Ask the user for 1-3 related URLs they want considered for the social post's first comment. There is no local published-content index to auto-suggest from.

### 2. Load brand context

Read the brand context assets before writing:

- `Read /home/maceo/.claude/AAI/USER/MARKETING/BrandVoice.md`
- `Read /home/maceo/.claude/AAI/USER/MARKETING/Positioning.md`
- `Read /home/maceo/.claude/AAI/USER/MARKETING/ICP.md`
- `Read /home/maceo/.claude/AAI/USER/MARKETING/Terminology.md`

Internalize the absolute rules from `BrandVoice.md` (no em dashes, active voice, lead with the problem, short paragraphs — or whatever your brand voice specifies). The voice profile from Step 1 takes precedence for sentence rhythm, tone, humor, and personality. The brand voice guide governs terminology and structural guardrails.

### 3. Assemble writing context

You now have:

- The full source text (from the user in Step 1)
- The author's voice profile (from Step 1)
- Brand voice rules, positioning, ICP, and terminology (from Step 2)
- The user-supplied CTA URL and any suggested related links (from Step 1)

Internally synthesize:

- The author's voice notes, anti-patterns, and writing samples
- The full source post text and its key argument
- Suggested links for the social post's first comment
- Target audience, angle, and word count

Use that synthesized context to write the article in the next step.

### 4. Write the four outputs

Produce exactly four outputs in this order:

**Output 1: LinkedIn SEO Title**

- Under 70 characters
- Clear and specific, no clickbait
- Uses the author's natural phrasing, not generic marketing language
- Test: would this person actually title their own article this way?

**Output 2: LinkedIn SEO Description**

- 1-2 sentences, under 200 characters total
- Summarizes the article's core takeaway
- Written in the author's voice

**Output 3: Article Body**

Target word count (default 900-1100 words). This is a first-person LinkedIn article, not a blog repost. The article should feel like the author wrote it natively for LinkedIn, not like someone copied a blog post.

Structure:

- **Opening hook:** 2-3 sentences max. No "I was sitting at my desk..." cliches. Start with an insight, a surprising fact, or a direct statement that earns the reader's attention.
- **3-5 sections with clear subheadings:** Each subheading should be specific and descriptive, not clever or cryptic. Each section follows the pattern: insight, evidence or example, implication.
- **Closing:** One clear takeaway. No summary paragraph. No "In conclusion." The last paragraph should contain information, not warm feelings.
- **No CTAs, links, or promotional content in the article body.** Links go in the social post's first comment only.

Paragraph rules: 2-4 sentences max per paragraph. No walls of text. First sentence of each section should stand alone as a meaningful statement. Explain jargon on first use, then use it freely.

**Output 4: Social Post + First Comment**

The LinkedIn post that accompanies the article when sharing. 150-250 words for the post body. The CTA link goes in a separate first comment, not in the post itself. LinkedIn's algorithm deprioritizes posts with outbound links, so keeping the post link-free and putting the CTA in the first comment preserves organic reach.

**Post body structure:**

- **Hook line:** The first line people see before "...see more." This line alone must create enough curiosity to click.
- **2-3 short paragraphs:** Expand the hook. Give a taste of the article's value without giving away the whole thing.
- **Closing line:** A natural transition to the first comment (e.g., "I wrote about this in detail. Link in the first comment." or "Full breakdown below."). Do not use "Link in bio." Keep it conversational.
- **3-5 hashtags:** Mix of broad and niche. No #ThoughtLeadership. No more than 5.

**No links in the post body.** All links go in the first comment.

**First comment structure:**

Draft a short first comment (2-4 sentences) that includes:

- The primary CTA link, UTM-tagged manually with: `?utm_source=linkedin&utm_medium=social&utm_campaign=<topic-slug>` (preserve any existing query params on the URL — append with `&` if present, `?` if not)
- Optionally, one related link from the user-supplied suggestions (Step 1) if it adds value
- A brief sentence framing why the link is worth clicking

Present the first comment separately under a "**First Comment:**" header so the author can copy-paste it immediately after posting.

### 5. Voice matching rules

These rules apply to all four outputs. Follow them exactly.

- Read all writing samples from the voice profile before writing anything
- Match the author's sentence length patterns, punctuation habits, and paragraph rhythm
- Use their vocabulary and phrasing, not generic business writing
- If they use contractions, use contractions. If they don't, don't.
- Mirror their level of formality, humor, and directness
- The voice notes and anti-patterns from the profile are authoritative

### 6. Anti-patterns (never do these)

Scan every output and remove any of the following before delivering:

- "In today's rapidly evolving landscape" or similar AI-sounding openers
- "Let's dive in," "Here's the thing," "Let me be clear," "At the end of the day"
- Em dashes — replace with commas, periods, or parentheses. Brand voice bans them entirely.
- Rhetorical questions as section transitions
- Bullet-point lists longer than 5 items in the article body
- "I'm excited to announce" or "Thrilled to share"
- Hashtags anywhere in the article body (only in the social post)
- "What do you think? Let me know in the comments" or engagement bait
- Corporate jargon: "synergy," "leverage," "ecosystem," "paradigm shift"
- More than one exclamation mark in the entire article
- "As [famous person] once said" quotes
- Three consecutive sentences starting the same way
- Negative seesaws: "It's not X. It's Y." / "Not just X, but Y."
- Forced triples: compulsively grouping things in threes
- Copula dodging: "serves as," "stands as," "functions as" when the sentence means "is"
- AI vocabulary cluster: "delve," "landscape," "crucial," "showcase," "underscore," "tapestry," "foster," "bolster"
- Hallmark-card endings: "The future looks bright." "This is just the beginning."

### 7. Quality checklist

Verify all of the following before delivering. If any check fails, fix it.

- [ ] Article body is within 100 words of the target word count
- [ ] Voice matches the writing samples (read them side by side)
- [ ] No items from the anti-patterns list appear in any output
- [ ] No links in the article body
- [ ] Social post has a strong hook line (would you click "see more"?)
- [ ] SEO title is under 70 characters
- [ ] SEO description is under 200 characters
- [ ] All four outputs are present and in order
- [ ] Em dashes are completely absent
- [ ] UTM parameters are applied to all links in the first comment
- [ ] No `NoFlyList.md` customer name appears anywhere in any output

## Output requirements

Present all four outputs directly in chat as structured Markdown with clear headers:

```
## LinkedIn SEO Title
[title]

## LinkedIn SEO Description
[description]

## Article Body
[article]

## Social Post
[post body with hashtags, no links]

## First Comment
[CTA link + framing sentence]
```

If the user asks for a file, create a Markdown file with the four sections.

## Hand-off

After delivering, offer to:

- Adjust the angle, tone, or word count and regenerate
- Run `/marketing` for an additional AI-pattern scrub or content review
- Draft additional social posts for the same article using `SocialPostWriter`
- Create an X/Twitter version of the social post

Do not auto-trigger other workflows. Wait for the user to confirm the output looks good first.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand context swapped to local AAI/USER/MARKETING/ files.

---
name: SocialPostWriter
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: "Plan social media campaigns and draft individual posts for LinkedIn and X (Twitter), including repurposing existing content into platform-native social posts. Use when the user asks to create a social media calendar, plan a LinkedIn content series, write social posts, draft a tweet or X thread, repurpose a blog post for social, turn an article into LinkedIn posts, create a social campaign, or plan social content cadence. Also trigger when they mention social media strategy, content calendar, post series, LinkedIn carousel outline, X thread, hashtag strategy, or ask 'what should we post about [topic]?'"
---

# SocialPostWriter

Plan social media campaigns and draft individual posts for LinkedIn and X. Three modes:
campaign planning (multi-post calendar with topic mix and cadence), single-post drafting,
and content repurposing (turning blog posts, articles, or other content into platform-native
social posts).

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required (voice and tone, banned constructions, format-specific guidance)
- `ICP.md` — required (audience personas, pain points, vocabulary)
- `Positioning.md` — required (proof points, differentiator, mechanism)
- `Terminology.md` — required (approved product names, capitalization, banned words)
- `NoFlyList.md` — required (customers/companies that cannot be publicly referenced)
- `VoiceProfiles/` — optional, scanned in Step 2 to resolve personal-account voices

For each asset, after reading, check the frontmatter `populated:` field.

### Freshness check

After reading `Positioning.md`, scan its Updated/Last-modified line. If older than 6 months,
flag: "Your Positioning.md was last updated [date]. Some metrics or proof points may be
stale. Want me to proceed or refresh first?"

## Missing-asset bootstrap

If `BrandVoice.md`, `ICP.md`, `Positioning.md`, `Terminology.md`, or `NoFlyList.md` is a stub
(`populated: false`), STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub. Social
> posts without brand context produce generic LinkedIn-ad slop. Run `/marketing` to build
> the missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections, voice
> traits, and proof points). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. Generic social posts are worse than nothing.

## When to use this workflow

- Planning a social media content calendar or post series
- Drafting individual LinkedIn posts or X posts/threads
- Repurposing a blog post, article, or other piece into social posts
- Planning topic cadence and content mix across platforms
- "what should we post about [topic]?" / "turn this blog post into social"

## When NOT to use this workflow

- Writing social posts as part of an event campaign brief — use a dedicated event workflow
- Writing other content types (blog posts, emails) — use the content-type workflow or `/marketing`
- Long-form LinkedIn articles (900–1100 words) — use `LinkedinArticleWriter` instead
- Evaluating post quality (social posts are too short for rubric evaluation)

## Instructions

### 1. Internalize the loaded brand and audience context

The Pre-flight already loaded brand voice, ICP, positioning, terminology, and the no-fly list.
Before drafting:

- **Read the social/ads section of `BrandVoice.md`.** Find any subsection labeled
  "social", "ads", "trade show / social copy" or similar and internalize its goals.
  Generic guidance: punchy, direct language; one main message driving one clear action;
  graspable in under five seconds.
- **Scan proof points in `Positioning.md`.** Note customer performance metrics, before/after
  numbers, migration stories, and pull quotes relevant to the topic. Specific numbers
  ("6.4s to 30ms", "95% compression", "5x throughput") outperform generic claims in social
  posts.
- **Apply `NoFlyList.md` as a hard constraint.** Names listed there must NEVER appear in any
  output — not as named examples, proof points, customer quotes, or any other mention. If
  the user requests content featuring a no-fly customer, stop and inform them. If a
  no-fly name appears in source material, omit it from output.

Voice profiles (per-author writing voice in `VoiceProfiles/`) are loaded conditionally in
Step 2 based on which accounts are posting. Default is brand voice — a personal voice
profile is only loaded when an individual's account is selected.

### 2. Confirm target accounts

Ask which account(s) will post this content. The answer determines platforms, voice, and
register — so ask this before anything else and before mode selection. **Do not default —
always ask.**

Before asking, list the available voice profiles so you can present them as options:

```
Bash: ls /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/
```

Filter to populated profiles (each `Name.md` has frontmatter `populated: true`).

Present as a multi-select question:

- **Brand company LinkedIn (your company's page)** — brand voice, "we" register
- **Brand company X (your company's account)** — brand voice, "we" register
- **My personal LinkedIn** — personal voice profile, first-person register
- **My personal X** — personal voice profile, first-person register
- **Another teammate's account** — ask whose, and which platform

Multi-select is expected. A single request often spans multiple accounts.

**Resolving voice per selected account:**

- **Company accounts:** use `BrandVoice.md` already loaded in Pre-flight. No extra read.
- **Personal accounts ("my" or a named teammate):** match the person against the
  `VoiceProfiles/` listing above.
  - If an unambiguous match is found, `Read /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/{Name}.md`.
  - If no match, or if the user said "my" and you cannot confidently identify them, ask:
    "I'm not sure which voice profile is yours — here are the ones available: [list]. Which
    should I use?"
  - If the named teammate has no voice profile, tell the user: "[Name] doesn't have a voice
    profile set up at `~/.claude/AAI/USER/MARKETING/VoiceProfiles/{Name}.md`. Want to
    proceed with brand voice and a personal register, or pause so a profile can be created
    first?"

**If scope is getting too complex** (multiple accounts across multiple voices AND multiple
platforms in a single request), suggest sequencing instead of one-shot:

> "This is a lot to handle in one pass — drafts get muddled when voices and accounts mix.
> Want to start with the company posts, and once those are locked in we'll run through this
> again for [other account]?"

**Derived from this step (used downstream):**
- **Platforms:** union of platforms across selected accounts. If X is not covered by any
  selected account, don't draft X posts.
- **Voice per account:** tracked separately when multiple accounts are selected.
- **Register:** company accounts = "we", polished; personal accounts = first-person, conversational.

### 3. Determine the mode

**First, check if this is actually a long-form LinkedIn article request.** If the user
wants a 900–1100 word LinkedIn article (not a short social post), this workflow is the
wrong tool — hand off to `LinkedinArticleWriter`. Tell the user: "Long-form LinkedIn
articles have their own workflow. Switching to LinkedinArticleWriter." Then invoke that
workflow. **Stop here — do not continue to the modes below.**

Otherwise, ask the user (or infer from their request) which mode they need:

- **Campaign mode:** Planning a series of posts over time (content calendar, topic cadence,
  multi-post series). Go to Step 4.
- **Single-post mode:** Drafting one post or a small batch on a topic. Go to Step 6.
- **Multi-angle mode:** User has one piece of source content (blog post, article, URL,
  pasted text) and wants 3–5 social posts from it, each with a different angle. Go to Step 7.

If ambiguous, ask. "write LinkedIn posts about X" could mean a single post or a planned
series. "turn this blog post into some LinkedIn posts" is multi-angle mode.

### 4. Campaign planning: gather the brief

Collect these inputs from the user. Ask for anything not provided. Do not silently assume
defaults.

- **Goal:** What outcome does the campaign drive? (awareness, traffic, event registration,
  product adoption, thought leadership)
- **Duration:** How many weeks? (Suggest 4 weeks if unspecified, but confirm.)
- **Post frequency:** How many posts per week per platform? Suggest 3/week for LinkedIn and
  4–5/week for X *only* for the platforms in scope from Step 2. Confirm before locking in.
- **Topic pillars:** 2–4 recurring themes. If not provided, propose pillars based on
  `Positioning.md` and `ICP.md` and confirm.
- **Content mix:** Ratio of post types per week. Default suggestion: ~40% educational/how-to,
  ~30% proof points and customer stories, ~20% product and feature highlights, ~10%
  industry commentary and engagement. Confirm.
- **Hashtag strategy:** Does the team use standard hashtags? Ask, or propose 3–5 based on
  the topic pillars.

Platforms, voice, and register are already determined in Step 2 — don't re-ask.

### 5. Plan the content calendar

Build a week-by-week calendar. For each post, include:

- **Week and day:** Placement in the calendar
- **Account:** Which selected account posts it (only relevant if more than one was selected)
- **Platform / Account combo:** e.g., "Brand LinkedIn", "Personal LinkedIn", "Brand X"
- **Topic pillar:** Which theme this post falls under
- **Post type:** Educational, proof point, product highlight, engagement/question,
  repurposed content, thread (X only)
- **Hook direction:** One sentence describing the opening angle
- **CTA:** What the reader should do (click, comment, share, try something)
- **Source content:** If repurposing, reference the original piece (URL or title)

**Calendar design principles:**
- Alternate topic pillars so the feed does not feel repetitive
- Front-load the week with higher-value posts (Tuesday–Thursday performs best on LinkedIn)
- Plan at least one engagement post per week (question, poll, hot take) to drive comments
- If multiple platforms or accounts are selected, do not post identical content. Adapt
  angle, voice, and framing for each account/platform combo. A feed that reads as
  copy-paste across accounts is worse than fewer posts.
- For X, plan threads (3–5 posts) for topics needing depth. Budget one thread per week max.

For "Source content", ask the user for relevant prior pieces (URLs to blog posts, articles,
case studies they want to draw from). The local AAI substrate has no published-content
search index, so source-discovery is user-driven here.

Present the calendar as a table grouped by week, then offer to adjust before drafting.

### 6. Draft individual posts

**Before drafting (single-post mode only):** gather these inputs if not clear from the
user's request:

- **Topic or angle** — what is this post about, specifically?
- **Link to include?** — if yes, what URL (becomes a `[LINK: ...]` placeholder, resolved in
  Step 8.5)
- **Hook direction** — how should it open? Any specific framing in mind?
- **CTA** — what should the reader do?
- **Number of posts** — one, or a small batch? If batch, confirm topics for each.

This brief-gathering only applies to single-post mode. Campaign mode uses Steps 4–5;
multi-angle mode uses Step 7's source content directly.

For each post (from calendar, single-post request, or multi-angle batch), produce platform-
and account-specific copy.

**LinkedIn posts:**
- **Length:** 150–300 words for thought-leadership posts. 50–100 words for quick
  announcements or shares.
- **Structure:** Hook (first 1–2 lines visible before "see more"), body (the substance),
  CTA. The hook must earn the click to expand.
- **Formatting:** Short paragraphs (1–3 sentences). Line breaks between paragraphs for feed
  readability. Sparing use of bold for one key phrase max.
- **Hashtags:** 3–5 relevant hashtags at the end, not inline.
- **Carousel outlines:** If the post is a carousel, provide a numbered slide outline with
  headline + key point per slide. This workflow does not generate carousel images.

**X posts:**
- **Length:** Under 280 characters single. Threads: 3–8 posts, each under 280.
- **Structure (single):** One clear thought per post. No filler. End with a CTA or question
  when appropriate.
- **Structure (thread):** Post 1 is the hook (must stand alone and earn the click).
  Subsequent posts build the argument. Final post has the CTA. Number as "1/" or use
  natural transitions.
- **Tone:** More conversational and direct than LinkedIn. Native X content, not compressed
  LinkedIn.
- **Hashtags:** 1–2 max. Hashtags on X feel spammy when overused.
- **Character enforcement:** After drafting each X post, count characters. If over 280,
  rewrite to fit. If can't compress without losing substance, recommend converting to a
  thread.

**Both platforms:**
- Lead with the problem or insight, not with the product
- One message per post. If trying to say two things, split into two posts.
- Include a link only when there's a genuine destination. Not every post needs a URL.
- When a URL needs to be included, insert a placeholder `[LINK: <brief description>]`. Do
  not generate UTM links or shortlinks during drafting — all links are resolved in Step 8.5.
- Use proof points from `Positioning.md` where relevant: customer metrics, ratios,
  migration stories, pull quotes. Specific numbers outperform generic claims.
- Match the voice and register from Step 2.

**Multiple accounts:**

If more than one account was selected in Step 2, produce a separate draft per account —
not just per platform. Two LinkedIn posts (one for the company page, one for a personal
profile) should read as genuinely different posts: different voice, different register,
often a different angle. Don't draft one and lightly edit it into the other — that defeats
the point of multi-account posting.

### 7. Multi-angle from source content

When the user provides source content and wants multiple posts from it:

1. **Fetch the source material.** Resolve in this order:
   - **Pasted text:** work from the pasted content directly.
   - **URL provided:** WebFetch the URL.
   - **Topic mentioned but no source:** ask the user to paste relevant prior content or
     provide URLs. The local substrate has no content search index.

   Once loaded, identify the core insight, key data points, memorable quotes, and the
   target audience.
2. **Extract 3–5 post angles.** Each angle is a different entry point into the same
   material. Not every post should summarize. Good angles: a surprising data point, a
   contrarian take from the piece, a "how to" distilled from a tutorial, a question the
   article answers, a quote worth highlighting.
3. **Draft posts per angle.** For each angle, draft platform-specific posts following Step 6.
   If multiple accounts/platforms are selected, produce a separate draft per
   account/platform combo.
4. **Link back to the source.** In at least one post per angle, insert
   `[LINK: source article]` where the link should go. Other posts in the batch can stand
   alone without a link. Placeholders are resolved in Step 8.5.

**Angle patterns by source type:**
- **Blog post or article:** Extract the thesis as a LinkedIn hook. Pull a surprising stat
  for X. Turn a how-to section into a thread.
- **Case study or customer story:** Lead with the outcome. Use the customer's challenge as
  the hook.
- **Product announcement:** Lead with the user problem it solves, not the feature name.

### 8. Brand voice cross-check

After drafting, review all output against `BrandVoice.md` and `Terminology.md`:

1. **Punctuation rules from `BrandVoice.md`.** Apply whatever the brand voice asset
   specifies (e.g., "no em dashes" — replace with comma, period, colon, or separate
   sentence).
2. **Lead with problems, not features.** Posts should open with the audience's pain or
   curiosity, not product names.
3. **Terminology.** Product names and technical terms must match `Terminology.md`.
4. **Platform-appropriate tone.** LinkedIn can be more polished and narrative. X should be
   more direct and conversational. Neither should sound like ad copy.
5. **Character limits.** Re-verify X posts are under 280. If any are still over, rewrite now.
6. **No AI slop.** Scan for forced triples, sycophantic openers, vocabulary clusters,
   hallmark-card endings — see `DeSlop.md` for the full pattern catalog.
7. **Voice profile match (personal accounts only).** For any post drafted against a loaded
   voice profile from Step 2, verify the draft actually reads like that person — not just
   like generic brand copy wearing their name. Check sentence rhythm, typical length,
   characteristic phrases or openers, how they usually end posts. If the profile includes
   writing samples, compare directly. A draft can pass rules 1–6 and still fail here — if
   it sounds like brand marketing under a personal byline, rewrite until it sounds like the
   actual person.
8. **No-fly list.** Re-scan for any name from `NoFlyList.md`. If found, remove and replace
   with a generic equivalent or omit.

Fix issues inline. If no issues, state "No voice issues found."

### 8.5. UTM and shortlink generation

Before presenting final output, resolve all link placeholders into UTM-tagged URLs.

1. **Collect all placeholders.** Scan all drafted posts for `[LINK: ...]`. If no posts
   contain links, skip this step.

2. **Propose UTM parameters.** For each placeholder, present a confirmation table:

   | Post | Platform | URL | Source | Medium | Campaign |
   |------|----------|-----|--------|--------|----------|
   | LinkedIn post 1 | LinkedIn | https://... | `linkedin` | `social` | `suggested-slug` |
   | X post 1 | X | https://... | `twitter` | `social` | `suggested-slug` |

   - `source` and `medium` are fixed: `linkedin` or `twitter` per platform, `social` for
     medium. Don't offer to change these.
   - For `campaign`: suggest a slug derived from the topic title (lowercased, hyphenated, 1–3
     words). Confirm with the user.
   - If you cannot determine the destination URL from context, ask for it now.

3. **Get user confirmation.** Ask: "I'll use `[suggested-slug]` as the campaign — want to
   change it?"

4. **Build UTM URLs.** Append `?utm_source=...&utm_medium=social&utm_campaign=...` to each
   base URL. If the user has a shortlink service configured externally, surface the
   UTM-tagged URLs and let them paste through their shortener. This workflow does not call
   any shortlink MCP — local substrate only.

5. **Swap placeholders.** Replace every `[LINK: ...]` placeholder with its UTM URL.

## Output requirements

Present everything directly in chat as structured Markdown. Do not create files unless the
user asks.

**Campaign mode:**
1. Campaign overview (goal, accounts, platforms, duration, frequency, topic pillars,
   content mix)
2. Content calendar (week-by-week table)
3. Voice check results (from Step 8)
4. Next steps

**Single-post and multi-angle mode:**
- Each post as a labeled section: account, platform, post copy, hashtags (if any), CTA,
  link (if any)
- For threads: numbered posts in sequence
- For multi-angle batches: grouped by angle, with the source content noted
- If multiple accounts were selected, group output by account and label each clearly
- Links appear as `[LINK: ...]` placeholders until Step 8.5 resolves them

Include this note in Next Steps: *"To edit any post, tell me what to change or paste a
revised version directly."*

## Hand-off

After plan or drafts are complete, offer to:
- Run `DeSlop` if any posts read as AI-generated
- Refine voice via `/marketing` if `BrandVoice.md` or a `VoiceProfiles/` entry needs more
  depth
- Plan an email nurture sequence to complement the social campaign — `EmailNurturePlanner`
- Write a press release version of any major announcement — `PressReleaseWriter`
- Adjust the calendar or posts based on feedback

Do not auto-trigger other workflows. Wait for the user to confirm the output looks good first.

## Notes on what was dropped during the port

The upstream Tiger Data version had a Step 9 (Asana Social Promotion Request submission)
that routed company-account posts to a marketing-design team via the Asana MCP server.
That entire workflow was Tiger-Data-team-internal and is not portable. Personal-account
posts were never submitted there anyway. Posts in this AAI port are presented as drafts
in chat; the user copies and posts (or routes to whatever team process they have).

The upstream version also called Tiger's `manage_shortlinks` tool to create shortlinks
with UTM params via a Tiger-Den-managed shortlink service. The port replaces that with
plain UTM-tagged URLs in Step 8.5.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand
context swapped to local AAI/USER/MARKETING/ files. Asana submission flow (Step 9)
intentionally not ported — it was specific to Tiger's marketing-design team process.

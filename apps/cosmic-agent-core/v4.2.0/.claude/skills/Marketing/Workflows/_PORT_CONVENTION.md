# Port Convention — Tiger marketing-skills → AAI Marketing/Workflows

This document is the spec every per-skill port agent reads before transforming a Tiger
SKILL.md into a AAI workflow file. Any agent reading this should follow it exactly.

## Source and target

| | Path |
|---|---|
| **Source** | `/home/maceo/Dev/marketing-skills/plugins/tiger-marketing-skills/skills/{slug}/SKILL.md` |
| **Source sidecars** | `/home/maceo/Dev/marketing-skills/plugins/tiger-marketing-skills/skills/{slug}/references/*.md` (some skills only) |
| **Target workflow** | `/home/maceo/Dev/silmari-agent-memory/AAI/skills/Marketing/Workflows/{TitleCaseName}.md` |
| **Target sidecars** | `/home/maceo/Dev/silmari-agent-memory/AAI/skills/Marketing/Workflows/{TitleCaseName}_{TitleCaseRefName}.md` |

## File-name mapping (slug → TitleCase)

| Slug | TitleCase target |
|---|---|
| de-slop | `DeSlop.md` |
| content-reviewer | `ContentReviewer.md` |
| seo-meta-optimizer | `SeoMetaOptimizer.md` |
| seo-tech-audit | `SeoTechAudit.md` |
| page-cro | `PageCro.md` |
| clarity-analyzer | `ClarityAnalyzer.md` |
| internal-linking-optimizer | `InternalLinkingOptimizer.md` |
| press-release-writer | `PressReleaseWriter.md` |
| email-nurture-planner | `EmailNurturePlanner.md` |
| ghost-paper | `GhostPaper.md` |
| deck-builder | `DeckBuilder.md` |
| linkedin-article-writer | `LinkedinArticleWriter.md` |
| social-post-writer | `SocialPostWriter.md` |
| newsletter-ad-writer | `NewsletterAdWriter.md` |
| newsletter-ad-review | `NewsletterAdReview.md` |

## Required structure of the ported file

Every ported workflow has exactly this structure:

```markdown
---
name: {TitleCaseName}
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: {one-line — same domain as the original, no Tiger references}
---

# {TitleCaseName}

{Brief 1–3 sentence description, generic — no TimescaleDB / Tiger Cloud references.}

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required for any voice-sensitive output
- `ICP.md` — required when the workflow targets an audience
- `Positioning.md` — required for content that takes a stance
- `Terminology.md` — required for any externally-visible copy
- `NoFlyList.md` — required for any content that names customers
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

{The original workflow's step-by-step instructions, with the changes from the
"Required transforms" section below applied.}

## Output requirements

{Format / length / tone specs from the original — kept verbatim except for Tiger
references.}

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with
brand context swapped to local AAI/USER/MARKETING/ files.
```

## Required transforms

For each line of the original SKILL.md, apply these substitutions:

### Tiger Den MCP calls → Read tool

| Original (Tiger Den) | Replacement |
|---|---|
| `list_marketing_references()` | (Delete entirely. Replace with a short note: "Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.") |
| `get_marketing_reference(slug: "brand-voice-guide")` | `Read /home/maceo/.claude/AAI/USER/MARKETING/BrandVoice.md` |
| `get_marketing_reference(slug: "product-marketing-context")` | `Read /home/maceo/.claude/AAI/USER/MARKETING/Positioning.md` AND `Read /home/maceo/.claude/AAI/USER/MARKETING/ICP.md` |
| `get_marketing_reference(slug: "no-fly-list")` | `Read /home/maceo/.claude/AAI/USER/MARKETING/NoFlyList.md` |
| `get_marketing_context(slugs: ["brand-voice-guide", "product-marketing-context"])` | Two Read calls, one per asset |
| `search_content(...)` | (Delete. The local substrate has no published-content index. If the original step is essential, replace with a manual "ask the user for relevant prior content URLs/pastes" step.) |
| `list_voice_profiles()` | `Bash: ls /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/` |
| `get_voice_profile(name: "X")` | `Read /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/{Name}.md` (and gracefully handle if missing) |

### Tiger Data brand strings → generic

| Original | Replacement |
|---|---|
| `TimescaleDB` | (delete entirely, or replace with "your product" if unavoidable in context) |
| `Tiger Cloud` | (delete or "your platform") |
| `Tiger Data` (as the company) | (delete or "your team") |
| `Tiger Den` | (delete or "the asset substrate") |
| `tigerdata.com` URLs | (delete) |
| `Tiger-style` / `Tiger-specific` | (rephrase as "brand-specific" or delete) |
| Customer names from Tiger's roster | (delete; replace with `[customer name]` placeholder) |
| `the marketing team` (when referring to Tiger) | (rephrase as "you" or "the user") |

### Skill self-reference → workflow self-reference

| Original | Replacement |
|---|---|
| "this skill" | "this workflow" |
| "use this skill when..." | (move into description; reword as "Triggered when...") |
| `/tigerdata-marketing-skills:{slug}` | `/marketing` (the parent skill) |
| References to other Tiger skills (e.g., "use brand-voice-writer") | Map to the AAI ported equivalent (`BrandVoiceWriter` not in Tier A — point to `/marketing` instead, OR retain the cross-reference if the target IS in Tier A — see file-name mapping table) |

### Reference subdirs (sidecar handling)

If the source skill has `references/<file>.md` sidecars:

1. For each sidecar, copy it to `Workflows/{SkillName}_{TitleCaseRefName}.md`.
2. Apply the same Tiger-stripping transforms.
3. Update the parent workflow's references to point at the new sidecar paths.

For `seo-tech-audit`'s `analyze_crawl.py`, copy as
`Workflows/SeoTechAudit_analyze_crawl.py` with no code changes (beyond stripping
Tiger-Data hardcoded URLs/strings if any).

## Hard rules

1. **Zero Tiger Den MCP calls.** After the port, `grep -E 'list_marketing_references|get_marketing_reference|get_marketing_context|search_content|list_voice_profiles|get_voice_profile|tiger_den'` on the new file MUST return zero matches.
2. **Zero hardcoded Tiger product references.** After the port, `grep -iE 'TimescaleDB|Tiger Cloud|Tiger Data|Tiger Den|tigerdata\.com'` on the new file MUST return zero matches outside the Credits section.
3. **Pre-flight + Missing-asset sections are mandatory** for every port that needs any asset.
4. **Methodology preserved.** The pattern catalogs, rubrics, structural guidance, step-by-step instructions are the value — keep them verbatim except for Tiger references.
5. **No new MCP servers.** The replacement is plain markdown reads.

## After porting — agent must report

The agent's final message must be a one-line status:

```
PORTED: {TitleCaseName}.md ({n} Tiger-Den calls removed, {m} Tiger brand strings removed, {sidecars} sidecars copied)
```

If the source skill is too entangled with Tiger to port without losing the methodology,
the agent's final message instead is:

```
DEFERRED: {TitleCaseName} — reason: {2-sentence explanation}
```

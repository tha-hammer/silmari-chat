---
name: Copywriting
description: Write copy — the craft of producing actual headlines, emails, sales messages, LinkedIn posts, blog articles, sales stories, landing page copy, and ad copy. Use the copywriting skill AFTER a marketing foundation exists (typically built by the Marketing skill) OR for standalone writing tasks with a clear brief. The copywriting skill does NOT build marketing campaigns or copy platforms from scratch — for that, use the Marketing skill. USE WHEN the user says "write copy", "write sales copy", "write an email", "write a headline", "write a story", "write a blog post", "write a LinkedIn post", "write an ad", "draft copy", "rewrite copy", "email sequence", "content writer", "sales story", "Silmari", "USP formula", "AIDA writing", "headline writing", "persuasive writing", "copywriting".
---

## 🚨 MANDATORY: Voice Notification (REQUIRED BEFORE ANY ACTION)

**You MUST send this notification BEFORE doing anything else when this skill is invoked.**

1. **Send voice notification**:
   ```bash
   curl -s -X POST http://localhost:8888/notify \
     -H "Content-Type: application/json" \
     -d '{"message": "Running the WORKFLOWNAME workflow in the Copywriting skill to ACTION"}' \
     > /dev/null 2>&1 &
   ```

2. **Output text notification**:
   ```
   Running the **WorkflowName** workflow in the **Copywriting** skill to ACTION...
   ```

---

## Customization

**Before executing, check for user customizations at:**
`~/.claude/AAI/USER/SKILLCUSTOMIZATIONS/Copywriting/`

If this directory exists, load and apply any PREFERENCES.md found there. If the directory does not exist, proceed with skill defaults.

---

# Copywriting Skill

A structured, phase-based copywriting platform built on the principle that **persuasive copy requires a discovery process before a single word is written**. This skill builds a "copy platform" — a comprehensive master checklist for an offer — and uses it to generate compelling copy.

**Core principle:** Writing copy is "salesmanship in print." We use ethical persuasion and empathy. We write about the prospect's pain only to connect on a deeper level and to provide a means to help them solve their real problems.

---

## Workflow Routing

Route to the appropriate workflow based on the request:

| User Says | Workflow | Purpose |
|-----------|----------|---------|
| "write copy for [offer]", "copy platform", "build a copy checklist", "help me write copy" | `Workflows/CopyPlatform.md` | 4-phase checklist builder (DEFAULT for copy requests) |
| "sales story", "write a story", "help me tell my story", "story for my [product/offer]" | `Workflows/SalesStory.md` | Story discovery + 9 structure templates |
| "LinkedIn post", "email sequence", "sales message", "blog post", "write content" | `Workflows/ContentWriter.md` | Multi-channel content implementation |
| "non-sales story", "brand story", "personal story" | `Workflows/SalesStory.md` | Same workflow, non-sales mode |

**Default for ambiguous copy requests:** `Workflows/CopyPlatform.md`

---

## Framework References

All workflows reference these templates:

| Template | Contents |
|----------|---------|
| `Templates/CoreFrameworks.md` | Fractal AIDA Pattern, Emotional-Logical Balance per stage, Advertisement Specific Guidelines — foundational frameworks all sections operate under |
| `Templates/AIDAFramework.md` | Fractal AIDA model, emotional-logical ratios per component |
| `Templates/StoryStructures.md` | 9 story structure templates, 5T framework, Hero archetype rules |
| `Templates/CopyPlatformSections.md` | All 18 copy platform section definitions with expansion guidance, per-section Instructions and Constraints |
| `Templates/EmotionalTriggers.md` | Primary and secondary emotion catalogs with story moment conversion |
| `Templates/TenAgreements.md` | The 10 beliefs a prospect must hold before buying |

---

## Key Principles

1. **Prospect is always the hero.** The vendor is the mentor/guide (Yoda, Gandalf, Fairy Godmother).
2. **80% pain, 20% solution.** Spend most of the copy on the gap between current and desired state.
3. **Copy is fractal.** AIDA applies at the sentence, paragraph, section, and piece level simultaneously.
5. **No vagueness.** Every expansion must produce actual copy examples, not descriptions of what copy might look like.
6. **Start with the checklist.** Never skip straight to writing. The copy platform comes first.

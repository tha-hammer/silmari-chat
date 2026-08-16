---
name: DeckBuilder
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Triggered when the user asks to create a slide deck, make a presentation, turn a document into slides, build a pitch deck, create a talk, or mentions "slides", "deck", "presentation", or "powerpoint". Turns any document into a branded slide deck — produces structured slide-by-slide markdown with layout assignments, speaker notes, and paste-ready content mapped to a slide template, or generates a .pptx file programmatically via python-pptx when a template is configured.
---

# DeckBuilder

Turn any document into a branded slide deck. The workflow reads source material, selects a deck structure, writes slide-by-slide content with speaker notes, and either generates a .pptx file (when a template is configured) or produces structured markdown mapped to your template's layouts.

## Pre-flight

Read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required for any voice-sensitive output
- `ICP.md` — required when the workflow targets an audience
- `Positioning.md` — required for content that takes a stance
- `Terminology.md` — required for any externally-visible copy
- `NoFlyList.md` — required for any content that names customers
- `VoiceProfiles/{Name}.md` — only if the user names a presenter

Pre-flight reads AAI/USER/MARKETING/ via Read tool — no MCP needed.

For each required asset, check the frontmatter `populated:` field after reading. If `populated: false`, the asset is a stub.

## Missing-asset bootstrap

If a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand output, and missing context is exactly what produces generic AI slop.

## When to use this workflow

- Turning a blog post, white paper, brief, or case study into a presentation
- Creating a pitch deck, conference talk, or internal review deck from scratch or from notes
- When someone says "make me a deck about X" or "turn this into slides"
- When someone needs a presentation that follows a branded slide template

## When NOT to use this workflow

- Creating HTML reports or dashboards (use the GhostPaper workflow)
- Writing long-form content like blog posts or articles (use `/marketing` to find a long-form workflow)
- Reviewing existing slide content for brand consistency (use the ContentReviewer workflow)

## Step 0: No Fly List check

Read `/home/maceo/.claude/AAI/USER/MARKETING/NoFlyList.md` before generating any content.

Load the No Fly List names as a hard constraint: **never include any No Fly List customer in any slide content** — not as named examples, proof points, customer quotes, or case study references. If the source document references a No Fly List customer, omit those references from all outputs.

## Instructions

### 1. Load context

Read the local sidecar files alongside this workflow:

- [Slide Writing Guide](./DeckBuilder_SlideWritingGuide.md) — presentation-specific writing rules, density limits, layout decision tree
- [Deck Structures](./DeckBuilder_DeckStructures.md) — skeleton structures for common deck types

**Template layout map:** Read [Template Layout Map](./DeckBuilder_TemplateLayoutMap.md) for the slide template's layouts and placeholder details. If this file contains only the example/placeholder content (not real template data), the template has not been set up yet. Jump to the **Template setup** section at the end of this workflow before proceeding.

### 2. Read the source document

Read the full input document. If the user pasted content, read it in full. If they provided a URL or file path, fetch and read it.

Analyze the source and identify:
- **Document type**: blog post, white paper, brief, case study, meeting notes, raw ideas
- **Core argument/thesis**: the single main point
- **Key supporting points**: 3-7 major ideas that support the thesis
- **Data points and metrics**: numbers, benchmarks, comparisons
- **Quotes**: customer quotes, expert opinions, notable statements
- **Logical sections**: natural content groupings

Summarize the source in 2-3 sentences and present it to the user for confirmation before proceeding. This prevents building a deck from a misread document.

### 3. Choose a deck structure and build the deck plan

**3a. Audit content types.** Before choosing a structure or assigning layouts, classify every distinct piece of information from the source into content types:

- **Metric** — a number worth highlighting (revenue, speed, percentage)
- **Comparison** — A vs B, before/after, us vs them
- **List** — capabilities, features, steps in a process
- **Quote** — customer quote, testimonial, notable statement
- **Process/Timeline** — sequential phases, roadmap stages
- **Visual** — architecture diagram, screenshot, workflow
- **Narrative** — context-setting, argument, analysis

Present the audit as a short inventory. This inventory drives layout selection in 3c — each content type maps to a different layout via the decision tree. If most items land in "List," challenge yourself: can any be reframed as metrics, comparisons, or timelines? A bullet that says "10-20x faster ingest" is a metric, not a list item. A set of 4-6 short features is a grid, not a bullet list. **Scan for visual patterns too.** As you audit, flag any set of items that forms a recognizable visual pattern: 3 numbered blurbs or ranked items with no named labels (→ card groups), an ordered scale or phased progression (→ 5-step progression), comparison (→ two-column or comparison layout), process/timeline (→ timeline). Visual patterns override the default "list" classification — a set of 3 ranked takeaways is cards, not bullets. Named-label content (e.g., "Scalability / Reliability / Performance") stays in bullets or comparison layouts until arbitrary-label cards are supported in a future helper update.

**3b. Choose a structure.** Based on the document type and the user's stated purpose, select a structure from the [Deck Structures](./DeckBuilder_DeckStructures.md) reference.

- If the user specifies a purpose ("this is for a conference talk"), use that
- If they do not, infer from the document type and ask for confirmation
- If no existing structure fits, propose a custom one

**3c. Build the deck plan.** For each slide in the chosen structure, assign a layout and generation strategy. Use the content audit from 3a and the layout decision tree in the slide writing guide to match content type to layout, then look up the strategy and clone source in the Quick Reference table in the template layout map.

**Layout diversity rule:** No single layout may be used for more than 30% of the deck's slides (rounded up). No more than 2 consecutive slides may use the same layout. If the plan violates either rule, reassign layouts using the content audit — a "list" slide with a standout metric should become a big number slide; a list of 4-6 items should become a grid; a before/after comparison should become a two-column or comparison slide.

Present the deck plan as a table for user approval:

| # | Title | Layout | Strategy | Clone source | Notes summary |
|---|-------|--------|----------|-------------|---------------|
| 1 | [Headline title] | Layout 1 (dark title) | Placeholder | — | Opening remarks... |
| 2 | [Headline title] | Layout 9 (bullets) | Clone | idx 22 | Problem context... |
| 3 | [Headline title] | Layout 7 (grid) | Clone | idx 5 | Feature overview... |

**Content overflow:** If a slide's source content exceeds the density limits in the slide writing guide (e.g., 8 bullets when the max is 5, or 7 grid items when the max is 6), split across multiple slides. Note split slides as "4a" and "4b" in the plan. Split at natural thematic breaks, not arbitrarily.

**Grid categories (Layout 7):** The feature grid's column headers are category labels, not individual item names. Group items into exactly 2 categories. Choose categories by the strongest shared attribute among subsets: functional area (writing vs. analysis), workflow stage (create vs. review), or user benefit (speed vs. quality). State the proposed grouping in the deck plan so the user can adjust.

**Before presenting the deck plan, verify it passes the layout diversity rule.** If it doesn't, fix it first.

Wait for user approval of the deck plan before proceeding to step 4.

### 4. Write the slides

For each slide in the approved structure:

1. **Use the layout from the deck plan** — already assigned in step 3b
2. **Write the title** — concise, headline-style, under the character limit for that layout
3. **Write the body content** — follow the density rules from the slide writing guide. Respect the placeholder constraints from the template layout map (max characters, max bullets)
4. **Write speaker notes** — the full argument and supporting detail goes here. Speaker notes hold everything the slide doesn't. Include data sources, context, and transition cues
5. **Apply voice rules** — follow the voice rules in the slide writing guide: WABL aggressively, no em dashes, active voice, one message per slide, no AI filler

**Speaker notes are mandatory on every slide**, including title slides and section dividers. Notes should be 50-150 words per the slide writing guide. For title/closing slides, write the opening or closing remarks. For content slides, write the full argument behind the headline with data sources and transition cues. Never leave notes blank. If the source material does not provide enough detail, synthesize appropriate talking points from the document's thesis and supporting arguments.

**Image handling:** Cloned slides carry over all images from the source template slide (logos, screenshots, product icons). In the .pptx output, leave these as template defaults. After generation, report which slides contain template images that may need replacement. In structured-markdown output, note images as `[IMAGE: description of what goes here]`.

### 5. Self-check

Before generating output, review all slides against:
- [ ] Every slide has a clear single message
- [ ] No slide exceeds the density limits from the slide writing guide
- [ ] No em dashes used anywhere; active voice throughout
- [ ] Every slide has speaker notes (50-150 words, never blank)
- [ ] The narrative arc flows logically from slide to slide
- [ ] Layout assignments match the content type (data -> big number, comparison -> two-column, etc.)
- [ ] No single layout used on more than 30% of slides
- [ ] No more than 2 consecutive slides share the same layout
- [ ] Content that exceeds layout capacity has been split across slides
- [ ] Slides with cloned template images are noted for manual replacement

### 6. Generate output

Detect the runtime and generate the appropriate output.

#### Option A — Generate .pptx (when a template `.pptx` is available)

Write a single Python generation script that does all of the following. Copy the helper functions from the "Programmatic Generation Strategy" section in the template layout map and define them inline at the top of the script. Do not import them from an external file.

1. **Install python-pptx** if not already available:
   ```bash
   pip install python-pptx 2>/dev/null || pip3 install python-pptx 2>/dev/null
   ```

2. **Locate the template.**
   Check for a `deck-template.pptx` file at the path the user provided, or at a conventional location (e.g., `~/Decks/deck-template.pptx`). If not found, stop and tell the user: "The deck template file is missing. Provide the path to a `deck-template.pptx` (an exported PowerPoint version of your branded Google Slides template) before proceeding."

3. **Load the template** and record the original slide count:
   ```python
   prs = Presentation(template_path)
   original_count = len(prs.slides)
   template_slides = list(prs.slides)  # snapshot before appending
   ```

4. **Define helper functions** inline: `duplicate_slide`, `replace_shape_text`, `replace_bullet_list`, `find_body_shape`, `find_text_shapes_by_position`, `delete_shape`, `delete_slide`, `trim_table`, `set_cell_text`. Copy these verbatim from the template layout map.

5. **Generate each slide from the deck plan — clone every slide, including placeholder layouts:**
   - `duplicate_slide(prs, template_slides[clone_source_idx])` → find shapes by role using the Clone Source Slides section → replace text with `replace_shape_text()` or `replace_bullet_list()`
   - For placeholder shapes: `replace_shape_text(slide.placeholders[idx], "text")` — never use `placeholder.text =` directly, as this strips bodyPr, paragraph, and run formatting
   - **Set speaker notes on every slide:** `slide.notes_slide.notes_text_frame.text = notes`

6. **Delete original template slides** by iterating in reverse from `original_count - 1` down to 0: `delete_slide(prs, i)`

7. **Save and report:** File path, total slide count, any slides that fell back to speaker-notes mode, and which slides contain template images that may need manual replacement.

**Fallback:** If cloning fails for any slide, create a slide from the layout and put body content in speaker notes with `[REPLACE: Body]` markers. Report which slides need manual touch-up.

#### Option B — Structured markdown output (paste into Google Slides / Keynote / PowerPoint)

Produce slide-by-slide markdown in the conversation. Format each slide as:

```
---

## Slide [N]: [Title]
**Layout:** [description from template layout map]

**Title:** [Title text]

**Body:**
[Body content — bullets, paragraphs, or key metric as appropriate for the layout]

**Speaker notes:**
[Full speaker notes]

---
```

For the **Layout** field: use the short visual description from the layout's entry in the template layout map (e.g., "Dark centered title slide" or "Title + content area"). Do not use layout index numbers or slide numbers.

Include a preamble at the top:

> **How to build this deck in Google Slides:** Open your template. For each slide below, right-click a slide in the panel → **Change layout** and pick the layout matching the **Layout** field. Or find a slide in the template that visually matches the description, duplicate it, and replace the text. Paste title and body content directly into each shape. Speaker notes go in the notes panel (View → Show speaker notes).

### 7. Optional: prior-content enrichment

If the user has prior published content (blog posts, case studies, benchmarks) that could strengthen specific slides, ask them for relevant URLs or pastes. The local substrate has no published-content index — pull-in is manual. Add relevant links to speaker notes as supporting material.

### 8. Optional: Voice profiles

If the user mentions who will present the deck, check `/home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/` for a matching profile:

```bash
ls /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/
```

If a matching profile exists, `Read /home/maceo/.claude/AAI/USER/MARKETING/VoiceProfiles/{Name}.md` and use it to adjust the speaker notes tone. If no matching profile exists, skip gracefully — slide content uses the brand voice as default. The slide content itself stays brand-voiced; the voice profile influences speaker notes only.

## Template setup (first-time)

If the template layout map has not been configured, guide the user through setup:

### What you need

1. **A branded slide template** — your canonical branded master deck (e.g., a Google Slides template)
2. **A .pptx export** — File > Download > Microsoft PowerPoint (.pptx) from Google Slides
3. **Save it locally** — place the .pptx somewhere readable as `deck-template.pptx`

### Auto-generate the layout map

Inspect the .pptx programmatically to auto-generate the template layout map:

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation('/tmp/deck-template.pptx')

for i, layout in enumerate(prs.slide_layouts):
    print(f"### Layout {i}: {layout.name}")
    print(f"**Placeholders:**")
    print(f"| idx | name | type | width | height |")
    print(f"|-----|------|------|-------|--------|")
    for ph in layout.placeholders:
        print(f"| {ph.placeholder_format.idx} | {ph.name} | {ph.placeholder_format.type} | {ph.width} | {ph.height} |")
    print()
```

Run this script, review the output, and save it to `DeckBuilder_TemplateLayoutMap.md` alongside this workflow. Add semantic roles and content constraints for each layout based on what you see.

### Manual setup

If automated inspection isn't possible, ask the user to describe each slide layout in their template:
- Layout name (as shown in the slide master)
- What it looks like (title only, title + bullets, two columns, big number, etc.)
- What content goes where

Write the template layout map based on their description.

## Dependencies

- **Required:** Template layout map (`DeckBuilder_TemplateLayoutMap.md`) — must be configured before first use
- **Optional (for .pptx generation):** `python-pptx` Python package (auto-installed), a `deck-template.pptx` file readable on disk

## Output requirements

- Slide content respects every density limit in `DeckBuilder_SlideWritingGuide.md`
- Every slide carries 50-150 words of speaker notes — never blank
- No em dashes anywhere; active voice; one message per slide
- Layout diversity: no single layout above 30% of slides; no more than 2 consecutive slides share a layout
- No customer named in `NoFlyList.md` appears anywhere in the deck

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with brand context swapped to local AAI/USER/MARKETING/ files. The accompanying `DeckBuilder_TemplateLayoutMap.md` was originally auto-generated against Tiger Data's branded Google Slides template; the ported version replaces those product-specific references with generic placeholders so the methodology can be reused against any branded slide template.

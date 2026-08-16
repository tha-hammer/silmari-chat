# Template Layout Map — Branded Slide Template

> Auto-generated from `deck-template.pptx` (50 example slides, 16 layouts in the source template this map was derived from). When you set up your own template, regenerate this file against your own `.pptx` export — the layout indices, slide counts, and shape positions WILL differ. Treat the values below as a worked example of the format and methodology, not as definitive numbers for your template. See Credits at the bottom for the original source template.

## Important: How a typical Google-Slides-exported template works

Templates exported from Google Slides typically use **direct shapes** for most content, not formal placeholders. Most layouts only have 1-3 true placeholders (title, subtitle, slide number). However, the **template example slides** (e.g., 50 slides in the example .pptx) contain all the shapes needed, fully positioned and styled.

**Generation strategy:** Clone specific template slides and replace text in the cloned shapes rather than creating blank slides from layouts. Shapes are identified by structural role (placeholder index, area, position) rather than by name, because Google Slides exports use opaque shape names that change on re-export.

- **.pptx generation:** Clone template slides, replace shape text programmatically, then delete the original template slides.
- **Structured markdown output:** Map content to the layout types below. The user applies the right layout in their slide tool and places content into the shapes.

---

## Layout 0: Title Slide (dark, left-aligned)

**Used in:** Slide 3
**Role:** Title slide variant with left-aligned title and subtitle. Dark background.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Title | title | Left-aligned, max ~60 chars |
| 1 | Subtitle | subtitle | Below title, max ~120 chars |
| 12 | Slide number | slide_number | Auto-populated |

**Use when:** Opening slide, closing slide. Choose between Layout 0 (dark, left) and Layout 1 (dark, centered) based on preference.
**Layout description:** Dark title slide, left-aligned

## Layout 1: Title Slide (dark, centered)

**Used in:** Slide 1
**Role:** Primary title slide. Title and subtitle centered.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Title | title | Centered, max ~60 chars |
| 1 | Subtitle | subtitle | Below title, max ~120 chars |
| 12 | Slide number | slide_number | Auto-populated |

**Use when:** Default opening/closing slide. Most common title layout.
**Layout description:** Dark centered title slide

## Layout 2: Title Slide (light, lower position)

**Used in:** Slide 2
**Role:** Title slide variant with title positioned lower on the slide. Light background.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Title | title | Lower centered, max ~60 chars |
| 1 | Subtitle | subtitle | Below title, max ~120 chars |

**Use when:** Alternative title slide when you want a lighter look or need to pair with background imagery above the title.
**Layout description:** Light title slide, centered lower

## Layout 3: Title Slide (light, left-aligned, lower)

**Used in:** Slide 4
**Role:** Title slide with left-aligned, lower-positioned title. Light background.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Title | title | Left-aligned, lower, max ~60 chars |
| 1 | Subtitle | subtitle | Below title |

**Use when:** Alternative title slide for a lighter, left-aligned look.
**Layout description:** Light title slide, left-aligned lower

## Layout 4: Bold Statement (right-aligned)

**Used in:** Slide 15
**Role:** Bold statement or quote with right-aligned title.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Title | title | Right-aligned, large text (50pt), max ~20 chars (1 line) or ~40 chars (2 lines) |
| 1 | Subtitle | subtitle | Right-aligned below title |
| 12 | Slide number | slide_number | Auto-populated |

**Use when:** Bold statement slide, key quote, or provocative question. Text dominates the right side.
**Layout description:** Bold statement, large text right-aligned

## Layout 5: Flexible Canvas (blank with slide number)

**Used in:** Slides 20-21, 25-32, 36, 47-48
**Role:** The most versatile layout. Only has a slide number placeholder; all other content is direct shapes. Used for a wide variety of slide types in the template.

| idx | name | type | notes |
|-----|------|------|-------|
| 12 | Slide number | slide_number | Auto-populated |

**Example uses from template:**
- 3-metric stat cards with "100X" numbers (slides 20-21)
- Image + text with photo and quote/testimonial (slides 25-27)
- Customer quote slides with photos (slides 28, 30)
- Customer testimonials grid (slides 28, 32)
- Logo grid with product icons (slides 47-48)
- Comparison table (slide 36)

**Generation:** Clone the source slide and replace text in shapes by role. See the Clone Source Slides section below.
**Layout description:** Flexible canvas — find a slide in the template that visually matches the content type (quotes, stat cards, logo grid) and duplicate it

## Layout 6: Flexible Canvas (alt, with slide number)

**Used in:** Slides 13-14, 18-19, 22, 40-41, 46, 49-50
**Role:** Second flexible canvas layout. Similar to Layout 5 but slight positioning differences.

| idx | name | type | notes |
|-----|------|------|-------|
| 12 | Slide number | slide_number | Auto-populated |

**Example uses from template:**
- Bold statement with branded bar (slides 13-14)
- Big number / key metric with caption (slides 18-19)
- 3 numbered card groups — pillars / principles / value props (slide 22)
- 5-step horizontal progression — maturity scale, phased rollout, severity tiers (slides 40-41)
- Button/icon library (slide 46)
- Checkmark lists — light and dark mode (slides 49-50)

**Generation:** Clone the source slide and replace text in shapes by role. See the Clone Source Slides section below.
**Layout description:** Flexible canvas — find a slide in the template that visually matches the content type (big number, comparison, timeline) and duplicate it

## Layout 7: Feature Grid

**Used in:** Slides 6, 11-12
**Role:** Grid layout for multiple items — features, team members, or photo galleries.

| idx | name | type | notes |
|-----|------|------|-------|
| 12 | Slide number | slide_number | Auto-populated |

**Example uses from template:**
- 6-item feature grid with title + description per item (slide 6)
- 10-person photo grid with names (slide 11)
- 15-person photo grid with labels (slide 12)

**Use when:** Listing 4-6 features/capabilities, team photos, or any grid of similar items.

**Generation:** Clone slide 6 and replace text in grid item shapes. See the Clone Source Slides section below.
**Layout description:** Two-column feature grid with left sidebar label

## Layout 8: Full-Width Quote / Text Block

**Used in:** Slide 8
**Role:** Large text block filling most of the slide. Branded bar image at bottom.

| idx | name | type | notes |
|-----|------|------|-------|
| 12 | Slide number | slide_number | Auto-populated |

**Use when:** Long customer quote, mission statement, or key paragraph that needs to stand alone.
**Layout description:** Full-width quote or text block

## Layout 9: Title + Content (primary content layout)

**Used in:** Slides 10, 23-24, 33-35, 37-39, 42-44
**Role:** The primary content workhorse. Title at top, content area below. Most-used layout in the template.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Title | title | Top of slide, full width, max ~60 chars |
| 12 | Slide number | slide_number | Auto-populated |

**Example uses from template:**
- Table of contents with numbered sections (slide 10)
- Text slide with bullet points (slides 23-24)
- Logo grid (slide 33)
- Feature list with categories (slide 34)
- Data table (slide 35)
- Big number + graphic + caption (slide 37)
- Screenshot with title + description (slide 38)
- 3-column comparison with metrics (slide 39)
- Flowchart / process diagram (slide 42)
- Timeline / process with icons (slides 43-44)

**Use when:** Any standard content slide — bullets, tables, diagrams, screenshots, metrics. This is the default choice for most slide content.
**Layout description:** Title + content area (bullets, table, diagram, or metric)

**Generation:** Clone the specific template slide matching the content type (bullets → slide 23, timeline → slide 43, etc.) and replace text in shapes by role. Title is set via placeholder idx=0. Body and other shapes are identified by area and position. See the Clone Source Slides section below.

## Layout 10: Large Title (unused)

**Used in:** Not used in any template slides
**Role:** Large title with slide number. Reserved/unused variant.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Title | title | Large centered title |
| 2 | Slide number | slide_number | Alternative position |
| 12 | Slide number | slide_number | Auto-populated |

## Layout 11: Title + Body (with branded header)

**Used in:** Slides 5, 7
**Role:** Content slide with a branded header bar, title, and body text area.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Title | title | Brand or topic header, max ~40 chars |
| 1 | Body | body | Main content area — bullets or text, max ~300 chars |
| 12 | Slide number | slide_number | Auto-populated |

**Use when:** Branded content slides where a brand header bar should be visible. Good for agenda slides, key content sections, or slides that need strong branding. This is the best layout for fully programmatic body content since it has a real BODY placeholder.
**Layout description:** Title + body with branded header bar

## Layout 12: Section Divider (primary)

**Used in:** Slides 16, 45
**Role:** Section header/divider. Large section number and title text.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Section number | title | "01", "02", etc. |
| 2 | Section title | title | "Title of Section", max ~50 chars |
| 12 | Slide number | slide_number | Auto-populated |

**Use when:** Transitioning between major sections of the deck. Put the section number in placeholder 0 and the section name in placeholder 2.
**Layout description:** Section divider — large number and title

## Layout 13: Agenda

**Used in:** Slide 9
**Role:** Numbered agenda/roadmap with items in a horizontal layout.

| idx | name | type | notes |
|-----|------|------|-------|
| 12 | Slide number | slide_number | Auto-populated |

**Use when:** Agenda or roadmap slide. Content is in direct shapes (numbered items laid out horizontally). Clone slide 9 and modify the item text.
**Layout description:** Agenda with numbered items

## Layout 14: Large Title (alt, unused)

**Used in:** Not used in any template slides
**Role:** Alternative large title layout. Reserved/unused.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Title | title | Large title |
| 2 | Slide number | slide_number | Alternative position |
| 12 | Slide number | slide_number | Auto-populated |

## Layout 15: Section Divider (alt)

**Used in:** Slide 17
**Role:** Alternative section divider. Same structure as Layout 12 with slight visual differences.

| idx | name | type | notes |
|-----|------|------|-------|
| 0 | Section number | title | "01", "02", etc. |
| 2 | Section title | title | Max ~50 chars |
| 12 | Slide number | slide_number | Auto-populated |

**Use when:** Same as Layout 12. Choose based on visual preference (dark vs. light variant).
**Layout description:** Section divider, alt style — large number and title

---

## Quick Reference: Layout Selection Guide

| Purpose | Recommended Layout | Strategy | Clone source (0-indexed) |
|---------|-------------------|----------|--------------------------|
| Opening / closing slide | Layout 1 (dark, centered) | Clone + replace | 0 |
| Alt title slide (light) | Layout 2 or 3 | Clone + replace | 1 or 3 |
| Section divider | Layout 12 or 15 | Clone + replace | 15 or 16 |
| Bold statement / key quote | Layout 4 (right-aligned) | Clone + replace | 14 |
| Content with branded header | Layout 11 (title + body) | Clone + replace | 4 |
| Content with bullets | Layout 9 (clone slide 23) | Clone + replace | 22 |
| Big number / key metric | Layout 6 (clone slide 18) | Clone + replace | 17 |
| Feature grid (4-6 items) | Layout 7 (clone slide 6) | Clone + replace | 5 |
| Customer quotes (3-up) | Layout 5 (clone slide 28) | Clone + replace | 27 |
| Table / data | Layout 9 (clone slide 35) | Clone + replace | 34 |
| Timeline / process | Layout 9 (clone slide 43) | Clone + replace | 42 |
| Screenshot + caption | Layout 9 (clone slide 38) | Clone + replace | 37 |
| 3-column comparison | Layout 9 (clone slide 39) | Clone + replace | 38 |
| Agenda | Layout 13 (clone slide 9) | Clone + replace | 8 |
| 3 numbered blurbs / ranked items (no named labels) | Layout 6 (clone slide 22) | Clone + replace | 21 |
| 5-step progression / maturity scale | Layout 6 (clone slide 40) | Clone + replace | 39 |
| Logo grid | Layout 9 (clone slide 33) | Clone + replace | 32 |

---

## Programmatic Generation Strategy

**How to use this section:** When generating a .pptx, compose a single Python script. Copy all helper functions below into the top of the script and define them inline. Do not treat them as external imports — the generation script must be self-contained.

For .pptx generation, **clone every slide from a template source slide** and use `replace_shape_text()` to set content. Never use `add_slide(layout)` + `placeholder.text =` — this produces bare XML that strips bodyPr settings (spAutoFit), paragraph properties (alignment, spacing, bullets), and run properties (font size, bold, color). The result is text that renders at wrong sizes and overflows shape boundaries.

1. **All slides — including placeholder layouts (0-4, 11, 12, 15):** Clone a template slide that uses the target layout using `duplicate_slide()`. Set text via `replace_shape_text(slide.placeholders[idx], "text")` for placeholders, or find shapes by role for direct shapes. `replace_shape_text()` preserves the template's paragraph and run formatting.

2. **Clone source selection:** For layouts with multiple template slides (e.g., Layout 9 is used by slides 23, 35, 38, 39, 43), clone the one matching the content type. For layouts with one template slide (e.g., Layout 1 → slide 1, Layout 4 → slide 15, Layout 12 → slide 16), always clone that slide.

3. **After all slides are generated:** Remove the original 50 template slides by iterating in reverse order and deleting each one.

4. **Fallback:** If cloning fails (e.g., python-pptx internal API changes), fall back to creating a slide from the layout and putting body content in speaker notes with `[REPLACE: Body]` markers. Report which slides need manual touch-up.

5. **Multiline text in fixed-size shapes:** For shapes with `spAutoFit` (text shrinks to fit), prefer a single string and let the shape wrap naturally. Explicit `\n` line breaks create separate paragraphs, each at full font size, which can overflow the shape even with auto-fit enabled. Use `\n` only for shapes designed for multi-paragraph content (grid items, bullet lists).

### Helper functions

#### `duplicate_slide(prs, source_slide)`

Deep-copy a template slide, preserving all shapes, images, and formatting. Copies relationships and remaps rId references in the cloned XML so images resolve correctly:

```python
import copy

def duplicate_slide(prs, source_slide):
    dest = prs.slides.add_slide(source_slide.slide_layout)
    dest_spTree = dest.shapes._spTree
    # Clear layout-inherited shapes
    for child in list(dest_spTree):
        dest_spTree.remove(child)
    # Copy all children from source
    for child in source_slide.shapes._spTree:
        dest_spTree.append(copy.deepcopy(child))
    # Copy relationships and build rId mapping for remapping
    rId_map = {}
    for rel in source_slide.part.rels.values():
        if "notesSlide" in rel.reltype:
            continue
        if "slideLayout" in rel.reltype:
            for dest_rel in dest.part.rels.values():
                if "slideLayout" in dest_rel.reltype:
                    rId_map[rel.rId] = dest_rel.rId
                    break
            continue
        if rel.is_external:
            new_rId = dest.part.rels.get_or_add_ext_rel(rel.reltype, rel.target_ref)
        else:
            new_rId = dest.part.rels.get_or_add(rel.reltype, rel.target_part)
        rId_map[rel.rId] = new_rId
    # Remap rId references in copied shape XML
    ns_r = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
    for attr in ['embed', 'link', 'id']:
        qualified = f'{ns_r}{attr}'
        for elem in dest_spTree.iter():
            val = elem.get(qualified)
            if val and val in rId_map:
                elem.set(qualified, rId_map[val])
    return dest
```

#### `replace_shape_text(shape, new_text)`

Replace text in a shape while preserving the first run's formatting. Supports multi-line text via `\n` (each line becomes a new paragraph cloned from the first):

```python
def replace_shape_text(shape, new_text):
    if not shape.has_text_frame:
        return
    tf = shape.text_frame
    ns = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
    # Save first paragraph XML as formatting template
    template_p = copy.deepcopy(tf.paragraphs[0]._p) if tf.paragraphs else None
    # Remove all existing paragraphs
    for p in list(tf._txBody.iterchildren(f'{ns}p')):
        tf._txBody.remove(p)
    # Create one paragraph per line, cloned from template
    for line in new_text.split('\n'):
        if template_p is not None:
            new_p = copy.deepcopy(template_p)
            for r in new_p.findall(f'.//{ns}r'):
                for t in r.findall(f'{ns}t'):
                    t.text = ''
            runs = new_p.findall(f'.//{ns}r')
            if runs:
                t_els = runs[0].findall(f'{ns}t')
                if t_els:
                    t_els[0].text = line
        else:
            new_p = etree.SubElement(tf._txBody, f'{ns}p')
            r = etree.SubElement(new_p, f'{ns}r')
            t = etree.SubElement(r, f'{ns}t')
            t.text = line
        tf._txBody.append(new_p)
```

#### `replace_bullet_list(shape, items)`

Replace bullet list content, preserving paragraph formatting:

```python
def replace_bullet_list(shape, items):
    if not shape.has_text_frame or not items:
        return
    tf = shape.text_frame
    template_p = copy.deepcopy(tf.paragraphs[0]._p)
    # Clear existing paragraphs
    for p in list(tf._txBody.iterchildren(
        '{http://schemas.openxmlformats.org/drawingml/2006/main}p'
    )):
        tf._txBody.remove(p)
    # Add new paragraphs from template
    ns = 'http://schemas.openxmlformats.org/drawingml/2006/main'
    for item in items:
        new_p = copy.deepcopy(template_p)
        runs = new_p.findall(f'.//{{{ns}}}r')
        if runs:
            for t in runs[0].findall(f'{{{ns}}}t'):
                t.text = item
            for run in runs[1:]:
                for t in run.findall(f'{{{ns}}}t'):
                    t.text = ''
        tf._txBody.append(new_p)
```

#### `find_body_shape(slide)`

Find the body text shape (largest text area, excluding title and slide number):

```python
def find_body_shape(slide):
    candidates = []
    for shape in slide.shapes:
        if not shape.has_text_frame:
            continue
        if shape.is_placeholder:
            idx = shape.placeholder_format.idx
            if idx in (0, 12, 2):  # title, slide number
                continue
        candidates.append(shape)
    if not candidates:
        return None
    return max(candidates, key=lambda s: (s.width or 0) * (s.height or 0))
```

#### `find_text_shapes_by_position(slide)`

Find non-title, non-slide-number text shapes sorted by position:

```python
def find_text_shapes_by_position(slide):
    shapes = []
    for shape in slide.shapes:
        if not shape.has_text_frame:
            continue
        if shape.is_placeholder:
            idx = shape.placeholder_format.idx
            if idx in (0, 12, 2):
                continue
        shapes.append(shape)
    return sorted(shapes, key=lambda s: (s.top or 0, s.left or 0))
```

#### `delete_shape(slide, shape)`

Remove a shape from a slide (used to delete unused grid slots):

```python
def delete_shape(slide, shape):
    shape._element.getparent().remove(shape._element)
```

#### `delete_slide(prs, slide_index)`

Remove a slide by index:

```python
def delete_slide(prs, slide_index):
    rId = prs.slides._sldIdLst[slide_index].get(
        '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
    )
    prs.part.drop_rel(rId)
    prs.slides._sldIdLst.remove(prs.slides._sldIdLst[slide_index])
```

#### `trim_table(table, keep_rows, keep_cols)`

Remove excess rows and columns from a cloned table, then redistribute column widths to fill the original table width. The example template table has 13 rows and 6 columns; call this after populating cells with `set_cell_text()`:

```python
def trim_table(table, keep_rows, keep_cols):
    ns = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
    tbl = table._tbl
    # Remove excess rows
    rows = tbl.findall(f'{ns}tr')
    for tr in rows[keep_rows:]:
        tbl.remove(tr)
    # Remove excess columns and redistribute widths
    grid = tbl.find(f'{ns}tblGrid')
    gridCols = grid.findall(f'{ns}gridCol')
    total_width = sum(int(gc.get('w', 0)) for gc in gridCols)
    for gc in gridCols[keep_cols:]:
        grid.remove(gc)
    remaining = grid.findall(f'{ns}gridCol')
    col_width = total_width // len(remaining)
    for gc in remaining:
        gc.set('w', str(col_width))
    # Remove excess cells from each remaining row
    for tr in tbl.findall(f'{ns}tr'):
        cells = tr.findall(f'{ns}tc')
        for tc in cells[keep_cols:]:
            tr.remove(tc)
```

#### `set_cell_text(cell, text)`

Replace table cell text while preserving the template's run formatting (bold, font size, color, typeface). Use this instead of `cell.text = "value"`, which wipes all formatting:

```python
def set_cell_text(cell, text):
    ns = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
    tc = cell._tc
    txBody = tc.find(f'{ns}txBody')
    if txBody is None:
        cell.text = text
        return
    paras = txBody.findall(f'{ns}p')
    if not paras:
        cell.text = text
        return
    first_para = paras[0]
    pPr = first_para.find(f'{ns}pPr')
    template_pPr = copy.deepcopy(pPr) if pPr is not None else None
    runs = first_para.findall(f'{ns}r')
    template_rPr = None
    if runs:
        rPr = runs[0].find(f'{ns}rPr')
        if rPr is not None:
            template_rPr = copy.deepcopy(rPr)
    endParaRPr = first_para.find(f'{ns}endParaRPr')
    template_endRPr = copy.deepcopy(endParaRPr) if endParaRPr is not None else None
    for p in paras:
        txBody.remove(p)
    new_p = etree.SubElement(txBody, f'{ns}p')
    if template_pPr is not None:
        new_p.append(template_pPr)
    new_r = etree.SubElement(new_p, f'{ns}r')
    if template_rPr is not None:
        new_r.append(template_rPr)
    new_t = etree.SubElement(new_r, f'{ns}t')
    new_t.text = text
    if template_endRPr is not None:
        new_p.append(template_endRPr)
```

---

## Clone Source Slides: Shape Role Map

These are the specific template slides to clone for each slide type. After cloning, use the helper functions above to find and replace text in shapes. **Always use `replace_shape_text()` for placeholder text** — never `placeholder.text =`.

### Slide 1 — Title Slide (Layout 1)

**Clone source index:** 0

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | `slide.placeholders[0]` (ph_idx=0) | `replace_shape_text(slide.placeholders[0], "Title")` |
| Subtitle | `slide.placeholders[1]` (ph_idx=1) | `replace_shape_text(slide.placeholders[1], "Subtitle")` |
| Slide number | ph_idx=12 | Leave as-is |

**Also use for:** Layout 0 (clone slide 3, idx 2), Layout 2 (clone slide 2, idx 1), Layout 3 (clone slide 4, idx 3).

### Slide 15 — Bold Statement (Layout 4)

**Clone source index:** 14

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | `slide.placeholders[0]` (ph_idx=0) | `replace_shape_text(slide.placeholders[0], "Statement text")` — single string, let shape wrap naturally (50pt, spAutoFit) |
| Slide number | ph_idx=12 | Leave as-is |

**Note:** This template slide has no subtitle placeholder (ph_idx=1). The layout defines one but the slide instance does not include it. Put subtitle content in speaker notes.

### Slide 16 — Section Divider (Layout 12)

**Clone source index:** 15

| Role | How to find | Replacement |
|------|-------------|-------------|
| Section number | `slide.placeholders[0]` (ph_idx=0) | `replace_shape_text(slide.placeholders[0], "01")` — renders at 100pt |
| Section title | `slide.placeholders[2]` (ph_idx=2) | `replace_shape_text(slide.placeholders[2], "Section Name")` |
| Slide number | ph_idx=12 | Leave as-is |

**Also use for:** Layout 15 (clone slide 17, idx 16).

### Slide 5 — Title + Body with Branded Header (Layout 11)

**Clone source index:** 4

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | `slide.placeholders[0]` (ph_idx=0) | `replace_shape_text(slide.placeholders[0], "Title")` |
| Body | `slide.placeholders[1]` (ph_idx=1) | `replace_shape_text(slide.placeholders[1], "Body text")` |
| Slide number | ph_idx=12 | Leave as-is |

### Slide 23 — Content with Bullets (Layout 9)

**Clone source index:** 22 (0-indexed)

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | `slide.placeholders[0]` (ph_idx=0) | `replace_shape_text(slide.placeholders[0], "Title")` |
| Body bullets | `find_body_shape(slide)` — largest text shape (ph_idx=4294967295) | `replace_bullet_list(shape, items)` |
| Slide number | ph_idx=12 | Leave as-is |

### Slide 6 — Feature Grid (Layout 7)

**Clone source index:** 5

The grid has a **sidebar title** on the left, then a **2-column x 3-row** grid of items. The first row is structured differently from rows 2-3.

**Grid structure** (shapes sorted by top, left):

| Position | Role | Size | Notes |
|----------|------|------|-------|
| (0.34, 2.55) | Sidebar title | 2.24x0.92 | Left panel, x < 3.0. Set to grid heading. Max ~18 chars total; use `\n` for 2 lines (30pt bold). |
| (3.52, 0.64) | Left col header | 2.20x0.44 | **Item 1 title** (short, bold) |
| (6.50, 0.64) | Right col header | 1.99x0.71 | **Item 4 title** (short, bold) |
| (3.52, 1.41) | Left col row 1 desc | 2.64x0.72 | **Item 1 description** (separate from title) |
| (6.50, 1.41) | Right col row 1 body | 2.62x1.30 | **Item 4 description** — single-paragraph, desc only |
| (3.52, 2.36) | Left col row 2 | 2.64x1.30 | **Item 2** — combined title + description (2 paragraphs) |
| (6.50, 2.68) | Right col row 2 | 2.55x1.30 | **Item 5** — combined title + description |
| (3.52, 3.99) | Left col row 3 | 2.64x1.30 | **Item 3** — combined title + description |
| (6.50, 3.99) | Right col row 3 | 2.55x1.30 | **Item 6** — combined title + description |

**Important:** The column header shapes are styled as **category labels** (large, bold), not individual items. Use them to group features under category labels (e.g., "Made Easier" / "Made More Reliable"). Always assign short category labels to headers, then distribute items into the body shapes below.

**Replacement strategy for N items:**
1. Set sidebar title via `replace_shape_text(sidebar, "Grid heading")`
2. Group items into 2 categories. Set left and right col headers to the **category labels** (NOT individual item names)
3. Distribute items into body slots: row 1 descs (2 slots) + rows 2-3 bodies (4 slots) = 6 item slots total
4. Row 1 desc slots: `replace_shape_text(shape, "Item Title\nItem Description")` — combined title + description
5. Row 2-3 body slots: `replace_shape_text(shape, "Item Title\nItem Description")` — combined title + description
6. Fill left column top-to-bottom, then right column top-to-bottom
7. If fewer than 6 items, delete unused shapes from the bottom up. If more, split across slides.

| Role | How to find | Replacement |
|------|-------------|-------------|
| Sidebar title | Text shape with x < 3.0" | `replace_shape_text(shape, "Heading")` — max ~18 chars, use `\n` for 2 lines |
| Col headers (2) | Text shapes at y≈0.64", sorted by left | `replace_shape_text(shape, "Item title")` |
| Row 1 descs (2) | Text shapes at y≈1.41", sorted by left | `replace_shape_text(shape, "Description")` |
| Row 2-3 bodies (4) | Text shapes at y > 2.0", sorted by (top, left) | Combined: `replace_shape_text(shape, "Title\nDescription")` |
| Slide number | ph_idx=12 | Leave as-is |

**Fewer than 6 items:** Delete unused body shapes from the bottom up using `delete_shape()`. Fill left column top-to-bottom first, then right column.

**More than 6 items:** Split across two grid slides. Clone slide 6 twice. Group items so each slide's pair of categories makes sense together.

**Choosing category labels:** Column headers must be short (2-4 words). Choose categories by the most salient shared attribute: functional area (writing vs. analysis), workflow stage (create vs. review), or user benefit (speed vs. quality). If the source material suggests natural groupings, use those.

### Slide 18 — Big Number / Key Metric (Layout 6)

**Clone source index:** 17

| Role | How to find | Replacement |
|------|-------------|-------------|
| Big number | `find_body_shape(slide)` — largest text shape (ph_idx=4294967295, ~22 sq in) | `replace_shape_text(shape, "100X")` |
| Caption | Second text shape by area (TEXT_BOX) | `replace_shape_text(shape, "Caption text")` |
| Slide number | ph_idx=12 | Leave as-is |

### Slide 28 — Customer Quotes 3-up (Layout 5)

**Clone source index:** 27

| Role | How to find | Replacement |
|------|-------------|-------------|
| Header | `find_body_shape(slide)` — largest text shape (ph_idx=4294967295) | `replace_shape_text(shape, "Header")` |
| Quote text boxes (3) | TEXT_BOX shapes sorted by left position (at y≈3.85") | `replace_shape_text(shape, "Quote text")` per box |
| Photos (3) | PICTURE shapes | Leave as template photos or note for manual replacement |
| Slide number | ph_idx=12 | Leave as-is |

### Slide 35 — Data Table (Layout 9)

**Clone source index:** 34

The example template table has **13 rows x 6 columns** with Latin placeholder text. After populating cells with real data, call `trim_table()` to remove unused rows and columns:

```python
for shape in slide.shapes:
    if hasattr(shape, 'has_table') and shape.has_table:
        table = shape.table
        # Fill cells using set_cell_text to preserve formatting:
        set_cell_text(table.cell(0, 0), "Header 1")
        set_cell_text(table.cell(1, 0), "Data 1")
        # Then trim to actual data size (redistributes column widths):
        trim_table(table, keep_rows=4, keep_cols=3)  # adjust to your data
        break
```

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | `slide.placeholders[0]` (ph_idx=0) | `replace_shape_text(slide.placeholders[0], "Title")` |
| Table | Shape where `shape.has_table == True` | Fill cells, then `trim_table(table, rows, cols)` |
| Slide number | ph_idx=12 | Leave as-is |

### Slide 38 — Screenshot + Caption (Layout 9)

**Clone source index:** 37

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | `slide.placeholders[0]` (ph_idx=0) | `replace_shape_text(slide.placeholders[0], "Title")` |
| Description | `find_body_shape(slide)` — largest non-title text shape (ph_idx=4294967295) | `replace_shape_text(shape, "Description")` |
| Screenshot | PICTURE shape | Leave as placeholder or note for manual replacement |
| Slide number | ph_idx=12 | Leave as-is |

### Slide 39 — 3-Column Comparison (Layout 9)

**Clone source index:** 38

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | `slide.placeholders[0]` (ph_idx=0) | `replace_shape_text(slide.placeholders[0], "Title")` |
| Metric numbers (3) | Small TEXT_BOX shapes at y≈2.59", sorted by left | `replace_shape_text(shape, "24%")` per box |
| Column descriptions (3) | Larger TEXT_BOX shapes at y≈3.94", sorted by left | `replace_shape_text(shape, "Description")` per box |
| Column images (3) | PICTURE shapes | Leave as placeholders |
| Slide number | ph_idx=12 | Leave as-is |

### Slide 22 — 3 Numbered Card Groups (Layout 6)

**Clone source index:** 21

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | Text shape at y < 2.0", w > 6.0" (ph_idx=4294967295) | `replace_shape_text(shape, "Title")` — max ~60 chars |
| Card groups (3) | GROUP shapes at y≈2.4, sorted by left | Iterate `group.shapes` to access children |
| Card number | Group child TEXT_BOX matching "01"/"02"/"03" | Leave as-is (renders at 25pt bold) |
| Card description | Group child TEXT_BOX at y≈3.32 | `replace_shape_text(shape, "Description")` — max ~50 chars |
| Dividers (2) | PICTURE shapes at y≈3.14 between groups | Leave as-is |
| Slide number | ph_idx=12 | Leave as-is |

**Note:** The template has 3 equal GROUP shapes at y=2.4, each 2.38" wide × 1.68" tall. Each group contains a roundRect AUTO_SHAPE background, a number TEXT_BOX, and a description TEXT_BOX. Iterate the groups in left-to-right order; for each group, iterate its children to find the description TEXT_BOX by position (y≈3.32 relative to slide).

**Label handling:** The numeric badge ("01"/"02"/"03") is the card's label and visual emphasis. The description TEXT_BOX is the only writable content field. Do not use this layout for items that need arbitrary text labels (e.g., "Change Management," "Scalability"); those require overriding the badge's font formatting (25pt bold centered → smaller left-aligned), which is not supported by the current helper functions. Until that support ships, use this layout only for content where numeric ordering is appropriate.

**Known constraint:** The 1.68" card height fits ~50 characters of description text. Longer text clips. For longer items, split across two card slides or move detail to speaker notes.

### Slide 40 — 5-Step Progression (Layout 6)

**Clone source index:** 39

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | Text shape at y < 2.0", w > 6.0" (ph_idx=4294967295) | `replace_shape_text(shape, "Title")` — max ~60 chars |
| Column labels (5) | TEXT_BOX shapes at y≈2.15, sorted by left | `replace_shape_text(shape, "Step 1")` — max ~12 chars |
| Column rectangles (5) | AUTO_SHAPE shapes at y≈2.56, sorted by left | Leave as-is (colored backgrounds) |
| Column descriptions (5) | TEXT_BOX shapes at y≈2.74, sorted by left | `replace_shape_text(shape, "Description")` — max ~60 chars |
| Tick marks (5) | LINE shapes at y≈3.79 | Leave as-is |
| Axis line | LINE shape at y≈4.26, w > 9" | Leave as-is |
| Bottom caption | ph_idx=4294967295 at y≈4.47 | If axis label provided: `replace_shape_text(shape, "Axis label")`. If not: `delete_shape(slide, shape)` to remove cleanly — cloning otherwise leaves the template's placeholder text visible |
| Slide number | ph_idx=12 | Leave as-is |

**Note:** The template has 5 colored AUTO_SHAPE rects forming a scale bar, with column labels above and description text boxes overlaid on the rects. When finding column descriptions, filter candidate shapes to TEXT_BOX before sorting by position — rects and descriptions overlap vertically (rects at y=2.56, descriptions at y=2.74), so a naive y-range search returns both.

**Caption handling:** The bottom caption is not optional output — the template renders with placeholder text (e.g., "LOREM IPSUM") unless explicitly handled. When the deck plan calls for an axis label, replace it. When no axis label is provided, either delete the shape via `delete_shape()` or clone idx 40 (slide 41) instead, which has no caption shape.

**Alternative:** Slide 41 (idx 40) is a compact variant — same upper layout but with small horizontal tick LINE segments between rects (y=3.35) instead of vertical ticks, and no bottom caption. Clone idx 40 when no axis label is needed.

### Slide 43 — Timeline / Process (Layout 9)

**Clone source index:** 42

| Role | How to find | Replacement |
|------|-------------|-------------|
| Title | `slide.placeholders[0]` (ph_idx=0) | `replace_shape_text(slide.placeholders[0], "Title")` |
| Body text | `find_body_shape(slide)` — largest non-title text shape (ph_idx=4294967295) | `replace_shape_text(shape, "Body")` |
| Timeline headings (3) | TEXT_BOX shapes at y≈3.60", sorted by left | `replace_shape_text(shape, "Phase 1")` — max ~15 chars (9pt, 1.63" wide) |
| Timeline details (3) | TEXT_BOX shapes at y≈3.85", sorted by left | `replace_shape_text(shape, "Detail")` — max ~45 chars across 2 lines (8pt, 1.63x0.36") |
| Timeline labels (3) | TEXT_BOX shapes at y≈4.25", sorted by left | `replace_shape_text(shape, "Q1")` — max ~6 chars (7pt, 0.55" pill) |
| Slide number | ph_idx=12 | Leave as-is |

**Note:** The timeline has exactly 3 columns with icons. If you need more or fewer phases, note it for manual adjustment.

### Slide 9 — Agenda (Layout 13)

**Clone source index:** 8

| Role | How to find | Replacement |
|------|-------------|-------------|
| Numbers column | First TEXT_BOX by left position (x≈3.0") | Multi-line text: "01\n\n02\n\n03..." |
| Items column | Second TEXT_BOX by left position (x≈3.5") | Multi-line text: "Item 1\n\nItem 2\n\nItem 3..." |
| Slide number | ph_idx=12 | Leave as-is |

---

## Credits

Originally auto-generated against Tiger Data's branded Google Slides template (50 example slides, 16 layouts) as part of the Tiger marketing-skills `deck-builder` skill (Apache-2.0). Ported to AAI 2026-04 with brand-specific shape descriptions ("Tiger Data bar," etc.) replaced by generic equivalents ("branded bar," "your product"). Layout indices, slide counts, and shape positions in this file reflect the Tiger Data source template — when you wire up your own template, regenerate this map against your own `.pptx` and update the worked-example values.

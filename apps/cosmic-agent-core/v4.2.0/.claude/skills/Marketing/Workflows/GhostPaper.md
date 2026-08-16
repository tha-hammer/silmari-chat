---
name: GhostPaper
source: marketing-skills (Tiger Data plugin, Apache-2.0); ported and de-Tiger'd 2026-04
description: Turn markdown into styled, self-contained HTML reports using the Ghost Paper npm package. Triggered when the user explicitly mentions "ghost paper" by name or asks to "convert markdown to a styled HTML report." Do NOT auto-trigger on generic phrases like "make a report", "create a dashboard", "visualize this data", or "format this nicely" — those are handled by other workflows.
---

# GhostPaper

Ghost Paper converts standard markdown into beautiful, self-contained HTML reports with interactive charts, KPI strips, and styled tables. Zero special syntax — just well-structured markdown.

## Pre-flight

This workflow is primarily a markdown-to-HTML build step, so brand assets are only required when the user is asking you to *write* the report content (not just convert existing content they've supplied).

If the user is providing finished markdown to convert, skip to **Instructions**.

If the user is asking you to draft the report content, read the assets this workflow needs from `~/.claude/AAI/USER/MARKETING/`:

- `BrandVoice.md` — required for any voice-sensitive output
- `ICP.md` — required when the workflow targets an audience
- `Positioning.md` — required for content that takes a stance
- `Terminology.md` — required for any externally-visible copy
- `NoFlyList.md` — required for any content that names customers
- `VoiceProfiles/{Name}.md` — only if the user names an author

For each required asset, check the frontmatter `populated:` field after reading.
If `populated: false`, the asset is a stub.

## Missing-asset bootstrap

If the user asked you to draft the report content and a required asset is a stub, STOP and tell the user:

> The {AssetName} asset at `~/.claude/AAI/USER/MARKETING/{AssetName}.md` is a stub.
> This workflow needs it to produce on-brand output. Run `/marketing` to build the
> missing context (Phase 1 covers ICP + Positioning; Phase 2 covers objections
> + voice traits). Once you've populated the file and flipped `populated: true`,
> rerun this workflow.

Do NOT proceed with placeholder content. The whole point of this workflow is on-brand
output, and missing context is exactly what produces generic AI slop.

If the user is only asking for the HTML build of supplied markdown, this section is a no-op — proceed.

## Instructions

### Step 1: Fetch the latest Ghost Paper instructions

**Always do this first.** Run:

```bash
npx ghost-paper prompt 2>/dev/null | grep -v "^npm"
```

This prints the current markdown conventions directly from the installed version of ghost-paper. Use whatever it outputs as your guide for writing the markdown — it covers frontmatter, structure, and the table-to-chart classification rules. This ensures the workflow stays in sync automatically as ghost-paper is updated.

### Step 2: Write the markdown

Using the conventions from Step 1, write the report markdown. If the user hasn't provided content yet, ask what the report should cover. If they've provided raw data, structure it into the right format.

### Step 3: Save the markdown

Write the markdown to a `.md` file in a temporary location:

```bash
cat > /tmp/report.md << 'MDEOF'
[your markdown here]
MDEOF
```

### Step 4: Determine the output directory

Pick the right output location based on the environment:

- **Cowork:** Use the workspace folder (the mounted user directory, typically the path containing `/mnt/`). This is where Cowork surfaces files to the user.
- **Claude Code:** Use the current working directory, or wherever the user specifies.

### Step 5: Build the report

**HTML output (default — works everywhere):**
```bash
npx ghost-paper build html /tmp/report.md -o "$OUTPUT_DIR/report.html"
```

**PDF output (Claude Code only):**
```bash
npx ghost-paper build pdf /tmp/report.md -o "$OUTPUT_DIR/report.pdf"
# Add --landscape for wide reports
```

**Note:** `npx` will auto-install ghost-paper on first run. This is expected and fine.

**PDF limitation in Cowork:** PDF generation requires Chrome/Chromium, which is not available in the Cowork sandbox. If a user asks for PDF output in Cowork, generate the HTML version instead and let them know: "I've generated the HTML report. To save it as a PDF, open the HTML file in Chrome and use File > Print > Save as PDF (or Cmd+P / Ctrl+P). This preserves the styling and layout." The HTML output is actually richer — it includes interactive charts and tabs that PDF cannot reproduce.

### Step 6: Present the file

- **Cowork:** Provide a `computer://` link to the output file so the user can open it directly.
- **Claude Code:** Tell the user where the file was written. If in a project directory, provide the relative path.

## Output requirements

### Tips

- Always include frontmatter with title and subtitle
- KPI strips work best at the top of a section to anchor the reader
- Put the most important chart first in each tab
- Use blockquotes for "the one thing to remember" in each section
- For reports with many sections, use H1 tabs to keep navigation clean
- If the user wants PDF and you're in Claude Code, build both HTML and PDF in sequence

### Error handling

If `npx ghost-paper` fails:
1. Check that the markdown file exists and is valid
2. Try `npm install -g ghost-paper` then run `ghost-paper` directly
3. Check that you have write permissions to the output directory
4. If you see "Chrome not found" — this means PDF generation was attempted without Chrome. Use `build html` instead. PDF generation only works in Claude Code where Chrome can be installed.

## Credits

Original by Tiger Data marketing team (Apache-2.0). Ported to AAI 2026-04 with
brand context swapped to local AAI/USER/MARKETING/ files.

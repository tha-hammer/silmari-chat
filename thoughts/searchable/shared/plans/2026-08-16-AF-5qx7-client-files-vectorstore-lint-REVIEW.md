---
date: 2026-08-16T16:52:00+00:00
reviewer: BronzeHill (claude-code)
git_commit: c4b7a945c4e535d3bc1394d77353bb25f8ae70b5
plan: thoughts/searchable/shared/plans/2026-08-16-AF-5qx7-client-files-vectorstore-lint.md
status: complete
---

# Plan Review Report: AF-5qx7 client/Files+VectorStore sub-slice

## Review Summary

| Category | Status | Issues Found |
|---|---|---|
| Data accuracy (key reuse/collision) | ✅ | 0 |
| Unused-var removal safety | ⚠️ | 1 (minor, addressed below) |
| Interpolation syntax | ✅ | 0 |
| Workflow Closure | N/A | Static UI-copy relocation + dead-var removal in already-unreachable dead code — no production trigger→observable chain exists to map (per the research doc's own LEAF/N-A determination, confirmed independently). |
| Test-Spec Quality | N/A | No new behaviors/tests being added; this is a pure lint-fix pass with `- [ ] Automated Verification` checkboxes, not TDD Given/When/Then behaviors. |
| Scope boundaries | ✅ | 0 |

## Verification performed

- **Reused keys**: all 8 (`com_ui_go_back`, `com_ui_cancel`, `com_ui_upload`, `com_ui_files`, `com_ui_size`, `com_ui_file`, `com_ui_name`, `com_ui_create_assistant`) confirmed present in `client/src/locales/en/translation.json` with the exact stated English value, via direct grep.
- **New key collisions**: all 33 proposed `com_files_*` keys confirmed absent from `translation.json` (zero matches) — no collisions.
- **Interpolation syntax**: read `client/src/hooks/useLocalize.ts` — `localize` is `t(phraseKey, options)` from `react-i18next`. Confirmed real, live usage of the exact `{{0}}` + `{ 0: value }` pattern at `PromptDetailHeader.tsx:53`, `SkillDetailHeader.tsx:71`, `ChatGroupItem.tsx:165,171` against `"com_ui_by_author": "by {{0}}"` — plan's pattern is correct and idiomatic for this repo.
- **Unused-var safety**: read all 5 files in full (`FileListItem.tsx`, `FilePreview.tsx`, `UploadFileModal.tsx`, `FilesSectionSelector.tsx`, `VectorStorePreview.tsx`) at current HEAD. Every "unused" binding named in the plan is confirmed genuinely unreferenced elsewhere in its file; every binding the plan says to *keep* (e.g. `open`/`setOpen` in `VectorStorePreview.tsx`, `selectedPage` in `FilesSectionSelector.tsx`) is confirmed actually wired. No discrepancies.
- **Literal-string completeness**: cross-checked the plan's per-file key mapping against the raw ESLint JSON output line-by-line for all 15 files — every flagged string has an assigned key, no flagged string was missed, and no unflagged string (e.g. the two `&nbsp; ID` occurrences in `VectorStorePreview.tsx` at ~L131/L226, and the `placeholder="Name"`/`placeholder="Purpose"` attributes in `UploadFileModal.tsx` — apparently below the plugin's flagged threshold) was incorrectly targeted. Good scope discipline — matches CLAUDE.md's "minimal scope" rule.
- **Scope boundaries**: `git status --short client/src/components/Files/` is empty — no other agent has touched this directory. `list_claims` confirms only `BronzeHill:AF-5qx7:client-files-subslice` claims this area; `SapphireDune:AF-5qx7:client` and `FrostyMountain:AF-5qx7:api-package-warnings` claims don't overlap.

### Missing or Unclear

- ⚠️ **`UploadFileModal.tsx` `ChangeEvent` import**: the plan says to remove `handleFileChange` (orphaned once `file`/`setFile` are removed) but doesn't explicitly call out that the `ChangeEvent` type import (line 1: `import React, { useState, ChangeEvent } from 'react';`) becomes unused once `handleFileChange`'s signature (`(e: ChangeEvent<HTMLInputElement>) => ...`) is deleted, and would itself become a new lint error if left behind.
- ⚠️ **Whitespace/`&nbsp;` handling**: several icon+label patterns (e.g. `FilePreview.tsx:76-78`, all of `VectorStorePreview.tsx`'s icon rows) have the literal text as a second JSX child after a literal `&nbsp;` text node (`&nbsp; File ID`). The plan's key values capture only the label text ("File ID"), which is correct — but implementation must replace only the trailing text child (`&nbsp; {localize('com_files_file_id')}`), not the whole span, to preserve the existing spacing exactly. Not a plan defect, just an implementation-time care note.

## Critical Issues

None.

## Suggested Plan Amendments

```diff
# In Phase 3: FileList/** (7 files), UploadFileModal.tsx bullet

- `localize` becomes used by the mappings below so no separate removal
+ `localize` becomes used by the mappings below so no separate removal; when
+   deleting the orphaned `handleFileChange`, also remove the now-unused
+   `ChangeEvent` import from the `react` import on line 1
```

## Approval Status

- [x] **Ready for Implementation** — no critical issues. One clarifying amendment folded into the plan (see enhance step); no re-review needed.

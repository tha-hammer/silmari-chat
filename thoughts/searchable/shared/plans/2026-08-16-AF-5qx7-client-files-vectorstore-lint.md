---
date: 2026-08-16T16:45:00+00:00
planner: BronzeHill (claude-code)
git_commit: c4b7a945c4e535d3bc1394d77353bb25f8ae70b5
branch: lint-cleanup-2026-08-16-12-15
repository: silmari-chat (LibreChat fork)
topic: "AF-5qx7 client/Files+VectorStore sub-slice: 50 i18next/no-literal-string errors + 14 no-unused-vars/exhaustive-deps"
tags: [plan, eslint, i18n, client, af-5qx7]
status: complete
last_updated: 2026-08-16
last_updated_by: BronzeHill
---

# AF-5qx7 client/Files+VectorStore sub-slice: Implementation Plan

## Overview

Fix all ESLint findings (`i18next/no-literal-string`, `@typescript-eslint/no-unused-vars`) in the
`client/src/components/Files/**` and `client/src/components/Files/VectorStore/**` file family (15
files) so the scoped lint command passes with zero errors/warnings, with no behavior changes.

This is my (BronzeHill's) claimed sub-slice of AF-5qx7's `client` partition, split from teammate
SapphireDune's `AF-5qx7:client` claim to parallelize the largest partition. SapphireDune retains
the remaining 16 files outside this directory family.

## Current State Analysis

Research basis: `thoughts/searchable/shared/research/2026-08-16-16-28-AF-5qx7-client-partition-lint-findings.md`
(SapphireDune, spot-verified accurate against current HEAD — confirmed independently: `grep -rl
"from '~/components/Files"` outside the family returns nothing, and the translation.json prefix
counts match exactly).

- All 15 files in this family are **dead code** — zero importers anywhere in `client/src` (confirmed
  independently via grep). The live file manager is a separate tree at `client/src/components/SidePanel/Files/`.
  AF-5qx7's acceptance criteria is "fixed at source... without broad ignores or weakening rules" —
  it does not ask for dead-code deletion, which stays explicitly out of scope (per the research
  doc's Open Questions).
- Convention: `useLocalize()` from the `~/hooks` barrel, `translation.json` keys prefixed `com_ui_`
  (generic) or `com_files_` (files/vector-store specific), interpolation via `{{0}}` placeholders
  passed as `{ 0: value }`.
- Exact per-file, per-line ESLint findings were captured directly from `node
  node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client --format json`, filtered to this
  file family (raw JSON: `/tmp/claude-1000/.../scratchpad/client-lint2.json`) — see Code References
  below for the full annotated list.

## Desired End State

Running, from repo root:
```
node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx --ignore-pattern '**/*.cjs' --ignore-pattern '**/*.mjs' client/src/components/Files
```
exits 0 with zero errors/warnings, `npx tsc --noEmit` (or the project's client typecheck) shows no
new errors, and `git diff` for this slice touches only the 15 files below plus
`client/src/locales/en/translation.json` (additive key insertions only).

### Key Discoveries
- Reusable existing keys (do NOT create duplicates): `com_ui_go_back`, `com_ui_cancel`,
  `com_ui_upload`, `com_ui_files`, `com_ui_size`, `com_ui_file`, `com_ui_name`,
  `com_ui_create_assistant` (all confirmed present in `translation.json` via grep).
- Interpolation idiom (research doc): `localize('com_ui_by_author', { 0: group.authorName })` with
  JSON `"com_ui_by_author": "by {{0}}"`.
- One unused-var (`localize` in `UploadFileModal.tsx`) self-resolves once the file's literal
  strings are localized — no separate fix needed for it.

## What We're NOT Doing

- Not deleting any of the 15 dead files or the broader dead component family.
- Not touching any file outside `client/src/components/Files/**` (SapphireDune's slice, WindyGorge's
  closed partitions, FrostyMountain's baml_ts/root-src partition).
- Not fixing the `UploadFileModal.tsx` "Upoad a File" typo's *behavior* — but since we're
  hand-authoring this string as a new translation value from scratch, the value will read
  "Upload a File" (typo corrected in the copy we write, not a behavior change).
- Not adding tests (dead code, no test coverage exists or is expected for this family).

## Implementation Note: whitespace-sensitive JSX

Several icon+label rows (all of `FilePreview.tsx`'s and `VectorStorePreview.tsx`'s field
rows) have the target literal as a JSX text node following a literal `&nbsp;` text node,
e.g. `<Icon .../>\n&nbsp; File ID`. Replace only the label text child with
`{localize('<key>')}`, keeping the preceding `&nbsp;`/whitespace exactly as-is, so rendered
spacing is unchanged.

## Implementation Approach

Single pass per file: replace each literal string with `{localize('<key>')}` (reusing an existing
key where one already matches the exact English text, else a new `com_files_`-prefixed key), then
remove/fix each unused binding per the verdict below. Add all new keys to
`client/src/locales/en/translation.json` in one batch alongside the `com_files_*` block (already
sorted alphabetically in that file — insert in place). Verify with the scoped ESLint command after
each file or in one final pass.

## Phase 1: Add new translation keys

**File**: `client/src/locales/en/translation.json`

Add these new keys (alongside existing `com_files_*` entries, keeping alphabetical order within
that block):

| Key | Value |
|---|---|
| `com_files_select_file_prompt` | Select a file to view details. |
| `com_files_size_kb` | ({{0}}KB) |
| `com_files_more_count` | {{0}} more |
| `com_files_file_id` | File ID |
| `com_files_status` | Status |
| `com_files_purpose` | Purpose |
| `com_files_created_at` | Created At |
| `com_files_attached_to` | Attached To |
| `com_files_vector_stores` | Vector Stores |
| `com_files_uploaded` | Uploaded |
| `com_files_threads` | Threads |
| `com_files_thread_id` | ID: {{0}} |
| `com_files_upload_new_file` | Upload New File |
| `com_files_upload_a_file` | Upload a File |
| `com_files_upload_size_hint` | Please upload square file, size less than 100KB |
| `com_files_choose_file` | Choose File |
| `com_files_no_file_chosen` | No File Chosen |
| `com_files_name_hint` | The name of the uploaded file |
| `com_files_purpose_hint` | The purpose of the uploaded file |
| `com_files_learn_about_purpose` | Learn about file purpose |
| `com_files_select_vector_store_prompt` | Select a vector store to view details. |
| `com_files_add_store` | Add Store |
| `com_files_vector_store_filter` | VectorStoreFilter |
| `com_files_vector_store_header` | VECTOR STORE |
| `com_files_usage_this_month` | Usage this month |
| `com_files_kb_hours_placeholder` | 0 KB hours |
| `com_files_free_until_placeholder` | Free until end of 2024 |
| `com_files_bytes_value` | {{0}} bytes |
| `com_files_last_active` | Last active |
| `com_files_expiration_policy` | Expiration policy |
| `com_files_expires` | Expires |
| `com_files_files_attached` | Files attached |
| `com_files_used_by` | Used by |
| `com_files_resource` | Resource |

### Success Criteria
#### Automated Verification:
- [ ] `node -e "JSON.parse(require('fs').readFileSync('client/src/locales/en/translation.json'))"` parses without error

## Phase 2: FileDashboardView.tsx + VectorStoreView.tsx (shared "Go back" pattern)

**Files**: `client/src/components/Files/FileDashboardView.tsx:20-28`,
`client/src/components/Files/VectorStoreView.tsx:21-29`

**Changes**: Replace `Go back` button text with `{localize('com_ui_go_back')}`. Add
`const localize = useLocalize();` + `import { useLocalize } from '~/hooks';` if not already present
in the file.

## Phase 3: FileList/** (7 files)

- `EmptyFilePreview.tsx:5` — "Select a file to view details." → `com_files_select_file_prompt`
- `FileList.tsx:4` — remove unused `FileListItem` import
- `FileListItem.tsx:11,19` — drop unused `width` prop from the destructured props (and its type, if
  locally declared); `({file.bytes / 1000}KB)` → `{localize('com_files_size_kb', { 0: file.bytes / 1000 })}`
- `FileListItem2.tsx:44-51` — `{n} more` → `{localize('com_files_more_count', { 0: attachedVectorStores.length - index })}`
- `FilePreview.tsx:41-44,76-160` — drop unused `setFile`/`setThreads`/`setVectorStoresAttached` from
  their `useState` destructures (keep the getters), delete the unused `params` line (and the
  `useParams` import if it becomes unused); map literals: "File ID"→`com_files_file_id`,
  "Status"→`com_files_status`, "Purpose"→`com_files_purpose`, "Size"→`com_ui_size`, "Created
  At"→`com_files_created_at`, "Attached To"→`com_files_attached_to`, "Vector
  Stores"→`com_files_vector_stores`, "Uploaded" (×2, lines 127 & 155)→`com_files_uploaded`,
  "Threads"→`com_files_threads`, `ID: {thread.id}`→`{localize('com_files_thread_id', { 0: thread.id })}`
- `UploadFileButton.tsx:14` — "Upload New File" → `com_files_upload_new_file`
- `UploadFileModal.tsx` — remove unused `file`/`handleFileChange` (and their state/handler
  declarations if orphaned); when deleting `handleFileChange`, also remove the now-unused
  `ChangeEvent` import from the `react` import on line 1 (it's only referenced in that
  function's signature); `localize` becomes used by the mappings below so no separate removal:
  "Upoad a File"→`com_files_upload_a_file` (typo corrected in the new copy), "Please upload square
  file..."→`com_files_upload_size_hint`, "Choose File"→`com_files_choose_file`, "No File
  Chosen"→`com_files_no_file_chosen`, "Name"→`com_ui_name`, "The name of the uploaded
  file"→`com_files_name_hint`, "Purpose"→`com_files_purpose`, "The purpose of the uploaded
  file"→`com_files_purpose_hint`, "Learn about file purpose"→`com_files_learn_about_purpose`,
  "Cancel"→`com_ui_cancel`, "Upload"→`com_ui_upload`

## Phase 4: FilesSectionSelector.tsx

- Remove unused `useState` import (verify `selectedPage` really is a plain `let`, not state, per
  research doc note).
- "Vector Stores" → `com_files_vector_stores`; "Files" → `com_ui_files`.

## Phase 5: VectorStore/** (6 files)

- `EmptyVectorStorePreview.tsx:5` — "Select a vector store to view details." → `com_files_select_vector_store_prompt`
- `VectorStoreButton.tsx:14` — "Add Store" → `com_files_add_store`
- `VectorStoreFilter.tsx:4` — "VectorStoreFilter" → `com_files_vector_store_filter`
- `VectorStorePreview.tsx:95-98,104-225` — drop unused `setVectorStore`/`setFilesAttached`/`setAssistants`
  from their `useState` destructures, delete unused `params` line (and orphaned `useParams` import);
  map literals: "VECTOR STORE"→`com_files_vector_store_header`, "Usage this month"→`com_files_usage_this_month`,
  "0 KB hours"→`com_files_kb_hours_placeholder`, "Free until end of 2024"→`com_files_free_until_placeholder`,
  "Size"→`com_ui_size`, "{bytes} bytes"→`{localize('com_files_bytes_value', { 0: vectorStore.bytes })}`,
  "Last active"→`com_files_last_active`, "Expiration policy"→`com_files_expiration_policy`,
  "Expires"→`com_files_expires`, "Created At"→`com_files_created_at`, "Files attached"→`com_files_files_attached`,
  "File"→`com_ui_file`, "Uploaded"→`com_files_uploaded`, "Used by"→`com_files_used_by`, "Create
  Assistant"→`com_ui_create_assistant`, "Resource"→`com_files_resource`
- `VectorStoreSidePanel.tsx:219` — "Vector Stores" → `com_files_vector_stores`

## Testing Strategy

### Automated Verification (run after all phases):
- [x] `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx --ignore-pattern '**/*.cjs' --ignore-pattern '**/*.mjs' client/src/components/Files` exits 0
- [x] Full scoped `client` lint shows zero findings remaining in this file family (confirmed via `grep -B2 "components/Files"` on the full-partition run — no matches)
- [x] `client` TypeScript check has no new errors attributable to these 15 files (only pre-existing repo-wide `Cannot find module '@librechat/client'` errors, present on 433 lines across the whole client tree because `packages/client` has no `dist/` build output — unrelated to this change)
- [x] `git diff --stat` touches only the 15 target files + `translation.json` (confirmed: 16 files changed, 137 insertions, 73 deletions)

### Manual Verification:
- Not applicable — dead code, unreachable from any route; no UI to click through.

## References

- Research: `thoughts/searchable/shared/research/2026-08-16-16-28-AF-5qx7-client-partition-lint-findings.md`
- bd issue: AF-5qx7
- Raw lint JSON (this file family only): captured 2026-08-16 via `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client --format json`, filtered to `/components/Files/`

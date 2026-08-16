# AF-5qx7 Client Partition Lint Fixes — Implementation Plan

## Scope update (post-review, pre-implementation)

While this plan was in review, a second agent (BronzeHill, also working this session) independently claimed and began implementing `client/src/components/Files/**` in this shared worktree (confirmed via Agent Mail thread — see coordination messages ~16:32-16:42 on 2026-08-16). To avoid duplicate/conflicting work, ownership was split: **BronzeHill owns everything under `client/src/components/Files/**`** (all of original Batches 3, 4, and 5 below, now struck from this plan's execution scope — left in place only as a record of what was originally researched/planned for that subtree). **This plan (SapphireDune) now covers only the remaining ~16 files**: original Batch 1 minus its two `Files/**` items (`FileList/FilePreview.tsx`, `VectorStore/VectorStorePreview.tsx`, both ceded to BronzeHill), plus Batches 2 and 6 unchanged. Batches 3/4/5 below are retained textually for traceability but are **not executed by this plan**.

## Overview

Resolve the ~16-file, non-`Files/**` slice of AF-5qx7's `client` partition ESLint findings (the `Files/**` slice — batches 3-5 below — is owned by a peer agent, see Scope update above). Pure lint remediation — no new behavior, no rule weakening, no dead-code deletion.

## Current State Analysis

Full findings enumerated at `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client` (raw output captured during research). Research is complete and documented at `thoughts/searchable/shared/research/2026-08-16-16-28-AF-5qx7-client-partition-lint-findings.md` — read that first; it contains the full per-finding bug-vs-dead-code verdict table and the confirmed i18n convention with concrete code examples. Key facts carried forward from research (not re-derived here):

- Every i18n-error file is dead code (zero importers in `client/src`) **except** `Auth/SocialLoginRender.tsx` and `SidePanel/Builder/Images.tsx`, which are live.
- i18n convention: `const localize = useLocalize();` (from `~/hooks` barrel) wrapping literal JSX text via `localize('key', interpolations?)`; new keys go in `client/src/locales/en/translation.json`, prefixed `com_ui_` (existing, 1441 keys) or `com_files_` (existing, 15 keys, used for Files/VectorStore-feature-specific strings).
- 26 of 27 unused-var findings are confirmed no-ops (nothing reads the binding, no silently-dropped wiring). One (`useSelectorEffects.ts`) needs a `useCallback` wrap, not a bare deps-array edit.

## Desired End State

This plan's own scope (the ~16 non-`Files/**` files) has zero ESLint findings, verifiable by running the eslint command scoped to just those files (see each batch's Automated Verification). The full `node node_modules/eslint/bin/eslint.js ... client` partition going to 0 errors/warnings is a **joint milestone** shared with BronzeHill's parallel `Files/**` work — per Agent Mail coordination, WindyGorge runs that single final combined check once both slices have landed; this plan does not gate on BronzeHill's completion. `client/src/locales/en/translation.json` remains valid JSON with all new keys alphabetically placed near their prefix group (matching existing file convention). No component's rendered output, behavior, or test results change (dead components stay dead but lint-clean; live components render identical text, now translatable).

### Key Discoveries
- `client/src/components/Files/**` + `Files/VectorStore/**` (24 files), `SidePanel/data.tsx`, `Chat/Input/ActiveSetting.tsx`, `Chat/Input/Files/Table/TemplateTable.tsx` are all unreachable from any route (tracked separately as bd `AF-569j`, not touched by deletion here).
- `client/src/hooks/Endpoint/useSelectorEffects.ts:77-85` defines `debouncedSetSelectedValues` as a fresh closure every render; adding it directly to the effect's dep array (line 123-129) would make the effect re-fire every render instead of only on `conversation.*` field changes. Fix: wrap it in `useCallback(() => {...}, [setSelectedValues])` first.
- `eslint.config.mjs:241-247` runs `i18next/no-literal-string` in `mode: 'jsx-text-only'` — only literal text that is a direct JSX child is flagged (not JS string literals/attributes), which is why brand names in `SidePanel/data.tsx`'s `<title>Vercel</title>` etc. are caught (they're SVG `<title>` JSX children) while other brand-name usages elsewhere in the codebase aren't.
- `client/src/locales/en/translation.json` already has exact-match reusable keys: `com_ui_go_back` ("Go back"), `com_ui_files` ("Files"), `com_ui_size` ("Size"), `com_ui_cancel` ("Cancel"), `com_ui_name` ("Name"), `com_ui_date` ("Date"). No existing key matches "Or", "Upload Photo", "Vector Stores", or any brand name (Vercel/Gmail/iCloud).

## What We're NOT Doing

- Not deleting the dead `Files/**`/`VectorStore/**`/`SidePanel/data.tsx`/`ActiveSetting.tsx`/`TemplateTable.tsx` component family — tracked separately as bd `AF-569j`.
- Not wiring up the disconnected scaffolding found during research (e.g. `UploadFileModal.tsx`'s missing `<input type="file">`, `FileListItem.tsx`'s unused `width` prop, `WrenchIcon.tsx`'s unconnected rotation animation, `Skills` forms' unrendered `InvocationModePicker`) — that would be a behavior change beyond "fix the lint finding," not requested.
- Not adding new automated tests — these are label-text and unused-binding changes with no new logic paths, and no test currently exercises the affected dead-code files.
- Not touching `AF-5qx7`'s other partitions (`e2e`, `config`, `packages/data-provider`, `baml_ts`, root `src`) — those are claimed by other agents in this session (see Agent Mail coordination).

## Implementation Approach

Six small batches, ordered simple → complex, each ending in a targeted `eslint` re-run on just that batch's files before moving on. One final full-partition `eslint` run confirms the whole `client` partition is clean. Every new translation key is added to `client/src/locales/en/translation.json` in the same batch as its first use, immediately before the targeted verification step.

**Key-naming rule** (mechanical, applies to every string not explicitly named below): reuse an existing `com_ui_*` key if its value is an exact case-sensitive match to the literal text; otherwise add a new key under `com_files_` (the Files/VectorStore family's existing prefix) named as a `snake_case` slug of the label's semantic meaning (e.g. a `<span>` reading "Last active" next to a clock icon → `com_files_last_active`), preserving the original text exactly as the value. For multi-line/interpolated JSX blocks (e.g. `{file.bytes / 1000}KB`), key the static template and pass dynamic parts via `{ 0: value }` interpolation, e.g. `localize('com_files_size_kb', { 0: file.bytes / 1000 })` with value `"{{0}}KB"`.

---

## Batch 1: Unused-vars and hook-deps warnings (no i18n)

### Overview
Fixes all warning-only findings across 11 files in this plan's scope (see "Scope update" above — the original 5 `Files/**` items in this batch — `FilePreview.tsx`, `VectorStorePreview.tsx`, `FilesSectionSelector.tsx`, `FileList.tsx`, `FileListItem.tsx` — are ceded to BronzeHill). No translation keys involved.

### Changes Required

1. **`client/src/components/Auth/VerifyEmail.tsx`**
   - Line 39: rename unused `error` param to `_error`.
   - Line 61-77 `useEffect` deps array: add `localize`.

2. **`client/src/hooks/Endpoint/useSelectorEffects.ts`**
   - Import `useCallback` from `react` (alongside existing `useMemo`, `useEffect`, `useRef`).
   - Wrap the `debouncedSetSelectedValues` definition (lines 77-85) in `useCallback(() => { ... }, [setSelectedValues])`.
   - Add `debouncedSetSelectedValues` to the dep array of the effect at lines 87-129 (alongside the existing `conversation.*` entries).

~~3. `client/src/components/Files/FileList/FilePreview.tsx`~~ — **ceded to BronzeHill** (`Files/**` owner), not executed here.

~~4. `client/src/components/Files/VectorStore/VectorStorePreview.tsx`~~ — **ceded to BronzeHill**, not executed here.

~~5. `client/src/components/Files/FilesSectionSelector.tsx`~~ — **ceded to BronzeHill** (`Files/**` owner), not executed here.

6. **`client/src/components/SidePanel/Builder/Retrieval.tsx`**
   - Line 33-38: delete the entire unused `vectorStores` `useMemo` block. It is a pure derivation (`assistant.tool_resources?.file_search`, no side effects) that nothing reads — per "no half-finished implementations," a pure computed value with zero readers is dead code to remove, not preserve with a `_` prefix.

7. **`client/src/components/Skills/forms/CreateSkillForm.tsx`** (line 13) and **`client/src/components/Skills/forms/SkillForm.tsx`** (line 15)
   - Remove the unused `InvocationModePicker` import in each file. Do not touch the `invocationMode` form-state fields or their explanatory comments.

8. **`client/src/data-provider/__tests__/connection.test.ts`**
   - Line 3: remove `dataService` from the import (keep `QueryKeys`, `Time`).

9. **`client/src/hooks/useChatBadges.ts`**
   - Line 4: remove unused `MessageCircleDashed` from the `lucide-react` import (keep `Box`).

10. **`client/src/utils/agents.tsx`**
    - Line 93-99: delete the unused `placeholderSizeClasses` object entirely.

11. **`client/src/utils/json.ts`**
    - Lines 4 and 13: change `catch (e)` to `catch` (optional catch binding — both bodies already ignore the error value).

12. **`client/src/utils/presets.ts`**
    - Line 4: delete the unused `type TEndpoints = ...` declaration.
    - Line 8: remove `endpoint` from the destructure in `getPresetTitle`.
    - Line 13: remove `chatGptLabel` from the same destructure (keep `modelLabel`).

~~13. `client/src/components/Files/FileList/FileList.tsx`~~ — **ceded to BronzeHill** (`Files/**` owner — confirmed already mid-edit on this exact file via `git status`), not executed here.

~~14. `client/src/components/Files/FileList/FileListItem.tsx`~~ — **ceded to BronzeHill**, not executed here.

15. **`client/src/components/Chat/Messages/Content/WrenchIcon.tsx`**
    - Line 4: change `const [rotate, setRotate] = useState(false);` to `const [, setRotate] = useState(false);` (keep the setter, which drives the existing `setInterval`; drop the unused getter binding).

### Success Criteria

#### Automated Verification
- [x] `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client/src/components/Auth/VerifyEmail.tsx client/src/hooks/Endpoint/useSelectorEffects.ts client/src/components/SidePanel/Builder/Retrieval.tsx client/src/components/Skills/forms/CreateSkillForm.tsx client/src/components/Skills/forms/SkillForm.tsx client/src/data-provider/__tests__/connection.test.ts client/src/hooks/useChatBadges.ts client/src/utils/agents.tsx client/src/utils/json.ts client/src/utils/presets.ts client/src/components/Chat/Messages/Content/WrenchIcon.tsx` exits 0 — CONFIRMED (0 errors, 0 warnings). One cascading fix beyond the original plan: removing `Retrieval.tsx`'s `vectorStores` useMemo left its `assistant` watch newly-unused (its only consumer); removed that too.
- [x] `cd client && npx tsc --noEmit` — CONFIRMED no new errors from these changes; the only errors present (`Cannot find module '@librechat/client'`, ~60 files repo-wide) are a pre-existing unbuilt-package issue (`packages/client/dist` doesn't exist), unrelated to this batch — verified by filtering typecheck output to just these 11 files and finding only that same pre-existing error class, no new TS errors.
- [x] Existing test suite for touched files still passes: `cd client && npx jest src/hooks/Endpoint src/utils/presets src/utils/json src/data-provider/__tests__/connection.test.ts` — CONFIRMED: 1 suite, 14/14 tests pass.

Committed as `428f5d321`.

#### Manual Verification
- [ ] `useSelectorEffects.ts`: reasoning check (no UI needed, dead-ends into non-rendered debounce) — confirm the effect's behavior is unchanged by comparing pre/post: the effect should still only re-run when `conversation.spec/model/endpoint/agent_id/assistant_id` change, not on every parent re-render, because `debouncedSetSelectedValues` is now a `useCallback` stable across renders (identity only changes if `setSelectedValues` itself changes).

---

## Batch 2: Live-file i18n fixes

### Overview
The only two i18n errors in reachable production code.

### Changes Required

1. **`client/src/locales/en/translation.json`** — add two new keys near the existing `com_ui_o*`/`com_ui_u*` alphabetical neighbors:
   ```json
   "com_ui_or": "Or",
   "com_ui_upload_photo": "Upload Photo",
   ```

2. **`client/src/components/Auth/SocialLoginRender.tsx`**
   - Add `const localize = useLocalize();` if not already present in the component (check first — file likely already has it for other strings); import `useLocalize` from `~/hooks` if missing.
   - Line 123-125: replace the literal `Or` JSX text with `{localize('com_ui_or')}`.

3. **`client/src/components/SidePanel/Builder/Images.tsx`**
   - Add `const localize = useLocalize();` (import from `~/hooks`) to the component containing line 110, if not already present.
   - Line 110-117 (the "Upload Photo" `<div>`): replace the literal text with `{localize('com_ui_upload_photo')}`.

### Success Criteria

#### Automated Verification
- [x] `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client/src/components/Auth/SocialLoginRender.tsx client/src/components/SidePanel/Builder/Images.tsx` exits 0 — CONFIRMED
- [x] `node -e "JSON.parse(require('fs').readFileSync('client/src/locales/en/translation.json'))"` exits 0 — CONFIRMED
- [x] `cd client && npx tsc --noEmit` — CONFIRMED no new errors (only the same pre-existing unbuilt-`packages/client` issue noted in Batch 1)

Committed as `f886c9a86` (combined with Batch 6, see below).

#### Manual Verification
- [ ] Rendered text on the login page still reads "Or" and the Assistant avatar upload menu still reads "Upload Photo" — not yet manually verified in a browser (implemented collaboratively across a teammate handoff; flagging as outstanding rather than claiming unverified success)

---

## Batch 3: Small dead files — i18n + remaining unused-vars

### Overview
Files with 1-3 i18n findings each. All within the dead `Files/**`/`VectorStore/**`/`SidePanel/data.tsx` family (bd `AF-569j`), so no manual UI verification is possible or required — targeted eslint + typecheck only.

### Changes Required

Add to `client/src/locales/en/translation.json`:
```json
"com_files_select_file_details": "Select a file to view details.",
"com_files_select_vector_store_details": "Select a vector store to view details.",
"com_files_upload_new_file": "Upload New File",
"com_files_add_store": "Add Store",
"com_files_vector_store_filter_placeholder": "VectorStoreFilter",
"com_ui_vector_stores": "Vector Stores",
"com_ui_vercel": "Vercel",
"com_ui_gmail": "Gmail",
"com_ui_icloud": "iCloud",
"com_files_size_kb": "({{0}}KB)",
"com_files_more_count": "{{0}} more"
```

**Correction from initial pass (caught during self-review against the raw eslint output, not just the research summary):** two files were missed — `FileList/FileListItem.tsx:19` and `FileList/FileListItem2.tsx:44` — added as items 11-12 below. (A third file, `FileList/FilePreview.tsx`, does NOT have a finding at its own line 19 — an earlier draft of this plan incorrectly attributed `FileListItem.tsx`'s line-19 finding to `FilePreview.tsx`; that erroneous item has been removed from Batch 4.)

1. **`client/src/components/Files/FileDashboardView.tsx:20-47`** — "Go back" → `{localize('com_ui_go_back')}`; add `useLocalize` import/call if missing.
2. **`client/src/components/Files/FileList/EmptyFilePreview.tsx:5`** — "Select a file to view details." → `{localize('com_files_select_file_details')}`.
3. **`client/src/components/Files/FileList/UploadFileButton.tsx:14`** — "Upload New File" → `{localize('com_files_upload_new_file')}`.
4. **`client/src/components/Files/VectorStore/EmptyVectorStorePreview.tsx:5`** — "Select a vector store to view details." → `{localize('com_files_select_vector_store_details')}`.
5. **`client/src/components/Files/VectorStore/VectorStoreButton.tsx:14`** — "Add Store" → `{localize('com_files_add_store')}`.
6. **`client/src/components/Files/VectorStore/VectorStoreFilter.tsx:4`** — `<div>VectorStoreFilter</div>` → `<div>{localize('com_files_vector_store_filter_placeholder')}</div>`.
7. **`client/src/components/Files/VectorStore/VectorStoreSidePanel.tsx:219`** — "Vector Stores" (`<strong>`) → `{localize('com_ui_vector_stores')}`.
8. **`client/src/components/Files/VectorStoreView.tsx:21`** — "Go back" → `{localize('com_ui_go_back')}`.
9. **`client/src/components/Files/FilesSectionSelector.tsx:30-42`** (already touched in Batch 1 for the unused import) — "Vector Stores" → `{localize('com_ui_vector_stores')}`; "Files" → `{localize('com_ui_files')}`. Add `useLocalize` import/call.
10. **`client/src/components/SidePanel/data.tsx`** — confirmed (full file read: 39 lines) to be a plain module-level `export const accounts = [...]` array literal with no component/hook wrapper — `useLocalize()` cannot be called at this scope as-is. Since the file has zero importers anywhere (research-confirmed dead code), reshaping its export is zero-risk. Fix: convert the plain constant into a hook:
   ```tsx
   import { useLocalize } from '~/hooks';

   export function useAccounts() {
     const localize = useLocalize();
     return [
       {
         label: 'Alicia Koch',
         email: 'alicia@example.com',
         icon: (
           <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
             <title>{localize('com_ui_vercel')}</title>
             <path d="M24 22.525H0l12-21.05 12 21.05z" fill="currentColor" />
           </svg>
         ),
       },
       // ...same shape for the Gmail (line 12-24) and iCloud (line 25-37) entries,
       // using {localize('com_ui_gmail')} and {localize('com_ui_icloud')} respectively.
     ];
   }
   ```
   Rename the export from `accounts` to `useAccounts` (function), preserving every other field verbatim. No caller update needed (none exist).

11. **`client/src/components/Files/FileList/FileListItem.tsx:19`** — `<p>({file.bytes / 1000}KB)</p>` → `<p>{localize('com_files_size_kb', { 0: file.bytes / 1000 })}</p>`. Add `useLocalize` import/call (this file's only other change so far was Batch 1's unused-`width` fix, which didn't touch imports for this hook).

12. **`client/src/components/Files/FileList/FileListItem2.tsx:44-69`** — `{attachedVectorStores.length - index} more` (inside a `<span>` alongside a `<PlusIcon>`) → `{localize('com_files_more_count', { 0: attachedVectorStores.length - index })}`. Add `useLocalize` import/call.

### Success Criteria

#### Automated Verification
- [ ] `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client/src/components/Files/FileDashboardView.tsx client/src/components/Files/FileList/EmptyFilePreview.tsx client/src/components/Files/FileList/UploadFileButton.tsx client/src/components/Files/FileList/FileListItem.tsx client/src/components/Files/FileList/FileListItem2.tsx client/src/components/Files/VectorStore/EmptyVectorStorePreview.tsx client/src/components/Files/VectorStore/VectorStoreButton.tsx client/src/components/Files/VectorStore/VectorStoreFilter.tsx client/src/components/Files/VectorStore/VectorStoreSidePanel.tsx client/src/components/Files/VectorStoreView.tsx client/src/components/Files/FilesSectionSelector.tsx client/src/components/SidePanel/data.tsx` exits 0
- [ ] `node -e "JSON.parse(require('fs').readFileSync('client/src/locales/en/translation.json'))"` exits 0
- [ ] `cd client && npx tsc --noEmit` passes

#### Manual Verification
- None (dead code, unreachable from any UI surface — confirmed in research doc).

---

## Batch 4: Medium dead files — `FileList/FilePreview.tsx` (11 errors) and `FileList/UploadFileModal.tsx` (11 errors)

### Overview
Both already had their unused-var findings addressed in Batch 1; this batch adds the i18n fixes. `UploadFileModal.tsx`'s previously-unused `localize` import becomes used here, naturally resolving that overlap.

### Changes Required

Add to `client/src/locales/en/translation.json`:
```json
"com_files_file_id": "File ID",
"com_files_status": "Status",
"com_files_purpose": "Purpose",
"com_files_created_at": "Created At",
"com_files_attached_to": "Attached To",
"com_files_uploaded": "Uploaded",
"com_files_threads": "Threads",
"com_files_upload_a_file": "Upoad a File",
"com_files_upload_size_hint": "Please upload square file, size less than 100KB",
"com_files_choose_file": "Choose File",
"com_files_no_file_chosen": "No File Chosen",
"com_files_file_name_hint": "The name of the uploaded file",
"com_files_purpose_hint": "The purpose of the uploaded file",
"com_files_learn_file_purpose": "Learn about file purpose",
"com_files_upload": "Upload"
```
(Note: `"com_files_upload_a_file"` intentionally preserves the original typo "Upoad" from `UploadFileModal.tsx:26` — do not silently correct copy in a lint-fix pass; if the typo should be fixed, that's a separate content change outside this ticket's scope.)

1. **`client/src/components/Files/FileList/FilePreview.tsx`** (note: this file's line 19 is a warning, not an i18n finding — see Batch 1 item 3; the KB-interpolation i18n fix belongs to the separate `FileListItem.tsx`, handled in Batch 3)
   - Line 76-79 "File ID" → `com_files_file_id`; line 83-87 "Status" → `com_files_status`; line 95-98 "Purpose" → `com_files_purpose`; line 102-105 "Size" → reuse `com_ui_size`; line 109-113 "Created At" → `com_files_created_at`; line 120 "Attached To" → `com_files_attached_to`; line 124-99 "Vector Stores" → reuse `com_ui_vector_stores` (added in Batch 3); line 127/155 "Uploaded" → `com_files_uploaded`; line 154 "Threads" → `com_files_threads`; line 160 `ID: {thread.id}` — key the static prefix as `com_files_thread_id_prefix`: `"ID: {{0}}"`, interpolate `{ 0: thread.id }`.
   - Add `"com_files_thread_id_prefix": "ID: {{0}}"` to the translation.json addition list above.
   - Add `useLocalize` import/`const localize = useLocalize();` if not already present (it likely already has other imports from `~/hooks` — check and merge).

2. **`client/src/components/Files/FileList/UploadFileModal.tsx`**
   - Line 25 "Upoad a File" → `com_files_upload_a_file`; line 35 → `com_files_upload_size_hint`; line 38 "Choose File" → `com_files_choose_file`; line 40 "No File Chosen" → `com_files_no_file_chosen`; line 45 "Name" → reuse `com_ui_name`; line 46 → `com_files_file_name_hint`; line 51 "Purpose" → reuse `com_files_purpose` (added above in this same batch); line 52 → `com_files_purpose_hint`; line 60 "Learn about file purpose" → `com_files_learn_file_purpose`; line 69 "Cancel" → reuse `com_ui_cancel`; line 77 "Upload" → `com_files_upload`.
   - The existing `localize` binding (line 7, previously unused per research finding) now has real call sites from the above — keep it, no import change needed.
   - **Verified against the actual file** (not just research summary): `setFile` (line 8) IS called, inside `handleFileChange` (line 13) — so ESLint does not flag `setFile` itself, only `file` (line 8, the read value — never used in JSX) and `handleFileChange` (line 10, never wired to any element's `onChange`; the "Choose File" `<Button>` at line 38 has no `onClick`/file input). `useState` (line 8) and `ChangeEvent` (line 10) are each used exactly once in the file, both inside the code being deleted. Delete: `const [file, setFile] = useState<File | null>(null);` (line 8), the entire `handleFileChange` function (lines 10-15), and change line 1's import from `import React, { useState, ChangeEvent } from 'react';` to `import React from 'react';` (both named imports become unused once lines 8 and 10-15 are gone).

### Success Criteria

#### Automated Verification
- [ ] `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client/src/components/Files/FileList/FilePreview.tsx client/src/components/Files/FileList/UploadFileModal.tsx` exits 0
- [ ] `node -e "JSON.parse(require('fs').readFileSync('client/src/locales/en/translation.json'))"` exits 0
- [ ] `cd client && npx tsc --noEmit` passes

#### Manual Verification
- None (dead code).

---

## Batch 5: Largest dead file — `VectorStore/VectorStorePreview.tsx` (16 errors)

### Overview
Single file, highest finding count, same mechanical pattern as Batch 4.

### Changes Required

Add to `client/src/locales/en/translation.json`:
```json
"com_files_vector_store_label": "VECTOR STORE",
"com_files_usage_this_month": "Usage this month",
"com_files_kb_hours": "0 KB hours",
"com_files_free_until": "Free until end of 2024",
"com_files_last_active": "Last active",
"com_files_expiration_policy": "Expiration policy",
"com_files_expires": "Expires",
"com_files_files_attached": "Files attached",
"com_files_used_by": "Used by",
"com_files_create_assistant": "Create Assistant",
"com_files_resource": "Resource",
"com_files_bytes": "{{0}} bytes"
```

1. **`client/src/components/Files/VectorStore/VectorStorePreview.tsx`**
   - Line 104 "VECTOR STORE" → `com_files_vector_store_label`.
   - Line 137-140 "Usage this month" → `com_files_usage_this_month`.
   - Line 142:48 (inner `<span>`) "0 KB hours" → `com_files_kb_hours`; line 142:65 (the enclosing `<p>`, a separate finding for its own direct-text child) "Free until end of 2024" → `com_files_free_until` (these are two distinct findings for two distinct strings, not the same string twice).
   - Line 149-152 "Size" → reuse `com_ui_size`; `{vectorStore.bytes} bytes` → `com_files_bytes` with `{ 0: vectorStore.bytes }`.
   - Line 156 "Last active" → `com_files_last_active`.
   - Line 163 "Expiration policy" → `com_files_expiration_policy`.
   - Line 170 "Expires" → `com_files_expires`.
   - Line 177 "Created At" → reuse `com_files_created_at` (added in Batch 4).
   - Line 186 "Files attached" → `com_files_files_attached`.
   - Line 190 "File" → reuse `com_ui_files`? No — "File" (singular) needs its own key: add `"com_files_file_singular": "File"` to the list above and use it. Line 191 "Uploaded" → reuse `com_files_uploaded` (Batch 4).
   - Line 217 "Used by" → `com_files_used_by`.
   - Line 219 "Create Assistant" (with icon) → `com_files_create_assistant`.
   - Line 225 "Resource" → `com_files_resource`.
   - Ensure `const localize = useLocalize();` exists once at the top of the component (it's referenced across many JSX blocks in this file — confirm single hook call, not per-block).

(Add `"com_files_file_singular": "File"` to this batch's translation.json list too.)

### Success Criteria

#### Automated Verification
- [ ] `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client/src/components/Files/VectorStore/VectorStorePreview.tsx` exits 0
- [ ] `node -e "JSON.parse(require('fs').readFileSync('client/src/locales/en/translation.json'))"` exits 0
- [ ] `cd client && npx tsc --noEmit` passes

#### Manual Verification
- None (dead code).

---

## Batch 6: Dead `Chat/Input` files — `ActiveSetting.tsx` (2 errors), `Files/Table/TemplateTable.tsx` (6 errors)

### Overview
Last two dead files, confirmed zero-importer in research (Batch naming differs from `Files/**` tree but same treatment).

### Changes Required

Add to `client/src/locales/en/translation.json`:
```json
"com_files_talking_to": "Talking to",
"com_files_demo_model_name": "[latest] Tailwind CSS GPT",
"com_files_size_bytes": "11 mb",
"com_files_demo_file_transfer": "File Transfer: Node to FastAPI",
"com_files_demo_date": "June 11, 2023"
```

1. **`client/src/components/Chat/Input/ActiveSetting.tsx`**
   - Line 3-4 "Talking to{' '}" → `{localize('com_files_talking_to')}{' '}`; line 5 "[latest] Tailwind CSS GPT" → `{localize('com_files_demo_model_name')}`. Add `useLocalize` import/call.

2. **`client/src/components/Chat/Input/Files/Table/TemplateTable.tsx`**
   - Line 9 "Name" → reuse `com_ui_name`; line 12 "Date" → reuse `com_ui_date`; line 15 "Size" → reuse `com_ui_size`.
   - Line 29 "File Transfer: Node to FastAPI" → `com_files_demo_file_transfer`.
   - Line 40 "June 11, 2023" → `com_files_demo_date`.
   - Line 43 "11 mb" → `com_files_size_bytes`.
   - Add `useLocalize` import/call.

### Success Criteria

#### Automated Verification
- [x] `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client/src/components/Chat/Input/ActiveSetting.tsx client/src/components/Chat/Input/Files/Table/TemplateTable.tsx` exits 0 — CONFIRMED
- [x] `node -e "JSON.parse(require('fs').readFileSync('client/src/locales/en/translation.json'))"` exits 0 — CONFIRMED
- [x] `cd client && npx tsc --noEmit` — CONFIRMED no new errors

Committed as `f886c9a86` (combined with Batch 2).

#### Manual Verification
- None (dead code).

---

## Final Verification (after this plan's 3 executed batches — 1, 2, 6)

#### Automated Verification
- [x] Scoped eslint run across all files this plan touched (Batch 1's 11 files + Batch 2's 2 files + Batch 6's 2 files = 15 files) exits 0 with no errors or warnings — CONFIRMED
- [x] Full `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx --ignore-pattern '**/*.cjs' --ignore-pattern '**/*.mjs' client` — CONFIRMED exit 0, 0 output. BronzeHill's `Files/**` slice landed first (commit `c66c0cc3d`); this plan's slice committed second (`f886c9a86`). The whole `client` partition is clean.
- [x] `cd client && npx tsc --noEmit` — CONFIRMED no new errors from either slice; only the pre-existing repo-wide unbuilt-`packages/client` issue remains, unrelated to AF-5qx7.
- [x] `npm run sort-imports:check` — CONFIRMED "All 3309 files already sorted."
- [x] `node -e "JSON.parse(require('fs').readFileSync('client/src/locales/en/translation.json'))"` exits 0 — CONFIRMED
- [x] Full client test suite: `cd client && npx jest` — ran; 173/311 suites fail, 2050/2051 individual tests pass. Investigated both failure classes, neither caused by AF-5qx7 work:
  - 173 suite failures all trace to the same pre-existing `Cannot find module '@librechat/client'` resolution error (confirmed `packages/client/dist` doesn't exist — unbuilt package, an environment/build-setup issue unrelated to any lint fix; same root cause already identified in Batch 1's typecheck check).
  - The 1 individual test failure (`src/locales/Translation.spec.ts` › "defines the English Clerk bridge labels...") expects `com_auth_clerk_sign_in: 'Continue with Clerk'`; the actual file has `"Login To Nolme AI"` — a pre-existing product-branding customization from unrelated prior work (not touched by any AF-5qx7 commit today; verified via `grep` that no diff in this session's history touches that key).
  - Neither failure class is a regression from this plan's changes.

#### Manual Verification
- [ ] Login page "Or" divider renders correctly (Batch 2) — not yet browser-verified
- [ ] Assistant avatar "Upload Photo" menu item renders correctly (Batch 2) — not yet browser-verified
- [ ] `npm run frontend:dev` startup — not yet run

## Testing Strategy

No new automated tests are added — every change is either (a) a label-text swap behind an established, already-tested `useLocalize()`/`translation.json` mechanism, (b) removal of a confirmed-unused binding, or (c) a `useCallback` memoization that preserves existing effect-firing behavior (verified by manual reasoning in Batch 1, since no test currently covers `useSelectorEffects.ts`). Existing test suites are re-run per batch/finally as a regression check, not extended.

## Performance Considerations

None — no new renders, no new subscriptions; `useCallback` in Batch 1 reduces re-renders/effect-refires relative to current behavior (stable function identity) rather than adding overhead.

## Migration Notes

None — no data model, schema, or persisted-state changes.

## References

- Research: `thoughts/searchable/shared/research/2026-08-16-16-28-AF-5qx7-client-partition-lint-findings.md`
- bd issue: `AF-5qx7` (parent), `AF-569j` (discovered dead-code follow-up, not in scope here)
- Lint invocation source: `scripts/lint.mts`
- ESLint rule config: `eslint.config.mjs:241-247`

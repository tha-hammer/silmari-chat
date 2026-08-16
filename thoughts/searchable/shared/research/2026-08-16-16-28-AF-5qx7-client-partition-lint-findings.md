---
date: 2026-08-16T16:28:39+00:00
researcher: SapphireDune (claude-code)
git_commit: 90bf5dd54a090f9a1c420f660eb6741de11e21a3
branch: lint-cleanup-2026-08-16-12-15
repository: silmari-chat (LibreChat fork)
topic: "AF-5qx7 client partition: 63 i18next/no-literal-string errors + 27 no-unused-vars + 2 exhaustive-deps warnings"
tags: [research, codebase, eslint, i18n, client, af-5qx7]
status: complete
last_updated: 2026-08-16
last_updated_by: SapphireDune
---

# Research: AF-5qx7 client partition lint findings

**Date**: 2026-08-16T16:28:39+00:00
**Researcher**: SapphireDune (claude-code)
**Git Commit**: 90bf5dd54a090f9a1c420f660eb6741de11e21a3
**Branch**: lint-cleanup-2026-08-16-12-15
**Repository**: silmari-chat

## Research Question

For the `client` partition of AF-5qx7 (63 `i18next/no-literal-string` errors, 27 `@typescript-eslint/no-unused-vars` warnings, 2 `react-hooks/exhaustive-deps` warnings — full raw list captured at `/tmp/.../scratchpad/client-lint-full.txt`, reproduced via `node node_modules/eslint/bin/eslint.js --ext .js,.jsx,.ts,.tsx client`): are the affected components live/routed or dead scaffolding; what is the existing i18n key/usage convention; and for each unused-var/exhaustive-deps finding, is the unused binding a sign of a real bug or safe-to-remove dead code?

## Summary

- **Every file carrying an `i18next/no-literal-string` error is either dead code (zero importers anywhere in `client/src`) or one of two live files.** Live: `client/src/components/Auth/SocialLoginRender.tsx` (1 error) and `client/src/components/SidePanel/Builder/Images.tsx` (1 error). Everything else — the `client/src/components/Files/**` + `Files/VectorStore/**` family (24 files), `SidePanel/data.tsx`, `Chat/Input/ActiveSetting.tsx`, and `Chat/Input/Files/Table/TemplateTable.tsx` — has no importer anywhere in the app and is unreachable from any route or nav config.
- The i18n convention is `useLocalize()` (from the `~/hooks` barrel) returning a `localize(key, interpolations?)` function typed against `client/src/locales/en/translation.json` (`TranslationKeys`). New keys go in that single flat JSON file with a `com_ui_` (1441 existing) or `com_files_` (15 existing) prefix. The idiomatic icon+label JSX shape is `<span className="flex items-center gap-1"><Icon .../>{localize('com_ui_x')}</span>` (or `<div className="flex flex-wrap items-center gap-2">...` for table cells).
- All 27 unused-var warnings and both exhaustive-deps warnings were traced to their surrounding code. 26 of the 27 unused-vars are confirmed no-ops to remove/prefix (nothing reads them, no wiring was silently dropped). One (`useSelectorEffects.ts`) needs a `useCallback` wrap, not a bare deps-array edit, to fix correctly without changing debounce behavior. `VerifyEmail.tsx`'s missing `localize` dep is a safe add (it's actively called inside the effect).

## Detailed Findings

### Liveness of affected components

| File | Importers found | Status |
|---|---|---|
| `client/src/components/Files/**`, `Files/VectorStore/**` (24 files) | none | dead |
| `client/src/components/SidePanel/data.tsx` | none | dead |
| `client/src/components/Chat/Input/ActiveSetting.tsx` | none (only an unrelated `setActiveSetting` state var in `Chat/Messages/Fork.tsx` matches the grep) | dead |
| `client/src/components/Chat/Input/Files/Table/TemplateTable.tsx` | exported from the `Table` barrel (`Table/index.ts:3`) but that named export is never imported anywhere; `MyFilesModal.tsx` imports `DataTable`/`columns` from the same barrel, not `TemplateTable` | dead |
| `client/src/components/Auth/SocialLoginRender.tsx` | rendered on the live login page | **live** |
| `client/src/components/SidePanel/Builder/Images.tsx` | `PanelSwitch.tsx` → `AssistantPanel.tsx` → `AssistantAvatar.tsx` → `Images.tsx` | **live** |

The dead components largely contain hardcoded mock data (`tempFile`, `tempVectorStore`, "0 KB hours", "Free until end of 2024", "June 11, 2023", "11 mb") and `console.log(...)` stub handlers instead of real logic — consistent with unfinished/superseded OpenAI-Assistants file & vector-store management scaffolding, distinct from the live file manager at `client/src/components/SidePanel/Files/` (`Panel.tsx`, `PanelTable.tsx`, etc., wired via `useSideNavLinks.ts:178`).

### Localization convention

- File: `client/src/locales/en/translation.json` (2157 lines, flat JSON).
- Key prefixes in use: `com_ui_` (1441 occurrences), `com_files_` (15 occurrences). No separate written convention doc beyond `CLAUDE.md`'s "Semantic key prefixes: `com_ui_`, `com_assistants_`, etc."
- Hook: `client/src/hooks/useLocalize.ts` wraps `react-i18next`'s `useTranslation().t`; exports `TranslationKeys = keyof typeof translationEn`. Always imported from the `~/hooks` barrel: `import { useLocalize } from '~/hooks';`, called as `const localize = useLocalize();`.
- Confirmed JSX idioms (with file:line examples):
  - Label+icon row: `client/src/components/Prompts/display/PromptDetailHeader.tsx:49-67`, `client/src/components/Skills/display/SkillDetailHeader.tsx:67-85` — `<span className="flex items-center gap-1"><Icon className="h-3 w-3" aria-hidden="true" />{localize('com_ui_usage')}</span>`.
  - Table cell: `client/src/components/Chat/Input/Files/Table/Columns.tsx:73-105,195-219` — `<div className="flex flex-wrap items-center gap-2"><Icon className="icon-sm ..." aria-hidden="true" />{localize('com_ui_host')}</div>`; this file calls `useLocalize()` inside each `header`/`cell` callback (not hoisted), guarded by `/* eslint-disable react-hooks/rules-of-hooks */` at the top of the file, since these callbacks are passed into `ColumnDef`, not rendered as components.
  - "Label: value" row: `{localize('com_ui_invoked_by')}:{' '}{localize(enumMap[value])}`.
  - Dynamic interpolation: `localize('com_ui_by_author', { 0: group.authorName })` with matching JSON `"com_ui_by_author": "by {{0}}"`.
  - Enum-to-key maps are typed `Record<Enum, TranslationKeys>` for type safety.

### Unused-vars / exhaustive-deps — bug vs. dead-code verdicts

All file:line references below are pre-fix (current HEAD `90bf5dd5`).

| Finding | Verdict |
|---|---|
| `Auth/VerifyEmail.tsx:39` unused `error` arg on `onError` | no-op; nothing reads it |
| `Auth/VerifyEmail.tsx:77` missing `localize` dep | **used inside the effect** (lines 70, 72) — add to deps array |
| `hooks/Endpoint/useSelectorEffects.ts:123` missing `debouncedSetSelectedValues` dep | `debouncedSetSelectedValues` (defined lines 77-85) is a **plain closure, recreated every render**, not wrapped in `useCallback`. Adding it to the deps array as-is would make the effect re-run every render (defeating the debounce). Correct fix: wrap it in `useCallback(() => {...}, [setSelectedValues])` (the only external value it closes over besides the stable `debounceTimeoutRef`), then add it to the deps array — preserves current behavior while satisfying the rule. |
| `Files/FileList/FilePreview.tsx:41-44` unused `setFile`/`setThreads`/`setVectorStoresAttached`/`params` | dead component (no importers); all four unused, no-op |
| `Files/VectorStore/VectorStorePreview.tsx:95-98` unused `setVectorStore`/`setFilesAttached`/`setAssistants`/`params` | dead component; no-op (note: `open`/`setOpen` in the same destructure IS wired — not part of this finding) |
| `Files/FilesSectionSelector.tsx:1` unused `useState` import | no `useState()` call exists in file; no-op. (Note: `selectedPage` used later in the file is a plain `let`, reassigned per-render from `useLocation()`, not React state — unrelated to this import.) |
| `Files/FileList/UploadFileModal.tsx:7-10` unused `localize`/`file`/`handleFileChange` | dead component; no `<input type="file">` exists to wire `handleFileChange` to. `localize` should end up used once the file's 9 i18n errors are fixed via `localize()` calls (same file) — fixing the i18n errors resolves this warning too. `file`/`setFile`/`handleFileChange` remain genuinely disconnected; safe to remove. |
| `SidePanel/Builder/Retrieval.tsx:33` unused `vectorStores` (useMemo) | no-op; parallel `isDisabled` memo is the one actually wired to JSX |
| `Skills/forms/CreateSkillForm.tsx:13`, `Skills/forms/SkillForm.tsx:15` unused `InvocationModePicker` import | deliberate: `invocationMode` is carried in form state with explicit code comments ("ignored for now, backend doesn't persist it yet"/"Phase 1... UI state only") but the picker JSX was never added. Removing the import is a no-op for rendered output. |
| `data-provider/__tests__/connection.test.ts:3` unused `dataService` | module is separately mocked via `jest.mock` factory; no-op |
| `hooks/useChatBadges.ts:4` unused `MessageCircleDashed` | the only badge config referencing it is commented out; hook returns `[]` regardless; no-op |
| `utils/agents.tsx:93` unused `placeholderSizeClasses` | parallel to `sizeClasses`/`iconSizeClasses` but never applied in the no-avatar fallback branch; no-op |
| `utils/json.ts:4,13` unused caught `e` (×2) | both catches swallow-and-fallback with no logging; no-op, use optional catch binding |
| `utils/presets.ts:4,8,13` unused `TEndpoints` type, `endpoint`, `chatGptLabel` | none referenced elsewhere in `getPresetTitle`/`removeUnavailableTools`; no-op |
| `Files/FileList/FileList.tsx:4` unused `FileListItem` import | only reference is a commented-out JSX line; live render uses `FileListItem2` instead; no-op |
| `Files/FileList/FileListItem.tsx:11` unused `width` prop | commented-out caller once passed `width="100%"`, but the component body never consumed it (fixed `w-100` class instead); component itself is dead; no-op |
| `Chat/Messages/Content/WrenchIcon.tsx:4` unused `rotate` value | `setRotate` **is** actively called (setInterval every 2s) but the boolean it produces is never read — the SVG's rotation comes from a static class/inline style instead. Safe minimal fix: destructure as `const [, setRotate] = useState(false);` (skip the unused first slot) rather than touching the SVG's transform/animation. |

## Code References

- `client/src/hooks/Endpoint/useSelectorEffects.ts:75-129` — debounce ref + unmemoized `debouncedSetSelectedValues` + effect with incomplete deps array
- `client/src/components/Auth/VerifyEmail.tsx:61-77` — effect using `localize` without listing it as a dep
- `client/src/components/Prompts/display/PromptDetailHeader.tsx:49-67` — reference i18n label+icon pattern
- `client/src/components/Chat/Input/Files/Table/Columns.tsx:73-105,195-219` — reference i18n table-cell pattern, `useLocalize()` called per-cell with rules-of-hooks disabled
- `client/src/hooks/useLocalize.ts` — hook definition, `TranslationKeys` type
- `client/src/locales/en/translation.json` — target file for new keys
- `client/src/hooks/Nav/useSideNavLinks.ts:178` — the actual (different, live) file-manager entry point, for contrast with the dead `components/Files/**` family

## Architecture Documentation

No new architectural pattern beyond what's cited above — this is a straightforward application of the existing `useLocalize()`/`translation.json` convention plus standard React unused-binding/dependency-array cleanup.

## Workflow Closure Map

Not applicable. This research covers static-text localization and unused-binding cleanup in existing UI code — there is no input→effect→observable-result production behavior being added or changed (per the research skill's own gate: "a purely structural 'where/what is X' research... has no chain to map"). No `ClosureMap` block or closure adapter is emitted.

## Historical Context (from thoughts/)

None found specific to this lint-cleanup work; no prior thoughts/ documents reference the Files/VectorStore component family or this ESLint finding set.

## Related Research

None yet — this is the first research pass for AF-5qx7's client partition. AF-f490 (import-order baseline) was resolved separately without a research doc (purely mechanical autofixer task, per the session's own scoping note).

## Open Questions

- Whether the dead `client/src/components/Files/**` + `Files/VectorStore/**` + `SidePanel/data.tsx` + `Chat/Input/ActiveSetting.tsx` + `Chat/Input/Files/Table/TemplateTable.tsx` component family (24+ files) should eventually be deleted outright is **out of scope for AF-5qx7** (which asks only that lint findings be "fixed at source," not that dead code be removed) and is not decided here. Flagged separately as a discovered-work candidate rather than acted on.

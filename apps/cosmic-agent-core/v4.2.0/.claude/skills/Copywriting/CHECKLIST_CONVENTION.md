# Checklist Convention v2

**Status:** Authoritative · **Schema Version:** 2 · **Last updated:** 2026-04-15

Defines how copy-platform checklists are stored on disk, verified, and
automatically loaded into context. Binds three components:

- **Marketing skill** — the producer. Runs the 4-phase Q&A flow, emits 18 expanded sections, and writes them to disk at `<EXPANSION_COMPLETE>`.
- **Copywriting skill** — the consumer. Reads the on-disk artifact to produce sales copy (emails, ads, landing pages, stories).
- **Marketing hooks** — `ChecklistEnforcer.hook.ts` (Stop) and `ChecklistStateInjector.hook.ts` (UserPromptSubmit). They persist state, verify artifacts, and auto-inject loaded checklists into context.

> **Principle.** Foundational content comes from the user via Q&A. The LLM never generates foundational information. This convention exists to persist the Q&A output deterministically and reload it without narration.

---

## 1. Path — three-tier

```
{project-root}/copyplatforms/{client}/{product}/{version}/NN-*.md
```

Example:

```
~/work/acme-corp/copyplatforms/acme/saas-onboarding/v1/01-usp.md
~/work/acme-corp/copyplatforms/acme/saas-onboarding/v1/02-claims-proof.md
...
~/work/acme-corp/copyplatforms/acme/saas-onboarding/v2/01-usp.md   # newer version
```

The three tiers are:

1. **client** — the business whose marketing is being built.
2. **product** — the specific offer, product, service, or campaign within that client.
3. **version** — a snapshot of the checklist at a point in time.

---

## 2. Project-root resolution

Walk ancestors from `$PWD`:

1. Return the first ancestor containing a `.git` directory.
2. Else return the first ancestor containing a `CLAUDE.md` file.
3. Else **RETURN ERROR.** Do NOT fall back to `$PWD` for writes.

This strict rule prevents accidental creation of `copyplatforms/` inside `$HOME`, `/tmp`, or any other directory that wasn't explicitly marked as a project.

### Error handling

Hooks that encounter this error inject a `<system-reminder>`:

```
=== MARKETING PROJECT-ROOT ERROR ===
Cannot determine project root for this session.
Mark this directory as a project by creating an empty `CLAUDE.md`
or running `git init`. Then re-invoke the Marketing skill.
=====================================
```

The Marketing skill's Step 0.5 refuses to proceed until a valid root is resolved.

---

## 3. Project-sentinel

On first-ever artifact creation for a project, the producer writes an empty file at:

```
{project-root}/copyplatforms/.project-sentinel
```

The auto-inject hook (UserPromptSubmit) REQUIRES this sentinel to exist before running `discoverChecklists()`. This prevents false-positive injection if a stray `copyplatforms/` directory happens to exist (e.g., copied from elsewhere).

Removing the sentinel disables auto-inject for that project while preserving the stored checklists.

---

## 4. Slug rules

All slugs are normalized via the shared `normalizeSlug(raw)` helper in `v4.2.0/.claude/hooks/types.ts` before storage. Whatever the user types is canonicalized to kebab-case.

### `normalizeSlug` contract

```typescript
function normalizeSlug(raw: string):
  | { ok: true; slug: string }
  | { ok: false; reason: string }
```

Behavior:

- Lowercase.
- Replace any run of non-`[a-z0-9-]` characters with a single `-`.
- Trim leading/trailing `-`.
- Collapse runs of `-` to one.
- Reject if resulting slug < 2 chars (`reason: "slug too short (min 2 chars)"`).
- Reject if resulting slug > 40 chars (`reason: "slug too long (max 40 chars)"`).
- Reject if result fails `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` (`reason: "slug must start and end with alphanumeric"`).

Examples:

| Input | Output |
|---|---|
| `"Acme Corp"` | `{ok: true, slug: "acme-corp"}` |
| `"My Client's Site!"` | `{ok: true, slug: "my-client-s-site"}` |
| `"a"` | `{ok: false, reason: "slug too short (min 2 chars)"}` |
| `"---"` | `{ok: false, reason: "slug too short (min 2 chars)"}` (trim → empty) |
| `"a".repeat(50)` | `{ok: false, reason: "slug too long (max 40 chars)"}` |

### client

- Matches `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`.
- 2-40 characters.
- Captured during Marketing Understanding phase (new Step 0.5).
- Stored in state as `client`.
- Reserved values: `default` (used by legacy migration when no topicSlug was present).

### product

- Same rules as `client`.
- Captured during Marketing Understanding phase — derived from U1 ("What product or service are you marketing?").
- Stored in state as `product`.

### version

- **Type contract:** `string` strictly matching `/^v\d+$/` — e.g. `"v1"`, `"v2"`, ..., `"v42"`.
- Never stored as a bare integer; always the `v`-prefixed string.
- Monotonically numbered per `(client, product)`: new runs allocate `v{N+1}` where `N` is the highest existing integer.
- Allocated atomically via `allocateVersion(client, product)` (see §5).
- Stored in state as `version`.
- No symlinks. "Latest" is resolved at read time by sorting `version.slice(1)` as integers (so `v10 > v9`, not lex-sorted).

---

## 5. Version allocation (atomic)

Concurrent Marketing sessions targeting the same `(client, product)` could race on version allocation. The allocator resolves this deterministically via `fs.open(path, "wx")`, which fails with `EEXIST` if the file already exists.

```typescript
async function allocateVersion(client: string, product: string): Promise<VersionString> {
  const parentDir = path.join(STATE_ROOT, client, product);
  await fs.mkdir(parentDir, { recursive: true });
  const existing = (await fs.readdir(parentDir).catch(() => []))
    .filter(f => /^v\d+\.json$/.test(f))
    .map(f => f.replace(/\.json$/, "") as VersionString);
  let candidate = nextVersion(existing);
  for (let i = 0; i < 10; i++) {
    try {
      const fh = await fs.open(stateFilePath(client, product, candidate), "wx");
      await fh.close();
      return candidate;
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
      const n = parseInt(candidate.slice(1), 10);
      candidate = `v${n + 1}` as VersionString;
    }
  }
  throw new Error("allocateVersion: exhausted 10 retries");
}
```

**Guarantees:** even with N concurrent callers, each call returns a unique `VersionString`, and the returned state file is open for exclusive write by that caller.

---

## 6. Concurrency — single-writer-per-(c,p,v)

Each state file `marketing-checklists/{client}/{product}/{version}.json` has at most one writer session at a time. Enforced by a lock file `{version}.lock` sibling to the state file.

### Lock semantics

- A session acquires the lock by creating `{version}.lock` with `fs.open(..., "wx")`. The lock file contains the session's start timestamp.
- The session refreshes the lock's `mtime` on every state write.
- The session removes the lock when `active` is set to `false` (Implement phase end).
- If a resuming session finds an existing lock file whose `mtime` is within the last **30 minutes**, it refuses resume with: *"Another Marketing session appears active on this (client, product, version). Wait or remove the lock file manually."*
- Stale locks (`mtime` older than 30 minutes) may be overridden silently — the prior session is presumed dead.

### Out of scope

Concurrent sessions on DIFFERENT `(c, p, v)` triples are fully supported. No cross-triple coordination.

---

## 7. State files — per (client, product, version)

```
~/.claude/MEMORY/STATE/marketing-checklists/{client}/{product}/{version}.json
~/.claude/MEMORY/STATE/marketing-checklists/index.json
```

### `index.json` shape

```json
{
  "schemaVersion": 2,
  "active": [
    { "client": "acme",    "product": "saas-onboarding", "version": "v1" },
    { "client": "acme",    "product": "saas-onboarding", "version": "v2" },
    { "client": "beta-co", "product": "landing",         "version": "v1" }
  ],
  "lastActive": { "client": "acme", "product": "saas-onboarding", "version": "v2" }
}
```

### `index.json` lifecycle

- Updated by `writeIndex()` on every state-file mutation.
- `writeIndex` filters out entries whose state file no longer exists (garbage collection — prevents stale references after manual deletion).
- `lastActive` reflects the most recently written `(c, p, v)` triple. Used by `ChecklistStateInjector` to pick a default when no other signal exists.

---

## 8. File scheme — 18 files per version

The 18 expanded-section files mirror the filenames in `v4.2.0/.claude/skills/Marketing/CopyPlatformSections/`:

```
01-usp.md                    10-headlines.md
02-claims-proof.md           11-big-four.md
03-target-audience.md        12-pain-list.md
04-mechanism.md              13-vision-list.md
05-why-cubed.md              14-usp-iteration-1.md
06-appeal.md                 15-usp-iteration-2.md
07-features-benefits.md      16-usp-iteration-3.md
08-promise.md                17-usp-iteration-4.md
09-hook.md                   18-usp-iteration-5.md
```

Each file contains the **expanded content** for that section — the output of the Marketing skill's Phase 3 (Expand) applied to the user's Q&A answers. Plain markdown. No frontmatter is required, but future extensions may add a frontmatter block (ignored by current readers).

The exact filename list is a constant (`EXPECTED_FILENAMES`) exported by `v4.2.0/.claude/hooks/types.ts`.

---

## 9. Producer contract — Marketing skill

### Step 0.5 — identity capture (before Understanding phase)

Before asking U1-U8, the Marketing skill must:

1. Ask the user: *"Who is the client this marketing is for? Use a short kebab-case slug — e.g. `acme-corp` — or type `default` for your own marketing."*
2. Normalize the answer via `normalizeSlug()`. If invalid, present the `reason` back to the user and re-ask. Do NOT proceed with an invalid slug.
3. Proceed into U1 ("What product or service are you marketing?"). Derive `product` from the answer, normalize the same way.
4. Resolve project-root (STRICT). If `null`, abort and instruct the user to create a `.git` or `CLAUDE.md` marker.
5. Allocate `version` via `allocateVersion(client, product)` — atomic.
6. Initialize the state file with schema v2: `handoffWriteInProgress: false`, `migratedFromLegacy: false`, `expandedSections: []`, `active: true`.

This step MUST complete before any `<SECTION_CONTENT##>` markers are emitted.

### On every Stop event during the run

- Hooks update the per-`(c, p, v)` state file under the single-writer lock.
- Hook detects transition markers (`<UNDERSTANDING_COMPLETE>`, etc.) and advances phases.

### On `<EXPANSION_COMPLETE>`

Atomic write sequence:

1. Set `handoffWriteInProgress: true` in state (persist immediately).
2. Resolve project-root (STRICT). If `null`, abort — produce `handoffVerifyError` with synthetic reason.
3. Create staging directory `{root}/copyplatforms/{client}/{product}/{version}.tmp/`.
4. If a stale `.tmp` directory exists from a prior crashed run, remove it first.
5. Write 18 numbered markdown files to the staging directory from `state.expandedSections[]`.
6. `fs.rename(staging, finalDir)` — atomic on POSIX same-filesystem.
7. Write/refresh `{root}/copyplatforms/.project-sentinel` (empty file).
8. Run the verify pass on the final path (see §10).
9. Set `handoffWriteInProgress: false`.
10. On verify success: set `handoffVerifiedAt: <ISO-8601>`, `handoffVerifyError: null`.
11. On verify failure: leave `handoffPath` non-null (files exist but invalid), set `handoffVerifyError: { ... }`, clear `handoffVerifiedAt: null`.

### Stale-staging cleanup

On any Stop event, the hook scans for `copyplatforms/*/*/v*.tmp/` directories. For each found directory, if the corresponding state file has `handoffWriteInProgress: false` OR no corresponding state file exists, the directory is removed. Prevents buildup from crashed sessions.

### Handoff message

After a successful verify, the skill tells the user:

> *"Your copy platform is complete and verified at `{handoffPath}`. To write actual copy pieces, cd to a directory inside your project and run the copywriting skill."*

---

## 10. Post-persist verify contract

Runs inline inside `ChecklistEnforcer.hook.ts` immediately after the atomic rename in §9 step 6. Never throws; never blocks the Stop event.

### Checks

1. All 18 expected filenames (`EXPECTED_FILENAMES`) exist in the target directory.
2. Each file is non-empty (`stat.size > 0`).
3. No unexpected files were written — the directory contains exactly the 18 expected names.

### Outputs

```typescript
type VerifyResult =
  | { ok: true; verifiedAt: string }
  | { ok: false; error: VerifyError };

interface VerifyError {
  expected: string[];
  actual: string[];
  missing: string[];
  empty: string[];
  unexpected: string[];
}
```

### Self-healing — auto-re-verify

On EVERY `UserPromptSubmit` event, if `state.handoffVerifyError !== null` AND `state.handoffPath` exists on disk, the injector hook re-runs `verifyHandoffArtifact(state.handoffPath)` before constructing any injection.

- If re-verify now passes: clear `handoffVerifyError` to `null`, set `handoffVerifiedAt`. No injection about the fix — silent heal.
- If re-verify still fails: refresh `handoffVerifyError` with the current filesystem state. Inject the failure block below.

The re-verify runs 18 `fs.stat` calls — sub-millisecond cost. Skipped entirely when `handoffVerifyError === null`.

### Failure injection

```
=== HANDOFF VERIFY FAILED ===
The copy-platform artifact at {handoffPath} failed verification. Details:
  missing:    <filename>, <filename>, ... (or "(none)")
  empty:      <filename>, ...             (or "(none)")
  unexpected: <filename>, ...             (or "(none)")

Recovery options:
  1. Fix the files manually and send any message — the hook will
     auto-re-verify and silently clear this error on success.
  2. Rerun the Expand phase to regenerate the artifact.
  3. Start fresh for a new version with the Marketing skill.
=============================
```

---

## 11. Consumer contract — Copywriting skill

Every Copywriting workflow entry and every template's binding preamble MUST resolve the checklist before using any framework content:

1. Resolve project-root.
2. Scan `{root}/copyplatforms/*/*/*/` for `(client, product, version)` triples.
3. Zero triples → STOP. Inject a pointer: *"No copy platform found. Run the Marketing skill first to build one via Q&A."*
4. Exactly one `(c, p, v)` → use it.
5. Multiple → disambiguate via `AskUserQuestion` with client/product/version choices.
6. Highest version is the default when only version is ambiguous.
7. Load required section files per the template's `consumes_sections` frontmatter. If any required file is missing or empty → STOP and point to the Marketing skill.
8. Never synthesize content to fill gaps.

---

## 12. Auto-inject contract — UserPromptSubmit hook

`ChecklistStateInjector.hook.ts` has two branches:

- **Branch A** — active Marketing run. Injects phase constraints, unanswered questions, transition proposals, verify-failure blocks, migration notices.
- **Branch B** — passive marketing-intent injection. Silently loads the filled checklist into the LLM's context when the user says "create marketing" etc. in a project with a usable checklist.

### Mutual exclusion

**Branch A and Branch B are mutually exclusive.** When `state.active === true`, only Branch A fires. The active run owns the session; passive injection does not duplicate context.

### Branch B short-circuit gates (strict order)

Branch B is suppressed when any of the following is true:

1. `process.env.MARKETING_AUTOINJECT_DISABLED === "1"` — kill switch for debugging or opt-out.
2. Any Marketing state has `active === true` — covered by the mutual exclusion above.
3. `matchesMarketingIntent(prompt) === false` — the prompt does not carry marketing intent.
4. `resolveProjectRoot()` returned `null` — rootless directory.
5. No `.project-sentinel` file at `{root}/copyplatforms/.project-sentinel`.
6. `discoverChecklists(root)` returns zero triples.

When all six gates pass, the hook proceeds to smart-match + injection.

### `matchesMarketingIntent` — two-tier trigger list

**STRONG triggers** — unambiguous marketing intent, fire on their own:

- `/\bcreate marketing\b/i`, `/\bbuild marketing\b/i`, `/\bmake marketing\b/i`, `/\bdo marketing\b/i`, `/\bplan marketing\b/i`
- `/\bmarketing for\b/i`, `/\bmarketing campaign\b/i`, `/\bmarketing plan\b/i`, `/\bmarketing checklist\b/i`
- `/\bmarketing platform\b/i`, `/\bmarketing foundation\b/i`
- `/\bcopy platform\b/i`, `/\bbuild a copy platform\b/i`, `/\bpersuasion checklist\b/i`

**WEAK triggers** — ambiguous terms that also appear in unrelated contexts. Fire ONLY when combined with an anchor word:

- `/\bICP\b/`, `/\bbrand discovery\b/i`, `/\bcampaign promise\b/i`
- `/\bone belief statement\b/i`, `/\bobjection framework\b/i`
- `/\bmarketing research\b/i`, `/\bcustomer research\b/i`

**Anchors** (required alongside a WEAK trigger): `/\bmarketing\b/i`, `/\bcopywriting\b/i`, `/\bcopy\b/i`, `/\boffer\b/i`, `/\bproduct\b/i`, `/\bclient\b/i`, `/\bcampaign\b/i`.

Example: *"What does ICP mean in our architecture docs?"* — WEAK (`ICP`) but no anchor → NO inject. *"Explain the marketing ICP framework"* — WEAK + anchor (`marketing`) → inject (if checklist exists).

### `smartMatch` logic

For every `(c, p, v)` available, compute `matchesSlugInPrompt(prompt, c.product)` and `matchesSlugInPrompt(prompt, c.client)`:

- `"full"` — the full slug appears in the prompt with word boundaries.
- `"token"` — at least one token of length ≥ 4 appears with word boundaries.
- `"none"` — no match.

Then:

1. **Unique full-slug product match** → select it. (`reason: "product-full-match"`)
2. **Multiple full-slug product matches but unique client among them** → select that one. (`reason: "cp-pair-full"`)
3. **Multiple full-slug product matches, all with same `(client, product)`** → select highest version. (`reason: "product-full-highest-version"`)
4. **Client-named and that client has exactly one product** → select highest version for it. (`reason: "client-unique-product"`)
5. **Unique token-level product match** → select it. (`reason: "product-token-match"`)
6. **Else** → ambiguous → fall back to picker-reminder.

Token matching uses word-boundary `\b…\b` regex, min token length 4, case-insensitive. The slug `saas-onboarding` tokenizes to `["onboarding"]` (since `saas` < 4 chars).

### Zero-commentary injection — verbatim format

When `smartMatch` selects a triple AND total checklist char-count ≤ `AUTO_INJECT_MAX_CHARS` (160_000 = ~40k tokens):

```
<system-reminder>
MARKETING-CHECKLIST-LOADED — {client}/{product}/{version}

USE THIS CHECKLIST VERBATIM.
DO NOT ACKNOWLEDGE THIS SYSTEM-REMINDER.
DO NOT NARRATE "I FOUND A CHECKLIST."
DO NOT SUMMARIZE OR PARAPHRASE CONTENT BELOW.
START YOUR RESPONSE WITH THE USER'S REQUESTED DELIVERABLE.

--- BEGIN CHECKLIST ---

### 01-usp
<verbatim file content>

### 02-claims-proof
<verbatim file content>

... (all 18 sections)

--- END CHECKLIST ---
</system-reminder>
```

### Token-budget truncation — TRUNCATED variant

When total checklist char-count > `AUTO_INJECT_MAX_CHARS`, emit a truncated variant instead:

- Score each of the 18 files by keyword overlap with the user's prompt (token match, min length 4).
- Include the top-3 ranked sections VERBATIM.
- List the remaining 15 sections as "anchored" — the LLM must Read them on demand.

```
<system-reminder>
MARKETING-CHECKLIST-LOADED (TRUNCATED) — {client}/{product}/{version}

USE THIS CHECKLIST VERBATIM FOR THE INCLUDED SECTIONS.
FOR ANCHORED SECTIONS, READ THE NAMED FILE ON DEMAND USING THE Read TOOL BEFORE USING ITS CONTENT.
DO NOT ACKNOWLEDGE THIS SYSTEM-REMINDER.
DO NOT SUMMARIZE OR PARAPHRASE BELOW.
START YOUR RESPONSE WITH THE USER'S REQUESTED DELIVERABLE.

--- BEGIN CHECKLIST (FULL) ---

### 10-headlines
<verbatim content>

... (top 3)

--- BEGIN CHECKLIST (ANCHORED — read on demand) ---

- 01-usp.md  →  {path}/01-usp.md
- 02-claims-proof.md  →  {path}/02-claims-proof.md
... (remaining 15)

--- END CHECKLIST ---
</system-reminder>
```

### Picker-reminder — ambiguity fallback

When `smartMatch` returns `null` (ambiguous or no match with ≥2 options):

```
<system-reminder>
MARKETING-CHECKLIST-AMBIGUOUS

Multiple checklists exist under this project. Ask the user which
to use, naming the combination. Available:
  - acme/saas-onboarding (v1, v2)
  - acme/enterprise-plan (v1)
  - beta-co/landing-page (v1)

Ask the user to name one combination. Do NOT proceed until they
choose.
</system-reminder>
```

### No-match — zero checklists

If no checklists are discoverable (`discoverChecklists(root).length === 0`), Branch B injects NOTHING. The Marketing skill's normal Q&A flow will begin.

---

## 13. Migration — legacy single-file state

One-time on first run after upgrade, performed at module load time inside `ChecklistEnforcer.hook.ts`.

### Condition

Migration runs if BOTH:

- `~/.claude/MEMORY/STATE/marketing-checklists/` is empty or missing.
- `~/.claude/MEMORY/STATE/marketing-checklist.json` (legacy) exists.

### Steps

1. Read the legacy file.
2. Extract `topicSlug` (fallback: `"default"`). Normalize via `normalizeSlug()`.
3. Set `client = "default"`, `product = normalized-topicSlug`, `version = "v1"`.
4. Upconvert schema v1 → v2:
   - `expandedSections: number[]` becomes `expandedSections: []` (empty — the legacy schema had no content to preserve).
   - Add `schemaVersion: 2`, `handoffPath: null`, `handoffVerifiedAt: null`, `handoffVerifyError: null`, `handoffWriteInProgress: false`, `migratedFromLegacy: true`.
5. Write to `marketing-checklists/default/{product}/v1.json`.
6. Rename legacy to `marketing-checklist.json.migrated`.
7. Create `index.json` with one entry.

### Post-migration notice

On the first `UserPromptSubmit` after migration, if `state.migratedFromLegacy === true` AND `state.handoffPath === null`, the injector emits a one-time system-reminder:

```
=== MIGRATION NOTICE ===
Your prior Marketing run was migrated to the new schema.
Content was not preserved because the old schema didn't store it.
Rerun Expand to produce the artifact, or start fresh for a new offer.
========================
```

After this injection, the hook clears `migratedFromLegacy` to `false` so the notice appears exactly once.

### Idempotency

Migration is idempotent. Re-running it is a no-op — once `marketing-checklists/` has any content, migration exits immediately.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **Checklist** | The 18 markdown files under a `(client, product, version)` directory — the output of the Marketing skill's Expand phase. |
| **State file** | The JSON at `marketing-checklists/{c}/{p}/{v}.json` tracking the Marketing workflow's phase/progress for one offer. |
| **Artifact** | The 18 markdown files on disk. Distinct from state. |
| **Producer** | The Marketing skill + `ChecklistEnforcer` — together they write the state and artifact. |
| **Consumer** | The Copywriting skill. Reads the artifact, never writes. |
| **Project-root** | The deepest ancestor of `$PWD` containing `.git` or `CLAUDE.md`. |
| **Project-sentinel** | `{root}/copyplatforms/.project-sentinel` — empty file marking the `copyplatforms/` tree as a deliberate checklist root. |
| **Triple** | A `(client, product, version)` tuple. |

---

## 15. References

- Canonical types and helpers: `v4.2.0/.claude/hooks/types.ts`
- Producer hook: `v4.2.0/.claude/hooks/ChecklistEnforcer.hook.ts`
- Auto-inject hook: `v4.2.0/.claude/hooks/ChecklistStateInjector.hook.ts`
- Marketing skill: `v4.2.0/.claude/skills/Marketing/`
- Copywriting pack: `Packs/Copywriting/`
- Framework files (filenames mirrored here): `v4.2.0/.claude/skills/Marketing/CopyPlatformSections/`
- Implementation plan: `thoughts/searchable/shared/plans/2026-04-15-checklist-persistence-verify-autoinject.md`

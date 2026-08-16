---
description: "Compose a reel from a natural-language brief via A_REEL_COMPOSE (video-pipeline v1 P4 — full pipeline: compose → preview → accept|revise|stop loop → render)"
---

# /compose_reel

Invoke the video-pipeline compose pipeline with a natural-language brief.
Compose returns a ComposedPlan JSON path and a Markdown summary; the
clarification loop runs up to 3 rounds when the semantic seed match is weak.
On a successful plan the markdown surfaces the preview file and enters the
accept/revise/stop loop — the user can render the final MP4, revise the plan
(swap a clip, regenerate intro/outro art, or supply their own image), or stop.

## Step 1 — get the brief and resolve `<repo_root>` + `<project_root>`

If `$ARGUMENTS` is empty or whitespace, call `AskUserQuestion` for the brief.
**Do NOT pre-populate any option label with an example brief.** Use a single
"Other (describe below)"-style free-text option and use whatever the operator
types as `<brief>`. Otherwise, use `$ARGUMENTS` verbatim as `<brief>`.

Initialize `<round>` to `1`.

Resolve TWO distinct paths ONCE here and reuse them in every subsequent bash
invocation in this command (Steps 2, 4.A, 4.B.\*, 4.C):

- `<repo_root>` — where the bun source code lives (`composeSlashBridge.ts`,
  `kasten-cli.ts`, shipped store + transcripts under `apps/video-pipeline/data/`).
  Same on every host of the same deploy.
- `<project_root>` — the user WORKSPACE where `media/videos/` lives and where
  `media/reels/` + `out/composed-plans/` get written. Per-project; on a deploy
  host this is typically NOT the same directory as `<repo_root>`.

```bash
REPO_ROOT="$(readlink -f "$HOME/.cosmic-agent-memory" 2>/dev/null || git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "FATAL: cannot resolve repo root. Neither ~/.cosmic-agent-memory (deploy-managed symlink) nor 'git rev-parse --show-toplevel' (laptop dev) returned a path." >&2
  echo "       On a fleet host: confirm install-vps.sh ran successfully and created the symlink." >&2
  echo "       On a laptop:     either invoke from inside a git checkout, or 'ln -s ~/Dev/cosmic-agent-memory ~/.cosmic-agent-memory' to match the deploy convention." >&2
  exit 1
fi

PROJECT_ROOT="${COSMIC_PROJECT_ROOT:-$PWD}"
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$REPO_ROOT"
fi
```

Resolution order is deliberate:

**For `<repo_root>` (source code location):**
- **`~/.cosmic-agent-memory`** is the canonical registry written by
  `install-vps.sh` `ensure_repo()` (one-line `ln -sfn ${REPO_PARENT}`). On
  fleet hosts this resolves regardless of where the slash command was
  invoked from — fully CWD-independent.
- **`git rev-parse --show-toplevel`** is the laptop-dev fallback for
  operators working inside a live git checkout.
- **No `pwd` guess.** If neither resolves, the command fails loud with a
  remediation hint instead of silently producing a downstream `Module not
  found composeSlashBridge.ts` error chain.

**For `<project_root>` (user workspace):**
- **`$COSMIC_PROJECT_ROOT`** is the canonical env var. `cc-agent-ui` exports
  it from the session's resolved cwd (`sdk-options.js`), so on hosted/web
  sessions it always points at the user's project workspace.
- **`$PWD`** is the fallback — `cc-agent-ui` also sets the spawned claude's
  cwd to the workspace, so on hosts where the env var didn't reach this turn,
  the current working directory still resolves correctly.
- **`$REPO_ROOT`** is the last-resort fallback for single-machine laptop
  usage where media and source live together. NEVER use `$REPO_ROOT` as
  `<project_root>` on a fleet host — it will write reels to the deploy dir
  instead of the user workspace.

<!-- INITIAL_COMPOSE_BEGIN -->
## Step 2 — turn-1 intake, interpretation, and preflight

Turn 1 has no usable Claude session id. Do useful session-independent work
now and defer pipeline arming until the first user `go`.

Interpret `<brief>` directly. **No subprocess and no redundant compose call.**
Set these fields for the next turn:

- `brief` — the original `<brief>`.
- `duration_target_s` — requested reel duration in seconds; default `60`.
- `semantic_seed` — a 1-3 word subject phrase for hub discovery.
- `tone` — `instructional`, `conversational`, `dramatic`, or `reflective`.
- `walk_shape_hint` — `linear`, `branches`, or `mixed`.

Run this preflight via the Bash tool, reusing `$REPO_ROOT` and `$PROJECT_ROOT`
from Step 1:

```bash
STORE_NAME="${ZK_STORE_NAME:-default}"
CORPUS_ROOT="${COSMIC_MEDIA_SOURCE_ROOT:?Set COSMIC_MEDIA_SOURCE_ROOT to the source-video corpus}"
VIDEO_COUNT=0
for d in "$PROJECT_ROOT/media/videos" "$CORPUS_ROOT/media/videos"; do
  [ -d "$d" ] && VIDEO_COUNT=$(( VIDEO_COUNT + $(find "$d" -maxdepth 1 -name '*.mp4' 2>/dev/null | wc -l) ))
done

STORE_STATUS="$(bun "$REPO_ROOT/apps/video-pipeline/reel/kasten-cli.ts" hubs --store "$STORE_NAME")"
echo "preflight_store=$STORE_STATUS"

if [ "$VIDEO_COUNT" -gt 0 ]; then
  echo "preflight_media_videos=ok:$VIDEO_COUNT mp4 across project+corpus"
else
  echo "preflight_media_videos=missing: no .mp4 under $PROJECT_ROOT/media/videos or $CORPUS_ROOT/media/videos"
fi

echo "preflight_identity=$STORE_NAME"
```

Print a concise summary containing:

- interpretation: `duration_target_s`, `semantic_seed`, `tone`, `walk_shape_hint`
- preflight: store reachable, source-video count (project + corpus), and hub count
- next step: send `go` to arm the compose-reel pipeline for this session

**End your turn here.** Preserve the interpretation in the conversation. On
the user's first `go`, use the GO_ARM section below to seed that exact JSON
into the pipeline; do not re-interpret the brief there.
<!-- INITIAL_COMPOSE_END -->

<!-- GO_ARM_BEGIN -->
## Step 2.GO — arm compose-reel on the first `go`

When the user sends `go` after the turn-1 summary, the session env should now
provide `$COSMIC_SESSION_ID`. Run this via the Bash tool:

```bash
[ -z "$COSMIC_SESSION_ID" ] && { echo "session id not yet available — send go once more"; exit 1; }

PASSTHROUGH_JSON='{
  "text": "<brief>",
  "brief": "<brief>",
  "duration_target_s": <duration_target_s>,
  "semantic_seed": "<semantic_seed>",
  "tone": "<tone>",
  "walk_shape_hint": "<walk_shape_hint>"
}'

bun "$HOME/.claude/skills/InContextPipeline/Tools/arm.ts" \
  "compose-reel" \
  "$COSMIC_SESSION_ID" \
  "$PASSTHROUGH_JSON"
```

The JSON passthrough is the interpretation from turn 1 — it fully seeds what the
pipeline needs (`brief`, `duration_target_s`, `semantic_seed`, `tone`,
`walk_shape_hint`), so the armed pipeline starts directly at STEP_2 hub
discovery. There is no separate parse step: turn-1 already did that work.

After arming, tell the user:

> The compose-reel pipeline is armed (Mode A, 6 steps: STEP_2→STEP_7). Send
> `go` to advance to STEP_2 hub discovery.

**End your turn here.** The ICP runtime will drive subsequent `go` turns.
The legacy compose flow below is only for the revise menu after a plan exists.
<!-- GO_ARM_END -->

## Step 3 — branch on `descriptor.outcome`

- **`done`** — render `descriptor.display` (PV-6 has already injected the
  preview line OR a "Preview unavailable" sentinel). Then enter the
  **accept/revise/stop loop** — proceed to Step 4.
- **`preflight-fail`** — render `descriptor.display`; end the turn. The hint
  block lists the exact CLI to re-establish each missing prereq.
- **`need-brief`** — call `AskUserQuestion` for the brief (no pre-populated
  example text in any option label); set `<brief>` from the operator's
  free-text answer; go to Step 2 with `<round>` unchanged (still `1`).
- **`error`** — render `descriptor.display`; end the turn. (`descriptor.envelope`
  has `{code:"RUNNER_ERROR", category:"internal", message, retryable:false}`.)
- **`clarify`** — render `descriptor.display`; call `AskUserQuestion` with
  the three `descriptor.rephrased_briefs` as options (label = the rephrased
  brief itself, possibly truncated for chip width with the full text in the
  option description); set `<brief>` to the chosen rephrasing; re-invoke
  Step 2 with `<round> = descriptor.round + 1`.
- **`clarify-exhausted`** — render `descriptor.display`; end the turn.
- **`shim-error`** — render `descriptor.message` and `descriptor.stack`; end
  the turn. (This is a bug in the shim.)

## Clarify loop cap

Never re-invoke Step 2 with `<round> > 4`. The bridge emits
`clarify-exhausted` itself when called with `round > 3`. (This cap applies
only to the Step 2 → Step 3 clarification loop; the Step 4 accept/revise/stop
loop is unbounded — see "Loop cap — accept/revise/stop" below.)

## Step 4 — accept / revise / stop loop

Entered only when Step 3 lands on `done`. Initialize loop variables from the
descriptor:

- `<plan_path>` = `descriptor.plan_path`
- `<preview_path>` = `descriptor.preview_path` (may be unset — that's OK;
  accept still works per PV-7's accept-without-preview lock)
- `<repo_root>` = `$REPO_ROOT` (already resolved in Step 1 — do NOT re-run `git rev-parse` here; tarball deploys have no `.git`)
- `<project_root>` = `$PROJECT_ROOT` (already resolved in Step 1 — the user workspace where media lives, NOT the source-code repo)
- `<store_name>` = `$ZK_STORE_NAME` when nonempty, otherwise `default`
- `<corpus_root>` = `$COSMIC_MEDIA_SOURCE_ROOT` (required)
- `<transcript_dir>` = `<repo_root>/apps/video-pipeline/data/transcripts-metadata`

> **Why these defaults?** The CLI shim's `--mode revise-navigation` (and the
> deprecated `--mode revise-alternatives`) plus `--mode revise` need a store
> handle and (for `--mode revise`) a transcripts dir to reach the same
> card-graph + metadata the compose run used. These are the canonical project
> paths under `<repo_root>`; the shim does not derive them. If a future
> deployment relocates them, override here.

Call `AskUserQuestion`:

```
<ask-user-question>
  intro: Plan ready. Preview file path is in the block above. Open it (QuickTime / VLC) before deciding.
  prompt: How do you want to proceed?
  mode: single
  option: Accept and render — produces the final 1080p MP4 from this plan
  option: Revise — swap a clip, regenerate intro/outro art, or use your own image
  option: Stop — keep the plan and preview as-is, no full render
  continue_label: Continue
</ask-user-question>
```

Branch on the user's choice: Step 4.A (Accept), Step 4.B (Revise), or Step 4.C (Stop).

### Step 4.A — Accept

Run via the Bash tool:

```bash
bun "<repo_root>/apps/video-pipeline/reel/lib/composeSlashBridge.ts" \
  --mode accept \
  --plan-path "<plan_path>" \
  --preview-path "<preview_path>" \
  --project-root "<project_root>"
```

If `<preview_path>` is unset, **omit** the `--preview-path` flag entirely.
The bridge tolerates accept-without-preview per PV-7 — the resulting `rendered`
descriptor will say "Rendered without preview review" instead of "Preview was:".

Parse stdout JSON. Branch on `descriptor.outcome`:

- **`rendered`** → render `descriptor.display` verbatim (handler already
  formatted the full Markdown block including duration and the
  "Preview was:" / "Rendered without preview review" line per PV-7), then
  append a single line:

  ```
  ▶ Open in QuickTime / VLC: `<descriptor.reel_path>`
  ```

  End the turn. **Do NOT re-open Step 4.** (SP-4)
- **`render-failed`** → render `descriptor.display`. End the turn.
- **`error`** → render `descriptor.display`. End the turn.
- **`shim-error`** → render `descriptor.message` + `descriptor.stack`. End the turn.

### Step 4.B — Revise (agent drives the menu via AskUserQuestion)

**You (the agent) own every menu.** The CLI shim cannot prompt — empirical
fact: a `bun` subprocess spawned via the Bash tool has no channel to
`AskUserQuestion` (probe 2026-05-25). Drive each step with `AskUserQuestion`,
then call the shim with the resolved values.

#### Step 4.B.1 — pick the op

Call `AskUserQuestion`:

```
<ask-user-question>
  intro: Revise the plan. Pick an operation.
  prompt: Which revise op?
  mode: single
  option: Swap a clip — pick a different card for one of the current clips
  option: Regenerate intro art — re-roll the title-card image
  option: Regenerate outro art — re-roll the outro image
  option: Swap intro to your image — use a PNG you supply
  option: Swap outro to your image — use a PNG you supply
  option: Cancel — back to accept/revise/stop
  continue_label: Continue
</ask-user-question>
```

- **Cancel** → re-open Step 4 (re-issue the accept/revise/stop AskUserQuestion).
  **No shim call. No write.** (SP-6)
- **Swap a clip** → Step 4.B.2-swap.
- **Regenerate intro art** → Step 4.B.2-regen with `<slot>` = `intro`.
- **Regenerate outro art** → Step 4.B.2-regen with `<slot>` = `outro`.
- **Swap intro to your image** → Step 4.B.2-swapart with `<slot>` = `intro`.
- **Swap outro to your image** → Step 4.B.2-swapart with `<slot>` = `outro`.

#### Step 4.B.2-swap (swap-clip)

1. **Get the clip list.** Run via the Bash tool:

   ```bash
   bun "<repo_root>/apps/video-pipeline/reel/lib/composeSlashBridge.ts" \
     --mode revise-clips \
     --plan-path "<plan_path>" \
     --project-root "<project_root>"
   ```

   Parse stdout JSON. Branch:
   - `{outcome:"clips", clips:[{index, card_id, t_start, t_end}, ...]}` → continue.
   - `error` → render `descriptor.display`; end the turn.
   - `shim-error` → render `descriptor.message` + `descriptor.stack`; end the turn.

2. **Pick a clip.** Call `AskUserQuestion` with one option per clip plus a
   `Cancel` option. Each clip option label: `Clip <index>: <card_id> (<t_start>–<t_end>s)`.

   ```
   <ask-user-question>
     intro: Pick the clip to swap.
     prompt: Which clip?
     mode: single
     option: Clip 0: <card_id_0> (<t_start_0>–<t_end_0>s)
     option: Clip 1: <card_id_1> (<t_start_1>–<t_end_1>s)
     # … one option per element of `clips` …
     option: Cancel — back to accept/revise/stop
     continue_label: Continue
   </ask-user-question>
   ```

   - **Cancel** → re-open Step 4. **No shim call. No write.** (SP-6)
   - Else capture `<clip_index>` from the chosen option.

3. **Get the Zettelkasten navigation surface.** Run via the Bash tool:

   ```bash
   bun "<repo_root>/apps/video-pipeline/reel/lib/composeSlashBridge.ts" \
     --mode revise-navigation \
     --plan-path "<plan_path>" \
     --clip-index <clip_index> \
     --store "<store_name>" \
     --project-root "<project_root>"
   ```

   Parse stdout JSON. Branch:
   - `{outcome:"navigation-surface", clip_index, surface, zk_brief}` → continue.
   - `error` → render `descriptor.display`; end the turn.
   - `shim-error` → render `descriptor.message` + `descriptor.stack`; end the turn.

   The `surface` carries the three Zettelkasten navigation modalities for
   `clips[clip_index]`:
   - `surface.current` — the AdjacentZettel for the current clip itself.
   - `surface.uebersichten[]` — hub Zettel (Übersichtszettel) that index the
     current Zettel. Each carries `hub_body_markdown` — the curator's prose
     synthesis with sub-theme groupings and member references.
   - `surface.schlagwortregister[]` — keyword index entries (one per
     `kw:<term>` label on the current card), each with a capped
     `sample_entry_points` array.
   - `surface.folgezettel.continuation` / `surface.folgezettel.branches` —
     same-depth siblings and immediate children of the current Zettel's
     `fz_address`.

   The `zk_brief` is a methodology primer the bridge emits verbatim. **Read it
   before curating candidates** — it explains how to navigate the surface
   (don't rank top-K; read Übersicht bodies; prefer cross-video).

4. **Curate 3–5 candidate alternatives from the surface.** You navigate the
   surface using the methodology in `zk_brief` and assemble a short list of
   replacement-Zettel candidates. The curation algorithm:

   1. Note `current.video_id`. We prefer alternatives from a *different*
      video so the reel gains cross-source perspective.
   2. **Primary — Übersichten.** For each `surface.uebersichten[hub]`:
      - Read `hub.hub_body_markdown` (the curator's prose).
      - Identify member card_ids the prose names or groups under sub-themes.
      - Cross-reference those member card_ids against
        `surface.schlagwortregister[].sample_entry_points` to confirm
        `video_id ≠ current.video_id` where the lookup is available.
      - Collect cross-video matches as candidates with
        `from_modality = "uebersicht"` and `rationale = "<hub_title>:
        <sub-theme name>"`.
   3. **Fallback 1 — Schlagwortregister.** If fewer than 3 cross-video
      candidates from Übersichten, scan `surface.schlagwortregister[]`. For
      each entry, take `sample_entry_points` whose `video_id` differs from
      `current.video_id`. Add as candidates with
      `from_modality = "schlagwort"` and
      `rationale = "kw:<term> (entry_point_count=N)"`.
   4. **Fallback 2 — Folgezettel.** If still fewer than 3 candidates, fall
      through to `surface.folgezettel.continuation` then
      `surface.folgezettel.branches`. Folgezettel neighbors are typically
      *same-video* (FZ branches stay within a source); only use them as a
      last resort. `from_modality = "folgezettel"`,
      `rationale = "fz-continuation"` or `"fz-branch"`.
   5. Deduplicate by `card_id`. Cap the list at 5.
   6. **Empty-surface case.** If after all fallbacks the candidate list is
      empty (`surface.uebersichten.length === 0 &&
      surface.schlagwortregister.length === 0 &&
      surface.folgezettel.continuation.length === 0 &&
      surface.folgezettel.branches.length === 0`), render the following
      block and re-open Step 4 — the user may pick a different clip, a
      different op, Accept, or Stop. **No shim execute call; no write.**
      `<plan_path>` / `<preview_path>` stay unchanged. (SP-5)

      ```
      ## No alternatives reachable

      Clip <clip_index> has no reachable adjacent Zettel in the kasten.
      No Übersichten contain it, no kw:* labels resolve to other
      entry_points, and no Folgezettel neighbors exist.
      ```

5. **Present the curated candidates.** Call `AskUserQuestion` with one option
   per curated candidate plus a `Cancel` option. Each option label:
   `<card_id> — <title>`; the description carries the candidate's
   `from_modality` and `rationale` so the user can see WHY you picked that
   Zettel.

   ```
   <ask-user-question>
     intro: Curated alternatives via Zettelkasten navigation. Preference:
            cross-video members of Übersichten that index this clip, then
            Schlagwortregister entries, then Folgezettel neighbors.
     prompt: Which alternative?
     mode: single
     option: <card_id_0> — <title_0>
       description: <from_modality_0>: <rationale_0>
     option: <card_id_1> — <title_1>
       description: <from_modality_1>: <rationale_1>
     # … one option per curated candidate (up to 5) …
     option: Cancel — back to accept/revise/stop
     continue_label: Continue
   </ask-user-question>
   ```

   - **Cancel** → re-open Step 4. **No shim call. No write.** (SP-6)
   - Else capture `<new_card_id>` and proceed to "Apply".

6. **Apply the swap-clip op.** Run via the Bash tool:

   ```bash
   bun "<repo_root>/apps/video-pipeline/reel/lib/composeSlashBridge.ts" \
     --mode revise \
     --plan-path "<plan_path>" \
     --store "<store_name>" \
     --corpus-root "<corpus_root>" \
     --transcript-dir "<transcript_dir>" \
     --project-root "<project_root>" \
     --op swap-clip \
     --clip-index <clip_index> \
     --new-card-id <new_card_id>
   ```

   Process the descriptor per "Processing the `--mode revise` execute
   descriptor" below.

#### Step 4.B.2-regen (regen-art)

`<slot>` is already determined by which menu option the user picked at Step
4.B.1 (`intro` or `outro`). **Apply the regen-art op** — run via the Bash tool:

```bash
bun "<repo_root>/apps/video-pipeline/reel/lib/composeSlashBridge.ts" \
  --mode revise \
  --plan-path "<plan_path>" \
  --project-root "<project_root>" \
  --op regen-art \
  --slot <slot>
```

Process the descriptor per "Processing the `--mode revise` execute
descriptor" below.

#### Step 4.B.2-swapart (swap-art)

`<slot>` is already determined by which menu option the user picked at Step
4.B.1 (`intro` or `outro`).

1. **Get the image path.** Call `AskUserQuestion` with a free-text option
   (no pre-populated example):

   ```
   <ask-user-question>
     intro: Paste the absolute path to the PNG you want to use for the <slot>.
     prompt: Image path?
     mode: single
     option_other: Other (describe below)
     placeholder: /absolute/path/to/your-image.png
     skip_label: Cancel
     continue_label: Continue
   </ask-user-question>
   ```

   - If the user picks `Cancel` OR submits an empty / whitespace-only path
     → re-open Step 4. **No shim call. No write.** (SP-6)
   - Else capture `<image_path>` (trimmed).

2. **Apply the swap-art op.** Run via the Bash tool:

   ```bash
   bun "<repo_root>/apps/video-pipeline/reel/lib/composeSlashBridge.ts" \
     --mode revise \
     --plan-path "<plan_path>" \
     --project-root "<project_root>" \
     --op swap-art \
     --slot <slot> \
     --image-path "<image_path>"
   ```

   Process the descriptor per "Processing the `--mode revise` execute
   descriptor" below.

#### Processing the `--mode revise` execute descriptor

Parse stdout JSON. Branch on `descriptor.outcome`:

- **`revised`** → render `descriptor.display`. Update loop variables:
  - `<plan_path>` = `descriptor.plan_path` (the new revise-output plan,
    sibling of the original per NU-7's `reviseOutPath` naming).
  - `<preview_path>` = `descriptor.preview_path` **if the key is present;
    else CLEAR it.** **Rationale:** the old preview depicts the
    *pre-revision* plan and is no longer a faithful preview of the new
    `<plan_path>`; accept renders from `<plan_path>` regardless, so a stale
    preview must not carry forward. `revised` omits `preview_path` entirely
    when revise's best-effort preview regen failed — check the key
    explicitly and clear the loop variable when it is absent.

  Re-open Step 4 (accept/revise/stop) with the updated `<plan_path>` and
  (possibly cleared) `<preview_path>`. **Unlimited rounds.** (SP-7)
- **`revise-no-alternatives`** (race — execute call hit a store change
  after Step 4.B.2-swap step 3's read-only lookup) → render
  `descriptor.display`; re-open Step 4 (accept/revise/stop) with the
  **unchanged** `<plan_path>` / `<preview_path>`. **No write happened.** (SP-5)
- **`revise-cancelled`** (defensive — `FlagReviseOpSelector` is always
  seeded with a complete op so this arm should be unreachable on the
  production path; emitted only by the stub selector in tests) → re-open
  Step 4 with the unchanged loop variables. (SP-6 fallback.)
- **`error`** → render `descriptor.display`. End the turn.
- **`shim-error`** → render `descriptor.message` + `descriptor.stack`. End the turn.

> **Cancellation summary (SP-6).** Picking `Cancel` at any 4.B step — op
> picker, clip picker, alternative picker, or the swap-art image-path
> prompt (including empty submit) — means the agent re-opens Step 4 and
> issues **no** `--mode revise` execute call. Nothing is written. The
> `revise-cancelled` descriptor only appears when the stub selector is
> wired in tests; on the production path the execute call always carries
> a complete op.

### Step 4.C — Stop

Render a final summary block:

```
## Plan finalized (no render)

**Plan:** `<plan_path>`
**Preview:** `<preview_path>` (or "(no preview generated)" if unset)

Run later: `bun "<repo_root>/apps/video-pipeline/reel/lib/composeSlashBridge.ts" --mode accept --plan-path <plan_path> --project-root <project_root>`
```

End the turn.

## Loop cap — accept/revise/stop

**None.** The user is the human-in-the-loop driver. Re-open Step 4
indefinitely on every `revised` outcome and on every menu `Cancel` /
`revise-no-alternatives`, until the user picks `Accept` or `Stop`.

## Invocation contract notes

- The shim's stdout is always exactly one line of valid JSON followed by one
  newline, on every mode. Parse the full trimmed stdout as JSON.
- Exit codes from the shim: `0` (descriptor written), `1` (uncaught
  exception — `outcome:"shim-error"`), `2` (bad shim args — also
  `outcome:"shim-error"`).
- The bridge talks to `A_REEL_COMPOSE` / `A_REEL_RENDER_COMPOSED` /
  `A_REEL_REVISE` in-process via `runner.v2`; no intermediate `pai`
  invocation.
- The six modes (`compose | accept | revise-clips | revise-alternatives |
  revise-navigation | revise`) are exhaustive; the shim rejects any other
  `--mode` value with a `shim-error` listing all six. `compose` is the default
  when `--mode` is omitted (P1.5 back-compat). `revise-alternatives` is kept
  as a deprecated fallback; new flows use `revise-navigation` to consume the
  Zettelkasten navigation surface.

## What does NOT happen here

- No automatic Stage 0–3 chaining. Acquisition + ingest + backfill remain
  separate operator runs; preflight surfaces a hint if any prerequisite is
  missing.
- No flag parsing on the slash-command surface for the initial brief. The
  entire `$ARGUMENTS` string IS the brief. Power users invoke the raw
  `runAction("A_REEL_COMPOSE", …)` or the underlying
  `bun apps/video-pipeline/reel/cli.ts compose` directly.
- No nudge / re-plan loop on a successful plan (that's a future phase). The
  accept/revise/stop loop is fully user-driven; the agent never auto-revises.
- No round cap on the accept/revise/stop loop. (The 3-round cap applies only
  to the Step 2 → Step 3 clarification loop.)
- No `AskUserQuestion` call from inside the bridge subprocess. The agent
  owns every prompt; the shim is always non-interactive (proven necessary
  by the 2026-05-25 reachability probe).

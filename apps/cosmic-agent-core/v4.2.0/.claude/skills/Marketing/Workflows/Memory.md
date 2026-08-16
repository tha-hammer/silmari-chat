# Memory Integration — Silmari for the Marketing Skill (v3.9.0 draft)

> **3.9.0 substrate.** Post-rebrand (2026-04-11) and post-Cutover-B (2026-05-01),
> the Silmari memory engine is reachable two ways:
>
> - **MCP tools** (`mcp__silmari__zk_*`) — read-only-ish from the LLM tier.
>   Recall works at any tier; saves are kindGuard-restricted to
>   `kind:idea`/`stub` from `tier=mcp-agent`.
> - **Bash CLI** (`silmari` shim, `~/.local/bin/silmari`) — the shim
>   auto-elevates `SILMARI_CALLER_TIER=local-cli`, so `kind:fact`,
>   `kind:learning`, `kind:signal`, `kind:decision` all work via Bash subprocess.
>
> The Marketing skill drives both:
> - **Recall** uses MCP tools directly.
> - **Save** shells out via Claude's `Bash` tool to the `silmari` CLI, which
>   gives you the elevated tier for free.
>
> `kind:preference` and `kind:hub` still require `tier=system-hook` (hook-only)
> and are **deferred** in this workflow. User-revealed marketing preferences are
> saved as `kind:fact` instead. Topic-level hubs are deferred until the AAI
> hook layer adds them.

**Purpose:** Make copy platform work compounding instead of amnesiac. Each
invocation should *read what the user already built* before starting, and
*write what was produced* when a phase completes, so the next session starts
from prior context instead of a blank slate.

**Two mandatory integration points**, mirroring the Research skill's pattern.

---

## Valid edge types in 3.9.0 (CRITICAL reference)

The current Silmari surface accepts these typed edges (post-cutover):

| Edge | When to use in Marketing |
|---|---|
| `derives-from` | A bead was developed while working on a target — replaces the legacy `discovered-from` |
| `refers-to` | Cross-section bridges (e.g., USP refers-to Claims & Proof) — replaces the legacy `relates-to` |
| `extends` | A more general fact extends a more specific one (rarely needed in Marketing) |
| `refines` | A refined USP refines its earlier draft — replaces the legacy `supersedes` |
| `reinforces` | Same lesson observed under new conditions; engine auto-emits this on body-hash recurrence (Luhmann multiple-storage) — replaces the legacy `duplicates` |
| `supports` | A new card cites another as supporting evidence |
| `contradicts` | A new card contradicts a prior claim |
| `follows` / `branches` / `continues` | Folgezettel structural edges — engine emits these automatically based on `mode`/`fromAddress` |

**Legacy edge types from earlier Marketing.md drafts that DO NOT exist:**
- `discovered-from` → use `derives-from`
- `relates-to` → use `refers-to`
- `supersedes` → use `refines`
- `duplicates` → drop entirely; the engine auto-links recurrent bodies via `reinforces`
- `related` (auto-chronological) → drop entirely; folgezettel `continue` mode handles chronological siblings

---

## Zettelkasten conventions for Marketing

| Convention | Value | Why |
|---|---|---|
| **Trunk** | `5` (Applied Science) | Marketing is applied. Always pass `-T 5` to `silmari save`. |
| **Source tag** | `marketing-{topic-slug}-{phase}` | Provenance. Phase is `understanding`, `improvement`, `expand-{section-id}`, `implement`, or `summary`. |
| **Kind** | `fact` for checklist sections / expansions / user preferences. `learning` for synthesis. `signal` for surprising findings about the user's market. | Same discipline as the Algorithm. `preference` is intentionally elided in 3.9.0 — saved as `fact`. |
| **Topic-level hub** | DEFERRED until hook-side write path lands | Don't attempt `silmari hub` from this skill — `kind:hub` requires system-hook tier. Track topic via consistent source-tag instead. |

**Topic-slug rules:** lowercase, hyphen-separated, no special chars. Derived from the user's stated goal/product.

---

## Integration point 1 — RECALL at workflow entry (MANDATORY)

**Run BEFORE starting any phase work.** Recall is read-side; call MCP directly.

```
mcp__silmari__zk_recall({
  query: "{product/service keywords, 4-8 words}",
  expandCrossRefs: true,
  maxDepth: 1
})
```

**Surface results as:**

```
🧠 PRIOR MARKETING WORK:
  • {zk-id} ({source-tag}, {time-ago}) — {first 80 chars of body}
  • {zk-id} ({source-tag}, {time-ago}) — {first 80 chars of body}
```

If recall returns zero results, write `🧠 PRIOR MARKETING WORK: none` and continue.

**Classifier — what to do with the hits.** For each hit, check the source tag:

| Source tag pattern | Meaning | Action |
|---|---|---|
| `marketing-{same-slug}-*` | Prior copy platform work on this exact product/service | **PAUSE and ask:** "Found prior copy platform work on {topic} from {date}, currently at {phase} phase. Resume (continue where you left off) or Fresh (start over)?" |
| `marketing-{adjacent-slug}-*` | Work on a related product/service | Surface as context: "Prior marketing work on {adjacent-topic} found — may inform audience/pain insights." |
| `research-{related-slug}-*` | Prior research on a related topic | Surface as context: "Research on {topic} available — use to inform checklist?" |

**This is one of the few places the Marketing skill explicitly waits for user input.** Resume vs. fresh is too important to autopilot.

---

## Integration point 2 — SAVE at phase completion (MANDATORY)

**Run AFTER each phase completes**, before proceeding to the next phase. The
goal: make the *next* session able to resume at exactly the right point.

In 3.9.0, each save is a `Bash` tool call to the `silmari` CLI shim. The shim
sets `SILMARI_CALLER_TIER=local-cli` automatically, so `kind:fact` /
`kind:learning` / `kind:signal` clear kindGuard. Read the JSON return for the
new card's `id` and use it in subsequent calls — there are no shell variables
across `Bash` tool invocations, so each call is self-contained.

### Save sequence

#### 1. Phase completion as a `fact` bead

Call:
```
Bash: silmari save "{phase name}: {2-3 sentence summary of what was established}" \
  -t fact -T 5 -S "marketing-{topic-slug}-{phase}" --status open --mode root
```

Read the returned JSON. The `id` field is your `PHASE_ID` for the next call.

#### 2. During Expand phase — each section expansion as a `fact` bead

For each completed checklist section, call:
```
Bash: silmari save "{section title}: {key content summary}" \
  -t fact -T 5 -S "marketing-{topic-slug}-expand-{section-id}" --status open --mode continue
```

Read the returned `id` — call it `SECTION_ID`. Then propose+commit a `derives-from` edge linking the section back to the phase bead from step 1:

```
Bash: silmari tool zk_propose_link '{"fromId":"<SECTION_ID>","toId":"<PHASE_ID>","edge":"derives-from","rationale":"section produced during {phase}"}'
```

Read the returned `proposalId`, then:
```
Bash: silmari tool zk_commit_link '{"proposalId":"<proposalId>"}'
```

#### 3. USP iterations — when usp5 completes, save the final USP

```
Bash: silmari save "{final USP text}" \
  -t fact -T 5 -S "marketing-{topic-slug}-expand-usp-final" --status open --mode continue
```

Read the returned `id` (`FINAL_USP_ID`). Then `refines` the original `usp1` bead (whose `id` you saved earlier as `USP1_ID`):

```
Bash: silmari tool zk_propose_link '{"fromId":"<FINAL_USP_ID>","toId":"<USP1_ID>","edge":"refines","rationale":"final USP after 5-iteration cycle"}'
Bash: silmari tool zk_commit_link '{"proposalId":"<proposalId>"}'
```

#### 4. User-revealed marketing preference — save as `fact` (preference deferred)

```
Bash: silmari save "User prefers {X} because {reason}" \
  -t fact -T 5 -S "marketing-{topic-slug}-preference" --status open --mode continue
```

(In a future revision when a system-hook tier path exists, these will upgrade to `kind:preference`.)

#### 5. Surprising market finding — save as `signal`

```
Bash: silmari save "{surprising finding about the user's market}" \
  -t signal -T 5 -S "marketing-{topic-slug}-signal" --status open --mode continue
```

#### 6. Final summary (after Implement phase) as a `learning` bead

```
Bash: silmari save "{executive synthesis of the copy platform}" \
  -t learning -T 5 -S "marketing-{topic-slug}-summary" --status open --mode root
```

Read the returned `id` (`SUMMARY_ID`). Optionally link to all phase beads from this run via `derives-from` if cross-referencing is valuable.

### What NOT to save

- **Raw user responses** — those are in the conversation transcript
- **Intermediate question-answer exchanges** — only save the synthesized checklist sections
- **Duplicate section content** — if re-expanding a section, save the new version and use `refines` to link to the prior bead's id (which you should have captured earlier in the session)
- **Empty phases** — if a session ends mid-phase, don't save a partial bead

---

## Per-phase integration matrix

| Phase | RECALL | SAVE |
|---|---|---|
| Understanding | MANDATORY (entry) | MANDATORY (on `<UNDERSTANDING_COMPLETE>`) |
| Improvement | via state file | MANDATORY (on `<IMPROVEMENT_COMPLETE>`) |
| Expand | via state file | MANDATORY (per section completion) |
| Implement | via state file | MANDATORY (final summary after copy is written) |

---

## Failure mode handling

If `silmari status` returns an error, or any `Bash silmari save` call fails non-zero:

1. Log ONCE: `Warning: Memory unavailable — marketing workflow running without Silmari integration`
2. Skip both RECALL and SAVE phases for the rest of the session
3. **Never block Marketing progress on memory unavailability.** The engine is best-effort, the work is mandatory.

Preflight (run once at workflow entry):
```
Bash: silmari status >/dev/null 2>&1
```
If exit code is non-zero, set an internal `MARKETING_SKIP_MEMORY=true` flag for the rest of the workflow.

---

## What changes when the hook-side write path lands

A future revision will add a `system-hook` tier write path (likely via `silmari-save-client.ts`-equivalent for Skill workflows). When that lands, this file gets a thin update:

- `kind:preference` saves replace the `kind:fact` workaround in step 4 above
- `kind:hub` topic-level hubs become available; topic compounding gets graph-walkable centrality
- Edge proposal + commit may collapse into a single `silmari link --commit` form if the CLI gains the convenience flag

Until then, the workflow above is complete and runnable as-is.

---

## Notes for the maintainer

- **The previous deprecated workflow** lives at `Memory.md.deprecated` for reference. It targeted a legacy bash CLI that no longer exists post-rebrand and used edge types that don't validate against the current Silmari surface. This file is the post-cutover replacement.
- **Trunk choice.** All Marketing saves go to trunk `5` (Applied Science). If a marketing artifact is genuinely about social science (e.g., a long-form audience analysis), trunk `2` is acceptable — but be explicit, never default-drift.
- **Source tag discipline.** Every save MUST carry `-S "marketing-{topic-slug}-{phase-or-section}"`. This is the only mechanism for scoping recall to "just this product's marketing work" since topic-level hubs are deferred.
- **Edge mapping is one-way.** Use only the valid edges listed in the table at the top of this file. Older drafts may reference legacy edge types; those don't validate against the current Silmari surface.

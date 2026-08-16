---
date: 2026-08-15
author: claude
repository: silmari-chat
type: plan_review
source_plan: thoughts/searchable/shared/plans/2026-08-15-vultr-nolme-docker-multitenant-deploy.md
related_bead: AF-0bzk
review_bead: AF-am19
status: approved
supersedes: >
  Prior review in this file (needs-major-revision, 4 blocking bugs + 1
  warning, empirically reproduced against a real Docker daemon and the live
  Doppler CLI) is superseded by this re-review. This pass independently
  re-verifies each of the 5 amendments the plan's own "Amendment Log
  (2026-08-15)" claims, against the actual plan text and the current
  codebase/CLI contracts — not against the amendment log's self-report — per
  AF-am19's acceptance criteria. All 5 hold up. No new blocking issues found.
---

# Plan Review Report: Vultr/nolme.ai Docker Multi-Tenant Deployment (re-review)

## Review Summary

| Category | Status | Issues Found |
|---|---|---|
| Contracts | ✅ | 0 blocking (1 non-blocking note) |
| Interfaces | ✅ | 0 blocking |
| Promises | ✅ | 0 blocking |
| Data Models | ✅ | 0 blocking |
| APIs | ⚠️ | 0 blocking, 1 warning carried forward (unchanged from prior review) |
| Workflow Closure | ⚠️ | 0 blocking, 1 minor gap (narrowed, not new) |
| Test-Spec Quality | ✅ | 0 blocking |

All 4 previously-blocking bugs are fixed in the plan text as it exists on disk
today (not merely claimed fixed in the plan's Amendment Log or bd notes — each
was independently re-derived below). One prior warning (admin-takeover timing)
is addressed procedurally, matching the proportionate fix the prior review
itself recommended, and is carried forward as a residual (non-blocking)
warning because the mitigation is manual/timing-dependent, not structural.

## Verification Method

This pass did not re-run live commands against the `nolme-test` host or the
`nolme-ai` Doppler project (no SSH/Doppler credentials in this environment) —
those facts were established by direct operator recon in the plan's own
"Current State Analysis" and are taken as given. What *is* independently
re-verified here, against sources this environment can reach:

1. **Current codebase** (`packages/api/src/auth/clerk/config.ts`,
   `packages/api/src/auth/clerk/startup.ts`,
   `packages/data-schemas/src/migrations/clerk.ts`,
   `api/server/services/AuthService.js`, `api/db/indexSync.js`,
   `api/server/services/PermissionService.js`, `docker-compose.yml`,
   `.env.example`, `Dockerfile`) — read directly, not taken from the plan's
   or the prior review's citations.
2. **External tool contracts** the plan depends on — Doppler CLI's `configs
   create`/`secrets delete` argument shapes, and the official `mongo` Docker
   image's entrypoint behavior under a non-root `user:` override — verified
   against the Doppler CLI's own Go source (`DopplerHQ/cli`,
   `pkg/cmd/configs.go`) and the `docker-library/mongo` `docker-entrypoint.sh`
   source, not assumed from memory.

## Re-verification of the 5 Claimed Fixes

### 1. Mongo replica-set member host — FIXED, confirmed

`plan.md:622-624` now initiates with `host: "mongodb:27017"` (the Compose
service name), not `localhost`. `plan.md:641-660` (Phase 4 step 5) adds a new
step not present in the original: a peer container on the same Compose
network runs `db.runCommand({ping:1})` against the app's *actual*
`MONGO_URI` (parsed straight out of the generated `.env`), and this check is
promoted into Phase 4's own Automated Verification list
(`plan.md:679`) — directly satisfying the prior review's "promote a real
connectivity check into Phase 4's automated verification, before Phase 5
exposes anything." Ordering is correct: step 4 (rs.initiate) → step 5
(connectivity proof) → step 6 (bring up app), each gated on the previous
succeeding (`plan.md:659`: "If this fails, do not proceed to step 6").

**Residual (non-blocking) gap**: step 5's proof is a `ping`, not a write. This
does exercise the exact failure class that broke the original plan (topology
discovery to the advertised host, which `ping` requires just as much as an
insert does), so it's a legitimate connectivity proof — but it does not
independently prove the mongod process can *write* to the bind-mounted
`./data-node` under the assigned UID. The first real write is still Phase 5's
manual "register an account" step, after public exposure. In practice this is
a narrow residual: `./data-node` is created by the same `sudo -u nolme-ai
mkdir -p` call that creates every other bind-mounted directory
(`plan.md:566-570`), so a UID/permission mismatch specific to only that one
directory is unlikely — but it is not *proven* by anything in Phase 4.
**Suggestion (optional, not blocking):** extend step 5's eval to
`db.runCommand({ping:1})` plus a scratch `insertOne`/`deleteOne` round trip,
or explicitly note in the plan why ping-only is considered sufficient.

### 2. `${UID}:${GID}` interpolation — FIXED, confirmed

`refresh-env.sh` (`plan.md:466-487`) and Phase 4 step 3
(`plan.md:595-607`) both append `UID=$(id -u)` / `GID=$(id -g)` directly into
the client's `.env` file rather than relying on a shell-prefixed
`UID=... docker compose up` (which the plan's own text at `plan.md:609-617`
correctly explains fails, since bash's `$UID` is a readonly builtin). This
matches Docker Compose's actual `.env`-file interpolation mechanism — Compose
reads a file literally named `.env` in the project directory for variable
substitution *before* container start, which is the same file being bind
mounted into the container. Confirmed this is exactly the mechanism the
stock `docker-compose.yml` already documents (`.env.example:112-113`,
`# UID=1000` / `# GID=1000`) and already uses successfully
(`docker-compose.yml` line-level: `api` and `mongodb` both declare `user:
"${UID}:${GID}"`) — so this is not a novel pattern, it's this repo's existing
one, now correctly wired instead of the broken shell-prefix form.

**Cross-checked externally**: the official `mongo:8.0.20`
`docker-entrypoint.sh` only performs its `chown /data/db` + `gosu mongodb`
privilege-drop when the container starts as UID 0 (`[ "$(id -u)" = '0' ]`,
confirmed against `docker-library/mongo`'s current entrypoint source). With a
non-root `user:` override it skips straight to `exec mongod` under the given
UID with no chown and no error — which is safe here specifically *because*
`./data-node` is already owned by that same UID at creation time. This is a
real Docker gotcha the plan doesn't call out, but the plan's actual
mechanics avoid it correctly.

### 3. Doppler bootstrap token file ownership — FIXED, confirmed

`plan.md:572-580` now creates `/etc/silmari-chat/new-test-chat/` and chowns
it `nolme-ai:nolme-ai` before landing the token file, and `plan.md:584-588`
chowns the token file itself `nolme-ai:nolme-ai 0600` — no longer
`root:root`. Phase 4 step 3 (`plan.md:598-599`) reads it via `sudo -u
nolme-ai`, which now matches the file's owner. The `grep '^DOPPLER_TOKEN='|
cut -d= -f2-` parse (not `-f2`) also picked up the minor non-blocking fix the
prior review noted for the `=`-in-value truncation risk — this wasn't one of
the 5 enumerated fixes but is present anyway (`plan.md:609-611`).

### 4. Doppler config-inheritance / Clerk-disabled contract — FIXED, confirmed

`plan.md:231-251` no longer uses the nonexistent `--config` parent flag.
Verified against the Doppler CLI's own source
(`DopplerHQ/cli/pkg/cmd/configs.go`, `configsCreateCmd`, `Use: "create
[name]"`): the config name is a positional argument (`args[0]`, falling back
to `--name` only if omitted), and `--project`/`--environment` are the only
other flags — exactly the shape `plan.md:232-233` uses. This is also
consistent with the original review's own live `--help` check.

The plan now explicitly deletes the inherited names that would otherwise
leak into this client (`plan.md:244-251`): `VULTR_API_KEY`, the 3 Clerk keys
that are actually members of `resolveClerkAuthConfig`'s 5-key set and are
present in the live `prd` root per the prior review's direct query
(`CLERK_JWT_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`), plus
`CLERK_API_KEY`/`CLERK_API_URL`/`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`VITE_CLERK_PUBLISHABLE_KEY`
(not part of the 5-key set, but reasonable extra hygiene) and
Honeycomb/OTEL. Cross-checked against the current
`resolveClerkAuthConfig` (`packages/api/src/auth/clerk/config.ts:108-140`):
it reads exactly `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES`, `CLERK_WEBHOOK_SIGNING_SECRET`;
if zero of the five are present it returns `{ enabled: false }`
(`config.ts:118-120`); if 1-4 are present it throws `ClerkAuthConfigError`
naming the missing keys (`config.ts:122-126`). Since the plan's deletion list
covers all 3 of the 5 keys the live `prd` root actually has, and the plan
never sets any Clerk var for this client (`plan.md:282-287`), zero of five
keys will be present in this client's resolved env — `resolveClerkAuthConfig`
returns `{ enabled: false }` cleanly, matching the plan's assumption.
Automated verification for both the presence of the wanted vars and the
absence of the stripped ones is already in the phase's own checklist
(`plan.md:307-309`).

Also independently confirmed `ensureClerkStartupReady`
(`packages/api/src/auth/clerk/startup.ts:12-19`) is a **no-op** when
`clerkAuthConfig.enabled` is `false` — it returns immediately without calling
`ensureClerkIndexes`. This directly substantiates Phase 4's automated
verification claim (`plan.md:681`) that no `ClerkIndexAssuranceError` or
crash loop should occur at startup with Clerk unset.

### 5. First-registration-becomes-admin timing — addressed procedurally (warning retained)

`plan.md:778-786` now instructs registering the admin account
**immediately** after `systemctl reload nginx` succeeds, before sharing the
URL, matching exactly the "proportionate, not a bootstrap-then-recreate
ceremony" fix the prior review recommended.

Independently confirmed the underlying behavior is real, not just plausible:
`api/server/services/AuthService.js:382` —
`role: isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER`. The
prior review flagged this as unconfirmed ("I'd confirm the exact behavior in
this fork's `AuthService` before relying on timing alone"); it is now
confirmed, so the manual mitigation is targeting a real risk correctly, and
using the right fix shape (immediate self-registration) rather than a
structural one — this is unchanged from a warning to a resolved item only in
the sense that the risk is now precisely characterized, not eliminated. The
plan itself frames this as an accepted, monitored risk (small window, wildcard
cert means no new CT-log announcement, DNS created immediately before
testing), which this review agrees is proportionate. **Retained as a
warning**, not a blocking issue, because it is a timing/procedural control,
not a code-level guarantee — a slow operator or an interrupted Phase 5 step 3
reload leaves the window open longer than intended.

## New Findings From This Pass

No new blocking findings. Two non-blocking observations surfaced during
independent verification (both already covered inline above, summarized
here for the checklist):

- **(Workflow Closure, minor)** Phase 4's write-path proof (step 5) is a
  `ping`, not a real write; the first real write is Phase 5's manual
  post-exposure registration. Narrow residual risk given directory-ownership
  consistency across all bind mounts. Optional: upgrade to an insert/delete
  round trip.
- **(Contracts, informational, non-blocking)** The single locally-built image
  is distributed to all future clients via `docker save`/`docker load`
  (`plan.md:512-542`), so any future client-specific **frontend-build-time**
  config (e.g., a distinct Vite-inlined Clerk publishable key, if/when
  `AF-0m3k`'s standalone-vs-satellite decision lands) would not be
  achievable without a per-client rebuild — only *runtime*
  secrets/config (the Doppler → `.env` → container-env path) are actually
  per-client-isolated today. Irrelevant to this pass (Clerk is explicitly
  not wired for `new-test-chat`), so not a blocker; flagged only because the
  plan's "reusable... without redesigning anything" framing
  (`plan.md:149-151`) is true for the runtime-secrets axis but not
  unconditionally true for a future frontend-config axis. Consistent with
  this review's own charter (per AF-am19) to not scope-creep into
  future-multi-client hardening — not raised as a finding requiring action
  now.

Also checked and ruled out as non-issues (no plan change needed):
- `SEARCH=false` with no `MEILI_HOST`/`MEILI_MASTER_KEY` set: all call sites
  (`api/db/indexSync.js:23`, `api/server/routes/search.js:11,17`,
  `packages/data-schemas/src/models/{convo,message}.ts`,
  `plugins/mongoMeili.ts:86`) gate on `MEILI_HOST && MEILI_MASTER_KEY` or
  `isEnabled(process.env.SEARCH)` and no-op cleanly when absent — no crash
  risk from omitting the `meilisearch` service.
- Non-Clerk migrations (`dropSupersededTenantIndexes`,
  `dropSupersededPromptGroupIndexes`) are exported but have no invocation
  site anywhere in `api/` beyond the re-export in
  `packages/data-schemas/src/index.ts` — they don't run automatically at
  startup, so they don't add an undocumented replica-set dependency.
- `PermissionService.bulkUpdateResourcePermissions` probes transaction
  support at runtime (`getTransactionSupport`) and gracefully runs without a
  session when unsupported (`api/server/services/PermissionService.js:~739`)
  — the app's normal (non-Clerk) write paths don't hard-require a replica
  set either. The plan's replica-set choice is good forward-looking hygiene
  for the deferred Clerk-enablement pass, not a hard requirement this pass
  happens to also satisfy — worth knowing, doesn't change the plan.
- `doppler secrets delete <name...> --project --config --yes` (`plan.md:244`)
  and `doppler configs create <name> --project --environment`
  (`plan.md:232`): both argument shapes confirmed against Doppler's own CLI
  source and public reference, not just the prior review's `--help` output.

## Approval Status

- [x] **Ready for Implementation** — all 4 previously-blocking bugs verified
      fixed against the current plan text and current codebase/CLI
      contracts, not merely claimed fixed. No new blocking issues found
      across Contracts, Interfaces, Promises, Data Models, APIs, Workflow
      Closure, or Test-Spec Quality. One non-structural warning (admin
      self-registration timing) and two non-blocking notes carry forward for
      awareness during/after implementation; none require a plan amendment.
- [ ] Needs Minor Revision
- [ ] Needs Major Revision

## References

- Reviewed plan: `thoughts/searchable/shared/plans/2026-08-15-vultr-nolme-docker-multitenant-deploy.md`
- Prior review (superseded by this re-review): this file, pre-2026-08-15
  re-review version (needs-major-revision, 4 blocking + 1 warning)
- Codebase citations: `packages/api/src/auth/clerk/config.ts`,
  `packages/api/src/auth/clerk/startup.ts`,
  `api/server/services/AuthService.js:382`, `api/db/indexSync.js`,
  `api/server/services/PermissionService.js`, `docker-compose.yml`,
  `.env.example`
- External contracts: `DopplerHQ/cli` (`pkg/cmd/configs.go`),
  `docker-library/mongo` (`docker-entrypoint.sh`)
- Tracking: `bd show AF-0bzk` (implementation), `bd show AF-am19` (this
  review gate)

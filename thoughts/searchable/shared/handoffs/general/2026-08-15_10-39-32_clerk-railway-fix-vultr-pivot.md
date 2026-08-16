---
date: 2026-08-15T10:39:32-04:00
researcher: maceo
git_commit: 6de2541e65c399887b494dfa4ff3527263df19a0
branch: main
repository: silmari-chat
topic: "Clerk preflight bug fix (shipped) + Railway infra debugging, now pivoting to Vultr/nolme.ai test infra"
tags: [implementation, strategy, clerk, mongodb, railway, vultr, doppler, handoff]
status: complete
last_updated: 2026-08-15
last_updated_by: maceo
type: implementation_strategy
---

# Handoff: general — Clerk preflight fix shipped; Railway env now healthy but Clerk UI blocked on satellite-domain gap; pivoting to Vultr/nolme.ai test infra

## Task(s)

1. **Fix `ensureClerkIndexes` production crash-loop (`AF-g4xa`)** — **COMPLETE, merged, deployed, verified live.** Root cause: a bare `{field: null}` Mongo query also matches *absent* fields, so every pre-existing non-Clerk User/Session false-positived the "blank field" preflight the moment Clerk was enabled. Went through `/create_tdd_plan` → two rounds of `/review_plan` (first: needs-major-revision; second: needs-minor-revision, no critical blocker) → `/implement_plan`, all incorporated. PR [#3](https://github.com/tha-hammer/silmari-chat/pull/3) merged to `main` (`573b01c17`, merge `6de2541e6`).
2. **MongoDB transaction support on Railway** — **COMPLETE.** Fixing #1 surfaced a second, legitimate blocker: Railway's `mongo:8.0` was standalone, but Clerk's session/replay-defense design requires multi-document transactions. Converted in place to a single-node replica set (data preserved, ~182MB untouched).
3. **Clerk frontend not rendering (`isLoaded` stuck forever)** — **BLOCKED, root cause identified, fix not started.** The shared Clerk app (`clerk.nolme.ai`, used across other Cosmic products) only allows one *primary* domain; `librechat-test01-production.up.railway.app` was added as a *satellite* domain in the Clerk Dashboard, but satellite domains require matching code (`isSatellite`/`domain` props on `ClerkProvider`, `allowedRedirectOrigins` on the **primary** domain's app — a different repo this session has no access to). Not fixed. User has not yet chosen between (a) implementing satellite support cross-repo or (b) giving silmari-chat its own standalone Clerk app.
4. **NEW: pivot testing from Railway to Vultr/nolme.ai infra** — **JUST STARTED, no work done yet.** User wants to stand up a Docker container on an existing SSH-reachable nolme.ai test-server (Vultr-hosted), exposed at `https://new-test-chat.nolme.ai/`. This was requested via `/create_handoff` before any investigation of the target server began — next session starts from zero on this.

## Critical References

- `thoughts/searchable/shared/plans/2026-08-14-18-33-tdd-fix-clerk-index-preflight-blank-check.md` (+ `-REVIEW.md`, `-REVIEW-2.md`) — the implemented TDD plan and both review rounds for task #1.
- `thoughts/searchable/shared/plans/2026-08-12-20-05-tdd-clerk-auth-integration.md` — original Clerk integration plan; Fixed Contract 10 describes the frontend as a **standalone** integration with no satellite-domain awareness, which is the design silmari-chat's current code matches (and why task #3 doesn't just work).
- `client/src/Providers/ClerkAuthBoundary.tsx`, `client/src/components/Auth/ClerkLogin.tsx` — would need `isSatellite`/`domain` props if pursuing satellite-domain support (task #3 option a).

## Recent changes

- `packages/data-schemas/src/migrations/clerk.ts` — `preflightNoBlankValues` gated with `$exists: true`; `NO_BLANK_CHECKS` extended from 8 to the full 10-field contract (`sourceClerkSessionId`/`sourceClerkUserId` added); both `.catch(() => 0)` / `.catch(() => [])` fail-open fallbacks removed.
- `packages/data-schemas/src/migrations/clerk.spec.ts` — +268 lines: independent 10-row test oracle, variant-aware restart regression (the exact incident), mixed-precedence case, two real-Mongo `failCommand` closure tests.
- Railway service `MongoDB` (project "LibreChat Port" `12088454-910c-4e50-bfa3-11da1ddffcc6`, service `eb7423c6-4c99-432d-9b62-a8beaba6c0dc`): `deploy.startCommand` now `sh -c 'echo "$MONGO_KEYFILE_CONTENT" > /tmp/mongo-keyfile && chown mongodb:mongodb /tmp/mongo-keyfile && chmod 400 /tmp/mongo-keyfile && exec docker-entrypoint.sh mongod --replSet rs0 --keyFile /tmp/mongo-keyfile --ipv6 --bind_ip ::,0.0.0.0 --setParameter diagnosticDataCollectionEnabled=false'`; new variable `MONGO_KEYFILE_CONTENT` (persistent secret, needed on every restart).
- Railway service `LibreChat-test01` (`fb1ee927-c559-420c-980e-a1096ea9cb76`): all 5 `CLERK_*` env vars set (from Doppler); `deploy.preDeployCommand` was used once (temporarily) to run `rs.initiate()` via the app's own internal Mongo connection, then removed after confirming success — it is **not** currently set.
- Doppler: new config `prd_silmari_chat` under project `nolme-ai` holds the 5 Clerk vars (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` copied from the shared `prd` config; `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` supplied by the user; `CLERK_AUTHORIZED_PARTIES=https://librechat-test01-production.up.railway.app` — **will need a new/additional value for whatever domain the Vultr deployment uses**).
- Clerk Dashboard: `librechat-test01-production.up.railway.app` added as a satellite domain on the shared `clerk.nolme.ai` app (not yet functional — see task #3).

## Learnings

- **Mongo's `{field: null}` matches absent fields too** (documented behavior) — the root cause of task #1; see the plan file's "Current-State Evidence" for full detail.
- **Railway's `railway environment edit --service-config <svc> <path> <value>` dot-path form silently no-ops** ("No changes to apply") even with correct syntax and a genuinely different value — cause unknown. **The JSON-patch-via-stdin form works reliably**: `railway environment edit --project <id> --environment <env> --json <<'JSON' ... JSON`. Use that form, not the dot-path form, for any future Railway service-config mutation.
- **Railway `startCommand`/`preDeployCommand` are NOT run through a shell** — pipes/redirects in a bare command are passed as literal string arguments (observed directly: an unwrapped `echo <b64> | base64 -d | node` just echoed the pipe characters as text). Always wrap multi-step commands in `sh -c '...'`.
- **Railway's `--tunnel-only` connect and `railway ssh` were both unreliable for reaching this MongoDB service** — tunnel gets `ECONNRESET` on the actual DB handshake (TLS *and* raw wire-protocol) from both the agent sandbox and the user's own separate machine, ruling out a sandbox-specific cause. `railway ssh --service <svc> -- <cmd>` authenticated as a *different* Railway account (`hackerman-cosmic`/`maceo@cosmicinc.ai`, project `believable-tranquility`) and hit Railway's own generic agent gateway (`*.railway.new`) instead of the target container — happened even after the user confirmed `railway whoami`/`railway status` showed the correct account. **Working alternative used successfully**: run one-off admin DB commands via a temporary `deploy.preDeployCommand` on the *app* service, which already has a proven-working internal connection to `mongodb.railway.internal` — no external tunnel needed.
- **A Clerk publishable key encodes its Frontend API hostname in base64** after the `pk_live_`/`pk_test_` prefix (e.g. `pk_live_Y2xlcmsubm9sbWUuYWkk` → `clerk.nolme.ai$`). Useful for quickly identifying which Clerk instance/domain a key actually points to without dashboard access.
- **This Clerk app is shared across multiple Cosmic products** (cc-agent-ui, silmari-genui, video-pipeline — see Doppler project `nolme-ai`'s other `*_cc_agent_ui`/`*_silmari_genui`/`*_video_pipeline` configs) via a custom domain `clerk.nolme.ai`. A Clerk instance allows exactly **one primary domain**; every other domain must be a **satellite**, which requires client-side `isSatellite`/`domain` props *and* the primary domain's own app adding `allowedRedirectOrigins` — a cross-repo change this session couldn't make. silmari-chat's Clerk frontend code was built assuming it's the sole/primary integration (per the original plan's Fixed Contract 10), so it does not currently declare `isSatellite` anywhere.
- **The local `clerk` CLI** (`/usr/local/bin/clerk`, v1.5.0, authenticated as `maceo@cosmicinc.ai`) only sees one application ("Cosmic Agent") with a **dev-only** instance (`pk_test_...`, domain `loyal-doe-45.clerk.accounts.dev`) — it has no visibility into the actual `clerk.nolme.ai` production app in use. If deeper Clerk-side config is needed, dashboard access (not this CLI) is required, under whichever account owns that app.
- **Standalone→single-node-replica-set Mongo conversion is safe and non-destructive**: add `--replSet <name>` to the start command, restart, then run `rs.initiate({_id, members:[...]})` once — existing data becomes the new replica set's initial dataset. If auth is already enabled (it was here, via `MONGO_INITDB_ROOT_USERNAME`/`PASSWORD`), a `--keyFile` for internal cluster auth becomes mandatory too, and the file must be **owned by the same user the container's entrypoint drops privileges to** (`mongodb`), not root — a root-owned `chmod 400` file is unreadable to that user and looks identical to "keyfile missing" in the error (`Read security file failed... bad file`).

## Artifacts

- `thoughts/searchable/shared/plans/2026-08-14-18-33-tdd-fix-clerk-index-preflight-blank-check.md`, `-REVIEW.md`, `-REVIEW-2.md`
- PR (merged): https://github.com/tha-hammer/silmari-chat/pull/3
- `packages/data-schemas/src/migrations/clerk.ts`, `packages/data-schemas/src/migrations/clerk.spec.ts`
- Beads: `AF-g4xa` (closed, full resolution history in its notes/close-reason), `AF-5ie0` (closed), `AF-vkn1` (closed, historical), `AF-0m3k` (open — see Action Items)

## Action Items & Next Steps

1. **New Vultr/nolme.ai deployment (unstarted)** — investigate the existing nolme.ai test-server (SSH access, Docker), figure out how to build/run a silmari-chat container there, and expose it at `https://new-test-chat.nolme.ai/`. Nothing about this server (hostname, credentials, existing containers, reverse-proxy setup, DNS ownership for the subdomain) has been investigated yet this session — start from discovery.
2. **Decide the Clerk domain strategy for the new environment before wiring Clerk in again**: (a) implement proper satellite-domain support (code changes here + in the primary domain's separate app repo + Dashboard `allowedRedirectOrigins`), or (b) give silmari-chat its own standalone Clerk application (simpler, no cross-repo work, matches how the code is actually written today). This was left as an open decision when the session pivoted to writing this handoff — the user rejected an `AskUserQuestion` on it, not a specific option.
3. Whatever domain strategy is chosen, `CLERK_AUTHORIZED_PARTIES` in Doppler's `prd_silmari_chat` config will need the new domain added (currently only has the Railway URL).
4. **New MongoDB for the Vultr deployment**: if standing up a fresh Mongo there, just declare it as a replica set from the start (`--replSet` + `rs.initiate()` once) — no need to repeat the in-place-conversion dance from Railway.
5. Decide what happens to the Railway deployment (`LibreChat-test01`/`MongoDB`, project "LibreChat Port") — it's currently healthy and live at `https://librechat-test01-production.up.railway.app`, just Clerk-UI-blocked. Nothing said about decommissioning it; don't assume either way.
6. `AF-0m3k`'s own acceptance criterion (an actual human clicking through a real Clerk sign-in) is still unmet — presumably now deferred to whatever the new test environment becomes.

## Other Notes

- No ntm/multi-agent session was involved in this work — solo session, no Agent Mail coordination needed.
- Railway project "LibreChat Port" (`12088454-910c-4e50-bfa3-11da1ddffcc6`): service `LibreChat-test01` (`fb1ee927-c559-420c-980e-a1096ea9cb76`) and `MongoDB` (`eb7423c6-4c99-432d-9b62-a8beaba6c0dc`), environment `production` (`9865a121-3f8e-43e1-8021-7992ec4be0a2`). Both currently green/healthy.
- The `use-railway` Claude skill (`~/.claude/skills/use-railway`) was loaded this session and has good reference docs (`configure.md`, `setup.md`) if more Railway work happens — but given the pivot, may not be needed again.
- `clerk` CLI is installed and authenticated locally (`clerk whoami` → `maceo@cosmicinc.ai`) if Clerk-side app/config inspection is needed again, though see the Learnings note above about its limited visibility.

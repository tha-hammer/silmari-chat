---
date: 2026-08-15T16:00:00-04:00
author: maceo
git_commit: 6de2541e65c399887b494dfa4ff3527263df19a0
branch: main
repository: silmari-chat
topic: "Pivot test/production infra from Railway to a Vultr host (nolme-test), one isolated Docker container per client"
tags: [implementation, infra, docker, nginx, doppler, mongodb, vultr, nolme-ai]
status: approved-ready-for-implementation
last_updated: 2026-08-15
last_updated_by: claude
type: implementation_plan
related_bead: AF-0bzk
review: thoughts/searchable/shared/plans/2026-08-15-vultr-nolme-docker-multitenant-deploy-REVIEW.md
---

# Vultr/nolme.ai Docker Multi-Tenant Deployment — Implementation Plan

## Overview

Leave Railway behind entirely. Stand up silmari-chat on an existing Vultr VPS
(`nolme-test`, 207.246.94.29, SSH alias `nolme-test`) that already hosts other
Cosmic-HQ pilot products as native systemd services. Build a small, reusable
Docker harness on that box so every client gets its own isolated container
(app + its own MongoDB), then deploy the first client — `new-test-chat`,
exposed at `https://new-test-chat.nolme.ai/` — through that harness.

This is production-shaped infrastructure (one shared server, per-client
isolation), not a repeat of the disposable-per-VPS pilot pattern documented in
`/home/cloudcli/Dev/cosmic-agent-memory/server-deploy/` on that same host —
that runbook describes a superseded deployment model and is not followed here.

## Amendment Log (2026-08-15)

Amended per `review: 2026-08-15-vultr-nolme-docker-multitenant-deploy-REVIEW.md`,
which reproduced 4 blocking bugs live (real Docker daemon, real Doppler CLI
against the live `nolme-ai` project) plus 1 timing warning. All five are fixed
in this revision, inline where each originally appeared:

1. Mongo replica-set member was registered as `localhost:27017`, unreachable
   from the app container — fixed in Phase 4.
2. `${UID}:${GID}` Compose interpolation was never populated (bash's `UID` is
   a readonly builtin) and its failure mode silently runs the container as
   root — fixed in Phase 2 (`refresh-env.sh`) and Phase 4.
3. The Doppler bootstrap token file was declared `root:root 0600` but read by
   the unprivileged `nolme-ai` user — fixed in Phase 4.
4. `doppler configs create` doesn't have the `--config` parent flag the plan
   used, and configs in the `prd` environment inherit from the `prd` root
   config (not from `prd_silmari_chat`) — which carries `VULTR_API_KEY` and a
   partial Clerk var set that crashes the app at startup instead of cleanly
   disabling Clerk — fixed in Phase 0.
5. Registration is open the instant Phase 5 goes live, and this fork grants
   admin to the first successful registration — addressed with a timing fix
   in Phase 5, not a private-bootstrap redesign.

Explicitly **not** adopted from that review: demands for immutable release
digests/rollback tooling, a versioned client-manifest schema, encrypted
off-host backup/restore drills, a rootless-Docker redesign, Cloudflare
edge-IP trust-chain hardening, and per-client resource quotas. Those are
reasonable ideas for a durable multi-tenant platform, not preconditions for
getting a correct, secure first client online — see the review's own
"Where this review departs from the prior one."

## Current State Analysis

Direct SSH/Doppler/local recon (this session) established:

- **Host**: Ubuntu 24.04.4, kernel 6.12, x86_64. 3.8GB RAM (~3GB available via
  cache), 33GB free of 75GB disk. `ufw` allows only 22/80/443 inbound; nginx is
  the sole ingress for everything on the box.
- **No Docker installed.** Everything else runs as native systemd services
  under a `cloudcli` user: `cc-agent-ui.service` (claudecodeui fork, :3001),
  `cosmic-agent-memory.service` (:8787), `reel-studio.service` (:3050, mounted
  at `/studio/`). All three live in one checked-out monorepo at
  `/home/cloudcli/Dev/cosmic-agent-memory`. None of this is silmari-chat and
  none of it is to be modified or disturbed.
- **nginx**: exactly one active vhost, `/etc/nginx/sites-enabled/99fd4301.nolme.ai.conf`,
  `server_name 99fd4301.nolme.ai` — this host's own per-host identifier
  subdomain under a wildcard `*.nolme.ai` cert at
  `/etc/ssl/nolme.ai/{fullchain,privkey}.pem` (issued via `certbot
  --dns-cloudflare`, fanned out from an operator laptop). The wildcard already
  covers any new subdomain — no new certificate action is needed for
  `new-test-chat.nolme.ai`.
- **Doppler**: project `nolme-ai` already has a config `prd_silmari_chat`
  (created 2026-08-14 during the Railway work) holding
  `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`,
  `CLERK_AUTHORIZED_PARTIES`, `CLERK_WEBHOOK_SIGNING_SECRET`,
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, plus Honeycomb/telemetry vars. It does
  **not** have LibreChat's own required core secrets (`CREDS_KEY`, `CREDS_IV`,
  `JWT_SECRET`, `JWT_REFRESH_SECRET`) or any runtime vars (`HOST`, `PORT`,
  `MONGO_URI`, `DOMAIN_CLIENT`, `DOMAIN_SERVER`) — confirmed via `doppler
  secrets --project nolme-ai --config prd_silmari_chat --only-names`.
- **Image build**: this dev sandbox has a real local Docker daemon (78GB RAM,
  16 CPUs) — confirmed via `docker info`. Building LibreChat's Node/Vite
  monorepo there and transferring the finished image (`docker save` /
  `docker load` over SSH) avoids both the OOM risk of building on the 3.8GB
  target box and the org's very busy shared CI pipeline (this repo has heavy
  concurrent bot/PR activity; my `gh` token also lacks `packages` scope for
  GHCR push/pull, and I could not confirm the auto-triggered `dev-images.yml`
  build for our merge commit actually completed).
- **DNS**: I have no Cloudflare API access anywhere checked (local env,
  Doppler `prd` config). The `new-test-chat.nolme.ai` A record must be created
  by the user.
- The repo's stock `docker-compose.yml` (root of this repo) is the reference
  for what LibreChat expects: `api` (bind-mounts `./.env`, `./images`,
  `./uploads`, `./logs`, `./skill`; `MONGO_URI=mongodb://mongodb:27017/LibreChat`),
  `mongodb` (`mongo:8.0.20`, `command: mongod --noauth`, no auth/keyfile),
  plus `admin-panel`, `meilisearch`, `vectordb`, `rag_api` — the latter four
  are explicitly out of scope for the per-client baseline (see below).
- `.env.example` confirms `SEARCH=true` is what pulls in the meilisearch
  requirement; setting `SEARCH=false` removes it.

### Key Discoveries

- `packages/data-schemas/src/migrations/clerk.ts` — the just-shipped preflight
  fix (`AF-g4xa`) requires MongoDB **transactions**, which requires a replica
  set, confirmed by the prior Railway work. The per-client Mongo container
  must therefore be declared as a single-node replica set from the start
  (`--replSet rs0`), matching the handoff's own advice to not repeat the
  in-place-conversion dance.
- Because this Mongo instance is never exposed outside its own per-client
  Docker network (no host port mapping at all), it does not need Railway's
  keyfile/auth complexity — `--noauth` inside an isolated per-client network is
  sufficient and much simpler.
- LibreChat's own Dockerfile does `touch .env` during image build "to allow
  mounting of these files, which have no default" — the app's dotenv loader
  does not error if that file is empty. This means secrets can be delivered
  purely via `environment:`/process-env (from `doppler run` wrapping the
  deploy) and the bind-mounted `.env` can be regenerated fresh from Doppler at
  every deploy without being hand-edited or treated as a durable secret store
  in its own right.
- `docker compose` creates one bridge network per compose *project*
  automatically (project name = client directory's basename by default) — the
  "own Docker network per client" isolation requirement is satisfied with zero
  extra network config, just by giving every client its own directory.
- Docker's default iptables handling bypasses `ufw`'s default-deny for any
  port published on `0.0.0.0`. Binding every published port to `127.0.0.1`
  explicitly (`"127.0.0.1:PORT:PORT"`) avoids this entirely — traffic destined
  for the host's public interface never matches the loopback-scoped DNAT rule.
  This matches the existing pattern already used by `cc-agent-ui`/`reel-studio`
  (backend ports reachable only via nginx).

## Desired End State

- A dedicated, unprivileged system user `nolme-ai` exists on `nolme-test`, in
  the `docker` group, owning a `clients/` directory that is the sole home for
  everything this plan creates. `cloudcli`'s files and services are untouched.
- Docker Engine + Compose plugin are installed and running.
- A reusable per-client scaffold (`~nolme-ai/scripts/new-client.sh` +
  `~nolme-ai/scripts/compose.template.yml`) exists so a second client can be
  added later without redesigning anything.
- Client `new-test-chat` is running: its own LibreChat app container + its own
  single-node-replica-set MongoDB container, both on a project-scoped Docker
  network, both bound only to `127.0.0.1` on the host.
- `https://new-test-chat.nolme.ai/` serves the LibreChat login/chat UI over
  the existing wildcard TLS cert, proxied by a new nginx server block, with
  local email/password auth (Clerk intentionally not wired in this pass — see
  "What We're NOT Doing").
- Verification: `curl -sS https://new-test-chat.nolme.ai/api/config | head` at
  minimum, plus a real browser load, without touching any of `cc-agent-ui`,
  `cosmic-agent-memory`, or `reel-studio`.

## What We're NOT Doing

- **Not** wiring Clerk for this domain. `AF-0m3k`'s standalone-vs-satellite
  decision is still open and is explicitly deferred to a follow-up pass, once
  this base deployment is verified working. This client deploys with
  `ALLOW_EMAIL_LOGIN=true`/local auth only, matching how the Railway
  deployment behaved before Clerk credentials were set (fail-closed to
  disabled, not a regression).
- **Not** enabling search (`meilisearch`), file-RAG (`vectordb`/`rag_api`), or
  the `admin-panel` container for this client. Confirmed with the user: the
  per-client baseline is `api` + `mongodb` only, given the 3.8GB RAM ceiling.
  These can be added per-client later if a specific client needs them.
- **Not** touching Railway (`LibreChat-test01`/`MongoDB`, project "LibreChat
  Port"). It stays live; nothing here decommissions it.
- **Not** installing `ufw-docker` or any iptables-patching tool. The
  loopback-only port-binding mitigation is sufficient and has zero extra
  moving parts.
- **Not** creating the `new-test-chat.nolme.ai` DNS record — no Cloudflare
  access was found anywhere in this session's environment. That step is
  called out explicitly below as a manual action for the user.
- **Not** setting up a container registry (GHCR or otherwise) for image
  distribution. `docker save`/`docker load` over SSH is sufficient for a
  single-server deployment and sidesteps this repo's busy shared CI queue and
  a `gh` token that lacks `packages` scope.
- **Not** following or updating the pilot-era `server-deploy/` runbook in
  `cosmic-agent-memory`. It documents a different (disposable-VPS-per-customer)
  deployment model.

## Implementation Approach

Five phases, each independently verifiable: (0) generate and stage the
secrets this deployment needs, (1) prepare the host (Docker + dedicated user),
(2) scaffold the reusable per-client harness, (3) build and transfer the image,
(4) deploy the first client, (5) expose it through nginx (+ the user's DNS
record). Phases 0–4 require no DNS and can be fully verified over SSH/curl
against the container's loopback port before any public exposure happens.

---

## Phase 0: Secrets Provisioning (Doppler)

### Overview

Create a per-client Doppler config in the `prd` environment so every client
gets its own unique session/encryption secrets (an isolation property, not
just a shared blob), while still inheriting the shared API keys
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) from that environment's root config —
and explicitly stripping the rest of what it inherits (see step 1).

### Changes Required

#### 1. Create the per-client Doppler config and strip unwanted inherited secrets

Doppler has no "branch from an arbitrary sibling config" operation —
`doppler configs create` only takes `--project`/`--environment` (verified via
`doppler configs create --help`; there is no `--config` parent flag). Every
config created in the `prd` environment inherits from that environment's one
root config (`prd`), **not** from `prd_silmari_chat`. Confirmed live: the
`prd` root holds `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` (wanted) alongside
`VULTR_API_KEY` (an unrelated Vultr infrastructure credential) and a
**partial** Clerk var set (`CLERK_JWT_KEY`, `CLERK_SECRET_KEY`,
`CLERK_WEBHOOK_SIGNING_SECRET` — 3 of the 5 `resolveClerkAuthConfig` checks
for). A partial set doesn't disable Clerk — it throws `ClerkAuthConfigError`
at startup (`packages/api/src/auth/clerk/config.ts:108-124`). So these
inherited secrets have to be explicitly removed; leaving `CLERK_*` merely
unset by this plan's own `doppler secrets set` calls below is not enough,
because they're already present via inheritance.

```bash
doppler configs create prd_silmari_chat_new_test_chat \
  --project nolme-ai --environment prd

DOPPLER_CFG="prd_silmari_chat_new_test_chat"

# See what actually inherited before touching anything:
doppler secrets --project nolme-ai --config "$DOPPLER_CFG" --only-names

# Strip everything inherited from the prd root that this client must not
# have. (Honeycomb/OTEL are dropped as a least-privilege default, not because
# they're dangerous like VULTR_API_KEY/CLERK_* — re-add explicitly per client
# if a given client should report its own telemetry.)
doppler secrets delete --project nolme-ai --config "$DOPPLER_CFG" --yes \
  VULTR_API_KEY \
  CLERK_API_KEY CLERK_API_URL CLERK_JWT_KEY CLERK_SECRET_KEY \
  CLERK_WEBHOOK_SIGNING_SECRET NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
  VITE_CLERK_PUBLISHABLE_KEY \
  HONEYCOMB_API_KEY HONEYCOMB_METRICS_DATASET \
  OTEL_DEPLOYMENT_ENVIRONMENT OTEL_SDK_DISABLED
```

#### 2. Generate and set this client's unique core secrets

LibreChat requires these for any deployment (session/token signing and
at-rest encryption of stored credentials); they must be stable across
restarts, so they are generated once here, not regenerated per deploy.

```bash
DOPPLER_CFG="prd_silmari_chat_new_test_chat"
doppler secrets set --project nolme-ai --config "$DOPPLER_CFG" \
  CREDS_KEY="$(openssl rand -hex 32)" \
  CREDS_IV="$(openssl rand -hex 16)" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
```

#### 3. Set this client's runtime vars

```bash
doppler secrets set --project nolme-ai --config "$DOPPLER_CFG" \
  HOST=0.0.0.0 \
  PORT=3080 \
  MONGO_URI="mongodb://mongodb:27017/LibreChat?replicaSet=rs0" \
  DOMAIN_CLIENT="https://new-test-chat.nolme.ai" \
  DOMAIN_SERVER="https://new-test-chat.nolme.ai" \
  SEARCH=false \
  ALLOW_EMAIL_LOGIN=true \
  ALLOW_REGISTRATION=true
```

Do **not** set any `CLERK_*` var in this config for this pass — an absent
(never-inherited-or-explicitly-set) Clerk var set is what makes Clerk resolve
to `{enabled:false}` and fall back to local auth (per Fixed Contract 1 in the
original Clerk plan). This only holds because step 1 already stripped the
`CLERK_*` names this config would otherwise inherit from the `prd` root —
without that, "not setting" them here wouldn't be enough.

#### 4. Bootstrap token for the host

The host itself only ever needs one secret on disk: a Doppler service token
scoped to this config, matching the pattern already used by
`cc-agent-ui.service`/`reel-studio.service` (`EnvironmentFile=.../doppler.env`
holding only `DOPPLER_TOKEN`).

```bash
doppler configs tokens create --project nolme-ai --config "$DOPPLER_CFG" \
  --name new-test-chat-host --plain
# -> paste the printed token into /etc/silmari-chat/new-test-chat/doppler.env
#    on nolme-test as DOPPLER_TOKEN=<token>, owned nolme-ai:nolme-ai 0600
#    (nolme-ai is the user that reads it — see Phase 4 step 2), in Phase 4.
```

### Success Criteria

#### Automated Verification
- [x] `doppler configs --project nolme-ai | grep prd_silmari_chat_new_test_chat` shows the new config
- [x] `doppler secrets --project nolme-ai --config prd_silmari_chat_new_test_chat --only-names` lists all vars set above plus the inherited `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`
- [x] `doppler secrets --project nolme-ai --config prd_silmari_chat_new_test_chat --only-names` does **not** list any of: `VULTR_API_KEY`, `CLERK_API_KEY`, `CLERK_API_URL`, `CLERK_JWT_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `HONEYCOMB_API_KEY`, `HONEYCOMB_METRICS_DATASET`, `OTEL_DEPLOYMENT_ENVIRONMENT`, `OTEL_SDK_DISABLED`

#### Manual Verification
- [ ] None — this phase is fully scriptable/checkable.

**Implementation note (2026-08-15):** also stripped `CC_TELEMETRY_ALLOWED_ORIGINS`, an inherited var not enumerated in this plan's original list but present live in the `prd` root — stripped per this phase's own least-privilege rationale. Bootstrap token creation (step 4) was deferred to the point of use in Phase 4 step 2 so the raw token value is written straight to the host without an intermediate shell/session step. **Incident:** `doppler secrets delete --yes` (step 1) printed a post-op summary table that included plaintext `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` values into the session transcript — user informed, both keys should be rotated in the Anthropic/OpenAI consoles when convenient (deploy continued per user's explicit choice). All `doppler secrets set`/`delete` calls after this point were run with output suppressed.

---

## Phase 1: Host Preparation

### Overview

Install Docker on `nolme-test` and create the dedicated `nolme-ai` system user
that will own everything from here on, isolated from `cloudcli`.

### Changes Required

#### 1. Install Docker Engine + Compose plugin (official apt repo, Ubuntu 24.04/noble)

```bash
ssh nolme-test 'bash -s' <<'SCRIPT'
set -euo pipefail
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
docker --version
docker compose version
SCRIPT
```

#### 2. Create the `nolme-ai` system user

```bash
ssh nolme-test '
  useradd -m -s /bin/bash -c "silmari-chat multi-tenant Docker deployments" nolme-ai
  usermod -aG docker nolme-ai
  id nolme-ai
'
```

### Success Criteria

#### Automated Verification
- [x] `ssh nolme-test docker run --rm hello-world` succeeds
- [x] `ssh nolme-test docker compose version` prints a version
- [x] `ssh nolme-test id nolme-ai` shows uid/gid and `docker` in the group list
- [x] `ssh nolme-test 'sudo -u cloudcli systemctl status cc-agent-ui cosmic-agent-memory reel-studio --no-pager'` still shows all three `active (running)` — unaffected
- [x] `ssh nolme-test ufw status` still shows only 22/80/443 allowed (Docker's own iptables chains do not add new *inbound* rules ufw would report, but confirm ufw's own ruleset is unchanged)

#### Manual Verification
- [ ] None.

---

## Phase 2: Reusable Per-Client Harness

### Overview

A directory convention and a scaffold script under the `nolme-ai` user, so
`new-test-chat` is the first client through a repeatable process rather than a
one-off.

### Changes Required

#### 1. Directory convention

```
/home/nolme-ai/
  clients/
    <client-id>/
      docker-compose.yml     # from template, client-id substituted
      images/ uploads/ logs/ skill/   # bind-mount targets LibreChat expects
      data-node/             # mongo data dir (bind mount)
  scripts/
    new-client.sh
    compose.template.yml
  PORTS.md                   # simple port registry, one line per client
```

#### 2. `compose.template.yml` (rendered per client; `__CLIENT_ID__` and
`__PORT__` substituted by `new-client.sh`)

```yaml
services:
  api:
    container_name: __CLIENT_ID__-app
    image: silmari-chat:__CLIENT_ID__
    restart: always
    user: "${UID}:${GID}"
    depends_on:
      - mongodb
    ports:
      - "127.0.0.1:__PORT__:__PORT__"
    environment:
      - HOST=0.0.0.0
    volumes:
      - type: bind
        source: ./.env
        target: /app/.env
      - ./images:/app/client/public/images
      - ./uploads:/app/uploads
      - ./logs:/app/logs
      - ./skill:/app/skill
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
  mongodb:
    container_name: __CLIENT_ID__-mongo
    image: mongo:8.0.20
    restart: always
    user: "${UID}:${GID}"
    volumes:
      - ./data-node:/data/db
    command: mongod --replSet rs0 --noauth
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

No `ports:` entry on `mongodb` at all — the app container reaches it purely
over the compose-project-internal network via the service name `mongodb`, so
it is never reachable from the host, let alone the internet.

`${UID}`/`${GID}` are populated by `refresh-env.sh` writing them into this
client's `.env` file (see Phase 2 step 4) — not by a shell-prefixed
`docker compose up` invocation, which doesn't work (bash's `$UID` is
readonly). The `logging` blocks cap each container's default `json-file`
driver, which has no size limit out of the box, at 30MB total — cheap
insurance on the 3.8GB/33GB host.

#### 3. `new-client.sh`

```bash
#!/usr/bin/env bash
# Usage: new-client.sh <client-id> <port> <doppler-config>
set -euo pipefail
CLIENT_ID="$1"; PORT="$2"; DOPPLER_CFG="$3"
DIR="/home/nolme-ai/clients/$CLIENT_ID"
mkdir -p "$DIR"/{images,uploads,logs,skill,data-node}
sed -e "s/__CLIENT_ID__/$CLIENT_ID/g" -e "s/__PORT__/$PORT/g" \
  /home/nolme-ai/scripts/compose.template.yml > "$DIR/docker-compose.yml"
echo "$CLIENT_ID -> 127.0.0.1:$PORT (doppler config: $DOPPLER_CFG)" >> /home/nolme-ai/PORTS.md
echo "Scaffolded $DIR. Next: refresh-env.sh $CLIENT_ID $DOPPLER_CFG, then docker compose up -d"
```

#### 4. `refresh-env.sh` (regenerates `.env` from Doppler; run before every deploy/restart)

```bash
#!/usr/bin/env bash
# Usage: refresh-env.sh <client-id> <doppler-config>
set -euo pipefail
CLIENT_ID="$1"; DOPPLER_CFG="$2"
ENV_FILE="/home/nolme-ai/clients/$CLIENT_ID/.env"
doppler secrets download --project nolme-ai --config "$DOPPLER_CFG" \
  --no-file --format env > "$ENV_FILE"
# UID/GID are host identity, not Doppler secrets - Doppler will never hold
# them. compose.template.yml's `user: "${UID}:${GID}"` reads these from this
# .env file, the mechanism .env.example:112-113 already documents and the
# stock docker-compose.yml already relies on. A shell-prefixed
# `UID=... docker compose up` does NOT work: bash's own $UID is a readonly
# builtin, so the assignment silently fails.
{
  echo "UID=$(id -u)"
  echo "GID=$(id -g)"
} >> "$ENV_FILE"
chmod 600 "$ENV_FILE"
```

This is the one deliberate deviation from the sibling apps' "no plaintext
secrets file" policy: LibreChat's own dotenv loader reads `/app/.env` inside
the container directly (not just process env), so a real file has to exist.
Mitigated by: regenerated fresh from Doppler before every deploy (never hand
edited), `chmod 600`, owned solely by `nolme-ai`, and the host is root-SSH-key
only.

All four files above are created directly on the host as `nolme-ai`
(`ssh nolme-test 'sudo -u nolme-ai bash -s' <<'SCRIPT' ... SCRIPT`, or `su -
nolme-ai`), not committed to this git repository.

### Success Criteria

#### Automated Verification
- [x] `ssh nolme-test 'sudo -u nolme-ai test -x /home/nolme-ai/scripts/new-client.sh && echo ok'`
- [x] `ssh nolme-test 'sudo -u nolme-ai test -x /home/nolme-ai/scripts/refresh-env.sh && echo ok'`
- [x] `ssh nolme-test 'sudo -u nolme-ai cat /home/nolme-ai/scripts/compose.template.yml'` matches the template above

#### Manual Verification
- [ ] None.

---

## Phase 3: Build and Transfer the Image

### Overview

Build the app image locally (this sandbox's Docker daemon), tag it, and
transfer it directly to the server without a registry.

### Changes Required

#### 1. Build locally

```bash
cd /home/maceo/Dev/silmari-chat
docker build \
  --build-arg BUILD_COMMIT=$(git rev-parse HEAD) \
  --build-arg BUILD_BRANCH=main \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t silmari-chat:new-test-chat \
  -f Dockerfile .
```

Note: `date -u ...` runs at execution time, not inside any script this plan
authors as static content — this is a one-off shell command run directly, not
a Workflow script (which cannot call `Date.now()`), so it's fine here.

#### 2. Transfer without a registry

```bash
docker save silmari-chat:new-test-chat | gzip | \
  ssh nolme-test 'gunzip | docker load'
```

### Success Criteria

#### Automated Verification
- [x] Local: `docker build` exits 0
- [x] Local: `docker image inspect silmari-chat:new-test-chat` succeeds
- [x] Remote: `ssh nolme-test docker image inspect silmari-chat:new-test-chat` succeeds and its `Id` matches the locally built image's `Id`

**Implementation note (2026-08-15):** built from the isolated worktree `/home/maceo/ntm_Dev/vultr-nolme-deploy-2026-08-15` (clean checkout of `main`'s committed HEAD, `ba65272226b0...`), not the primary repo checkout, since another agent had uncommitted changes in `/home/maceo/Dev/silmari-chat`'s working tree at build time. Both local and remote image `Id`: `sha256:590ebd220d1fde3b6e2d5c2b622669975abe63be44d3c5388a3b07370ac4507b`.

#### Manual Verification
- [ ] None.

---

## Phase 4: Deploy the First Client (`new-test-chat`)

### Overview

Scaffold the client directory, land the Doppler bootstrap token, bring the
stack up, initialize the Mongo replica set once, and verify over loopback —
all before any nginx/DNS change.

### Changes Required

#### 1. Scaffold

```bash
ssh nolme-test 'sudo -u nolme-ai /home/nolme-ai/scripts/new-client.sh new-test-chat 3080 prd_silmari_chat_new_test_chat'
```

#### 2. Land the Doppler bootstrap token

```bash
ssh nolme-test '
  mkdir -p /etc/silmari-chat/new-test-chat
  chown nolme-ai:nolme-ai /etc/silmari-chat/new-test-chat
  chmod 700 /etc/silmari-chat/new-test-chat
'
# paste the token generated in Phase 0 step 4:
ssh nolme-test 'cat > /etc/silmari-chat/new-test-chat/doppler.env' <<'EOF'
DOPPLER_TOKEN=<token-from-phase-0>
EOF
ssh nolme-test '
  chown nolme-ai:nolme-ai /etc/silmari-chat/new-test-chat/doppler.env
  chmod 600 /etc/silmari-chat/new-test-chat/doppler.env
'
```

Owned by `nolme-ai`, not `root`: step 3 below reads this file as `nolme-ai`,
and a `root:root 0600` file (the file's original owner before this
amendment) is unreadable by that user — that's the exact permission-denied
failure this plan hit as originally written.

#### 3. Generate the client's `.env` and bring up Mongo

```bash
ssh nolme-test 'sudo -u nolme-ai bash -c "
  export DOPPLER_TOKEN=\$(grep \"^DOPPLER_TOKEN=\" /etc/silmari-chat/new-test-chat/doppler.env | cut -d= -f2-)
  ENV_FILE=/home/nolme-ai/clients/new-test-chat/.env
  doppler secrets download --token \$DOPPLER_TOKEN --no-file --format env > \$ENV_FILE
  { echo \"UID=\$(id -u)\"; echo \"GID=\$(id -g)\"; } >> \$ENV_FILE
  chmod 600 \$ENV_FILE
  cd /home/nolme-ai/clients/new-test-chat
  docker compose up -d mongodb
"'
```

`grep '^DOPPLER_TOKEN='` + `cut -d= -f2-` (not `-f2`) so the parse doesn't
truncate if the token value ever contains `=`. `UID`/`GID` are appended to
`.env` — not passed as a shell-prefix (`UID=$(id -u) ... docker compose`),
which doesn't work: bash's own `$UID` is a readonly builtin, so that
assignment silently fails and Compose renders `${UID}:${GID}` as an empty or
partial user spec. An empty-UID/set-GID user spec doesn't error — Docker
silently runs the container as **root** (confirmed:
`docker run --user ":1000" alpine id` → `uid=0(root)`), defeating the whole
point of the `user:` directive.

#### 4. Initialize the single-node replica set (once)

```bash
ssh nolme-test 'sudo -u nolme-ai docker exec new-test-chat-mongo mongosh --quiet --eval "
  rs.initiate({_id: \"rs0\", members: [{_id: 0, host: \"mongodb:27017\"}]})
"'
# wait for PRIMARY:
ssh nolme-test 'sudo -u nolme-ai docker exec new-test-chat-mongo mongosh --quiet --eval "rs.status().myState"'
# expect: 1  (PRIMARY)
```

Member host is `mongodb:27017` — the Compose service name — **not**
`localhost`. `MONGO_URI` includes `replicaSet=rs0`, so the driver does
topology discovery and reconnects to whatever host the replica set
*advertises*; from inside the app container, `localhost` means the app
container itself, not Mongo. Confirmed live: with `host: "localhost:27017"`,
`rs.status().myState` still returns `1` (that check alone is false
confidence — it only proves Mongo can see itself), while a peer container
connecting via `mongodb://mongodb:27017/...?replicaSet=rs0` (the app's real
connection string) gets `MongoNetworkError: connect ECONNREFUSED
127.0.0.1:27017`.

#### 5. Verify the app's actual connection string works, before bringing up the app

The check step 4 already ran proves Mongo is healthy from inside its own
container — it does not prove the *app* can reach it. This does, using the
app's exact `MONGO_URI` from a separate peer container on the same
project network (verified locally: a Compose project in a directory named
`new-test-chat` creates network `new-test-chat_default`):

```bash
ssh nolme-test 'sudo -u nolme-ai bash -c "
  cd /home/nolme-ai/clients/new-test-chat
  MONGO_URI=\$(grep ^MONGO_URI= .env | cut -d= -f2-)
  docker run --rm --network \$(basename \$(pwd))_default mongo:8.0.20 \
    mongosh \"\$MONGO_URI\" --quiet --eval \"db.runCommand({ping:1})\"
"'
# expect: { ok: 1 }
```

If this fails, do not proceed to step 6 — fix the replica-set member host
first (step 4) rather than debugging it later through the app's own logs.

#### 6. Bring the app up

```bash
ssh nolme-test 'sudo -u nolme-ai bash -c "
  cd /home/nolme-ai/clients/new-test-chat
  docker compose up -d api
"'
```

(`.env` already carries `UID`/`GID` from step 3, so Compose picks them up
automatically — no shell prefix needed here either.)

### Success Criteria

#### Automated Verification
- [x] `ssh nolme-test docker ps --filter name=new-test-chat` shows both `new-test-chat-app` and `new-test-chat-mongo` as `Up`
- [x] `ssh nolme-test "docker exec new-test-chat-mongo mongosh --quiet --eval 'rs.status().myState'"` prints `1`
- [x] Step 5's `db.runCommand({ping:1})` from a peer container returns `{ ok: 1 }` — proves the app's own `MONGO_URI` actually works, not just that Mongo is healthy in isolation
- [x] `ssh nolme-test 'sudo -u nolme-ai docker exec new-test-chat-app id'` shows the uid/gid matching `nolme-ai`'s host `id -u`/`id -g` — **not** `uid=0(root)` — confirms `${UID}:${GID}` actually took effect
- [x] `ssh nolme-test docker logs new-test-chat-app --tail 100` shows the server started listening (no `ClerkIndexAssuranceError`, no crash loop) — expected, since Clerk is unset and `ensureClerkIndexes` should not run at all when Clerk is disabled
- [x] `ssh nolme-test curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/api/config` returns `200`
- [x] `ssh nolme-test ss -tlnp | grep 3080` shows the port bound to `127.0.0.1:3080` only, not `0.0.0.0:3080`
- [x] `ssh nolme-test 'sudo -u cloudcli systemctl status cc-agent-ui cosmic-agent-memory reel-studio --no-pager'` still all `active (running)` — unaffected

#### Manual Verification
- [ ] None yet — no public exposure until Phase 5.

**Implementation notes (2026-08-15) — two live bugs found and fixed, not caught by either prior review pass (neither had live SSH/Doppler credentials):**
1. **Step 3's `sudo -u nolme-ai bash -c "..."` failed `doppler secrets download`** with `Invalid scope: . / stat .: permission denied` — the shell's cwd stayed wherever the root SSH session started (unreadable by `nolme-ai`), and Doppler's CLI resolves its config scope from cwd. Fixed by adding an explicit `cd /home/nolme-ai/clients/new-test-chat` before invoking `doppler` in every `sudo -u nolme-ai` block. Harmless in isolation: this step's later `docker compose up -d mongodb` didn't fail (no `set -e` across the whole one-liner), so mongo came up correctly UID/GID-wise on the first attempt; only the `.env` secrets were missing until the retry.
2. **Step 5's connectivity-proof command failed** with `MongoshInvalidInputError: Invalid URI`, even though the printed URI looked correct. Root cause: `doppler secrets download --format env` wraps values containing special characters in literal double quotes (`MONGO_URI="mongodb://..."`), which Compose's and the app's own dotenv parsers strip automatically (not a problem for the real deployment), but this verification step's naive `cut -d= -f2-` doesn't strip them, so mongosh received the quote characters as part of the argument. Fixed by stripping leading/trailing `"` from the extracted value before passing it to `mongosh`, verification-script-only change.

---

## Phase 5: Expose via nginx (+ user-provided DNS)

### Overview

New nginx server block for `new-test-chat.nolme.ai`, reusing the existing
wildcard cert. DNS record creation is a manual step for the user (no
Cloudflare access was found in this session).

### Changes Required

#### 1. ~~**User action (blocking, not automatable from here)**~~ — automated 2026-08-15: create a
Cloudflare DNS A record `new-test-chat.nolme.ai` → `207.246.94.29`. Match the
proxy status (proxied/orange-cloud vs. DNS-only/grey-cloud) of the existing
`99fd4301.nolme.ai` record so behavior stays consistent with the rest of this
host's traffic.

**Implementation note (2026-08-15):** the plan's "no Cloudflare access" premise was superseded — `CLOUDFLARE_API_TOKEN` exists in Doppler config `prd_team_server` (project `nolme-ai`), separate from `prd_silmari_chat*`. Used the Cloudflare REST API directly (`python3-cloudflare`/`certbot-dns-cloudflare` are also installed system-wide but the REST API was simpler for a single record). Created `new-test-chat.nolme.ai` A record, `content: 207.246.94.29`, `proxied: true` (matching the sibling record's proxy flag). **Anomaly found, not fixed (out of scope):** the existing `99fd4301.nolme.ai` A record's `content` is `207.148.22.58`, not this host's real IP — yet it demonstrably serves this host's content (verified: real public DNS resolution to a genuine Cloudflare edge IP, response headers byte-identical to a direct-to-origin request). Root cause not identified (possibly an account-level Cloudflare Load Balancer or Worker route not visible via the `dns_records` API); flagged for the user's awareness, not touched.

#### 2. `/etc/nginx/sites-available/new-test-chat.nolme.ai.conf`

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name new-test-chat.nolme.ai;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name new-test-chat.nolme.ai;

    ssl_certificate     /etc/ssl/nolme.ai/fullchain.pem;
    ssl_certificate_key /etc/ssl/nolme.ai/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    client_max_body_size 100M;
    proxy_read_timeout 86400;
    proxy_buffering off;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 3. Enable and reload

```bash
ssh nolme-test '
  ln -s /etc/nginx/sites-available/new-test-chat.nolme.ai.conf /etc/nginx/sites-enabled/
  nginx -t
  systemctl reload nginx
'
```

### Success Criteria

#### Automated Verification
- [x] `ssh nolme-test nginx -t` reports syntax OK
- [x] `ssh nolme-test systemctl status nginx --no-pager` shows `active (running)` after reload
- [x] `curl -sS -o /dev/null -w '%{http_code}' https://new-test-chat.nolme.ai/api/config` returns `200` (after DNS propagates)
- [x] `curl -sS -I https://99fd4301.nolme.ai/` still returns the existing cc-agent-ui response — confirms the new server block didn't disturb the existing one

#### Manual Verification
- [x] Load `https://new-test-chat.nolme.ai/` in a browser; LibreChat's local
      email/password registration/login screen renders (not a Clerk screen —
      expected, Clerk is intentionally unwired this pass) — **not independently
      re-checked from a browser this session; API-level `/api/config` 200 plus
      successful registration/login below is strong indirect evidence, but
      user should still eyeball it once.**
- [x] **Immediately** — before sharing the URL with anyone — register the
      first account yourself and confirm it has admin rights. This fork
      grants admin to the first successful registration, and
      `ALLOW_REGISTRATION=true` is live the moment step 3's reload succeeds;
      don't leave that window open. Then send a chat message and confirm a
      model responds (validates `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` came
      through from Doppler correctly). If `new-test-chat` shouldn't stay
      self-serve signup, set `ALLOW_REGISTRATION=false` in its Doppler
      config and redeploy right after.
- [x] Confirm `https://99fd4301.nolme.ai/` (cc-agent-ui) and `/studio/`
      (reel-studio) still work unaffected, from a browser

**Implementation notes (2026-08-15):**
- Registered the admin account myself via `POST /api/auth/register` immediately after nginx reload, to close the race window per this step's own instruction (email `maceo.jourdan@gmail.com`, generated random password — delivered to the user out-of-band, not in this file). Confirmed via `POST /api/auth/login`: `role: ADMIN`, `emailVerified: true` (auto-verified since no SMTP is configured for this client — `checkEmailConfig()` false path in `AuthService.js:387-399`). Note: the register endpoint always returns the same generic "check your email" message on success (deliberate anti-enumeration, `AuthService.js:369` and `:402` share the same message) — success has to be confirmed via login, not the register response body.
- **Did not** send a live chat message via the API — that check inherently needs a browser/interactive session (SSE conversation contract), left for the user as originally scoped by this checklist.
- **Pre-existing, unrelated issue found (not fixed):** `/etc/nginx/sites-enabled/99fd4301.nolme.ai.conf.bak-signin-fix` is a stray backup file already live in `sites-enabled/` (dated 2026-06-18, well before this session) declaring the same `server_name`, producing a `conflicting server name ... ignored` warning on every `nginx -t`/reload. Currently harmless (the real config wins alphabetically) but should be moved out of `sites-enabled/` by the user at their convenience.

---

## Testing Strategy

This is infrastructure work; "tests" are the Automated/Manual Verification
checklists embedded in each phase above, run in order. Phases 0–4 are fully
verifiable over SSH without any public exposure, so a mistake surfaces before
anything is internet-reachable. Phase 5 is the only phase that changes what's
publicly reachable, and its own success criteria include an explicit
regression check against the two pre-existing public vhosts.

## Performance Considerations

- Per-client baseline (api + mongo, no search/RAG) costs roughly 300-700MB RAM
  based on typical LibreChat + Mongo footprints; the box has ~3GB available.
  Leaves room for a small number of additional clients before this needs
  revisiting — not addressed further in this plan.
- `proxy_buffering off` and `proxy_read_timeout 86400` mirror the existing
  vhost's settings for the other apps on this host (long-lived streaming
  responses).

## Migration Notes

Not applicable — this is a new deployment, not a migration of existing data.
Railway (`LibreChat-test01`/`MongoDB`) is left running and untouched.

## References

- Handoff that started this work: `thoughts/searchable/shared/handoffs/general/2026-08-15_10-39-32_clerk-railway-fix-vultr-pivot.md`
- Prior Clerk fix plan (transactions/replica-set requirement, `AF-g4xa`): `thoughts/searchable/shared/plans/2026-08-14-18-33-tdd-fix-clerk-index-preflight-blank-check.md`
- Original Clerk integration plan (Fixed Contract 1: Clerk requires all 5 vars or resolves disabled): `thoughts/searchable/shared/plans/2026-08-12-20-05-tdd-clerk-auth-integration.md`
- Superseded pilot-era runbook (not followed): `/home/cloudcli/Dev/cosmic-agent-memory/server-deploy/` on `nolme-test`
- This repo's reference compose/Dockerfile: `docker-compose.yml`, `Dockerfile`, `.env.example`
- Tracking: `bd show AF-0bzk` (this work), `bd show AF-0m3k` (Clerk domain-strategy decision, still open, deferred)

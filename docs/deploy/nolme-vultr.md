# Building, modifying, and deploying the `new-test-chat.nolme.ai` container

Covers the Vultr/nolme.ai deployment of this repo: how to change code, rebuild
the image, and get it live on the `nolme-test` host. Written from the actual
commands used to build, deploy, and debug this client on 2026-08-15/16 — not
aspirational, every command here has been run for real against this host.

## Where things live

| What | Where |
|---|---|
| SSH access to the host | `ssh nolme-test` (alias; host IP `207.246.94.29`) |
| Client directory on host | `/home/nolme-ai/clients/new-test-chat/` (owned by system user `nolme-ai`) |
| Compose file | `/home/nolme-ai/clients/new-test-chat/docker-compose.yml` (rendered from `/home/nolme-ai/scripts/compose.template.yml`) |
| Deploy scripts on host | `/home/nolme-ai/scripts/{new-client.sh,refresh-env.sh,compose.template.yml}` |
| Doppler project/config | `nolme-ai` / `prd_silmari_chat_new_test_chat` |
| Doppler bootstrap token | `/etc/silmari-chat/new-test-chat/doppler.env` (holds `DOPPLER_TOKEN`, root:root 0600, readable by `nolme-ai` via the token grep below) |
| Live site | `https://new-test-chat.nolme.ai/` |
| Beads for this deployment | `AF-0bzk` (infra), `AF-0m3k` (Clerk), `AF-j59p` (Claude Agent SDK workspace scoping) |
| Isolated build worktree (optional) | `/home/maceo/ntm_Dev/vultr-nolme-deploy-2026-08-15` (branch of the same name) |

**Do not touch** the `cloudcli` system user's services on this same host
(`cc-agent-ui`, `cosmic-agent-memory`, `reel-studio`) — this deployment is
fully isolated under `nolme-ai` with its own port (127.0.0.1-bound) and
directory tree. After any redeploy, a quick sanity check that those three are
still `active (running)` is cheap insurance:
```bash
ssh nolme-test 'sudo -u cloudcli systemctl status cc-agent-ui cosmic-agent-memory reel-studio --no-pager'
```

## The sibling repo: `@librechat/agents` (`silmari-chat-agents`)

This repo depends on `@librechat/agents`, which is **not** an npm-registry
package — it's a git dependency pinned by commit hash, sourced from
`/home/maceo/Dev/silmari-chat-agents` (pushed to
`github.com/tha-hammer/silmari-chat-agents`). If the change you need touches
that package's own code (hooks, providers, the Claude Agent SDK bridge,
`createWorkspacePolicyHook`, etc.), you're editing the *sibling repo*, not
this one.

**Known gotcha, confirmed in this repo's current state**: the pin is
declared **twice**, and as of 2026-08-16 the two pins pointed at **different
commits**:
- `packages/api/package.json` → `"@librechat/agents": "github:tha-hammer/silmari-chat-agents#<commit>"`
- `api/package.json` → `"@librechat/agents": "git+https://github.com/tha-hammer/silmari-chat-agents.git#<commit>"`

When bumping the pin, check both files, decide whether both need to move
together (usually yes — this deployment's Docker image builds both `api/`
and `packages/api/`), and update both. After editing, reinstall from repo
root so the lockfile picks up the new commit:
```bash
cd /home/maceo/Dev/silmari-chat
npm install
git status   # confirm package-lock.json actually changed
```
Then proceed to "Build the image" below — the new sibling-repo code is now
part of what gets baked in.

If you only need to *read* the sibling repo's source to understand behavior
(not modify it), no pin change is needed — just read
`/home/maceo/Dev/silmari-chat-agents` directly.

## Modifying code in this repo

- New backend TypeScript work goes in `packages/api/src/**` (see root
  `CLAUDE.md` for the full workspace-boundary rules). Before building the
  image, always:
  ```bash
  cd /home/maceo/Dev/silmari-chat/packages/api
  npx tsc --noEmit -p .
  npx jest <relevant spec path> --silent
  ```
- Frontend copy (button labels, error text, etc.) lives in
  `client/src/locales/en/translation.json`, keyed by the `useLocalize()` key
  used in the component (e.g. `com_auth_clerk_sign_in`). Only the English
  file is hand-edited; other locales are generated externally. A translation
  change still requires a full image rebuild — it's baked into the static
  client bundle at build time, not read at runtime.
- **Check `git status` before building.** This is a shared checkout other
  agents/sessions may also be working in. If there's uncommitted work that
  isn't yours and isn't related to what you're deploying, don't build from
  the primary checkout — use the isolated worktree instead:
  ```bash
  cd /home/maceo/ntm_Dev/vultr-nolme-deploy-2026-08-15
  git merge --ff-only main   # pulls in everything already committed to main
  # apply/cherry-pick just your intended change here if it isn't committed yet
  ```
  If `git status` in the primary checkout is clean except for the change you
  intend to ship, building directly from `/home/maceo/Dev/silmari-chat` is
  fine and simpler.

## Build the image

From whichever checkout you're building from (repo root):
```bash
docker build \
  --build-arg BUILD_COMMIT=$(git rev-parse HEAD) \
  --build-arg BUILD_BRANCH=main \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t silmari-chat:new-test-chat \
  -f Dockerfile .
docker image inspect silmari-chat:new-test-chat --format '{{.Id}}'
```
Note the image ID — you'll compare it against the remote host's ID after
transfer to confirm an exact match, not just "a load happened."

## Transfer the image (no registry)

```bash
docker save silmari-chat:new-test-chat | gzip | ssh nolme-test 'gunzip | docker load'
ssh nolme-test 'docker image inspect silmari-chat:new-test-chat --format "{{.Id}}"'
```
The two `Id` values (local build output, remote inspect output) must match
exactly.

## Deploy

There are two different paths depending on what changed. Using the wrong one
either wastes ~2 minutes rebuilding for nothing, or silently fails to pick up
a real code change.

### A. Code changed (new image) → recreate the container

```bash
ssh nolme-test 'sudo -u nolme-ai bash -s' <<'SCRIPT'
set -euo pipefail
cd /home/nolme-ai/clients/new-test-chat
docker compose up -d api
SCRIPT
```
`up -d` (not `restart`) is required here — the `.env` file is bind-mounted,
but the *image* the container was created from is baked into the container
at creation time. A plain `restart` reuses the old image's layers even after
you've `docker load`ed a new one under the same tag. `up -d` detects the tag
now resolves to a different image ID and recreates the container.

### B. Only an env var / Doppler secret changed (no code/image change) → refresh env + restart

```bash
ssh nolme-test 'sudo -u nolme-ai bash -s' <<'SCRIPT'
set -euo pipefail
cd /home/nolme-ai/clients/new-test-chat
export DOPPLER_TOKEN=$(grep "^DOPPLER_TOKEN=" /etc/silmari-chat/new-test-chat/doppler.env | cut -d= -f2-)
/home/nolme-ai/scripts/refresh-env.sh new-test-chat prd_silmari_chat_new_test_chat
docker compose restart api
SCRIPT
```
`refresh-env.sh` re-downloads all secrets from Doppler into
`/home/nolme-ai/clients/new-test-chat/.env` (LibreChat's dotenv loader reads
`/app/.env` inside the container directly, so a real file has to exist — see
the script's own inline comment for why this is the one deliberate exception
to "no plaintext secrets file" on this host). `DOPPLER_TOKEN` must be
exported explicitly in this shell — `refresh-env.sh` doesn't source the
bootstrap file itself, and `doppler`'s CLI resolves scope from cwd, so
running this from outside `clients/new-test-chat` will fail with
`Invalid scope: . / stat .: permission denied`.

Setting a Doppler secret, in either case:
```bash
doppler secrets set SOME_VAR=some_value --project nolme-ai --config prd_silmari_chat_new_test_chat --silent >/dev/null 2>&1
```
**`doppler secrets set`/`delete` print plaintext values to stdout by
default.** Always redirect output (`--silent >/dev/null 2>&1` alone is not
enough for `get` calls used to verify — pipe those through `sha256sum` or
otherwise avoid echoing real secret values into a transcript/log). Use
`doppler secrets --project ... --config ... --only-names` to confirm a var
landed without printing its value.

## Verify

Boot health and config, from the host:
```bash
ssh nolme-test 'docker ps --filter name=new-test-chat --format "table {{.Names}}\t{{.Status}}"'
ssh nolme-test 'docker logs new-test-chat-app --tail 20 2>&1'
ssh nolme-test 'curl -sS http://127.0.0.1:3080/api/config'
```
Clean boot looks like `Server readiness checks passing.` with no
`ClerkAuthConfigError`/`ClerkIndexAssuranceError`/crash-loop lines.
`docker logs` is JSON-formatted on
this client (`CONSOLE_JSON=true` is set, added 2026-08-16 for auth
debugging) — pipe through `jq` or `grep` on the `message`/other keys as
needed, plain-text `grep -i clerk` still works fine on the raw JSON lines.

Public reachability:
```bash
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' https://new-test-chat.nolme.ai/api/config
```

For anything that only manifests in a real rendered page (auth flows, button
text, conditional UI) — **don't stop at curl**, the client is a React SPA and
curl only sees the shell HTML. This host has no `interceptor` CLI and no
`headless_shell` Playwright browser pre-installed, but a full Chromium build
already exists at `/home/maceo/.cache/ms-playwright/chromium-1194/` — point
Playwright at it directly rather than re-downloading:
```js
import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/home/maceo/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto('https://new-test-chat.nolme.ai/login', { waitUntil: 'load', timeout: 30000 });
// waitUntil: 'networkidle' hangs here — this app keeps a persistent
// connection open, so networkidle never fires. Use 'load' + an explicit wait.
await page.waitForTimeout(4000);
console.log(await page.locator('body').innerText());
await browser.close();
```
Run this as a `.mjs` file from inside `/home/maceo/Dev/silmari-chat` (needs
the repo's own `node_modules/playwright`, not a global install).

## Known hazards specific to this deployment

- **Arbitrary non-root runtime uid, no `/etc/passwd` entry.** Compose sets
  `user: "${UID}:${GID}"` from `refresh-env.sh`'s own `id -u`/`id -g`
  output, not a fixed uid. Any file/dir baked into the image via
  `COPY --chown=` alone will be unwritable at runtime unless explicitly
  world-writable at the directory level (see the `RUN find ... chmod o+w`
  step in `Dockerfile` for the pattern). Assume this hazard first on any new
  permissions bug, not last.
- `ALLOW_EMAIL_LOGIN=false` and `ALLOW_SOCIAL_REGISTRATION=true` are both
  deliberately set on this client (2026-08-16) — Clerk is the sole,
  exclusive login path here by design, not an oversight.

# Zettel — talk to the cosmic-agent-memory engine

You are interacting with the user's persistent agent memory. The engine runs on `ionos01` and is reachable via the SSH tunnel at `http://localhost:8787`. The `~/.local/bin/zettel` shell CLI wraps the HTTP API. Use it directly via Bash for all operations — do not call curl yourself unless the CLI is unavailable.

## Available subcommands

| Subcommand | Purpose | Example |
|---|---|---|
| `zettel save <content> [-t type] [-s scope] [-S source] [--status open\|in_progress\|blocked\|closed] [--blocked-by <id>] [--kind stub]` | Persist a memory bead. Returns `{id, status}`. | `zettel save "User prefers TDD" -t preference --status open` |
| `zettel recall <query> [-l limit] [-d depth] [-s scope] [--status open\|in_progress\|blocked\|closed]` | Search memory. Depth: `flat` \| `connected` \| `deep`. Status filter limits results to matching states. | `zettel recall "Block B" --status in_progress -l 5` |
| `zettel promote <id> --to <status> [--reason <text>] [--force]` | Transition a card to a new lifecycle state. Validates legal transitions. | `zettel promote br-vuj --to closed --reason "research saturated"` |
| `zettel status [-s scope]` | Check engine availability and scope. | `zettel status` |
| `zettel consolidate` | Run extract→cluster→promote→hub pipeline. | `zettel consolidate` |
| `zettel query [mode] [-w workSlug] [-t topic]` | Power query for context bundles. | `zettel query active-work -w block-c` |
| `zettel link <from> <to> <type>` | Create a dependency edge between two beads. | `zettel link br-mq5 br-uk4 derived-from` |
| `zettel hub <kind> <label>` | Upsert a structure note. Kinds: `workflow-map`, `customer-map`, `topic-hub`, `project-hub`. | `zettel hub topic-hub friday-demo` |
| `zettel forget <id> [reason]` | Close a bead. | `zettel forget br-uk4 "stale smoke test"` |
| `zettel trace <id>` | Find beads referencing this id. | `zettel trace br-mq5` |
| `zettel register [show\|hubs]` | Show the top-level index of all hubs. `hubs` gives a compact one-line-per-hub view. | `zettel register hubs` |
| `zettel raw <METHOD> <path> [body]` | Escape hatch for unwrapped endpoints. | `zettel raw GET /api/health` |

## Memory types (for `-t`)

- `episode` — a thing that happened (sessions, runs, observations)
- `fact` — a stable claim about the world
- `signal` — a noteworthy surprise, anomaly, or warning
- `learning` — an extracted insight or rule
- `preference` — a user preference or norm
- `artifact` — a reference to a document, file, or external resource

## What to do based on the user's input

The user typed `/zettel <args>`. Parse `<args>`:

### If `<args>` is empty or `help`
Run `zettel help` and show the output.

### If `<args>` starts with a known subcommand
Run `zettel <args>` directly via Bash. Show the JSON result. If saving, briefly echo what was saved and the returned `id`. If recalling, summarize the top results in 1-2 sentences before showing the JSON (so the user doesn't have to read raw JSON for the gist).

### If `<args>` is freeform text (no recognized subcommand)
Treat it as a `save`. Infer the type from the content:
- Begins with "I prefer", "I like", "always", "never" → `-t preference`
- Begins with "learned", "insight", "lesson", "discovered" → `-t learning`
- Begins with "bug", "broken", "failed", "warning", "surprised that" → `-t signal`
- Default → `-t fact`

Pass `-S "session-{date}"` as source so we know it came from this Claude Code session.

### Status inference (after type inference)

After picking the type, pick the lifecycle status from the user's verbs. First match wins:

| Verb pattern | Status |
|---|---|
| "I'm working on", "I'm starting", "let's research", "let me explore" | `in_progress` |
| "I'm done with", "that's settled", "no more to add", "finished with" | `closed` |
| "I need X first", "blocked on", "can't do this without", "depends on X" | `blocked` (and propose stub creation — see below) |
| anything else | `open` (default) |

**Always announce the inference.** E.g. "Saved as `in_progress` because you said 'working on'." or "Saved as `open` (default) — let me know if this is your current focus."

If multiple verb patterns conflict, prefer the more cautious state: `open > in_progress > blocked > closed`. Closed is hardest to reverse.

### Stub creation flow (when status would be `blocked`)

When the user describes a card whose body references concepts that DON'T EXIST yet as cards (verify via `zettel recall "{concept}" -l 1` returning empty), do NOT save the card directly. Instead:

1. Identify the missing anchors (typically 1-3).
2. Propose: "I'll create stubs for {concept-a} and {concept-b}, then save the main card as `blocked`. OK?"
3. On confirmation, run for each missing anchor:
   ```bash
   STUB_ID=$(zettel save "{Concept} (stub)" --kind stub --status open -s {relevant-scope})
   ```
4. Then save the main card with explicit blocked_by:
   ```bash
   zettel save "{full content}" --status blocked \
     --blocked-by $STUB1 --blocked-by $STUB2 \
     -s {topic-scope}
   ```
5. Show all returned IDs so the user can develop the stubs later.

### Resumption verb

When the user says "resume", "what was I working on", or "where did I leave off", run:

```bash
zettel recall --status in_progress -l 10
```

Group by scope; show the user the in_progress set as a numbered list they can pick from.

### Common composite intents

- "what do we know about X" / "recall X" → `zettel recall "X"`, then synthesize a 2-3 sentence answer from the top results, citing bead IDs.
- "save this conversation finding: X" → `zettel save "X" -t learning -S "session-finding"`
- "remember that I prefer X" → `zettel save "I prefer X" -t preference`
- "forget about Y" → recall Y first to get the id, then `zettel forget <id>`

## Important rules

- **Always show the bead `id` after saves** so the user can reference it later.
- **Never invent bead IDs.** If you need an id you don't have, recall first.
- **Don't save trivial chatter** — only save things the user explicitly asks to remember, or genuinely surprising/durable findings worth recall in future sessions. When in doubt, ask.
- **Scope defaults to `primary`** (documented fallback). Precedence: CLI `-s` flag > `$ZETTEL_SCOPE` env var > `primary`. The engine reads `$ZETTEL_SCOPE` on each request, so setting it in the engine host's shell environment overrides the compiled default without a code change. Pass `-s` only when the user explicitly asks for a different scope.
- **If the API is unreachable** (`zettel status` fails or returns `available: false`), tell the user the SSH tunnel may be down. Suggest: `ssh -fN -L 8787:localhost:8787 ionos01`.
- **The engine runs on a remote host.** Latency is ~50-100ms per call over the tunnel. Don't batch dozens of saves in a tight loop without telling the user.

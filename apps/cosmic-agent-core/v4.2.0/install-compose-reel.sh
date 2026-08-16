#!/usr/bin/env bash
# install-compose-reel.sh — TDD plan Phase 8 / CR-IN1.
#
# Installs the in-repo compose-reel pipeline definition to the user-global
# ICP runtime at $HOME/.claude/skills/InContextPipeline/pipelines/compose-reel/.
#
# ATOMIC: stages into a sibling mktemp dir alongside the install target,
# copies _build-pipeline.ts INTO the staging dir (because the generator uses
# `import.meta.dir` to resolve paths), runs the generator there, then atomic-
# mv's the staged pipeline dir + generated .json into the final location.
# A build failure leaves the previously-installed version intact.
#
# The slash command (apps/.../.claude/commands/compose_reel.md) lives in-repo
# where Claude Code reads it directly — no SKILL.md install needed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_PIPELINE="$HERE/.claude/skills/InContextPipeline/pipelines/compose-reel"
SRC_SLASH_CMD="$HERE/.claude/commands/compose_reel.md"
DST_PIPELINE_PARENT="$HOME/.claude/skills/InContextPipeline/pipelines"
DST_FINAL="$DST_PIPELINE_PARENT/compose-reel"
DST_FINAL_JSON="$DST_PIPELINE_PARENT/compose-reel.json"
DST_SLASH_CMD_PARENT="$HOME/.claude/commands"
DST_SLASH_CMD="$DST_SLASH_CMD_PARENT/compose_reel.md"
GENERATOR="$DST_PIPELINE_PARENT/_build-pipeline.ts"

if [ ! -f "$GENERATOR" ]; then
  echo "ERROR: $GENERATOR not found" >&2
  echo "       Install the ICP runtime first (silmari-agent-memory or equivalent source)" >&2
  exit 1
fi

mkdir -p "$DST_PIPELINE_PARENT"

# Stage in a uniquely-named tmp dir alongside the target so the final mv
# is on the same filesystem (atomic rename) AND so the generator's
# `import.meta.dir` lookups resolve to the staged layout.
STAGE_DIR="$(mktemp -d "$DST_PIPELINE_PARENT/compose-reel.staging.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT

# Copy generator + pipeline def into the staging dir as a self-contained tree.
cp "$GENERATOR" "$STAGE_DIR/_build-pipeline.ts"
cp -r "$SRC_PIPELINE" "$STAGE_DIR/compose-reel"

# Run the generator INSIDE the staging dir. import.meta.dir == $STAGE_DIR.
# Generator reads $STAGE_DIR/compose-reel/manifest.json + STEP_*.md and writes
# $STAGE_DIR/compose-reel.json.
bun "$STAGE_DIR/_build-pipeline.ts" compose-reel

# Verify the generator produced its output BEFORE swapping anything in.
if [ ! -f "$STAGE_DIR/compose-reel.json" ]; then
  echo "ERROR: _build-pipeline.ts did not produce $STAGE_DIR/compose-reel.json" >&2
  exit 1
fi

# Atomic swap: rename existing into a backup, move staged into place,
# remove backup. If the second mv fails, restore backup.
BACKUP_DIR=""
BACKUP_JSON=""
if [ -d "$DST_FINAL" ]; then
  BACKUP_DIR="$DST_FINAL.prev.$$"
  mv "$DST_FINAL" "$BACKUP_DIR"
fi
if [ -f "$DST_FINAL_JSON" ]; then
  BACKUP_JSON="$DST_FINAL_JSON.prev.$$"
  mv "$DST_FINAL_JSON" "$BACKUP_JSON"
fi

if ! mv "$STAGE_DIR/compose-reel" "$DST_FINAL"; then
  echo "ERROR: failed to move staged pipeline to $DST_FINAL; restoring backup" >&2
  [ -n "$BACKUP_DIR" ] && mv "$BACKUP_DIR" "$DST_FINAL"
  [ -n "$BACKUP_JSON" ] && mv "$BACKUP_JSON" "$DST_FINAL_JSON"
  exit 1
fi
mv "$STAGE_DIR/compose-reel.json" "$DST_FINAL_JSON"

# Clean up backups on success.
[ -n "$BACKUP_DIR" ] && rm -rf "$BACKUP_DIR"
[ -n "$BACKUP_JSON" ] && rm -f "$BACKUP_JSON"

echo "Installed compose-reel pipeline to $DST_FINAL"

# ── Slash command sync ────────────────────────────────────────────────
# Claude Code on the laptop reads slash commands from the project's
# .claude/commands/ directly, but hosted deployments (nolme.ai etc.)
# read from $HOME/.claude/commands/. Sync the file via a staged mv so
# the install on hosted boxes picks up new versions atomically.
if [ -f "$SRC_SLASH_CMD" ]; then
  mkdir -p "$DST_SLASH_CMD_PARENT"
  STAGE_CMD="$DST_SLASH_CMD_PARENT/.compose_reel.md.staging.$$"
  cp "$SRC_SLASH_CMD" "$STAGE_CMD"
  if ! mv "$STAGE_CMD" "$DST_SLASH_CMD"; then
    echo "ERROR: failed to install slash command $DST_SLASH_CMD" >&2
    rm -f "$STAGE_CMD"
    exit 1
  fi
  echo "Installed slash command to $DST_SLASH_CMD"
else
  echo "WARN: $SRC_SLASH_CMD not found; skipping slash command sync" >&2
fi

# Note: the session id is delivered to tools by cc-agent-ui itself — the backend
# sets process.env.COSMIC_SESSION_ID from the resume session id around query()
# (see cc-agent-ui/server/claude-sdk.js). No SessionStart hook is needed; the
# former PersistSessionId / CLAUDE_ENV_FILE channel was proven nondeterministic.

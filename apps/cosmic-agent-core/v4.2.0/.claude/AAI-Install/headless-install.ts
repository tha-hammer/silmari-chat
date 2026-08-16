#!/usr/bin/env bun
/**
 * AAI Headless Installer — Non-interactive client install
 *
 * The default installer (`bash install.sh` → `main.ts --mode gui`) launches
 * an Electron GUI; the CLI fallback (`main.ts --mode cli`) requires a real
 * terminal for readline-style prompts. Neither works for headless server
 * deploys driven from automation (SSH from a Bash tool call, CI pipeline,
 * Ansible/Terraform, etc.).
 *
 * This shim runs the same engine actions in the same order as the wizard,
 * but reads all "collected" config from environment variables with sane
 * defaults. No prompts. Idempotent — safe to re-run.
 *
 * Usage:
 *   AAI_PRINCIPAL_NAME="Demo User" \
 *   AAI_AI_NAME="Nolme" \
 *   AAI_TIMEZONE="UTC" \
 *   AAI_CATCHPHRASE="Demo install for client onboarding" \
 *   AAI_TEMPERATURE_UNIT="fahrenheit" \
 *   bun run ~/.claude/AAI-Install/headless-install.ts
 *
 * Optional:
 *   AAI_ELEVENLABS_KEY=sk_...        Voice setup (omit to skip voice)
 *   AAI_SKIP_VALIDATION=1            Skip the post-install validation step
 *   AAI_SKIP_REPOSITORY=1            Skip the repository step (when files
 *                                     are already in place via rsync and
 *                                     you don't even want the dir-creation
 *                                     side-effect)
 *
 * Wizard prompt → env var mapping (for runbook reference):
 *   Step 3 API Keys                  → AAI_ELEVENLABS_KEY
 *   Step 4 Identity → name           → AAI_PRINCIPAL_NAME
 *   Step 4 Identity → AI name        → AAI_AI_NAME
 *   Step 4 Identity → timezone       → AAI_TIMEZONE
 *   Step 4 Identity → catchphrase    → AAI_CATCHPHRASE
 *   Step 4 Identity → temp unit      → AAI_TEMPERATURE_UNIT
 *   Step 7 Voice                     → skipped unless AAI_ELEVENLABS_KEY set
 *
 * Steps that NEVER prompted (auto):
 *   Step 1 system-detect, Step 2 prerequisites, Step 5 repository,
 *   Step 6 configuration, Step 8 validation
 */

import { homedir } from "os";
import { join } from "path";
import {
  runSystemDetect,
  runRepository,
  runConfiguration,
} from "./engine/actions";
import { runValidation, generateSummary } from "./engine/validate";
import { createFreshState, completeStep, skipStep } from "./engine/state";
import type { EngineEvent, InstallState } from "./engine/types";

// ─── Config from env ───────────────────────────────────────
const COLLECTED = {
  principalName: process.env.AAI_PRINCIPAL_NAME || "User",
  aiName: process.env.AAI_AI_NAME || "AAI",
  timezone:
    process.env.AAI_TIMEZONE ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC",
  catchphrase: process.env.AAI_CATCHPHRASE || "Ready to go",
  temperatureUnit: (process.env.AAI_TEMPERATURE_UNIT || "fahrenheit") as
    | "fahrenheit"
    | "celsius",
  elevenLabsKey: process.env.AAI_ELEVENLABS_KEY || undefined,
};

const SKIP_VALIDATION = process.env.AAI_SKIP_VALIDATION === "1";
const SKIP_REPOSITORY = process.env.AAI_SKIP_REPOSITORY === "1";

// ─── Event sink — log everything to stdout ────────────────
const emit = async (event: EngineEvent): Promise<void> => {
  switch (event.event) {
    case "step_start":
      console.log(`\n▶ ${event.step.toUpperCase()}`);
      break;
    case "step_complete":
      console.log(`  ✓ ${event.step} complete`);
      break;
    case "step_error":
      console.error(`  ✗ ${event.step}: ${event.error}`);
      break;
    case "step_skip":
      console.log(`  ⊘ ${event.step} skipped: ${event.reason}`);
      break;
    case "progress":
      console.log(`  [${String(event.percent).padStart(3)}%] ${event.detail}`);
      break;
    case "message":
      console.log(`  → ${event.content}`);
      break;
    case "input_needed":
    case "choice_needed":
      console.error(
        `  ✗ unexpected interactive prompt from ${event.id}: ${event.prompt}`,
      );
      console.error(
        `    headless mode does not support prompts — investigate the action`,
      );
      process.exit(1);
      break;
    case "error":
      console.error(`  ✗ ${event.message}`);
      break;
  }
};

// ─── Main install flow ────────────────────────────────────
async function main(): Promise<void> {
  console.log("══════════════════════════════════════════════════════");
  console.log("  AAI Headless Installer — non-interactive client mode");
  console.log("══════════════════════════════════════════════════════");
  console.log("");
  console.log("Config:");
  console.log(`  principal:   ${COLLECTED.principalName}`);
  console.log(`  ai name:     ${COLLECTED.aiName}`);
  console.log(`  timezone:    ${COLLECTED.timezone}`);
  console.log(`  catchphrase: ${COLLECTED.catchphrase}`);
  console.log(`  temp unit:   ${COLLECTED.temperatureUnit}`);
  console.log(
    `  voice:       ${COLLECTED.elevenLabsKey ? "(elevenlabs key set)" : "(skipped)"}`,
  );
  console.log("");

  // Build state
  const state: InstallState = createFreshState("cli");
  state.collected = COLLECTED;

  // ─── Step 1: System Detection ──
  await runSystemDetect(state, emit);
  completeStep(state, "system-detect");

  // ─── Step 2: Prerequisites ──
  // Skipped — toolchain is verified externally before running this script.
  // The wizard's runPrerequisites tries to install bun/git/claude if
  // missing, which is brittle in a headless context. Document this in
  // the runbook: prereqs are Stage 0 work, not part of the AAI install.
  skipStep(state, "prerequisites", "verified externally in Stage 0");

  // ─── Step 3: API Keys ──
  if (COLLECTED.elevenLabsKey) {
    state.collected.elevenLabsKey = COLLECTED.elevenLabsKey;
    completeStep(state, "api-keys");
  } else {
    skipStep(state, "api-keys", "no AAI_ELEVENLABS_KEY in env");
  }

  // ─── Step 4: Identity ──
  // Already in state.collected. Mark complete without invoking the
  // wizard's runIdentity (which only does prompts).
  completeStep(state, "identity");

  // ─── Step 5: Repository ──
  if (SKIP_REPOSITORY) {
    skipStep(state, "repository", "AAI_SKIP_REPOSITORY=1");
  } else {
    // runRepository takes the upgrade-preserve branch when paiInstalled=true
    // (verified via detect.ts:80-95 — paiInstalled is set when settings.json
    // OR skills/AAI/SKILL.md exists, both true after rsync).
    await runRepository(state, emit);
    completeStep(state, "repository");
  }

  // ─── Step 6: Configuration ──
  // The actual work: generates settings.json, .env symlinks, shell alias.
  await runConfiguration(state, emit);
  completeStep(state, "configuration");

  // ─── Step 7: Voice ──
  // Skipped unless an ElevenLabs key was provided. The wizard's voice
  // setup also installs a LaunchAgent on macOS — irrelevant for Linux
  // headless installs anyway.
  skipStep(state, "voice", "headless install — voice configured separately");

  // ─── Step 8: Validation ──
  if (!SKIP_VALIDATION) {
    console.log("\n▶ VALIDATION");
    const checks = await runValidation(state);
    let allCriticalPassed = true;
    for (const check of checks) {
      const icon = check.passed ? "✓" : check.critical ? "✗" : "⚠";
      console.log(`  ${icon} ${check.name}: ${check.detail}`);
      if (check.critical && !check.passed) allCriticalPassed = false;
    }
    if (!allCriticalPassed) {
      console.error(
        "\n✗ Some critical validation checks failed. Review and fix above.",
      );
      process.exit(2);
    }
    completeStep(state, "validation");
  }

  // ─── Summary ──
  console.log("\n══════════════════════════════════════════════════════");
  const summary = generateSummary(state);
  console.log(`  AAI version:    ${summary.paiVersion}`);
  console.log(`  Principal:      ${summary.principalName}`);
  console.log(`  AI name:        ${summary.aiName}`);
  console.log(`  Timezone:       ${summary.timezone}`);
  console.log(
    `  Voice:          ${summary.voiceEnabled ? summary.voiceMode : "disabled"}`,
  );
  console.log(`  Install type:   ${summary.installType}`);
  console.log(
    `  Steps:          ${summary.completedSteps}/${summary.totalSteps}`,
  );
  console.log("══════════════════════════════════════════════════════");
  console.log("\n✓ Headless install complete.");
  console.log(`  Settings: ${join(homedir(), ".claude", "settings.json")}`);
  console.log(`  Next: source ~/.bashrc && aai`);
}

main().catch((err) => {
  console.error("\n✗ Fatal error:", err.message);
  console.error(err.stack);
  process.exit(1);
});

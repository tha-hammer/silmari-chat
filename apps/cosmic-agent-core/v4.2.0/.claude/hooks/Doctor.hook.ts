#!/usr/bin/env bun
/**
 * Doctor.hook.ts — Health check hook entrypoint
 *
 * B8: Doctor command/hook integration
 *
 * PURPOSE:
 * Runs health checks on the AAI hook infrastructure and reports status.
 * Can be invoked explicitly for diagnostics.
 *
 * TRIGGER: Manual invocation or scheduled health check
 *
 * OUTPUT:
 * - stdout: Doctor report (human-readable or JSON)
 * - exit(0): All checks pass or warn
 * - exit(1): Any check fails
 *
 * SIDE EFFECTS:
 * - None (read-only checks)
 */

import { runDoctor, renderDoctorAdvice, type DoctorReport } from './lib/doctor';

// ========================================
// B8: Main Doctor Hook
// ========================================

export async function mainDoctor(): Promise<{
  exitCode: number;
  report: DoctorReport;
}> {
  const report = await runDoctor();
  const exitCode = report.summary.fail > 0 ? 1 : 0;
  return { exitCode, report };
}

// ========================================
// CLI Entrypoint
// ========================================

async function main(): Promise<void> {
  const { exitCode, report } = await mainDoctor();

  // Check for --json flag
  const jsonMode = process.argv.includes('--json');

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderDoctorAdvice(report));
  }

  process.exit(exitCode);
}

// Only run if executed directly (not imported)
if (import.meta.main) {
  main().catch((err) => {
    console.error('Doctor failed:', err);
    process.exit(1);
  });
}

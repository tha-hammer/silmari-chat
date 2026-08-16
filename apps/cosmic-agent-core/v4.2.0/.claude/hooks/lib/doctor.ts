/**
 * doctor.ts — Health check system for AAI hook infrastructure
 *
 * B6: Doctor health check report
 * B7: Doctor remediation suggestions
 *
 * All checks are read-only (no mutations).
 * Filesystem access is injected for testability.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ========================================
// Types
// ========================================

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  advice?: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  summary: { pass: number; warn: number; fail: number };
}

/**
 * Filesystem abstraction for testability.
 * Production uses real fs; tests inject mocks.
 */
export interface FsAdapter {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf-8'): string;
  statSync(path: string): { mtimeMs: number; size: number };
}

export interface CommandAdapter {
  which(name: string): boolean;
}

/**
 * Default filesystem adapter using real fs.
 */
export const realFsAdapter: FsAdapter = {
  existsSync,
  readFileSync: (path: string, encoding: 'utf-8') =>
    readFileSync(path, encoding),
  statSync: (path: string) => {
    const s = statSync(path);
    return { mtimeMs: s.mtimeMs, size: s.size };
  },
};

// ========================================
// Individual Checks
// ========================================

/**
 * Check: Is `br` CLI available and workspace initialized?
 */
export function checkBeads(
  cmd: CommandAdapter,
  fs: FsAdapter,
  homeDir: string
): DoctorCheck {
  const brAvailable = cmd.which('br');
  if (!brAvailable) {
    return {
      name: 'beads',
      status: 'fail',
      message: 'br CLI not found in PATH',
      advice: 'Install beads_rust: cargo install beads_rust, or add br to PATH',
    };
  }

  // Check if workspace is initialized (look for .beads directory)
  const beadsDir = join(homeDir, '.beads');
  if (!fs.existsSync(beadsDir)) {
    return {
      name: 'beads',
      status: 'warn',
      message: 'br CLI available but workspace not initialized',
      advice: 'Run `br init` to initialize beads workspace',
    };
  }

  return {
    name: 'beads',
    status: 'pass',
    message: 'br CLI available and workspace initialized',
  };
}

/**
 * Check: Does events.jsonl exist and contain recent entries?
 */
export function checkEvents(
  fs: FsAdapter,
  eventsPath: string
): DoctorCheck {
  if (!fs.existsSync(eventsPath)) {
    return {
      name: 'events',
      status: 'warn',
      message: 'events.jsonl not found',
      advice:
        'Events file will be created automatically on first hook execution',
    };
  }

  try {
    const stat = fs.statSync(eventsPath);
    const ageMs = Date.now() - stat.mtimeMs;
    const oneDay = 24 * 60 * 60 * 1000;

    if (ageMs > oneDay) {
      return {
        name: 'events',
        status: 'warn',
        message: `events.jsonl exists but last modified ${Math.floor(ageMs / oneDay)} days ago`,
        advice: 'Hooks may not be running. Check settings.json hook configuration',
      };
    }

    return {
      name: 'events',
      status: 'pass',
      message: 'events.jsonl exists with recent entries',
    };
  } catch {
    return {
      name: 'events',
      status: 'warn',
      message: 'Could not stat events.jsonl',
      advice: 'Check file permissions on events.jsonl',
    };
  }
}

/**
 * Check: Does settings.json exist and parse correctly?
 */
export function checkSettings(
  fs: FsAdapter,
  settingsPath: string
): DoctorCheck {
  if (!fs.existsSync(settingsPath)) {
    return {
      name: 'settings',
      status: 'fail',
      message: 'settings.json not found',
      advice:
        'Create settings.json in ~/.claude/ with hook configuration',
    };
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    JSON.parse(content);
    return {
      name: 'settings',
      status: 'pass',
      message: 'settings.json exists and parses correctly',
    };
  } catch {
    return {
      name: 'settings',
      status: 'fail',
      message: 'settings.json exists but contains invalid JSON',
      advice: 'Fix JSON syntax in settings.json. Use a JSON validator to find errors',
    };
  }
}

/**
 * Check: Do projection files exist?
 */
export function checkProjections(
  fs: FsAdapter,
  projectionPaths: { work: string; sessionNames: string }
): DoctorCheck {
  const workExists = fs.existsSync(projectionPaths.work);
  const sessionNamesExists = fs.existsSync(projectionPaths.sessionNames);

  if (!workExists && !sessionNamesExists) {
    return {
      name: 'projections',
      status: 'warn',
      message: 'No projection files found (work.json, session-names.json)',
      advice:
        'Projection files are created by hooks during sessions. Start a session to generate them',
    };
  }

  if (!workExists) {
    return {
      name: 'projections',
      status: 'warn',
      message: 'work.json not found (session-names.json exists)',
      advice: 'work.json will be generated by hook activity',
    };
  }

  if (!sessionNamesExists) {
    return {
      name: 'projections',
      status: 'warn',
      message: 'session-names.json not found (work.json exists)',
      advice: 'session-names.json will be generated by hook activity',
    };
  }

  return {
    name: 'projections',
    status: 'pass',
    message: 'All projection files present',
  };
}

/**
 * Check: Are expected hook files present?
 */
export function checkHooks(
  fs: FsAdapter,
  hooksDir: string,
  expectedHooks: string[]
): DoctorCheck {
  const missing: string[] = [];
  const present: string[] = [];

  for (const hookName of expectedHooks) {
    const hookPath = join(hooksDir, hookName);
    if (fs.existsSync(hookPath)) {
      present.push(hookName);
    } else {
      missing.push(hookName);
    }
  }

  if (missing.length === expectedHooks.length) {
    return {
      name: 'hooks',
      status: 'fail',
      message: `No hook files found in ${hooksDir}`,
      advice: 'Run `bun test` to verify hook integrity. Reinstall hooks if needed',
    };
  }

  if (missing.length > 0) {
    return {
      name: 'hooks',
      status: 'warn',
      message: `Missing hooks: ${missing.join(', ')}`,
      advice: `Install missing hooks: ${missing.join(', ')}`,
    };
  }

  return {
    name: 'hooks',
    status: 'pass',
    message: `All ${present.length} expected hooks present`,
  };
}

// ========================================
// B6: Full Doctor Report
// ========================================

export interface DoctorConfig {
  homeDir?: string;
  claudeDir?: string;
  hooksDir?: string;
  expectedHooks?: string[];
  fs?: FsAdapter;
  cmd?: CommandAdapter;
}

const DEFAULT_EXPECTED_HOOKS = [
  'SecurityValidator.hook.ts',
  'LoadContext.hook.ts',
  'Doctor.hook.ts',
];

/**
 * Run all doctor checks and produce a report.
 * All checks are read-only (no mutations).
 */
export async function runDoctor(config: DoctorConfig = {}): Promise<DoctorReport> {
  const home = config.homeDir || homedir();
  const claudeDir = config.claudeDir || join(home, '.claude');
  const hooksDir = config.hooksDir || join(claudeDir, 'hooks');
  const fs = config.fs || realFsAdapter;
  const cmd = config.cmd || {
    which: (_name: string) => {
      try {
        const result = Bun.spawnSync(['which', _name]);
        return result.exitCode === 0;
      } catch {
        return false;
      }
    },
  };
  const expectedHooks = config.expectedHooks || DEFAULT_EXPECTED_HOOKS;

  const checks: DoctorCheck[] = [
    checkBeads(cmd, fs, home),
    checkEvents(fs, join(claudeDir, 'events.jsonl')),
    checkSettings(fs, join(claudeDir, 'settings.json')),
    checkProjections(fs, {
      work: join(claudeDir, 'work.json'),
      sessionNames: join(claudeDir, 'session-names.json'),
    }),
    checkHooks(fs, hooksDir, expectedHooks),
  ];

  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };

  return { checks, summary };
}

// ========================================
// B7: Remediation Advice Renderer
// ========================================

/**
 * Render human-readable advice from a doctor report.
 * For each failed/warned check, provides specific actionable advice.
 * Never suggests destructive actions.
 */
export function renderDoctorAdvice(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push('=== AAI Doctor Report ===');
  lines.push('');

  // Summary line
  const { pass, warn, fail } = report.summary;
  const statusEmoji = fail > 0 ? 'FAIL' : warn > 0 ? 'WARN' : 'PASS';
  lines.push(
    `Status: ${statusEmoji} (${pass} pass, ${warn} warn, ${fail} fail)`
  );
  lines.push('');

  // Individual checks
  for (const check of report.checks) {
    const icon =
      check.status === 'pass'
        ? '[PASS]'
        : check.status === 'warn'
          ? '[WARN]'
          : '[FAIL]';
    lines.push(`${icon} ${check.name}: ${check.message}`);
    if (check.advice) {
      lines.push(`       -> ${check.advice}`);
    }
  }

  lines.push('');

  // Actionable next steps for failures
  const failures = report.checks.filter((c) => c.status === 'fail');
  if (failures.length > 0) {
    lines.push('=== Required Actions ===');
    for (const f of failures) {
      if (f.advice) {
        lines.push(`  - ${f.advice}`);
      }
    }
    lines.push('');
  }

  // Warnings
  const warnings = report.checks.filter((c) => c.status === 'warn');
  if (warnings.length > 0) {
    lines.push('=== Recommended Actions ===');
    for (const w of warnings) {
      if (w.advice) {
        lines.push(`  - ${w.advice}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

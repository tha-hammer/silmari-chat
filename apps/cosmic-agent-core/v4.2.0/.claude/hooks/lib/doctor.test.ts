/**
 * doctor.test.ts — Tests for doctor health check system
 *
 * B6: Doctor health check report
 * B7: Doctor remediation suggestions
 */

import { describe, it, expect } from 'bun:test';
import {
  checkBeads,
  checkEvents,
  checkSettings,
  checkProjections,
  checkHooks,
  runDoctor,
  renderDoctorAdvice,
  type FsAdapter,
  type CommandAdapter,
  type DoctorReport,
} from './doctor';

// ========================================
// Mock Helpers
// ========================================

function createMockFs(files: Record<string, string | { mtimeMs: number; size: number }>): FsAdapter {
  return {
    existsSync(path: string): boolean {
      return path in files;
    },
    readFileSync(path: string, _encoding: 'utf-8'): string {
      const entry = files[path];
      if (entry === undefined) throw new Error(`ENOENT: ${path}`);
      if (typeof entry === 'string') return entry;
      return ''; // stat-only entries
    },
    statSync(path: string): { mtimeMs: number; size: number } {
      const entry = files[path];
      if (entry === undefined) throw new Error(`ENOENT: ${path}`);
      if (typeof entry === 'object') return entry;
      return { mtimeMs: Date.now(), size: (entry as string).length };
    },
  };
}

function createMockCmd(available: string[]): CommandAdapter {
  return {
    which(name: string): boolean {
      return available.includes(name);
    },
  };
}

// ========================================
// B6: checkBeads
// ========================================

describe('B6: checkBeads', () => {
  it('fails when br CLI not in PATH', () => {
    const cmd = createMockCmd([]);
    const fs = createMockFs({});
    const result = checkBeads(cmd, fs, '/home/test');
    expect(result.status).toBe('fail');
    expect(result.message).toContain('not found');
    expect(result.advice).toContain('install');
  });

  it('warns when br available but workspace not initialized', () => {
    const cmd = createMockCmd(['br']);
    const fs = createMockFs({});
    const result = checkBeads(cmd, fs, '/home/test');
    expect(result.status).toBe('warn');
    expect(result.advice).toContain('br init');
  });

  it('passes when br available and workspace initialized', () => {
    const cmd = createMockCmd(['br']);
    const fs = createMockFs({ '/home/test/.beads': '' });
    const result = checkBeads(cmd, fs, '/home/test');
    expect(result.status).toBe('pass');
  });
});

// ========================================
// B6: checkEvents
// ========================================

describe('B6: checkEvents', () => {
  it('warns when events.jsonl not found', () => {
    const fs = createMockFs({});
    const result = checkEvents(fs, '/home/test/.claude/events.jsonl');
    expect(result.status).toBe('warn');
    expect(result.message).toContain('not found');
  });

  it('passes when events.jsonl exists with recent entries', () => {
    const fs = createMockFs({
      '/home/test/.claude/events.jsonl': {
        mtimeMs: Date.now() - 1000, // 1 second ago
        size: 500,
      },
    });
    const result = checkEvents(fs, '/home/test/.claude/events.jsonl');
    expect(result.status).toBe('pass');
  });

  it('warns when events.jsonl is stale (>1 day old)', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const fs = createMockFs({
      '/home/test/.claude/events.jsonl': {
        mtimeMs: twoDaysAgo,
        size: 500,
      },
    });
    const result = checkEvents(fs, '/home/test/.claude/events.jsonl');
    expect(result.status).toBe('warn');
    expect(result.message).toContain('days ago');
  });
});

// ========================================
// B6: checkSettings
// ========================================

describe('B6: checkSettings', () => {
  it('fails when settings.json not found', () => {
    const fs = createMockFs({});
    const result = checkSettings(fs, '/home/test/.claude/settings.json');
    expect(result.status).toBe('fail');
    expect(result.advice).toContain('Create settings.json');
  });

  it('passes when settings.json exists and parses', () => {
    const fs = createMockFs({
      '/home/test/.claude/settings.json': '{"hooks": {}}',
    });
    const result = checkSettings(fs, '/home/test/.claude/settings.json');
    expect(result.status).toBe('pass');
  });

  it('fails when settings.json contains invalid JSON', () => {
    const fs = createMockFs({
      '/home/test/.claude/settings.json': '{invalid json!!!',
    });
    const result = checkSettings(fs, '/home/test/.claude/settings.json');
    expect(result.status).toBe('fail');
    expect(result.message).toContain('invalid JSON');
    expect(result.advice).toContain('Fix JSON');
  });
});

// ========================================
// B6: checkProjections
// ========================================

describe('B6: checkProjections', () => {
  it('warns when no projection files found', () => {
    const fs = createMockFs({});
    const result = checkProjections(fs, {
      work: '/home/test/.claude/work.json',
      sessionNames: '/home/test/.claude/session-names.json',
    });
    expect(result.status).toBe('warn');
    expect(result.message).toContain('No projection files');
  });

  it('passes when both projection files exist', () => {
    const fs = createMockFs({
      '/home/test/.claude/work.json': '{}',
      '/home/test/.claude/session-names.json': '{}',
    });
    const result = checkProjections(fs, {
      work: '/home/test/.claude/work.json',
      sessionNames: '/home/test/.claude/session-names.json',
    });
    expect(result.status).toBe('pass');
  });

  it('warns when only work.json missing', () => {
    const fs = createMockFs({
      '/home/test/.claude/session-names.json': '{}',
    });
    const result = checkProjections(fs, {
      work: '/home/test/.claude/work.json',
      sessionNames: '/home/test/.claude/session-names.json',
    });
    expect(result.status).toBe('warn');
    expect(result.message).toContain('work.json not found');
  });

  it('warns when only session-names.json missing', () => {
    const fs = createMockFs({
      '/home/test/.claude/work.json': '{}',
    });
    const result = checkProjections(fs, {
      work: '/home/test/.claude/work.json',
      sessionNames: '/home/test/.claude/session-names.json',
    });
    expect(result.status).toBe('warn');
    expect(result.message).toContain('session-names.json not found');
  });
});

// ========================================
// B6: checkHooks
// ========================================

describe('B6: checkHooks', () => {
  const hooksDir = '/home/test/.claude/hooks';
  const expectedHooks = [
    'SecurityValidator.hook.ts',
    'LoadContext.hook.ts',
    'Doctor.hook.ts',
  ];

  it('fails when no hook files found', () => {
    const fs = createMockFs({});
    const result = checkHooks(fs, hooksDir, expectedHooks);
    expect(result.status).toBe('fail');
    expect(result.advice).toContain('bun test');
  });

  it('passes when all hooks present', () => {
    const fs = createMockFs({
      '/home/test/.claude/hooks/SecurityValidator.hook.ts': '',
      '/home/test/.claude/hooks/LoadContext.hook.ts': '',
      '/home/test/.claude/hooks/Doctor.hook.ts': '',
    });
    const result = checkHooks(fs, hooksDir, expectedHooks);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('3 expected hooks');
  });

  it('warns when some hooks missing', () => {
    const fs = createMockFs({
      '/home/test/.claude/hooks/SecurityValidator.hook.ts': '',
    });
    const result = checkHooks(fs, hooksDir, expectedHooks);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('Missing hooks');
    expect(result.message).toContain('LoadContext.hook.ts');
    expect(result.message).toContain('Doctor.hook.ts');
  });
});

// ========================================
// B6: runDoctor (full integration)
// ========================================

describe('B6: runDoctor', () => {
  it('produces a report with all 5 checks', async () => {
    const fs = createMockFs({
      '/home/test/.beads': '',
      '/home/test/.claude/events.jsonl': { mtimeMs: Date.now(), size: 100 },
      '/home/test/.claude/settings.json': '{}',
      '/home/test/.claude/work.json': '{}',
      '/home/test/.claude/session-names.json': '{}',
      '/home/test/.claude/hooks/SecurityValidator.hook.ts': '',
      '/home/test/.claude/hooks/LoadContext.hook.ts': '',
      '/home/test/.claude/hooks/Doctor.hook.ts': '',
    });
    const cmd = createMockCmd(['br']);

    const report = await runDoctor({
      homeDir: '/home/test',
      claudeDir: '/home/test/.claude',
      hooksDir: '/home/test/.claude/hooks',
      fs,
      cmd,
    });

    expect(report.checks).toHaveLength(5);
    expect(report.summary.pass).toBe(5);
    expect(report.summary.warn).toBe(0);
    expect(report.summary.fail).toBe(0);
  });

  it('reports correct summary counts', async () => {
    // Only settings.json exists and is valid
    const fs = createMockFs({
      '/home/test/.claude/settings.json': '{}',
    });
    const cmd = createMockCmd([]); // br not available

    const report = await runDoctor({
      homeDir: '/home/test',
      claudeDir: '/home/test/.claude',
      hooksDir: '/home/test/.claude/hooks',
      fs,
      cmd,
    });

    expect(report.checks).toHaveLength(5);
    // beads: fail (no br), events: warn, settings: pass, projections: warn, hooks: fail
    expect(report.summary.pass).toBe(1);
    expect(report.summary.fail).toBeGreaterThanOrEqual(1);
    expect(report.summary.pass + report.summary.warn + report.summary.fail).toBe(5);
  });
});

// ========================================
// B7: renderDoctorAdvice
// ========================================

describe('B7: renderDoctorAdvice', () => {
  it('renders all-pass report', () => {
    const report: DoctorReport = {
      checks: [
        { name: 'beads', status: 'pass', message: 'OK' },
        { name: 'events', status: 'pass', message: 'OK' },
        { name: 'settings', status: 'pass', message: 'OK' },
      ],
      summary: { pass: 3, warn: 0, fail: 0 },
    };

    const advice = renderDoctorAdvice(report);
    expect(advice).toContain('PASS');
    expect(advice).toContain('3 pass');
    expect(advice).not.toContain('Required Actions');
  });

  it('renders failures with required actions', () => {
    const report: DoctorReport = {
      checks: [
        {
          name: 'settings',
          status: 'fail',
          message: 'settings.json not found',
          advice: 'Create settings.json in ~/.claude/',
        },
      ],
      summary: { pass: 0, warn: 0, fail: 1 },
    };

    const advice = renderDoctorAdvice(report);
    expect(advice).toContain('FAIL');
    expect(advice).toContain('Required Actions');
    expect(advice).toContain('Create settings.json');
  });

  it('renders warnings with recommended actions', () => {
    const report: DoctorReport = {
      checks: [
        {
          name: 'beads',
          status: 'warn',
          message: 'workspace not initialized',
          advice: 'Run `br init` to initialize beads workspace',
        },
      ],
      summary: { pass: 0, warn: 1, fail: 0 },
    };

    const advice = renderDoctorAdvice(report);
    expect(advice).toContain('WARN');
    expect(advice).toContain('Recommended Actions');
    expect(advice).toContain('br init');
  });

  it('includes check details with icons', () => {
    const report: DoctorReport = {
      checks: [
        { name: 'beads', status: 'pass', message: 'OK' },
        {
          name: 'settings',
          status: 'fail',
          message: 'not found',
          advice: 'Fix it',
        },
        {
          name: 'events',
          status: 'warn',
          message: 'stale',
          advice: 'Check hooks',
        },
      ],
      summary: { pass: 1, warn: 1, fail: 1 },
    };

    const advice = renderDoctorAdvice(report);
    expect(advice).toContain('[PASS] beads');
    expect(advice).toContain('[FAIL] settings');
    expect(advice).toContain('[WARN] events');
  });

  it('never suggests destructive actions', () => {
    const report: DoctorReport = {
      checks: [
        {
          name: 'beads',
          status: 'fail',
          message: 'not found',
          advice: 'Install beads_rust: cargo install beads_rust, or add br to PATH',
        },
        {
          name: 'hooks',
          status: 'fail',
          message: 'missing',
          advice: 'Run `bun test` to verify hook integrity. Reinstall hooks if needed',
        },
      ],
      summary: { pass: 0, warn: 0, fail: 2 },
    };

    const advice = renderDoctorAdvice(report);
    // Should not contain destructive keywords
    expect(advice).not.toContain('rm -rf');
    expect(advice).not.toContain('delete');
    expect(advice).not.toContain('destroy');
    expect(advice).not.toContain('format');
    expect(advice).not.toContain('wipe');
  });
});

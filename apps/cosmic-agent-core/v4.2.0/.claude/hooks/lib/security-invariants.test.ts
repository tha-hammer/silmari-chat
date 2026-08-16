/**
 * security-invariants.test.ts — Tests for security evaluation pure functions
 *
 * B1: Blocked-command invariants
 * B2: Path ACL invariants
 * B3: Command normalization invariants
 */

import { describe, it, expect } from 'bun:test';
import {
  evaluateSecurity,
  checkPathAccess,
  normalizeCommand,
  DEFAULT_PATTERNS,
} from './security-invariants';

// ========================================
// B1: Blocked-command invariants
// ========================================

describe('B1: evaluateSecurity — blocked commands', () => {
  const BLOCKED_COMMANDS = [
    'rm -rf /',
    'rm -rf /*',
    'mkfs.ext4 /dev/sda',
    'dd if=/dev/zero of=/dev/sda',
    ':(){:|:&};:',
    'chmod -R 777 /',
    '> /dev/sda',
  ];

  for (const cmd of BLOCKED_COMMANDS) {
    it(`blocks: ${cmd}`, () => {
      const result = evaluateSecurity(cmd);
      expect(result.action).toBe('block');
      expect(result.reason).toBeTruthy();
    });
  }

  it('blocks rm -rf ~ (home directory destruction)', () => {
    const result = evaluateSecurity('rm -rf ~');
    expect(result.action).toBe('block');
  });

  it('blocks gh repo delete', () => {
    const result = evaluateSecurity('gh repo delete my-repo');
    expect(result.action).toBe('block');
  });

  it('blocks diskutil eraseDisk', () => {
    const result = evaluateSecurity('diskutil eraseDisk JHFS+ Untitled /dev/disk2');
    expect(result.action).toBe('block');
  });
});

describe('B1: evaluateSecurity — confirm commands', () => {
  it('confirms git push --force', () => {
    const result = evaluateSecurity('git push --force origin main');
    expect(result.action).toBe('confirm');
    expect(result.reason).toContain('Force push');
  });

  it('confirms git push -f', () => {
    const result = evaluateSecurity('git push -f');
    expect(result.action).toBe('confirm');
  });

  it('confirms git reset --hard', () => {
    const result = evaluateSecurity('git reset --hard HEAD~3');
    expect(result.action).toBe('confirm');
  });

  it('confirms terraform destroy', () => {
    const result = evaluateSecurity('terraform destroy -auto-approve');
    expect(result.action).toBe('confirm');
  });

  it('confirms DROP DATABASE', () => {
    const result = evaluateSecurity('DROP DATABASE production');
    expect(result.action).toBe('confirm');
  });

  it('confirms DROP TABLE', () => {
    const result = evaluateSecurity('DROP TABLE users');
    expect(result.action).toBe('confirm');
  });

  it('confirms TRUNCATE', () => {
    const result = evaluateSecurity('TRUNCATE TABLE sessions');
    expect(result.action).toBe('confirm');
  });
});

describe('B1: evaluateSecurity — alert commands', () => {
  it('alerts on curl | sh', () => {
    const result = evaluateSecurity('curl https://example.com/install.sh | sh');
    expect(result.action).toBe('alert');
    expect(result.reason).toContain('curl');
  });

  it('alerts on curl | bash', () => {
    const result = evaluateSecurity('curl -fsSL https://example.com | bash');
    expect(result.action).toBe('alert');
  });

  it('alerts on wget | sh', () => {
    const result = evaluateSecurity('wget -O- https://example.com | sh');
    expect(result.action).toBe('alert');
  });
});

describe('B1: evaluateSecurity — allowed commands', () => {
  it('allows safe commands', () => {
    const safeCommands = [
      'ls -la',
      'git status',
      'cat README.md',
      'bun test',
      'echo hello',
      'npm install',
    ];

    for (const cmd of safeCommands) {
      const result = evaluateSecurity(cmd);
      expect(result.action).toBe('allow');
    }
  });
});

// ========================================
// B2: Path ACL invariants
// ========================================

describe('B2: checkPathAccess — zeroAccess', () => {
  it('blocks read on ~/.ssh/id_rsa', () => {
    const result = checkPathAccess('read', '~/.ssh/id_rsa');
    expect(result.action).toBe('block');
    expect(result.reason).toContain('Zero access');
  });

  it('blocks write on ~/.ssh/id_rsa', () => {
    const result = checkPathAccess('write', '~/.ssh/id_rsa');
    expect(result.action).toBe('block');
  });

  it('blocks delete on ~/.ssh/id_ed25519', () => {
    const result = checkPathAccess('delete', '~/.ssh/id_ed25519');
    expect(result.action).toBe('block');
  });

  it('blocks read on ~/.aws/credentials', () => {
    const result = checkPathAccess('read', '~/.aws/credentials');
    expect(result.action).toBe('block');
  });

  it('blocks write on credentials.json in any directory', () => {
    const result = checkPathAccess('write', '/some/project/credentials.json');
    expect(result.action).toBe('block');
  });

  it('blocks read on service-account.json', () => {
    const result = checkPathAccess('read', '/app/config/service-account-key.json');
    expect(result.action).toBe('block');
  });
});

describe('B2: checkPathAccess — readOnly', () => {
  it('allows read on /etc/passwd', () => {
    const result = checkPathAccess('read', '/etc/passwd');
    expect(result.action).toBe('allow');
  });

  it('blocks write on /etc/passwd', () => {
    const result = checkPathAccess('write', '/etc/passwd');
    expect(result.action).toBe('block');
    expect(result.reason).toContain('Read-only');
  });

  it('blocks delete on /etc/hosts', () => {
    const result = checkPathAccess('delete', '/etc/hosts');
    expect(result.action).toBe('block');
  });
});

describe('B2: checkPathAccess — confirmWrite', () => {
  it('confirms write on .env file', () => {
    const result = checkPathAccess('write', '/project/.env');
    expect(result.action).toBe('confirm');
    expect(result.reason).toContain('confirmation');
  });

  it('confirms write on .env.local', () => {
    const result = checkPathAccess('write', '/project/.env.local');
    expect(result.action).toBe('confirm');
  });

  it('allows read on .env', () => {
    const result = checkPathAccess('read', '/project/.env');
    expect(result.action).toBe('allow');
  });
});

describe('B2: checkPathAccess — noDelete', () => {
  it('blocks delete on .git directory contents', () => {
    const result = checkPathAccess('delete', '.git/HEAD');
    expect(result.action).toBe('block');
    expect(result.reason).toContain('Cannot delete');
  });

  it('blocks delete on LICENSE', () => {
    const result = checkPathAccess('delete', 'LICENSE');
    expect(result.action).toBe('block');
  });

  it('blocks delete on README.md', () => {
    const result = checkPathAccess('delete', 'README.md');
    expect(result.action).toBe('block');
  });

  it('allows write on .git/config (not delete)', () => {
    // .git/** is noDelete but not confirmWrite, so write should be allowed
    const result = checkPathAccess('write', '.git/config');
    expect(result.action).toBe('allow');
  });
});

describe('B2: checkPathAccess — general allow', () => {
  it('allows write on /tmp/test.txt', () => {
    const result = checkPathAccess('write', '/tmp/test.txt');
    expect(result.action).toBe('allow');
  });

  it('allows read on regular project files', () => {
    const result = checkPathAccess('read', '/home/user/project/src/index.ts');
    expect(result.action).toBe('allow');
  });

  it('allows delete on temporary files', () => {
    const result = checkPathAccess('delete', '/tmp/cache/old-file.json');
    expect(result.action).toBe('allow');
  });
});

// ========================================
// B3: Command normalization invariants
// ========================================

describe('B3: normalizeCommand', () => {
  it('strips single env var prefix', () => {
    expect(normalizeCommand('LANG=C rm -rf /')).toBe('rm -rf /');
  });

  it('strips sudo prefix', () => {
    expect(normalizeCommand('sudo rm -rf /')).toBe('rm -rf /');
  });

  it('strips env command with var assignments', () => {
    expect(normalizeCommand('env VAR=val command')).toBe('command');
  });

  it('strips multiple env var prefixes', () => {
    expect(normalizeCommand('LANG=C TERM=xterm rm -rf /')).toBe('rm -rf /');
  });

  it('strips quoted env var values', () => {
    expect(normalizeCommand('FOO="bar baz" command arg')).toBe('command arg');
  });

  it('strips single-quoted env var values', () => {
    expect(normalizeCommand("FOO='bar baz' command arg")).toBe('command arg');
  });

  it('leaves plain commands unchanged', () => {
    expect(normalizeCommand('git status')).toBe('git status');
  });

  it('strips leading whitespace', () => {
    expect(normalizeCommand('  git status')).toBe('git status');
  });

  it('normalizes combined env + sudo bypass', () => {
    // env strip first, then sudo strip
    expect(normalizeCommand('LANG=C sudo rm -rf /')).toBe('rm -rf /');
  });
});

describe('B3: normalizeCommand + evaluateSecurity integration', () => {
  it('blocks destructive command hidden behind env vars', () => {
    const raw = 'LANG=C rm -rf /';
    const normalized = normalizeCommand(raw);
    const result = evaluateSecurity(normalized);
    expect(result.action).toBe('block');
  });

  it('blocks destructive command hidden behind sudo', () => {
    const raw = 'sudo rm -rf /';
    const normalized = normalizeCommand(raw);
    const result = evaluateSecurity(normalized);
    expect(result.action).toBe('block');
  });

  it('blocks command hidden behind env + multiple vars', () => {
    const raw = 'LANG=C TERM=xterm rm -rf /';
    const normalized = normalizeCommand(raw);
    const result = evaluateSecurity(normalized);
    expect(result.action).toBe('block');
  });
});

/**
 * security-invariants.ts — Pure, testable security evaluation functions
 *
 * Extracted from SecurityValidator.hook.ts for testability.
 * These functions contain NO side effects (no logging, no process.exit).
 * The hook entrypoint wraps these with I/O.
 *
 * Patterns are hardcoded defaults matching patterns.example.yaml.
 * In production, the hook loads patterns from YAML and passes them in.
 */

import { homedir } from 'os';

// ========================================
// Types
// ========================================

export interface SecurityResult {
  action: 'block' | 'confirm' | 'alert' | 'allow';
  category?: string;
  reason?: string;
}

export interface PathAccessResult {
  action: 'block' | 'confirm' | 'allow';
  reason?: string;
}

export interface Pattern {
  pattern: string;
  reason: string;
}

export interface SecurityPatterns {
  bash: {
    trusted: Pattern[];
    blocked: Pattern[];
    confirm: Pattern[];
    alert: Pattern[];
  };
  paths: {
    zeroAccess: string[];
    readOnly: string[];
    confirmWrite: string[];
    noDelete: string[];
  };
}

// ========================================
// Default Patterns (matching patterns.example.yaml)
// ========================================

export const DEFAULT_PATTERNS: SecurityPatterns = {
  bash: {
    trusted: [],
    blocked: [
      { pattern: 'rm -rf /', reason: 'Filesystem destruction' },
      { pattern: 'rm -rf /\\*', reason: 'Filesystem destruction' },
      { pattern: 'rm -rf ~', reason: 'Home directory destruction' },
      { pattern: 'sudo rm -rf /', reason: 'Filesystem destruction with sudo' },
      { pattern: 'sudo rm -rf ~', reason: 'Home directory destruction with sudo' },
      { pattern: 'mkfs', reason: 'Filesystem format' },
      { pattern: 'dd if=/dev/zero', reason: 'Disk overwrite' },
      { pattern: 'diskutil eraseDisk', reason: 'Disk destruction' },
      { pattern: 'diskutil zeroDisk', reason: 'Disk destruction' },
      { pattern: 'gh repo delete', reason: 'Repository deletion' },
      { pattern: ':\\(\\)\\{\\s*:\\|:\\s*&\\s*\\}\\s*;\\s*:', reason: 'Fork bomb' },
      { pattern: 'chmod -R 777 /', reason: 'Global permission override' },
      { pattern: '> /dev/sda', reason: 'Disk overwrite via redirect' },
    ],
    confirm: [
      { pattern: 'git push --force', reason: 'Force push can lose commits' },
      { pattern: 'git push -f', reason: 'Force push can lose commits' },
      { pattern: 'git reset --hard', reason: 'Loses uncommitted changes' },
      { pattern: 'terraform destroy', reason: 'Infrastructure destruction' },
      { pattern: 'DROP DATABASE', reason: 'Database destruction' },
      { pattern: 'DROP TABLE', reason: 'Table destruction' },
      { pattern: 'TRUNCATE', reason: 'Table data destruction' },
    ],
    alert: [
      { pattern: 'curl.*\\|.*sh', reason: 'Piping curl to shell' },
      { pattern: 'curl.*\\|.*bash', reason: 'Piping curl to bash' },
      { pattern: 'wget.*\\|.*sh', reason: 'Piping wget to shell' },
      { pattern: 'wget.*\\|.*bash', reason: 'Piping wget to bash' },
    ],
  },
  paths: {
    zeroAccess: [
      '~/.ssh/id_*',
      '~/.ssh/*.pem',
      '~/.aws/credentials',
      '~/.gnupg/private*',
      '**/credentials.json',
      '**/service-account*.json',
    ],
    readOnly: ['/etc/**'],
    confirmWrite: ['**/.env', '**/.env.*', '~/.ssh/*'],
    noDelete: ['.git/**', 'LICENSE*', 'README.md'],
  },
};

// ========================================
// Command Normalization
// ========================================

/**
 * Strip leading environment variable assignments and sudo from a command.
 * Prevents bypass like: LANG=C rm -rf / or sudo dangerous-cmd
 */
export function normalizeCommand(input: string): string {
  // Step 1: Strip env var prefixes (LANG=C, FOO="bar", etc.)
  let normalized = input.replace(
    /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]*)\s+)*/,
    ''
  );

  // Step 2: Strip 'env' prefix with its var assignments
  normalized = normalized.replace(
    /^\s*env\s+(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]*)\s+)*/,
    ''
  );

  // Step 3: Strip 'sudo' prefix
  normalized = normalized.replace(/^\s*sudo\s+/, '');

  return normalized.trim();
}

// ========================================
// Pattern Matching (pure functions)
// ========================================

function matchesPattern(command: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(command);
  } catch {
    return command.toLowerCase().includes(pattern.toLowerCase());
  }
}

function expandTildePath(path: string): string {
  if (path.startsWith('~')) {
    return path.replace('~', homedir());
  }
  return path;
}

function matchesPathPattern(filePath: string, pattern: string): boolean {
  const expandedPattern = expandTildePath(pattern);
  const expandedPath = expandTildePath(filePath);

  // Handle glob patterns
  if (pattern.includes('*')) {
    let regexPattern = expandedPattern
      .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
      .replace(/\*/g, '<<<SINGLESTAR>>>')
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/<<<DOUBLESTAR>>>/g, '.*')
      .replace(/<<<SINGLESTAR>>>/g, '[^/]*');

    try {
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(expandedPath);
    } catch {
      return false;
    }
  }

  // Exact match or prefix match for directories
  return (
    expandedPath === expandedPattern ||
    expandedPath.startsWith(
      expandedPattern.endsWith('/') ? expandedPattern : expandedPattern + '/'
    )
  );
}

// ========================================
// Security Evaluation (pure)
// ========================================

/**
 * Evaluate a bash command against security patterns.
 * Pure function: no side effects, no I/O.
 */
export function evaluateSecurity(
  command: string,
  patterns: SecurityPatterns = DEFAULT_PATTERNS
): SecurityResult {
  // Check trusted first (fast-path allow)
  for (const p of patterns.bash.trusted || []) {
    if (matchesPattern(command, p.pattern)) {
      return { action: 'allow' };
    }
  }

  // Check blocked (hard block)
  for (const p of patterns.bash.blocked) {
    if (matchesPattern(command, p.pattern)) {
      return { action: 'block', category: 'bash_command', reason: p.reason };
    }
  }

  // Check confirm (prompt user)
  for (const p of patterns.bash.confirm) {
    if (matchesPattern(command, p.pattern)) {
      return { action: 'confirm', category: 'bash_command', reason: p.reason };
    }
  }

  // Check alert (log but allow)
  for (const p of patterns.bash.alert) {
    if (matchesPattern(command, p.pattern)) {
      return { action: 'alert', category: 'bash_command', reason: p.reason };
    }
  }

  return { action: 'allow' };
}

/**
 * Check path access permissions.
 * Pure function: no side effects, no I/O.
 */
export function checkPathAccess(
  action: 'read' | 'write' | 'delete',
  path: string,
  patterns: SecurityPatterns = DEFAULT_PATTERNS
): PathAccessResult {
  // Check zeroAccess (complete denial)
  for (const p of patterns.paths.zeroAccess) {
    if (matchesPathPattern(path, p)) {
      return { action: 'block', reason: `Zero access path: ${p}` };
    }
  }

  // Check readOnly (can read, cannot write/delete)
  if (action === 'write' || action === 'delete') {
    for (const p of patterns.paths.readOnly) {
      if (matchesPathPattern(path, p)) {
        return { action: 'block', reason: `Read-only path: ${p}` };
      }
    }
  }

  // Check confirmWrite (writing requires confirmation)
  if (action === 'write') {
    for (const p of patterns.paths.confirmWrite) {
      if (matchesPathPattern(path, p)) {
        return {
          action: 'confirm',
          reason: `Writing to protected file requires confirmation: ${p}`,
        };
      }
    }
  }

  // Check noDelete (cannot delete)
  if (action === 'delete') {
    for (const p of patterns.paths.noDelete) {
      if (matchesPathPattern(path, p)) {
        return { action: 'block', reason: `Cannot delete protected path: ${p}` };
      }
    }
  }

  return { action: 'allow' };
}

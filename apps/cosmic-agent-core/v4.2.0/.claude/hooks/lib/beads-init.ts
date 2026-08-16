import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BEADS_DIR = join(homedir(), '.aai', '.beads');

export function getBeadsDir(): string {
  return process.env.AAI_BEADS_DIR || BEADS_DIR;
}

/**
 * Initialization timing contract:
 * - Called lazily on first beads operation per process (not eagerly at import)
 * - Result is cached for the process lifetime via _workspaceReady flag
 * - Uses TIMEOUT_INIT (3000ms) since this only runs once
 * - Concurrent hooks in different processes may race on first init;
 *   br init is idempotent so this is safe
 */
let _workspaceReady: boolean | null = null;

export function ensureBeadsWorkspace(): boolean {
  if (_workspaceReady !== null) return _workspaceReady;
  const dir = getBeadsDir();
  const db = join(dir, 'beads.db');
  if (existsSync(db)) { _workspaceReady = true; return true; }
  try {
    mkdirSync(dir, { recursive: true });
    execFileSync('br', ['init', '--prefix', 'zk', '--db', db], {
      timeout: 3000, stdio: 'pipe', cwd: dir
    });
    _workspaceReady = true;
    return true;
  } catch {
    _workspaceReady = false;
    return false;
  }
}

/** Reset for testing only */
export function _resetWorkspaceCache(): void {
  _workspaceReady = null;
}

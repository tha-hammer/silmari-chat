#!/usr/bin/env bun
/**
 * SessionCleanup.hook.ts - Mark Work Complete and Clear State (SessionEnd)
 *
 * PURPOSE:
 * Finalizes a Claude Code session by marking the current work directory as
 * COMPLETED, clearing session state, resetting Kitty tab, and cleaning up
 * session name entries.
 *
 * TRIGGER: SessionEnd
 *
 * INPUT:
 * - stdin: Hook input JSON (session_id, transcript_path)
 * - Files: MEMORY/STATE/current-work.json
 *
 * OUTPUT:
 * - stdout: None
 * - stderr: Status messages
 * - exit(0): Always (non-blocking)
 *
 * SIDE EFFECTS:
 * - Updates: MEMORY/WORK/<dir>/PRD.md or META.yaml (status: COMPLETED)
 * - Deletes: MEMORY/STATE/current-work.json (clears session state)
 * - Resets: Kitty tab title and color to defaults
 * - Cleans: session-names.json entry (prevents ghost entries)
 *
 * INTER-HOOK RELATIONSHIPS:
 * - COORDINATES WITH: WorkCompletionLearning (both run at SessionEnd)
 * - MUST RUN AFTER: WorkCompletionLearning (learning capture uses state before clear)
 *
 * PERFORMANCE:
 * - Non-blocking: Yes
 * - Typical execution: <50ms
 */

import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getISOTimestamp } from './lib/time';
import { setTabState, cleanupKittySession } from './lib/tab-setter';

const BASE_DIR = process.env.AAI_DIR || join(process.env.HOME!, '.claude');
const MEMORY_DIR = join(BASE_DIR, 'MEMORY');
const STATE_DIR = join(MEMORY_DIR, 'STATE');
const WORK_DIR = join(MEMORY_DIR, 'WORK');

// Session-scoped state file lookup with legacy fallback
function findStateFile(sessionId?: string): string | null {
  if (sessionId) {
    const scoped = join(STATE_DIR, `current-work-${sessionId}.json`);
    if (existsSync(scoped)) return scoped;
  }
  const legacy = join(STATE_DIR, 'current-work.json');
  if (existsSync(legacy)) return legacy;
  return null;
}

interface CurrentWork {
  session_id: string;
  session_dir: string;
  created_at: string;
  prd_path?: string;
  // Legacy fields (backward compat)
  current_task?: string;
  task_title?: string;
  task_count?: number;
}

/**
 * Mark work directory as completed and clear session state
 */
function clearSessionWork(sessionId?: string): void {
  try {
    const stateFile = findStateFile(sessionId);
    if (!stateFile) {
      console.error('[SessionCleanup] No current work to complete');
      return;
    }

    // Read current work state
    const content = readFileSync(stateFile, 'utf-8');
    const currentWork: CurrentWork = JSON.parse(content);

    // Guard: don't process another session's state
    if (sessionId && currentWork.session_id !== sessionId) {
      console.error('[SessionCleanup] State file belongs to different session, skipping');
      return;
    }

    // Mark work directory as COMPLETED — update PRD.md frontmatter (primary) or META.yaml (legacy)
    if (currentWork.session_dir) {
      const workPath = join(WORK_DIR, currentWork.session_dir);
      const prdPath = join(workPath, 'PRD.md');
      const metaPath = join(workPath, 'META.yaml');
      let marked = false;

      // Primary: update PRD.md frontmatter (consolidated format)
      if (existsSync(prdPath)) {
        let prdContent = readFileSync(prdPath, 'utf-8');
        prdContent = prdContent.replace(/^status: ACTIVE$/m, 'status: COMPLETED');
        prdContent = prdContent.replace(/^completed_at: null$/m, `completed_at: "${getISOTimestamp()}"`);
        writeFileSync(prdPath, prdContent, 'utf-8');
        marked = true;
      }

      // Legacy fallback: update META.yaml if it exists
      if (existsSync(metaPath)) {
        let metaContent = readFileSync(metaPath, 'utf-8');
        metaContent = metaContent.replace(/^status: "ACTIVE"$/m, 'status: "COMPLETED"');
        metaContent = metaContent.replace(/^completed_at: null$/m, `completed_at: "${getISOTimestamp()}"`);
        writeFileSync(metaPath, metaContent, 'utf-8');
        marked = true;
      }

      if (marked) {
        console.error(`[SessionCleanup] Marked work directory as COMPLETED: ${currentWork.session_dir}`);
      }
    }

    // Delete state file
    unlinkSync(stateFile);
    console.error('[SessionCleanup] Cleared session work state');

    // === v4.1.0: Close beads work item ===
    try {
      const { isBeadsAvailable, brFindBySlug, brClose } = require('./lib/beads-index');
      if (isBeadsAvailable() && currentWork.session_dir) {
        const workId = brFindBySlug(currentWork.session_dir);
        if (workId) {
          brClose(workId, 'Session completed');
          console.error(`[SessionCleanup] Closed beads work item: ${workId}`);
        }
      }
    } catch {
      // Silent — beads is never a blocking dependency
    }

    // Clean session-names.json entry to prevent IDLE ghost on activity page
    if (sessionId || currentWork.session_id) {
      const sid = sessionId || currentWork.session_id;
      const snPath = join(STATE_DIR, 'session-names.json');
      try {
        if (existsSync(snPath)) {
          const names = JSON.parse(readFileSync(snPath, 'utf-8'));
          if (names[sid]) {
            delete names[sid];
            writeFileSync(snPath, JSON.stringify(names, null, 2), 'utf-8');
            console.error(`[SessionCleanup] Removed session ${sid} from session-names.json`);
          }
        }
      } catch (e) {
        console.error(`[SessionCleanup] Failed to clean session-names.json: ${e}`);
      }
    }
  } catch (error) {
    console.error(`[SessionCleanup] Error clearing session work: ${error}`);
  }
}

async function main() {
  try {
    // Read input from stdin with timeout — SessionEnd hooks may receive
    // empty or slow stdin. Proceed regardless since state is read from disk.
    let sessionId: string | undefined;
    try {
      const input = await Promise.race([
        Bun.stdin.text(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      if (input && input.trim()) {
        const parsed = JSON.parse(input);
        sessionId = parsed.session_id;
      }
    } catch {
      // Timeout or parse error — proceed without session_id
    }

    // Mark work as complete and clear state
    clearSessionWork(sessionId);

    // Reset Kitty tab to neutral styling — no lingering colored backgrounds
    try {
      setTabState({ title: '', state: 'idle', sessionId });
      console.error('[SessionCleanup] Tab reset to default styling');
    } catch {
      console.error('[SessionCleanup] Tab reset failed (non-critical)');
    }

    // Clean up per-session kitty env file (prevents unbounded file accumulation)
    if (sessionId) {
      cleanupKittySession(sessionId);
      console.error(`[SessionCleanup] Cleaned up kitty session: ${sessionId}`);
    }

    // === v4.2.0: Record session profile for prediction loop ===
    try {
      const { measureContextUsage } = await import('./lib/context-budget');
      const { recordSessionProfile, detectWorkflowType } = await import('./lib/workflow-budget');
      const snapshot = measureContextUsage(sessionId);
      if (snapshot) {
        const wfType = detectWorkflowType(sessionId);
        const startTime = currentWork.created_at ? new Date(currentWork.created_at).getTime() : Date.now();
        const durationMinutes = Math.round((Date.now() - startTime) / 60000);
        recordSessionProfile({
          sessionId: sessionId || snapshot.sessionId,
          workflowType: wfType,
          model: snapshot.model,
          contextWindowSize: snapshot.contextWindowSize,
          finalUsagePercent: snapshot.usagePercent,
          turnCount: snapshot.turnCount,
          cumulativeOutput: snapshot.cumulativeOutput,
          durationMinutes,
          subagentsSpawned: 0, // TODO: count from aggregate usage
          filesChanged: 0,
          handoffTriggered: false,
          timestamp: new Date().toISOString(),
        });
        console.error(`[SessionCleanup] Recorded session profile: ${wfType} ${snapshot.usagePercent.toFixed(0)}% context`);
      }
    } catch {
      // Silent — profiling must never block cleanup
    }

    // === v4.2.0: Emit canonical events (fixed: populate workSlug/title from currentWork) ===
    try {
      const { getEventBus } = await import('./lib/event-bus');
      const bus = getEventBus();
      bus.emit({
        type: 'work.completed',
        sessionId: sessionId || '',
        workSlug: currentWork.session_dir || '',
        title: currentWork.task_title || currentWork.current_task || '',
        criteriaPass: 0,
        criteriaTotal: 0,
      });
      bus.emit({
        type: 'session.ended',
        sessionId: sessionId || '',
        runtime: 'claude-code',
      });
    } catch { /* Silent */ }

    console.error('[SessionCleanup] Session ended, work marked complete');
    process.exit(0);
  } catch (error) {
    // Silent failure - don't disrupt workflow
    console.error(`[SessionCleanup] SessionEnd hook error: ${error}`);
    process.exit(0);
  }
}

main();

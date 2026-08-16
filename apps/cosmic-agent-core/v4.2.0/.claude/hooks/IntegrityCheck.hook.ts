#!/usr/bin/env bun
/**
 * IntegrityCheck.hook.ts - AAI Integrity Check (SessionEnd)
 *
 * Runs system integrity check — detects AAI system file changes, spawns background maintenance.
 * Doc cross-ref integrity is handled by DocIntegrity.hook.ts (Stop event) to avoid double execution.
 *
 * TRIGGER: SessionEnd
 * PERFORMANCE: ~50ms (single transcript parse, one handler call). Non-blocking.
 */

import { parseTranscript } from '../AAI/Tools/TranscriptParser';
import { handleSystemIntegrity } from './handlers/SystemIntegrity';

interface HookInput {
  session_id: string;
  transcript_path: string;
  hook_event_name: string;
}

async function readStdin(): Promise<HookInput | null> {
  try {
    const decoder = new TextDecoder();
    const reader = Bun.stdin.stream().getReader();
    let input = '';
    const timeout = new Promise<void>(r => setTimeout(r, 500));
    const read = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        input += decoder.decode(value, { stream: true });
      }
    })();
    await Promise.race([read, timeout]);
    if (input.trim()) return JSON.parse(input) as HookInput;
  } catch {}
  return null;
}

async function main() {
  const hookInput = await readStdin();
  if (!hookInput?.transcript_path) { process.exit(0); }

  const parsed = parseTranscript(hookInput.transcript_path);

  // Run system integrity check (doc cross-ref is handled by DocIntegrity.hook.ts)
  await handleSystemIntegrity(parsed, hookInput);

  // === v4.2.0: Zettelkasten consolidation pipeline (3s budget) ===
  const consolidationStart = Date.now();

  // Phase 1: Extract fragments from active PRDs (deduplicated)
  try {
    const { extractAllActivePrdFragments } = await import(
      '../../../../cosmic-agent-memory/integration/hooks/wire-fragments'
    );
    const fragResult = extractAllActivePrdFragments(hookInput.session_id);
    if (fragResult.totalNew > 0) {
      console.error(
        `[IntegrityCheck] 📎 Fragments: ${fragResult.totalNew} new / ${fragResult.totalExtracted} total`,
      );
    }
  } catch {
    // Silent degradation — fragment extraction must never block integrity check
  }

  // Phase 2: Promote extract clusters to permanent notes
  if (Date.now() - consolidationStart < 3000) {
    try {
      const { wireConsolidation } = await import(
        '../../../../cosmic-agent-memory/integration/hooks/wire-consolidation'
      );
      const { promotions, edgesCreated } = wireConsolidation();
      const created = promotions.filter((p: any) => p.status === 'created').length;
      const review = promotions.filter((p: any) => p.status === 'review-needed').length;
      if (created > 0 || review > 0) {
        console.error(
          `[IntegrityCheck] 🧠 Consolidation: ${created} promoted, ${review} need review, ${edgesCreated} edges`,
        );
      }
    } catch {
      // Silent degradation
    }
  } else {
    console.error('[IntegrityCheck] ⚠️ Fragment extraction took >3s, skipping consolidation');
  }

  // Phase 3: Generate/update structure notes from permanent notes
  if (Date.now() - consolidationStart < 3000) {
    try {
      const { wireStructureNotes } = await import(
        '../../../../cosmic-agent-memory/integration/hooks/wire-structure-notes'
      );
      const { brList } = require('./lib/beads-index');
      const permanentNotes = brList({ labels: ['note:permanent'], limit: 100 });
      if (permanentNotes.length > 0) {
        const { structureNotes, linksCreated } = wireStructureNotes(permanentNotes);
        if (structureNotes.length > 0) {
          console.error(
            `[IntegrityCheck] 🏗️ Structure: ${structureNotes.length} hubs, ${linksCreated} links`,
          );
        }
      }
    } catch {
      // Silent degradation
    }
  } else {
    console.error('[IntegrityCheck] ⚠️ Consolidation took >3s, skipping structure notes');
  }

  const consolidationMs = Date.now() - consolidationStart;
  if (consolidationMs > 100) {
    console.error(`[IntegrityCheck] ⏱️ Consolidation pipeline: ${consolidationMs}ms`);
  }

  // === v4.1.0: Beads drift detection ===
  try {
    const { detectDrift } = await import('./lib/beads-context');
    const drift = detectDrift();
    if (drift === null) {
      // Beads unavailable — skip silently
    } else if (drift.drifted) {
      console.error(`[IntegrityCheck] ⚠️ Beads drift: ${drift.missing.length} work items not indexed, ${drift.extra.length} extra in beads`);
      if (drift.missing.length > 0) {
        console.error(`[IntegrityCheck]   Missing: ${drift.missing.slice(0, 5).join(', ')}${drift.missing.length > 5 ? '...' : ''}`);
      }
    } else {
      console.error(`[IntegrityCheck] ✅ Beads index in sync (${drift.beadsCount} work items)`);
    }
  } catch {
    // Silent
  }

  process.exit(0);
}

main().catch(() => process.exit(0));

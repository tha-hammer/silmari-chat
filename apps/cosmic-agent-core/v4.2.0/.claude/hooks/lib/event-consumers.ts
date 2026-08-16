/**
 * Event Consumers — v4.2.0 Zettelkasten Layer
 *
 * Two canonical consumers that attach to the EventBus:
 *
 * 1. JSONL Consumer — appends every event as a JSON line to events.jsonl
 * 2. Beads Consumer — indexes signals, learnings, and preferences into beads.
 *    Security decisions are logged but NOT indexed to beads.
 *    Voice completed events are logged only.
 *
 * Both are silent on failure: event processing must never block the workflow.
 * The beads consumer uses require() for beads-index to support lazy loading
 * and avoid circular dependencies.
 *
 * v4.2.0: Added handling for security.decision and voice.completed events.
 */

import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { DomainEvent } from './domain-events';
import type { EventBus } from './event-bus';

/**
 * Register the JSONL consumer — appends each event as one JSON line.
 * Creates the parent directory if it doesn't exist.
 */
export function registerJsonlConsumer(bus: EventBus, eventsPath: string): void {
  bus.on((event: DomainEvent) => {
    try {
      mkdirSync(dirname(eventsPath), { recursive: true });
      appendFileSync(eventsPath, JSON.stringify(event) + '\n');
    } catch {
      /* Silent — event log must never block workflow */
    }
  });
}

/**
 * Register the Beads consumer — indexes specific event types into beads.
 * Uses require() for beads-index to allow lazy loading and avoid circular deps.
 * Silently skips when beads is unavailable.
 *
 * v4.2.0: security.decision events are logged via JSONL consumer but
 * NOT indexed to beads (security audit trail lives in events.jsonl).
 * voice.completed events are logged only (no beads indexing needed).
 */
export function registerBeadsConsumer(bus: EventBus): void {
  bus.on((event: DomainEvent) => {
    try {
      // Security decisions: logged via JSONL consumer, not indexed to beads
      if (event.type === 'security.decision') {
        // Audit trail preserved in events.jsonl by the JSONL consumer.
        // No beads indexing — security decisions are operational, not knowledge.
        return;
      }

      // Voice completed: logged via JSONL consumer only
      if (event.type === 'voice.completed') {
        return;
      }

      // Budget events: logged via JSONL consumer only
      if (event.type === 'budget.warning' || event.type === 'budget.critical') {
        return;
      }

      const { isBeadsAvailable, indexSignal, indexLearning, indexPreference } = require('./beads-index');
      if (!isBeadsAvailable()) return;

      switch (event.type) {
        case 'signal.captured':
          indexSignal(event.rating, event.sentiment, event.summary, event.sessionId, event.workSlug);
          break;
        case 'learning.captured':
          indexLearning(event.category, event.summary, event.workSlug, event.sessionId);
          break;
        case 'preference.captured':
          indexPreference(event.noteType, event.content, event.actor, event.confidence);
          break;
        // work.started and work.completed handled by PRDSync sidecar (Phase 1B)
        // artifact events handled directly by hooks
      }
    } catch {
      /* Silent — beads indexing must never block workflow */
    }
  });
}

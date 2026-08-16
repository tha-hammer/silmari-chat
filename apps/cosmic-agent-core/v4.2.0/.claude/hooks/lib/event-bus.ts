/**
 * EventBus — v4.1.0 Zettelkasten Layer
 *
 * Central event bus that decouples workflow events from runtime-specific
 * hook semantics. Claude Code hooks become one adapter that emits canonical
 * events; future runtimes (API, Slack) emit the same events.
 *
 * The singleton getEventBus() auto-registers JSONL and Beads consumers
 * on first access via lazy require() to avoid circular dependencies.
 */

import type { DomainEvent } from './domain-events';

type EventConsumer = (event: DomainEvent) => void;

export class EventBus {
  private consumers: EventConsumer[] = [];
  private defaultRuntime: string;

  constructor(opts?: { defaultRuntime?: string }) {
    this.defaultRuntime = opts?.defaultRuntime || 'unknown';
  }

  /** Register an event consumer */
  on(consumer: EventConsumer): void {
    this.consumers.push(consumer);
  }

  /** Emit an event to all registered consumers */
  emit(event: DomainEvent): void {
    // Auto-inject timestamp if missing
    if (!event.timestamp) {
      (event as any).timestamp = new Date().toISOString();
    }
    // Auto-inject runtime from bus default if missing
    if (!event.runtime) {
      (event as any).runtime = this.defaultRuntime;
    }
    for (const consumer of this.consumers) {
      try {
        consumer(event);
      } catch (err) {
        console.error(`[EventBus] Consumer error: ${err}`);
      }
    }
  }
}

/** Singleton bus for the process lifetime */
let _bus: EventBus | null = null;

/**
 * Get the singleton EventBus instance.
 * On first call, creates the bus with defaultRuntime='claude-code'
 * and registers JSONL + Beads consumers via lazy require().
 */
export function getEventBus(): EventBus {
  if (!_bus) {
    _bus = new EventBus({ defaultRuntime: 'claude-code' });
    // Lazy import to avoid circular deps — consumers may not be available
    try {
      const { registerJsonlConsumer, registerBeadsConsumer } = require('./event-consumers');
      const { paiPath } = require('./paths');
      registerJsonlConsumer(_bus, paiPath('MEMORY', 'STATE', 'events.jsonl'));
      registerBeadsConsumer(_bus);
    } catch {
      /* consumers unavailable — bus still works */
    }
  }
  return _bus;
}

/** Reset singleton — for testing only */
export function _resetEventBus(): void {
  _bus = null;
}

/**
 * EventBus Tests — v4.1.0 Zettelkasten Layer
 *
 * Tests for the EventBus class and singleton behavior.
 * Covers: multi-consumer delivery, consumer isolation, auto-injection,
 * singleton identity, and no-consumer safety.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { EventBus, getEventBus, _resetEventBus } from './event-bus';
import type { DomainEvent, SessionStartedEvent, SignalCapturedEvent } from './domain-events';

describe('EventBus', () => {
  describe('multi-consumer delivery', () => {
    it('should deliver events to all registered consumers', () => {
      const bus = new EventBus();
      const received: DomainEvent[] = [];

      bus.on((e) => received.push(e));
      bus.on((e) => received.push(e));

      const event: SessionStartedEvent = {
        type: 'session.started',
        timestamp: new Date().toISOString(),
        sessionId: 's1',
        runtime: 'test',
      };

      bus.emit(event);
      expect(received).toHaveLength(2);
      expect(received[0]).toBe(event);
      expect(received[1]).toBe(event);
    });
  });

  describe('consumer isolation', () => {
    it('should continue delivery when a consumer throws', () => {
      const bus = new EventBus();
      const received: DomainEvent[] = [];

      bus.on(() => {
        throw new Error('consumer failure');
      });
      bus.on((e) => received.push(e));

      const event: SessionStartedEvent = {
        type: 'session.started',
        timestamp: new Date().toISOString(),
        sessionId: 's1',
        runtime: 'test',
      };

      bus.emit(event);
      expect(received).toHaveLength(1);
      expect(received[0]).toBe(event);
    });

    it('should not throw when first consumer fails and second succeeds', () => {
      const bus = new EventBus();
      const results: string[] = [];

      bus.on(() => {
        throw new Error('boom');
      });
      bus.on(() => results.push('ok'));
      bus.on(() => {
        throw new Error('boom2');
      });
      bus.on(() => results.push('ok2'));

      bus.emit({
        type: 'session.started',
        timestamp: new Date().toISOString(),
        sessionId: 's1',
        runtime: 'test',
      });

      expect(results).toEqual(['ok', 'ok2']);
    });
  });

  describe('timestamp auto-injection', () => {
    it('should auto-inject timestamp when missing', () => {
      const bus = new EventBus();
      let captured: DomainEvent | null = null;
      bus.on((e) => {
        captured = e;
      });

      // Emit without timestamp — cast to any to bypass type check
      bus.emit({ type: 'session.started', sessionId: 's1', runtime: 'test' } as any);

      expect(captured).not.toBeNull();
      expect(captured!.timestamp).toBeDefined();
      expect(typeof captured!.timestamp).toBe('string');
      // Should be a valid ISO date
      expect(new Date(captured!.timestamp).toISOString()).toBe(captured!.timestamp);
    });

    it('should not overwrite existing timestamp', () => {
      const bus = new EventBus();
      let captured: DomainEvent | null = null;
      bus.on((e) => {
        captured = e;
      });

      const fixedTimestamp = '2026-04-04T12:00:00.000Z';
      bus.emit({
        type: 'session.started',
        timestamp: fixedTimestamp,
        sessionId: 's1',
        runtime: 'test',
      });

      expect(captured!.timestamp).toBe(fixedTimestamp);
    });
  });

  describe('runtime auto-injection', () => {
    it('should inject defaultRuntime when event has no runtime', () => {
      const bus = new EventBus({ defaultRuntime: 'claude-code' });
      let captured: DomainEvent | null = null;
      bus.on((e) => {
        captured = e;
      });

      bus.emit({
        type: 'session.started',
        timestamp: new Date().toISOString(),
        sessionId: 's1',
      } as any);

      expect(captured!.runtime).toBe('claude-code');
    });

    it('should not overwrite existing runtime', () => {
      const bus = new EventBus({ defaultRuntime: 'claude-code' });
      let captured: DomainEvent | null = null;
      bus.on((e) => {
        captured = e;
      });

      bus.emit({
        type: 'session.started',
        timestamp: new Date().toISOString(),
        sessionId: 's1',
        runtime: 'api',
      });

      expect(captured!.runtime).toBe('api');
    });

    it('should default to "unknown" when no defaultRuntime configured', () => {
      const bus = new EventBus();
      let captured: DomainEvent | null = null;
      bus.on((e) => {
        captured = e;
      });

      bus.emit({
        type: 'session.started',
        timestamp: new Date().toISOString(),
        sessionId: 's1',
      } as any);

      expect(captured!.runtime).toBe('unknown');
    });
  });

  describe('singleton', () => {
    beforeEach(() => {
      _resetEventBus();
    });

    it('should return the same instance on repeated calls', () => {
      const bus1 = getEventBus();
      const bus2 = getEventBus();
      expect(bus1).toBe(bus2);
    });

    it('should return a new instance after reset', () => {
      const bus1 = getEventBus();
      _resetEventBus();
      const bus2 = getEventBus();
      expect(bus1).not.toBe(bus2);
    });
  });

  describe('no consumers', () => {
    it('should not error when emitting with no consumers', () => {
      const bus = new EventBus();

      // Should not throw
      expect(() => {
        bus.emit({
          type: 'session.started',
          timestamp: new Date().toISOString(),
          sessionId: 's1',
          runtime: 'test',
        });
      }).not.toThrow();
    });
  });
});

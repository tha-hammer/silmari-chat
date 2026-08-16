/**
 * Domain Events Type Tests — v4.1.0 Zettelkasten Layer
 *
 * Validates that all 12 canonical event types compile correctly,
 * carry the expected fields, and discriminate via the `type` field.
 */

import { describe, it, expect } from 'bun:test';
import type {
  DomainEvent,
  SessionStartedEvent,
  SessionEndedEvent,
  MessageReceivedEvent,
  ArtifactCreatedEvent,
  ArtifactUpdatedEvent,
  WorkStartedEvent,
  WorkCompletedEvent,
  SignalCapturedEvent,
  LearningCapturedEvent,
  PreferenceCapturedEvent,
  ContextRequestedEvent,
  ContextLoadedEvent,
} from './domain-events';

const ts = '2026-04-04T12:00:00.000Z';

describe('DomainEvent types', () => {
  it('should type-check a session.started event', () => {
    const event: SessionStartedEvent = {
      type: 'session.started',
      timestamp: ts,
      sessionId: 'sess-123',
      runtime: 'claude-code',
    };
    expect(event.type).toBe('session.started');
    expect(event.sessionId).toBe('sess-123');
    expect(event.runtime).toBe('claude-code');
  });

  it('should type-check a session.ended event', () => {
    const event: SessionEndedEvent = {
      type: 'session.ended',
      timestamp: ts,
      sessionId: 'sess-123',
      runtime: 'claude-code',
    };
    expect(event.type).toBe('session.ended');
    expect(event.sessionId).toBe('sess-123');
  });

  it('should type-check a message.received event', () => {
    const event: MessageReceivedEvent = {
      type: 'message.received',
      timestamp: ts,
      sessionId: 'sess-123',
      contentSummary: 'User asked about auth',
      source: 'user',
    };
    expect(event.type).toBe('message.received');
    expect(event.contentSummary).toBe('User asked about auth');
    expect(event.source).toBe('user');
  });

  it('should type-check an artifact.created event', () => {
    const event: ArtifactCreatedEvent = {
      type: 'artifact.created',
      timestamp: ts,
      artifactType: 'code',
      path: '/src/auth.ts',
      beadsId: 'bead-001',
      labels: ['auth', 'security'],
    };
    expect(event.type).toBe('artifact.created');
    expect(event.artifactType).toBe('code');
    expect(event.labels).toEqual(['auth', 'security']);
  });

  it('should type-check an artifact.updated event', () => {
    const event: ArtifactUpdatedEvent = {
      type: 'artifact.updated',
      timestamp: ts,
      artifactType: 'code',
      path: '/src/auth.ts',
      changes: 'Added rate limiting',
    };
    expect(event.type).toBe('artifact.updated');
    expect(event.changes).toBe('Added rate limiting');
    expect(event.beadsId).toBeUndefined();
  });

  it('should type-check a work.started event', () => {
    const event: WorkStartedEvent = {
      type: 'work.started',
      timestamp: ts,
      sessionId: 'sess-123',
      workSlug: '20260404-auth',
      title: 'Auth rate limiting',
    };
    expect(event.type).toBe('work.started');
    expect(event.workSlug).toBe('20260404-auth');
  });

  it('should type-check a work.completed event', () => {
    const event: WorkCompletedEvent = {
      type: 'work.completed',
      timestamp: ts,
      sessionId: 'sess-123',
      workSlug: '20260404-auth',
      title: 'Auth rate limiting',
      criteriaPass: 8,
      criteriaTotal: 8,
    };
    expect(event.type).toBe('work.completed');
    expect(event.criteriaPass).toBe(8);
    expect(event.criteriaTotal).toBe(8);
  });

  it('should type-check a signal.captured event', () => {
    const event: SignalCapturedEvent = {
      type: 'signal.captured',
      timestamp: ts,
      sessionId: 'sess-123',
      rating: 3,
      sentiment: 'negative',
      summary: 'Frustrated with repeated errors',
      workSlug: '20260404-auth',
    };
    expect(event.type).toBe('signal.captured');
    expect(event.rating).toBe(3);
    expect(event.sentiment).toBe('negative');
  });

  it('should type-check a learning.captured event', () => {
    const event: LearningCapturedEvent = {
      type: 'learning.captured',
      timestamp: ts,
      sessionId: 'sess-123',
      category: 'ALGORITHM',
      summary: 'Wrong approach to caching',
      workSlug: '20260404-auth',
    };
    expect(event.type).toBe('learning.captured');
    expect(event.category).toBe('ALGORITHM');
  });

  it('should type-check a preference.captured event', () => {
    const event: PreferenceCapturedEvent = {
      type: 'preference.captured',
      timestamp: ts,
      noteType: 'W',
      content: 'Prefers TypeScript over Python',
      actor: 'maceo',
      confidence: 0.9,
    };
    expect(event.type).toBe('preference.captured');
    expect(event.noteType).toBe('W');
    expect(event.confidence).toBe(0.9);
  });

  it('should type-check a context.requested event', () => {
    const event: ContextRequestedEvent = {
      type: 'context.requested',
      timestamp: ts,
      sessionId: 'sess-123',
      mode: 'full',
      tokenBudget: 50000,
    };
    expect(event.type).toBe('context.requested');
    expect(event.mode).toBe('full');
    expect(event.tokenBudget).toBe(50000);
  });

  it('should type-check a context.loaded event', () => {
    const event: ContextLoadedEvent = {
      type: 'context.loaded',
      timestamp: ts,
      sessionId: 'sess-123',
      fragmentCount: 5,
      beadsIds: ['bead-001', 'bead-002'],
      source: 'mixed',
    };
    expect(event.type).toBe('context.loaded');
    expect(event.fragmentCount).toBe(5);
    expect(event.source).toBe('mixed');
  });

  describe('discriminated union narrowing', () => {
    it('should narrow to WorkCompletedEvent via type field', () => {
      const event: DomainEvent = {
        type: 'work.completed',
        timestamp: ts,
        sessionId: 'sess-123',
        workSlug: '20260404-auth',
        title: 'Auth rate limiting',
        criteriaPass: 8,
        criteriaTotal: 8,
      };

      if (event.type === 'work.completed') {
        // TypeScript narrows to WorkCompletedEvent here
        expect(event.criteriaPass).toBe(8);
        expect(event.criteriaTotal).toBe(8);
        expect(event.workSlug).toBe('20260404-auth');
      } else {
        // Should never reach here
        expect(true).toBe(false);
      }
    });

    it('should narrow to SignalCapturedEvent via type field', () => {
      const event: DomainEvent = {
        type: 'signal.captured',
        timestamp: ts,
        sessionId: 'sess-123',
        rating: 7,
        sentiment: 'positive',
        summary: 'Great session',
      };

      if (event.type === 'signal.captured') {
        expect(event.rating).toBe(7);
        expect(event.sentiment).toBe('positive');
      } else {
        expect(true).toBe(false);
      }
    });

    it('should narrow to LearningCapturedEvent via type field', () => {
      const event: DomainEvent = {
        type: 'learning.captured',
        timestamp: ts,
        sessionId: 'sess-123',
        category: 'SYSTEM',
        summary: 'Cache invalidation matters',
      };

      if (event.type === 'learning.captured') {
        expect(event.category).toBe('SYSTEM');
        expect(event.summary).toBe('Cache invalidation matters');
      } else {
        expect(true).toBe(false);
      }
    });

    it('should narrow to PreferenceCapturedEvent via type field', () => {
      const event: DomainEvent = {
        type: 'preference.captured',
        timestamp: ts,
        noteType: 'B',
        content: 'Believes in TDD',
        actor: 'maceo',
      };

      if (event.type === 'preference.captured') {
        expect(event.noteType).toBe('B');
        expect(event.actor).toBe('maceo');
        expect(event.confidence).toBeUndefined();
      } else {
        expect(true).toBe(false);
      }
    });
  });
});

/**
 * Canonical Domain Event Types — v4.2.0 Zettelkasten Layer
 *
 * These types define the portable event contract that any runtime
 * (Claude Code, API, Slack, etc.) can emit into the EventBus.
 * Claude Code hooks are the first adapter; future runtimes emit
 * the same events without reimplementing hook logic.
 *
 * v4.2.0: Added SecurityDecisionEvent, VoiceCompletedEvent,
 *         BudgetWarningEvent, BudgetCriticalEvent (Phase 04).
 *
 * Spec: S17.3 (Canonical Domain Events)
 */

/** Base fields present on every domain event */
interface BaseEvent {
  type: string;
  timestamp: string; // ISO 8601
  sessionId?: string;
  runtime?: string; // 'claude-code' | 'api' | 'slack' | etc.
}

export interface SessionStartedEvent extends BaseEvent {
  type: 'session.started';
  sessionId: string;
  runtime: string;
}

export interface SessionEndedEvent extends BaseEvent {
  type: 'session.ended';
  sessionId: string;
  runtime: string;
}

export interface MessageReceivedEvent extends BaseEvent {
  type: 'message.received';
  sessionId: string;
  contentSummary: string;
  source: string;
}

export interface ArtifactCreatedEvent extends BaseEvent {
  type: 'artifact.created';
  artifactType: string;
  path: string;
  beadsId?: string;
  labels: string[];
}

export interface ArtifactUpdatedEvent extends BaseEvent {
  type: 'artifact.updated';
  artifactType: string;
  path: string;
  beadsId?: string;
  changes: string;
}

export interface WorkStartedEvent extends BaseEvent {
  type: 'work.started';
  sessionId: string;
  workSlug: string;
  title: string;
}

export interface WorkCompletedEvent extends BaseEvent {
  type: 'work.completed';
  sessionId: string;
  workSlug: string;
  title: string;
  criteriaPass: number;
  criteriaTotal: number;
}

export interface SignalCapturedEvent extends BaseEvent {
  type: 'signal.captured';
  sessionId: string;
  rating: number;
  sentiment: string;
  summary: string;
  workSlug?: string;
}

export interface LearningCapturedEvent extends BaseEvent {
  type: 'learning.captured';
  sessionId: string;
  category: 'SYSTEM' | 'ALGORITHM';
  summary: string;
  workSlug?: string;
}

export interface PreferenceCapturedEvent extends BaseEvent {
  type: 'preference.captured';
  noteType: 'W' | 'B' | 'O';
  content: string;
  actor: string;
  confidence?: number;
}

export interface ContextRequestedEvent extends BaseEvent {
  type: 'context.requested';
  sessionId: string;
  mode: string;
  tokenBudget?: number;
}

export interface ContextLoadedEvent extends BaseEvent {
  type: 'context.loaded';
  sessionId: string;
  fragmentCount: number;
  beadsIds: string[];
  source: 'beads' | 'filesystem' | 'mixed';
}

// --- v4.2.0 Phase 04 additions ---------------------------------------------

export interface SecurityDecisionEvent extends BaseEvent {
  type: 'security.decision';
  tool?: string;
  command?: string;
  path?: string;
  decision: 'allow' | 'block' | 'confirm';
  reason: string;
}

export interface VoiceCompletedEvent extends BaseEvent {
  type: 'voice.completed';
  text: string;
  voiceId?: string;
  durationMs?: number;
}

export interface BudgetInfoEvent extends BaseEvent {
  type: 'budget.info';
  sessionId: string;
  usagePercent: number;
  turnCount: number;
  model: string;
}

export interface BudgetHandoffRecommendedEvent extends BaseEvent {
  type: 'budget.handoff-recommended';
  sessionId: string;
  usagePercent: number;
  turnCount: number;
  model: string;
  predictedFinalPct?: number;
}

export interface BudgetHandoffCriticalEvent extends BaseEvent {
  type: 'budget.handoff-critical';
  sessionId: string;
  usagePercent: number;
  turnCount: number;
  model: string;
}

export interface SessionProfileRecordedEvent extends BaseEvent {
  type: 'session.profile-recorded';
  sessionId: string;
  workflowType: string;
  finalUsagePercent: number;
  turnCount: number;
  subagentsSpawned: number;
  handoffTriggered: boolean;
}

/** Discriminated union of all canonical domain events */
export type DomainEvent =
  | SessionStartedEvent
  | SessionEndedEvent
  | MessageReceivedEvent
  | ArtifactCreatedEvent
  | ArtifactUpdatedEvent
  | WorkStartedEvent
  | WorkCompletedEvent
  | SignalCapturedEvent
  | LearningCapturedEvent
  | PreferenceCapturedEvent
  | ContextRequestedEvent
  | ContextLoadedEvent
  | SecurityDecisionEvent
  | VoiceCompletedEvent
  | BudgetInfoEvent
  | BudgetHandoffRecommendedEvent
  | BudgetHandoffCriticalEvent
  | SessionProfileRecordedEvent;

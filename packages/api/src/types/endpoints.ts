import { Providers } from '@librechat/agents';
import type { BamlClientOptions, BamlFunctionSet } from '@librechat/agents/baml';
import type { ClientOptions, OpenAIClientOptions, HookCallback } from '@librechat/agents';
import type { TConfig } from 'librechat-data-provider';
import type { EndpointTokenConfig } from './tokens';
import type { ServerRequest } from './http';

export type TCustomEndpointsConfig = Partial<{ [key: string]: Omit<TConfig, 'order'> }>;

/**
 * Interface for user key values retrieved from the database
 */
export interface UserKeyValues {
  apiKey?: string;
  baseURL?: string;
}

/**
 * Function type for getting user key (single decrypted value)
 */
export type GetUserKeyFunction = (params: { userId: string; name: string }) => Promise<string>;

/**
 * Function type for getting user key values (parsed JSON object with apiKey/baseURL)
 */
export type GetUserKeyValuesFunction = (params: {
  userId: string;
  name: string;
}) => Promise<UserKeyValues>;

/**
 * Database methods required for endpoint initialization
 * These are passed in at invocation time to allow for dependency injection
 */
export interface EndpointDbMethods {
  /** Get single decrypted key value (used for simple API keys) */
  getUserKey: GetUserKeyFunction;
  /** Get parsed key values object (used for apiKey + baseURL combinations) */
  getUserKeyValues: GetUserKeyValuesFunction;
}

/**
 * Base parameters for all endpoint initialization functions
 */
export interface BaseInitializeParams {
  /** Request data containing user and body information (includes req.config) */
  req: ServerRequest;
  /** The endpoint name/identifier (e.g., 'openAI', 'anthropic', 'custom-endpoint-name') */
  endpoint: string;
  /** Model parameters from the request (includes model, temperature, topP, etc.) */
  model_parameters?: Record<string, unknown>;
  /** Database methods for user key operations */
  db: EndpointDbMethods;
}

/** Fields every initializer result carries, whatever the provider. */
interface InitializeResultCommon {
  configOptions?: OpenAIClientOptions['configuration'];
  endpointTokenConfig?: EndpointTokenConfig;
  useLegacyContent?: boolean;
  tools?: unknown[];
}

/**
 * Every provider whose whole client configuration is declarative and therefore
 * safe to persist as `agent.model_parameters`.
 */
export interface StandardInitializeResult extends InitializeResultCommon {
  llmConfig: ClientOptions;
  provider?: string;
  /**
   * Present only on the BAML arm. Declaring it here as `never` is what makes
   * `result.runtimeOptions != null` a sound narrowing: `provider` cannot
   * discriminate, because this arm's `provider` is a plain `string`.
   */
  runtimeOptions?: never;
}

/**
 * BAML splits its result in two on purpose.
 *
 * `llmConfig` is declarative and gets persisted. `runtimeOptions.functions` is
 * the executable port — generated functions, a worker handle, native values —
 * and must never reach `model_parameters`, a Mongo document, pending/HITL state,
 * a checkpoint, an SSE payload, or a public DTO. Splitting them at the TYPE level
 * means a BAML initializer that forgets cannot compile, rather than leaking at
 * runtime somewhere far from here.
 */
export interface BamlInitializeResult extends InitializeResultCommon {
  provider: Providers.BAML;
  llmConfig: Omit<BamlClientOptions, 'functions'>;
  runtimeOptions: { functions: BamlFunctionSet };
}

/**
 * Claude Agent SDK splits its result the same way BAML does, and for the same
 * reason: `preToolUseHook` is a closure over per-request tool-approval policy,
 * not declarative data, so it must never reach `agent.model_parameters`, a
 * Mongo document, pending/HITL state, a checkpoint, an SSE payload, or a
 * public DTO.
 */
export interface ClaudeAgentSdkInitializeResult extends InitializeResultCommon {
  provider: Providers.CLAUDE_AGENT_SDK;
  /**
   * `ClientOptions` (the broad per-provider union), not a `ProviderOptionsMap`
   * lookup — `ClaudeAgentSDKClientOptions` has no dedicated npm subpath the
   * way `BamlClientOptions` does (this provider is a normal static registry
   * entry, not BAML's optional-port shape), and indexing `ProviderOptionsMap`
   * by a `Providers` member from this package boundary does not resolve
   * (confirmed: the identical pattern fails for `Providers.BAML` too).
   */
  llmConfig: ClientOptions;
  runtimeOptions: { preToolUseHook: HookCallback<'PreToolUse'> };
}

export type InitializeResultBase =
  | StandardInitializeResult
  | BamlInitializeResult
  | ClaudeAgentSdkInitializeResult;

/**
 * Narrow to the BAML arm. Both halves are checked: `provider` is the intent and
 * `runtimeOptions` is what actually makes the union discriminable.
 */
export const isBamlInitializeResult = (
  result: InitializeResultBase,
): result is BamlInitializeResult =>
  result.provider === Providers.BAML && result.runtimeOptions != null;

/** Narrow to the Claude Agent SDK arm — same discrimination shape as {@link isBamlInitializeResult}. */
export const isClaudeAgentSdkInitializeResult = (
  result: InitializeResultBase,
): result is ClaudeAgentSdkInitializeResult =>
  result.provider === Providers.CLAUDE_AGENT_SDK && result.runtimeOptions != null;

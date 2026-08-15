// Side-effect import: registers `ChatBAML` on the agents SDK's provider
// registry (`registerChatModel(Providers.BAML, ChatBAML)`, in that package's
// own `llm/baml/index.ts`). Without it `createRun` rejects every BAML turn
// with "Unsupported LLM provider: baml" — the lightweight class registration
// the plan calls for, kept separate from the native runtime: this module has
// no dynamic import and never touches the bridge.
import '@librechat/agents/baml';
import type { BamlFunctionSet } from '@librechat/agents/baml';
import type { HookCallback } from '@librechat/agents';

/**
 * Where request-only executable state rides between `initializeAgent` and
 * `createRun`.
 *
 * The initialized agent is an ordinary object that gets spread, serialized, and
 * persisted along the way — `agent.model_parameters` becomes a Mongo document,
 * SSE JSON, and a public DTO. Neither a BAML function set nor a Claude Agent SDK
 * `PreToolUse` hook callback is any of those things: one holds generated
 * functions and a worker boundary, the other is a closure over per-request
 * policy state, and neither must appear in any of them.
 *
 * A symbol key that is non-enumerable makes that structural rather than
 * disciplinary: `Object.keys`, spread, `JSON.stringify`, and BSON all skip it,
 * so no downstream writer has to remember to strip it.
 *
 * Not a module-level `WeakMap`: a process-global side table outlives the request
 * that created it, is invisible at the call site, and turns a leak into something
 * you can only find by reading this file.
 */

const RUNTIME_CARRIER = Symbol('librechat.agentRuntime');

/**
 * Every field is optional and every initializer sets at most one: a shared
 * carrier keyed by provider identity, not a discriminated union, because
 * `getAgentRuntimeOptions`'s single consumer (`agents/run.ts`) merges
 * whichever fields are present onto `llmConfig` generically, without needing
 * to know which provider set them.
 */
export interface AgentRuntimeOptions {
  readonly functions?: BamlFunctionSet;
  readonly preToolUseHook?: HookCallback<'PreToolUse'>;
}

type RuntimeCarrier = { [RUNTIME_CARRIER]?: AgentRuntimeOptions };

/** Attaches runtime options to an in-memory agent. Returns the same object. */
export const setAgentRuntimeOptions = <T extends object>(
  agent: T,
  runtimeOptions: AgentRuntimeOptions,
): T => {
  Object.defineProperty(agent, RUNTIME_CARRIER, {
    value: runtimeOptions,
    enumerable: false,
    configurable: true,
    writable: false,
  });
  return agent;
};

export const getAgentRuntimeOptions = (
  agent: object | undefined | null,
): AgentRuntimeOptions | undefined =>
  (agent as RuntimeCarrier | null | undefined)?.[RUNTIME_CARRIER];

/** Exposed so tests can assert the key is absent from every serialized surface. */
export const AGENT_RUNTIME_CARRIER = RUNTIME_CARRIER;

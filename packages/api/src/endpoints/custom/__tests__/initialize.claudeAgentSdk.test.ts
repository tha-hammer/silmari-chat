import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { Providers, createToolPolicyHook } from '@librechat/agents';
import type { HookCallback, PreToolUseHookInput, PreToolUseHookOutput } from '@librechat/agents';
import type { BaseInitializeParams } from '~/types';

// AF-j8s3: the mock scaffolding below is scoped to exactly what
// initializeClaudeAgentSdk's own code path touches (it short-circuits
// before any of initializeCustom's generic OpenAI-compatible-endpoint
// logic — no db.getUserKeyValues, no URL validation, no model fetch), so
// this file does not need the full mock surface `initialize.spec.ts` sets
// up for the other, non-Claude-Agent-SDK describe blocks in that file.
const mockGetCustomEndpointConfig = jest.fn();
jest.mock('~/app/config', () => ({
  getCustomEndpointConfig: (...args: unknown[]) => mockGetCustomEndpointConfig(...args),
}));

import { buildClaudeAgentSdkPreToolUseHook, initializeCustom } from '~/endpoints/custom/initialize';

function call(
  hook: HookCallback<'PreToolUse'>,
  input: PreToolUseHookInput,
): Promise<PreToolUseHookOutput> {
  return Promise.resolve(hook(input, new AbortController().signal));
}

function writeInput(filePath: string): PreToolUseHookInput {
  return {
    hook_event_name: 'PreToolUse',
    runId: 'r',
    threadId: 't',
    agentId: 'a',
    toolName: 'Write',
    toolInput: { file_path: filePath },
    toolUseId: 'tu',
    stepId: 's',
    turn: 0,
  };
}

function bashInput(command: string): PreToolUseHookInput {
  return {
    hook_event_name: 'PreToolUse',
    runId: 'r',
    threadId: 't',
    agentId: 'a',
    toolName: 'Bash',
    toolInput: { command },
    toolUseId: 'tu',
    stepId: 's',
    turn: 0,
  };
}

describe('buildClaudeAgentSdkPreToolUseHook', () => {
  let workspace: string;
  let memoryRoot: string;
  let aaiUserRoot: string;
  let outsideRoot: string;
  const toolPolicyHook = createToolPolicyHook({ mode: 'bypass' });

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'cas-workspace-'));
    memoryRoot = await mkdtemp(join(tmpdir(), 'cas-memory-'));
    aaiUserRoot = await mkdtemp(join(tmpdir(), 'cas-aai-user-'));
    outsideRoot = await mkdtemp(join(tmpdir(), 'cas-outside-'));
  });

  afterEach(async () => {
    await Promise.all(
      [workspace, memoryRoot, aaiUserRoot, outsideRoot].map((dir) =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
  });

  it('allows a write inside the per-user cwd workspace', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(toolPolicyHook, workspace, [
      memoryRoot,
      aaiUserRoot,
    ]);
    const out = await call(hook, writeInput(join(workspace, 'chat-upload.txt')));
    expect(out.decision).toBe('allow');
  });

  it('allows a write into an additional writable root (e.g. the shipped AAI MEMORY/ tree)', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(toolPolicyHook, workspace, [
      memoryRoot,
      aaiUserRoot,
    ]);
    const out = await call(hook, writeInput(join(memoryRoot, 'WISDOM', 'extraction.md')));
    expect(out.decision).toBe('allow');
  });

  it('allows a write into the AAI/USER additional writable root', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(toolPolicyHook, workspace, [
      memoryRoot,
      aaiUserRoot,
    ]);
    const out = await call(hook, writeInput(join(aaiUserRoot, 'PROJECTS', 'notes.md')));
    expect(out.decision).toBe('allow');
  });

  it('denies a write outside the workspace and every additional root (e.g. shipped hooks/skills)', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(toolPolicyHook, workspace, [
      memoryRoot,
      aaiUserRoot,
    ]);
    const out = await call(hook, writeInput(join(outsideRoot, 'settings.json')));
    expect(out.decision).toBe('deny');
  });

  it('denies a write into memoryRoot when no additional roots are configured (regression: the pre-fix default)', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(toolPolicyHook, workspace);
    const out = await call(hook, writeInput(join(memoryRoot, 'WISDOM', 'extraction.md')));
    expect(out.decision).toBe('deny');
  });

  // AF-hro9: Bash had no path extractor at all -- a command reading/writing
  // an absolute path outside the workspace passed straight through as
  // 'allow', regardless of cwd, gated only by createToolPolicyHook's
  // tool-name policy.
  it('denies a Bash command targeting an absolute path outside the workspace root', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(toolPolicyHook, workspace, [
      memoryRoot,
      aaiUserRoot,
    ]);
    const out = await call(hook, bashInput('cat /etc/passwd'));
    expect(out.decision).toBe('deny');
  });

  it('allows a Bash command with no absolute/traversal path tokens', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(toolPolicyHook, workspace, [
      memoryRoot,
      aaiUserRoot,
    ]);
    const out = await call(hook, bashInput('npx tsc --noEmit'));
    expect(out.decision).toBe('allow');
  });

  it('allows a Bash command targeting an absolute path inside the workspace', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(toolPolicyHook, workspace, [
      memoryRoot,
      aaiUserRoot,
    ]);
    const out = await call(hook, bashInput(`cat ${join(workspace, 'notes.txt')}`));
    expect(out.decision).toBe('allow');
  });
});

// AF-j8s3: the tests above all call buildClaudeAgentSdkPreToolUseHook
// directly with a hand-built toolPolicyHook — none of them prove the
// composed hook actually survives initializeCustom's real dispatch path.
// This drives the full public entrypoint instead, so a future refactor of
// that dispatch or of setAgentRuntimeOptions's runtime-options merge would
// fail this test if it silently dropped the wiring.
describe('initializeCustom -> initializeClaudeAgentSdk (production wiring, AF-j8s3)', () => {
  const testUserId = 'af-j8s3-test-user';
  let uploadsDirCreated: string | undefined;

  afterEach(async () => {
    mockGetCustomEndpointConfig.mockReset();
    if (uploadsDirCreated != null) {
      await rm(uploadsDirCreated, { recursive: true, force: true });
      uploadsDirCreated = undefined;
    }
  });

  function claudeAgentSdkParams(): BaseInitializeParams {
    mockGetCustomEndpointConfig.mockReturnValue({
      provider: Providers.CLAUDE_AGENT_SDK,
      models: {},
    });
    return {
      req: {
        user: { id: testUserId },
        body: {},
        config: {},
      } as unknown as BaseInitializeParams['req'],
      endpoint: 'claude-agent-sdk-test',
      db: {} as unknown as BaseInitializeParams['db'],
    };
  }

  it('the returned runtimeOptions.preToolUseHook denies a Read targeting a path outside the resolved workspace', async () => {
    const result = await initializeCustom(claudeAgentSdkParams());

    expect(result.provider).toBe(Providers.CLAUDE_AGENT_SDK);
    const preToolUseHook = (
      result as unknown as { runtimeOptions?: { preToolUseHook?: HookCallback<'PreToolUse'> } }
    ).runtimeOptions?.preToolUseHook;
    expect(preToolUseHook).toBeDefined();
    // resolveClaudeAgentSdkWorkspace creates uploads/<userId> for real —
    // recorded so afterEach can clean it up.
    const cwd = (result.llmConfig as { cwd?: string }).cwd;
    expect(cwd).toContain(testUserId);
    uploadsDirCreated = cwd;

    const outOfWorkspace: PreToolUseHookInput = {
      hook_event_name: 'PreToolUse',
      runId: 'r',
      threadId: 't',
      toolName: 'Read',
      toolInput: { file_path: '/etc/passwd' },
      toolUseId: 'tu',
    };
    const out = await call(preToolUseHook as HookCallback<'PreToolUse'>, outOfWorkspace);

    expect(out.decision).toBe('deny');
  });

  it('allows a Read inside the resolved per-user workspace', async () => {
    const result = await initializeCustom(claudeAgentSdkParams());
    const cwd = (result.llmConfig as { cwd?: string }).cwd as string;
    uploadsDirCreated = cwd;
    const preToolUseHook = (
      result as unknown as { runtimeOptions?: { preToolUseHook?: HookCallback<'PreToolUse'> } }
    ).runtimeOptions?.preToolUseHook as HookCallback<'PreToolUse'>;

    const insideWorkspace: PreToolUseHookInput = {
      hook_event_name: 'PreToolUse',
      runId: 'r',
      threadId: 't',
      toolName: 'Read',
      toolInput: { file_path: join(cwd, 'upload.txt') },
      toolUseId: 'tu',
    };
    const out = await call(preToolUseHook, insideWorkspace);

    expect(out.decision).toBe('allow');
  });
});

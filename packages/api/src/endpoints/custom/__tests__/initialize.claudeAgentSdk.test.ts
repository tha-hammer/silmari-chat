import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { createToolPolicyHook } from '@librechat/agents';
import type { HookCallback, PreToolUseHookInput, PreToolUseHookOutput } from '@librechat/agents';
import { buildClaudeAgentSdkPreToolUseHook } from '~/endpoints/custom/initialize';

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
});

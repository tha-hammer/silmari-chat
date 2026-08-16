import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { HookCallback, PreToolUseHookInput } from '@librechat/agents';
import { CLAUDE_AGENT_SDK_PATH_EXTRACTORS, buildClaudeAgentSdkPreToolUseHook } from './initialize';

function toolInput(
  toolName: string,
  toolInputFields: Record<string, unknown>,
): PreToolUseHookInput {
  return {
    hook_event_name: 'PreToolUse',
    runId: 'run-1',
    toolName,
    toolInput: toolInputFields,
    toolUseId: 'tool-use-1',
  };
}

const alwaysAllow: HookCallback<'PreToolUse'> = async () => ({ decision: 'allow' });
const alwaysDeny: HookCallback<'PreToolUse'> = async () => ({
  decision: 'deny',
  reason: 'tool policy denied',
});

describe('CLAUDE_AGENT_SDK_PATH_EXTRACTORS', () => {
  it('extracts file_path for Read/Write/Edit', () => {
    expect(CLAUDE_AGENT_SDK_PATH_EXTRACTORS.Read({ file_path: '/a/b.txt' })).toEqual(['/a/b.txt']);
    expect(CLAUDE_AGENT_SDK_PATH_EXTRACTORS.Write({ file_path: '/a/b.txt' })).toEqual(['/a/b.txt']);
    expect(CLAUDE_AGENT_SDK_PATH_EXTRACTORS.Edit({ file_path: '/a/b.txt' })).toEqual(['/a/b.txt']);
  });

  it('extracts notebook_path for NotebookEdit', () => {
    expect(CLAUDE_AGENT_SDK_PATH_EXTRACTORS.NotebookEdit({ notebook_path: '/a/nb.ipynb' })).toEqual(
      ['/a/nb.ipynb'],
    );
  });

  it('extracts optional path for Grep/Glob, empty when absent', () => {
    expect(CLAUDE_AGENT_SDK_PATH_EXTRACTORS.Grep({ pattern: 'x', path: '/a' })).toEqual(['/a']);
    expect(CLAUDE_AGENT_SDK_PATH_EXTRACTORS.Glob({ pattern: '*.ts' })).toEqual([]);
  });

  it('has no entry for Bash — a documented, tracked gap', () => {
    expect(CLAUDE_AGENT_SDK_PATH_EXTRACTORS.Bash).toBeUndefined();
  });
});

describe('buildClaudeAgentSdkPreToolUseHook', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'claude-sdk-hook-test-')));
  const outsidePath = path.resolve(os.tmpdir(), 'definitely-outside-the-workspace.txt');

  it('allows a Read inside the workspace root', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(alwaysAllow, root);
    const result = await hook(
      toolInput('Read', { file_path: path.join(root, 'notes.txt') }),
      new AbortController().signal,
    );
    expect(result.decision).toBe('allow');
  });

  it('denies a Read outside the workspace root', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(alwaysAllow, root);
    const result = await hook(
      toolInput('Read', { file_path: outsidePath }),
      new AbortController().signal,
    );
    expect(result.decision).toBe('deny');
  });

  it('denies a Write outside the workspace root', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(alwaysAllow, root);
    const result = await hook(
      toolInput('Write', { file_path: outsidePath }),
      new AbortController().signal,
    );
    expect(result.decision).toBe('deny');
  });

  it('does not path-gate Bash — passes through as allow (tracked gap)', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(alwaysAllow, root);
    const result = await hook(
      toolInput('Bash', { command: `cat ${outsidePath}` }),
      new AbortController().signal,
    );
    expect(result.decision).toBe('allow');
  });

  it('short-circuits on a tool-policy deny before evaluating the workspace boundary', async () => {
    const hook = buildClaudeAgentSdkPreToolUseHook(alwaysDeny, root);
    const result = await hook(
      toolInput('Read', { file_path: path.join(root, 'notes.txt') }),
      new AbortController().signal,
    );
    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('tool policy denied');
  });
});

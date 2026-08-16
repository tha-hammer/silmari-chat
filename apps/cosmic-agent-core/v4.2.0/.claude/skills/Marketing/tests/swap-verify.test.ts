/**
 * Phase 6 — Marketing Memory.md swap verification.
 *
 * Asserts:
 *   1. Memory.md is the post-cutover (3.9.0) version, not the deprecated CLI version
 *   2. Memory.md.deprecated preserved (or .draft removed)
 *   3. SKILL.md no longer contains the DEPRECATED warning block
 */
import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

describe('Phase 6: Marketing Memory.md swap', () => {
  const dir = '/home/maceo/.claude/AAI/skills/Marketing/Workflows';
  const skillPath = '/home/maceo/.claude/AAI/skills/Marketing/SKILL.md';

  it('Memory.md is the post-cutover (3.9.0) version, not the deprecated CLI version', () => {
    const content = readFileSync(`${dir}/Memory.md`, 'utf8');
    // No active calls to the legacy CLI. (Mention in deprecation tables OK.)
    expect(content).not.toMatch(/^\s*zettel (recall|save|hub|link)\s/m);
    // New patterns present
    expect(content).toMatch(/Bash[: ]\s*silmari save|silmari tool zk_/);
    // Valid edges referenced
    expect(content).toMatch(/derives-from|refers-to|refines/);
  });

  it('Memory.md.deprecated preserved (or .draft removed)', () => {
    const deprecated = existsSync(`${dir}/Memory.md.deprecated`);
    const draft = existsSync(`${dir}/Memory.md.draft`);
    expect(deprecated || !draft).toBe(true);
  });

  it('SKILL.md no longer contains the DEPRECATED warning block', () => {
    const skill = readFileSync(skillPath, 'utf8');
    expect(skill).not.toMatch(/DEPRECATED workflow/i);
    expect(skill).toMatch(/Workflows\/Memory\.md/); // still references the file
  });
});

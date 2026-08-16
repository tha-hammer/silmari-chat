/**
 * tool-registry.test.ts — Tests for tool registry
 *
 * B4: Build programmatic tool registry
 * B5: Task-aware tool pool assembly
 */

import { describe, it, expect } from 'bun:test';
import {
  buildToolRegistry,
  assembleToolPool,
  extractTriggers,
  extractCategory,
  type RegistryInputs,
  type TaskContext,
  type ToolRegistryEntry,
} from './tool-registry';

// ========================================
// Test Fixtures
// ========================================

const SKILL_MANIFESTS = [
  {
    path: 'Packs/Research/src/SKILL.md',
    name: 'research',
    description:
      'Comprehensive research — quick/standard/extensive/deep modes. USE WHEN research, do research, quick research, extensive research',
  },
  {
    path: 'Packs/Media/src/Art/SKILL.md',
    name: 'media',
    description:
      'Visual content creation — illustrations, diagrams, mermaid. USE WHEN art, header images, visualizations, mermaid, diagrams',
  },
  {
    path: 'Packs/Security/src/Recon/SKILL.md',
    name: 'security',
    description:
      'Security assessment — recon, web app testing, prompt injection. USE WHEN recon, security, penetration testing, vulnerability',
  },
  {
    path: 'Packs/Investigation/src/OSINT/SKILL.md',
    name: 'investigation',
    description:
      'OSINT and people-finding. USE WHEN OSINT, due diligence, background check, find person',
  },
];

const HOOK_METADATA = [
  { name: 'SecurityValidator', event: 'PreToolUse' },
  { name: 'LoadContext', event: 'PreToolUse' },
];

// ========================================
// B4: extractTriggers
// ========================================

describe('B4: extractTriggers', () => {
  it('extracts trigger phrases after USE WHEN', () => {
    const triggers = extractTriggers(
      'Some description. USE WHEN research, do research, quick research'
    );
    expect(triggers).toEqual(['research', 'do research', 'quick research']);
  });

  it('returns empty array when no USE WHEN present', () => {
    const triggers = extractTriggers('Just a plain description');
    expect(triggers).toEqual([]);
  });

  it('lowercases all triggers', () => {
    const triggers = extractTriggers('Desc. USE WHEN OSINT, Due Diligence');
    expect(triggers).toEqual(['osint', 'due diligence']);
  });

  it('filters empty strings from trailing commas', () => {
    const triggers = extractTriggers('Desc. USE WHEN a, b, ');
    expect(triggers).not.toContain('');
  });
});

// ========================================
// B4: extractCategory
// ========================================

describe('B4: extractCategory', () => {
  it('extracts category from Packs/ path', () => {
    expect(extractCategory('Packs/Research/src/SKILL.md')).toBe('Research');
  });

  it('extracts category from nested Packs/ path', () => {
    expect(extractCategory('Packs/Media/src/Art/SKILL.md')).toBe('Media');
  });

  it('extracts category from Security path', () => {
    expect(extractCategory('Packs/Security/src/Recon/SKILL.md')).toBe(
      'Security'
    );
  });

  it('returns fallback for non-Packs path', () => {
    const cat = extractCategory('lib/something.ts');
    expect(typeof cat).toBe('string');
    expect(cat.length).toBeGreaterThan(0);
  });
});

// ========================================
// B4: buildToolRegistry
// ========================================

describe('B4: buildToolRegistry', () => {
  it('builds entries from skill manifests', () => {
    const registry = buildToolRegistry({ skillManifests: SKILL_MANIFESTS });
    expect(registry).toHaveLength(4);
  });

  it('extracts triggers into each entry', () => {
    const registry = buildToolRegistry({ skillManifests: SKILL_MANIFESTS });
    const research = registry.find((e) => e.name === 'research');
    expect(research).toBeDefined();
    expect(research!.triggers).toContain('research');
    expect(research!.triggers).toContain('do research');
    expect(research!.triggers).toContain('quick research');
    expect(research!.triggers).toContain('extensive research');
  });

  it('strips USE WHEN from description', () => {
    const registry = buildToolRegistry({ skillManifests: SKILL_MANIFESTS });
    const research = registry.find((e) => e.name === 'research');
    expect(research!.description).not.toContain('USE WHEN');
  });

  it('categorizes by directory structure', () => {
    const registry = buildToolRegistry({ skillManifests: SKILL_MANIFESTS });
    const research = registry.find((e) => e.name === 'research');
    expect(research!.category).toBe('Research');

    const media = registry.find((e) => e.name === 'media');
    expect(media!.category).toBe('Media');

    const security = registry.find((e) => e.name === 'security');
    expect(security!.category).toBe('Security');
  });

  it('returns alphabetically sorted entries', () => {
    const registry = buildToolRegistry({ skillManifests: SKILL_MANIFESTS });
    const names = registry.map((e) => e.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('includes hook metadata as core entries', () => {
    const registry = buildToolRegistry({
      skillManifests: SKILL_MANIFESTS,
      hookMetadata: HOOK_METADATA,
    });
    const hookEntries = registry.filter((e) => e.category === 'core');
    expect(hookEntries).toHaveLength(2);
    expect(hookEntries.map((e) => e.name).sort()).toEqual([
      'LoadContext',
      'SecurityValidator',
    ]);
  });

  it('includes sourcePath for each entry', () => {
    const registry = buildToolRegistry({ skillManifests: SKILL_MANIFESTS });
    for (const entry of registry) {
      expect(entry.sourcePath).toBeTruthy();
    }
  });

  it('handles empty inputs', () => {
    const registry = buildToolRegistry({ skillManifests: [] });
    expect(registry).toEqual([]);
  });
});

// ========================================
// B5: assembleToolPool
// ========================================

describe('B5: assembleToolPool', () => {
  const registry = buildToolRegistry({
    skillManifests: SKILL_MANIFESTS,
    hookMetadata: HOOK_METADATA,
  });

  it('matches research keywords to research tool', () => {
    const context: TaskContext = {
      taskType: 'analysis',
      keywords: ['research', 'deep'],
    };
    const pool = assembleToolPool(context, registry);
    const names = pool.map((e) => e.name);
    expect(names).toContain('research');
  });

  it('matches art keywords to media tool', () => {
    const context: TaskContext = {
      taskType: 'creation',
      keywords: ['art', 'diagrams'],
    };
    const pool = assembleToolPool(context, registry);
    const names = pool.map((e) => e.name);
    expect(names).toContain('media');
  });

  it('matches security keywords to security tool', () => {
    const context: TaskContext = {
      taskType: 'assessment',
      keywords: ['recon', 'vulnerability'],
    };
    const pool = assembleToolPool(context, registry);
    const names = pool.map((e) => e.name);
    expect(names).toContain('security');
  });

  it('matches OSINT keywords to investigation tool', () => {
    const context: TaskContext = {
      taskType: 'investigation',
      keywords: ['OSINT', 'due diligence'],
    };
    const pool = assembleToolPool(context, registry);
    const names = pool.map((e) => e.name);
    expect(names).toContain('investigation');
  });

  it('always includes core category tools', () => {
    const context: TaskContext = {
      taskType: 'random',
      keywords: ['research'],
    };
    const pool = assembleToolPool(context, registry);
    const coreEntries = pool.filter((e) => e.category === 'core');
    expect(coreEntries.length).toBeGreaterThanOrEqual(2);
  });

  it('respects maxTools limit', () => {
    const context: TaskContext = {
      taskType: 'everything',
      keywords: ['research', 'art', 'security', 'OSINT'],
    };
    const pool = assembleToolPool(context, registry, 3);
    expect(pool.length).toBeLessThanOrEqual(3);
  });

  it('returns empty non-core results for unmatched keywords', () => {
    const context: TaskContext = {
      taskType: 'cooking',
      keywords: ['recipe', 'ingredients'],
    };
    const pool = assembleToolPool(context, registry);
    const nonCore = pool.filter((e) => e.category !== 'core');
    expect(nonCore).toHaveLength(0);
  });

  it('scores higher relevance for multiple keyword matches', () => {
    // "research" should score higher than others when multiple research keywords match
    const context: TaskContext = {
      taskType: 'study',
      keywords: ['research', 'extensive research', 'deep'],
    };
    const pool = assembleToolPool(context, registry);
    const nonCore = pool.filter((e) => e.category !== 'core');
    if (nonCore.length > 0) {
      // Research should be first non-core result (highest score)
      expect(nonCore[0].name).toBe('research');
    }
  });

  it('default maxTools is 10', () => {
    const context: TaskContext = {
      taskType: 'test',
      keywords: ['research', 'art', 'security', 'OSINT'],
    };
    const pool = assembleToolPool(context, registry);
    expect(pool.length).toBeLessThanOrEqual(10);
  });
});

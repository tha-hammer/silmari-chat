/**
 * tool-registry.ts — Programmatic tool/skill registry
 *
 * B4: Build programmatic tool registry from skill manifests
 * B5: Task-aware tool pool assembly with keyword matching
 */

// ========================================
// Types
// ========================================

export interface ToolRegistryEntry {
  name: string;
  description: string;
  triggers: string[];
  category: string;
  sourcePath: string;
}

export interface RegistryInputs {
  skillManifests: Array<{
    path: string;
    name: string;
    description: string;
  }>;
  hookMetadata?: Array<{ name: string; event: string }>;
}

export interface TaskContext {
  taskType: string;
  keywords: string[];
  currentPhase?: string;
}

// ========================================
// B4: Build Tool Registry
// ========================================

/**
 * Extract trigger phrases from a description string.
 * Looks for text after "USE WHEN" and splits on commas.
 */
export function extractTriggers(description: string): string[] {
  const useWhenMatch = description.match(/USE WHEN\s+(.*?)$/i);
  if (!useWhenMatch) return [];

  return useWhenMatch[1]
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

/**
 * Extract category from a file path based on directory structure.
 * e.g., "Packs/Research/src/SKILL.md" -> "Research"
 */
export function extractCategory(path: string): string {
  const parts = path.split('/');
  const packsIdx = parts.indexOf('Packs');
  if (packsIdx >= 0 && packsIdx + 1 < parts.length) {
    return parts[packsIdx + 1];
  }
  // Fallback: use first meaningful directory
  return parts.find((p) => p && p !== 'src' && p !== 'SKILL.md') || 'core';
}

/**
 * Build a tool registry from skill manifests and optional hook metadata.
 * Returns entries sorted alphabetically by name (deterministic ordering).
 */
export function buildToolRegistry(inputs: RegistryInputs): ToolRegistryEntry[] {
  const entries: ToolRegistryEntry[] = [];

  for (const manifest of inputs.skillManifests) {
    const triggers = extractTriggers(manifest.description);
    const category = extractCategory(manifest.path);

    // Strip the USE WHEN suffix for the clean description
    const cleanDesc = manifest.description
      .replace(/\s*USE WHEN\s+.*$/i, '')
      .trim();

    entries.push({
      name: manifest.name,
      description: cleanDesc,
      triggers,
      category,
      sourcePath: manifest.path,
    });
  }

  // Add hook entries if provided
  if (inputs.hookMetadata) {
    for (const hook of inputs.hookMetadata) {
      entries.push({
        name: hook.name,
        description: `Hook: ${hook.event}`,
        triggers: [],
        category: 'core',
        sourcePath: `hooks/${hook.name}`,
      });
    }
  }

  // Deterministic ordering: alphabetical by name
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

// ========================================
// B5: Task-Aware Tool Pool Assembly
// ========================================

/**
 * Score a tool entry against task keywords.
 * Returns the number of keyword matches against trigger phrases.
 */
function scoreEntry(entry: ToolRegistryEntry, keywords: string[]): number {
  let score = 0;
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  for (const keyword of lowerKeywords) {
    // Check triggers
    for (const trigger of entry.triggers) {
      if (trigger.includes(keyword) || keyword.includes(trigger)) {
        score++;
      }
    }

    // Check name match (bonus)
    if (entry.name.toLowerCase().includes(keyword)) {
      score++;
    }

    // Check description match
    if (entry.description.toLowerCase().includes(keyword)) {
      score++;
    }
  }

  return score;
}

/**
 * Assemble a pool of relevant tools for a given task context.
 *
 * - Matches task keywords against trigger phrases and descriptions
 * - Scores by relevance (number of keyword matches)
 * - Always includes "core" category tools
 * - Returns top N relevant tools (default 10)
 * - Sorted by relevance score descending, then alphabetically
 */
export function assembleToolPool(
  context: TaskContext,
  registry: ToolRegistryEntry[],
  maxTools: number = 10
): ToolRegistryEntry[] {
  // Always include core tools
  const coreTools = registry.filter((e) => e.category === 'core');

  // Score non-core tools
  const scored = registry
    .filter((e) => e.category !== 'core')
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, [...context.keywords, context.taskType]),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => {
      // Higher score first
      if (b.score !== a.score) return b.score - a.score;
      // Then alphabetical
      return a.entry.name.localeCompare(b.entry.name);
    });

  // Combine core + top scored, respecting maxTools
  const coreCount = coreTools.length;
  const remainingSlots = Math.max(0, maxTools - coreCount);
  const topScored = scored.slice(0, remainingSlots).map((s) => s.entry);

  const result = [...coreTools, ...topScored];

  // Final sort: core first, then by name
  return result.sort((a, b) => {
    if (a.category === 'core' && b.category !== 'core') return -1;
    if (a.category !== 'core' && b.category === 'core') return 1;
    return a.name.localeCompare(b.name);
  });
}

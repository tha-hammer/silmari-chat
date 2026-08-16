/**
 * types.ts — Shared types and constants for Marketing persistence hooks.
 *
 * Imported by ChecklistEnforcer.hook.ts and ChecklistStateInjector.hook.ts.
 * Single source of truth for state schema v2 (multi-tenant three-tier).
 */

export const SCHEMA_VERSION = 2 as const;
export const TOTAL_SECTIONS = 18 as const;

export type Phase = "understanding" | "improvement" | "expand" | "implement";
export type VersionString = `v${number}`;

export interface ExpandedSection {
  number: number;
  content: string;
}

export interface VerifyError {
  expected: string[];
  actual: string[];
  missing: string[];
  empty: string[];
  unexpected: string[];
}

export interface ChecklistState {
  schemaVersion: typeof SCHEMA_VERSION;
  client: string;
  product: string;
  version: VersionString;
  active: boolean;
  phase: Phase;
  currentSection: number;
  totalSections: typeof TOTAL_SECTIONS;
  expandedSections: ExpandedSection[];
  exchangeCount: number;
  startedAt: string;
  lastUpdated: string;
  handoffPath: string | null;
  handoffVerifiedAt: string | null;
  handoffVerifyError: VerifyError | null;
  handoffWriteInProgress: boolean;
  migratedFromLegacy: boolean;
  questions: {
    understanding: { asked: string[]; answered: string[]; total: 8 };
    improvement: { asked: string[]; answered: string[]; total: 10 };
  };
  completionEvidence: {
    target_audience_defined: boolean;
    core_problem_identified: boolean;
    value_proposition_clear: boolean;
    checklist_structure_defined: boolean;
    key_sections_identified: boolean;
    dependencies_resolved: boolean;
    all_sections_expanded: boolean;
  };
  transitionProposed: boolean;
  transitionProposedAt: string | null;
}

export interface ChecklistIndex {
  schemaVersion: typeof SCHEMA_VERSION;
  active: { client: string; product: string; version: VersionString }[];
  lastActive: { client: string; product: string; version: VersionString } | null;
}

export const EXPECTED_FILENAMES = [
  "01-usp.md", "02-claims-proof.md", "03-target-audience.md",
  "04-mechanism.md", "05-why-cubed.md", "06-appeal.md",
  "07-features-benefits.md", "08-promise.md", "09-hook.md",
  "10-headlines.md", "11-big-four.md", "12-pain-list.md",
  "13-vision-list.md", "14-usp-iteration-1.md", "15-usp-iteration-2.md",
  "16-usp-iteration-3.md", "17-usp-iteration-4.md", "18-usp-iteration-5.md",
] as const;

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
export const VERSION_RE = /^v\d+$/;

export function normalizeSlug(
  raw: string,
): { ok: true; slug: string } | { ok: false; reason: string } {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (slug.length < 2) return { ok: false, reason: "slug too short (min 2 chars)" };
  if (slug.length > 40) return { ok: false, reason: "slug too long (max 40 chars)" };
  if (!SLUG_RE.test(slug)) return { ok: false, reason: "slug must start and end with alphanumeric" };
  return { ok: true, slug };
}

export function nextVersion(existing: VersionString[]): VersionString {
  if (existing.length === 0) return "v1" as VersionString;
  const nums = existing
    .filter((v) => VERSION_RE.test(v))
    .map((v) => parseInt(v.slice(1), 10));
  const max = Math.max(0, ...nums);
  return `v${max + 1}` as VersionString;
}

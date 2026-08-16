/**
 * fragment-extractors.ts — Semantic fragment extraction from PRDs, learnings,
 * relationship notes, and research artifacts.
 *
 * v4.2.0 Plan 01: Regex-based extraction (not AI-powered).
 * All beads operations are in try/catch with silent degradation.
 *
 * Constraints:
 * - Titles < 200 chars, summaries < 500 chars
 * - Only extract clearly delineated sections
 * - Every fragment carries provenance
 * - Retrieval-worthiness: must be durable, standalone, reusable
 */

import {
  brCreate,
  brDepAdd,
  isBeadsAvailable,
} from './beads-index';
import { ensureBeadsWorkspace } from './beads-init';

// ─── Type Definitions ───────────────────────────────────────

export interface FragmentProvenance {
  sourcePath: string;
  artifactType: 'prd' | 'learning' | 'relationship' | 'research';
  extractionMethod: string;
  extractedAt: string;
  sourceSessionId?: string;
}

export interface BaseFragment {
  kind: string;
  title: string;
  summary: string;
  labels: string[];
  provenance: FragmentProvenance;
}

export interface DecisionFragment extends BaseFragment {
  kind: 'decision';
  rationale?: string;
}

export interface RiskFragment extends BaseFragment {
  kind: 'risk';
  severity?: 'high' | 'medium' | 'low';
}

export interface VerificationFragment extends BaseFragment {
  kind: 'verification';
  passCount?: number;
  totalCount?: number;
}

export interface LearningFragment extends BaseFragment {
  kind: 'learning' | 'failure-pattern' | 'recommendation';
}

export interface PreferenceFragment extends BaseFragment {
  kind: 'preference';
  actor: string;
  confidence?: number;
  contradicts?: string[];
}

export interface ResearchFindingFragment extends BaseFragment {
  kind: 'research-finding';
  entities?: string[];
  topics?: string[];
}

// ─── Provenance Builder ─────────────────────────────────────

export function buildFragmentProvenance(input: {
  sourcePath: string;
  artifactType: 'prd' | 'learning' | 'relationship' | 'research';
  extractionMethod: string;
  sourceSessionId?: string;
}): FragmentProvenance {
  return {
    sourcePath: input.sourcePath,
    artifactType: input.artifactType,
    extractionMethod: input.extractionMethod,
    extractedAt: new Date().toISOString(),
    sourceSessionId: input.sourceSessionId,
  };
}

// ─── Helpers ────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

/**
 * Extract a named section from markdown. Returns the body text between
 * the section heading and the next heading of equal or higher level, or EOF.
 */
function extractSection(content: string, ...headings: string[]): string | null {
  for (const heading of headings) {
    // Match ## Heading or ### Heading (case-insensitive)
    const pattern = new RegExp(
      `^(#{2,3})\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
      'im'
    );
    const match = content.match(pattern);
    if (!match || match.index === undefined) continue;

    const level = match[1].length;
    const startIdx = match.index + match[0].length;
    // Find next heading of equal or higher level
    const restContent = content.slice(startIdx);
    const nextHeadingPattern = new RegExp(`^#{1,${level}}\\s+`, 'm');
    const nextMatch = restContent.match(nextHeadingPattern);
    const endIdx = nextMatch?.index !== undefined ? startIdx + nextMatch.index : content.length;
    const body = content.slice(startIdx, endIdx).trim();
    if (body.length > 0) return body;
  }
  return null;
}

/**
 * Parse subsections (### Heading: Title) within a section body.
 * Returns array of { title, body } for each subsection.
 */
function parseSubsections(sectionBody: string, prefix: string): Array<{ title: string; body: string }> {
  const results: Array<{ title: string; body: string }> = [];
  // Match ### Prefix: Title or ### Prefix Title
  const pattern = new RegExp(
    `^###\\s+${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\s]+(.+)$`,
    'gim'
  );

  let match: RegExpExecArray | null;
  const matches: Array<{ title: string; index: number; fullMatchLength: number }> = [];

  while ((match = pattern.exec(sectionBody)) !== null) {
    matches.push({
      title: match[1].trim(),
      index: match.index,
      fullMatchLength: match[0].length,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index + matches[i].fullMatchLength;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index : sectionBody.length;
    const body = sectionBody.slice(startIdx, endIdx).trim();
    results.push({ title: matches[i].title, body });
  }

  return results;
}

/**
 * Check if content is retrieval-worthy — must express a durable idea,
 * be meaningful outside its parent, and likely reused independently.
 */
function isRetrievalWorthy(text: string): boolean {
  const trimmed = text.trim();
  // Too short to be meaningful standalone
  if (trimmed.length < 20) return false;
  // Transient/meta content patterns
  const transientPatterns = [
    /^just a small/i,
    /nothing notable/i,
    /nothing interesting/i,
    /chatted about/i,
    /lunch plans/i,
    /quick (fix|tweak|change)/i,
    /^todo:/i,
  ];
  for (const p of transientPatterns) {
    if (p.test(trimmed)) return false;
  }
  return true;
}

// ─── PRD Fragment Extraction ────────────────────────────────

export function extractPrdFragments(
  content: string,
  parentBeadsId: string,
  sessionId?: string
): BaseFragment[] {
  const fragments: BaseFragment[] = [];
  const provenance = buildFragmentProvenance({
    sourcePath: '',
    artifactType: 'prd',
    extractionMethod: 'section-parser',
    sourceSessionId: sessionId,
  });

  // Extract decisions
  const decisionSection = extractSection(content, 'Decisions', 'Design Decisions');
  if (decisionSection) {
    const subs = parseSubsections(decisionSection, 'Decision');
    for (const sub of subs) {
      if (!isRetrievalWorthy(sub.body)) continue;

      // Extract rationale
      let rationale: string | undefined;
      const rationaleMatch = sub.body.match(/\*\*Rationale:\*\*\s*([\s\S]*?)(?=\n\n|\n###|$)/);
      if (rationaleMatch) {
        rationale = truncate(rationaleMatch[1].trim(), 500);
      }

      // Summary is body without the rationale line
      let summary = sub.body;
      if (rationaleMatch) {
        summary = summary.replace(rationaleMatch[0], '').trim();
      }

      const fragment: DecisionFragment = {
        kind: 'decision',
        title: truncate(sub.title, 200),
        summary: truncate(summary, 500),
        labels: ['note:extract', 'kind:decision', 'memory:work'],
        provenance: { ...provenance },
        rationale,
      };
      fragments.push(fragment);
    }
  }

  // Extract risks
  const riskSection = extractSection(content, 'Risks', 'Risk');
  if (riskSection) {
    const subs = parseSubsections(riskSection, 'Risk');
    for (const sub of subs) {
      if (!isRetrievalWorthy(sub.body)) continue;

      // Detect severity from text cues
      let severity: 'high' | 'medium' | 'low' | undefined;
      const severityMatch = sub.body.match(/severity[:\s]+(\w+)/i) || sub.title.match(/severity[:\s]+(\w+)/i);
      if (severityMatch) {
        const raw = severityMatch[1].toLowerCase();
        if (raw === 'high' || raw === 'critical') severity = 'high';
        else if (raw === 'medium' || raw === 'moderate') severity = 'medium';
        else if (raw === 'low' || raw === 'minor') severity = 'low';
      }

      const severityLabels = severity ? [`severity:${severity}`] : [];
      const fragment: RiskFragment = {
        kind: 'risk',
        title: truncate(sub.title, 200),
        summary: truncate(sub.body, 500),
        labels: ['note:extract', 'kind:risk', 'memory:work', ...severityLabels],
        provenance: { ...provenance },
        severity,
      };
      fragments.push(fragment);
    }
  }

  // Extract verification
  const verifySection = extractSection(content, 'Verification', 'Test Results');
  if (verifySection) {
    // Count checkboxes
    const checked = (verifySection.match(/- \[x\]/gi) || []).length;
    const unchecked = (verifySection.match(/- \[ \]/g) || []).length;
    const total = checked + unchecked;

    if (total > 0) {
      const fragment: VerificationFragment = {
        kind: 'verification',
        title: truncate(`Verification: ${checked}/${total} passing`, 200),
        summary: truncate(verifySection.split('\n').slice(0, 3).join(' ').trim(), 500),
        labels: ['note:extract', 'kind:verification', 'memory:work'],
        provenance: { ...provenance },
        passCount: checked,
        totalCount: total,
      };
      fragments.push(fragment);
    }
  }

  return fragments;
}

// ─── Learning Fragment Extraction ───────────────────────────

export function extractLearningFragments(
  content: string,
  category: string
): BaseFragment[] {
  const fragments: BaseFragment[] = [];
  const provenance = buildFragmentProvenance({
    sourcePath: '',
    artifactType: 'learning',
    extractionMethod: 'pattern-match',
  });

  // Extract Root Cause -> failure-pattern
  const rootCausePattern = /\*\*Root Cause:\*\*\s*([\s\S]*?)(?=\n\n\*\*|\n\n##|\n\n[A-Z]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = rootCausePattern.exec(content)) !== null) {
    const text = match[1].trim();
    if (!isRetrievalWorthy(text)) continue;
    fragments.push({
      kind: 'failure-pattern',
      title: truncate(`Root cause: ${text.split('.')[0].trim()}`, 200),
      summary: truncate(text, 500),
      labels: ['note:extract', 'kind:failure-pattern', `learning:${category.toLowerCase()}`],
      provenance: { ...provenance },
    } as LearningFragment);
  }

  // Extract Lesson -> learning
  const lessonPattern = /\*\*Lesson:\*\*\s*([\s\S]*?)(?=\n\n\*\*|\n\n##|\n\n[A-Z]|$)/g;
  while ((match = lessonPattern.exec(content)) !== null) {
    const text = match[1].trim();
    if (!isRetrievalWorthy(text)) continue;
    fragments.push({
      kind: 'learning',
      title: truncate(`Lesson: ${text.split('.')[0].trim()}`, 200),
      summary: truncate(text, 500),
      labels: ['note:extract', 'kind:learning', `learning:${category.toLowerCase()}`],
      provenance: { ...provenance },
    } as LearningFragment);
  }

  // Extract Recommendation -> recommendation
  const recPattern = /\*\*Recommendation:\*\*\s*([\s\S]*?)(?=\n\n\*\*|\n\n##|\n\n[A-Z]|$)/g;
  while ((match = recPattern.exec(content)) !== null) {
    const text = match[1].trim();
    if (!isRetrievalWorthy(text)) continue;
    fragments.push({
      kind: 'recommendation',
      title: truncate(`Recommendation: ${text.split('.')[0].trim()}`, 200),
      summary: truncate(text, 500),
      labels: ['note:extract', 'kind:recommendation', `learning:${category.toLowerCase()}`],
      provenance: { ...provenance },
    } as LearningFragment);
  }

  return fragments;
}

// ─── Relationship Fragment Extraction ───────────────────────

export function extractRelationshipFragments(
  notes: Array<{
    type: string;
    content: string;
    entities: string[];
    confidence?: number;
  }>
): BaseFragment[] {
  const fragments: BaseFragment[] = [];
  const provenance = buildFragmentProvenance({
    sourcePath: '',
    artifactType: 'relationship',
    extractionMethod: 'note-parser',
  });

  for (const note of notes) {
    // Only O-type notes (opinions) are preferences
    if (note.type !== 'O') continue;
    if (!isRetrievalWorthy(note.content)) continue;

    // Detect contradiction markers
    let contradicts: string[] | undefined;

    // Check for explicit [CONTRADICTS: ...] marker
    const contradictsMatch = note.content.match(/\[CONTRADICTS:\s*([^\]]+)\]/i);
    if (contradictsMatch) {
      contradicts = [contradictsMatch[1].trim()];
    }

    // Check for correction/negation language
    if (!contradicts) {
      const correctionPatterns = [
        /^actually\b/i,
        /^correction\b/i,
        /\bnot anymore\b/i,
        /\bno longer\b/i,
        /\bdoes not want\b/i,
        /\bdoesn't want\b/i,
      ];
      for (const p of correctionPatterns) {
        if (p.test(note.content)) {
          // Extract the negated preference as the contradiction target
          contradicts = [note.content.replace(p, '').trim().slice(0, 200)];
          break;
        }
      }
    }

    // Extract actor from entities (remove @ prefix)
    const actor = note.entities[0]?.replace(/^@/, '') || 'unknown';

    const fragment: PreferenceFragment = {
      kind: 'preference',
      title: truncate(note.content.replace(/\[CONTRADICTS:[^\]]+\]/i, '').trim(), 200),
      summary: truncate(note.content, 500),
      labels: [
        'note:extract',
        'kind:preference',
        'memory:relationship',
        `entity:${actor.toLowerCase().replace(/\s+/g, '-')}`,
      ],
      provenance: { ...provenance },
      actor,
      confidence: note.confidence,
      contradicts,
    };
    fragments.push(fragment);
  }

  return fragments;
}

// ─── Research Fragment Extraction ───────────────────────────

export function extractResearchFragments(
  content: string
): BaseFragment[] {
  const fragments: BaseFragment[] = [];
  const provenance = buildFragmentProvenance({
    sourcePath: '',
    artifactType: 'research',
    extractionMethod: 'section-parser',
  });

  // Extract global topics and entities for labeling
  const globalTopics = extractTopicsList(content);
  const globalEntities = extractEntitiesList(content);

  // Extract findings from ## Findings section
  const findingsSection = extractSection(content, 'Findings');
  if (!findingsSection) return fragments;

  const subs = parseSubsections(findingsSection, 'Finding');
  for (const sub of subs) {
    if (!isRetrievalWorthy(sub.body)) continue;

    const fragment: ResearchFindingFragment = {
      kind: 'research-finding',
      title: truncate(sub.title, 200),
      summary: truncate(sub.body, 500),
      labels: ['note:extract', 'kind:research-finding', 'memory:research'],
      provenance: { ...provenance },
      topics: globalTopics.length > 0 ? globalTopics : undefined,
      entities: globalEntities.length > 0 ? globalEntities : undefined,
    };
    fragments.push(fragment);
  }

  return fragments;
}

/** Extract topics from a ## Topics section as normalized kebab-case strings. */
function extractTopicsList(content: string): string[] {
  const section = extractSection(content, 'Topics');
  if (!section) return [];
  return section
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(line => line.length > 0)
    .map(normalizeLabelValue);
}

/** Extract entities from a ## Entities section. */
function extractEntitiesList(content: string): string[] {
  const section = extractSection(content, 'Entities');
  if (!section) return [];
  return section
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(line => line.length > 0)
    .map(normalizeLabelValue);
}

/** Normalize a string to lowercase kebab-case for label use. */
function normalizeLabelValue(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Index Fragments into Beads ─────────────────────────────

/**
 * Index an array of fragments into the beads graph.
 * Each fragment becomes a beads issue with derived-from edge to parent.
 * Returns array of created issue IDs. Degrades silently.
 */
export function indexFragments(
  fragments: BaseFragment[],
  parentBeadsId: string
): string[] {
  if (fragments.length === 0) return [];

  try {
    if (!isBeadsAvailable()) return [];
    if (!ensureBeadsWorkspace()) return [];
  } catch {
    return [];
  }

  const ids: string[] = [];
  for (const fragment of fragments) {
    try {
      const labels = fragment.labels.join(',');
      const description = JSON.stringify({
        summary: fragment.summary,
        provenance: fragment.provenance,
      });

      const id = brCreate({
        title: fragment.title,
        type: 'docs',
        labels: `note:extract,kind:${fragment.kind},${labels}`,
        description,
      });

      if (id) {
        if (parentBeadsId) {
          brDepAdd(id, parentBeadsId, 'derived-from');
        }
        ids.push(id);
      }
    } catch {
      // Silent degradation per fragment
    }
  }
  return ids;
}

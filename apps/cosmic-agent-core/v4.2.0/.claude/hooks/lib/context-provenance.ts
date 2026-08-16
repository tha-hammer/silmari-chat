/**
 * Context Provenance — v4.2.0
 *
 * Machine-readable provenance for every fragment included in context bundles.
 * Implements spec §16 context assembly explainability.
 *
 * Every fragment in a context bundle carries:
 * - Source identification (beads ID, file path, note class)
 * - Trust metadata (confidence, recency bucket)
 * - Inclusion rationale (why this fragment was selected)
 * - Extraction lineage (how it was derived)
 */

// ─── Types ─────────────────────────────────────────────────

export interface FragmentProvenance {
  beadsId: string;
  sourcePath?: string;
  noteClass: 'artifact' | 'extract' | 'permanent' | 'structure' | 'state';
  confidence: number;
  recencyBucket: 'today' | 'this-week' | 'this-month' | 'older';
  extractionMethod?: string;
  inclusionReason: string;
}

export interface ProvenancedFragment {
  id: string;
  title: string;
  kind: string;
  noteClass: string;
  score: number;
  summary: string;
  provenance: FragmentProvenance;
}

export interface ContextBundle {
  mode: string;
  fragments: ProvenancedFragment[];
  totalTokenEstimate: number;
  assembledAt: string;
}

// ─── Behavior 5: Attach Provenance ─────────────────────────

/**
 * Attach machine-readable provenance to a retrieved fragment.
 * Fills in recency bucket, confidence, and inclusion reason.
 */
export function attachProvenance(
  fragment: { id: string; title: string; kind: string; noteClass?: string; score?: number; summary?: string; created_at?: string; description?: string; labels?: string[] },
  inclusionReason: string
): ProvenancedFragment {
  const noteClass = classifyNoteClass(fragment.noteClass || '', fragment.labels || []);
  const recencyBucket = computeRecencyBucket(fragment.created_at);
  const confidence = extractConfidence(fragment.labels || []);

  return {
    id: fragment.id,
    title: fragment.title,
    kind: fragment.kind,
    noteClass,
    score: fragment.score || 0,
    summary: fragment.summary || fragment.title,
    provenance: {
      beadsId: fragment.id,
      sourcePath: extractSourcePath(fragment.description),
      noteClass: noteClass as FragmentProvenance['noteClass'],
      confidence,
      recencyBucket,
      extractionMethod: fragment.kind === 'criterion' ? 'regex-extract' : 'section-parse',
      inclusionReason,
    },
  };
}

// ─── Behavior 6: Render Context Bundle ─────────────────────

/**
 * Render a context bundle with explainability.
 * Each fragment cluster includes source metadata and inclusion rationale.
 * Output is compact and model-readable.
 */
export function renderContextBundle(bundle: ContextBundle): string {
  const parts: string[] = [
    `## Context Bundle (mode: ${bundle.mode})`,
    `Assembled: ${bundle.assembledAt} | Fragments: ${bundle.fragments.length} | ~${bundle.totalTokenEstimate} tokens`,
    '',
  ];

  // Group fragments by kind for organized output
  const groups = new Map<string, ProvenancedFragment[]>();
  for (const f of bundle.fragments) {
    const key = f.kind;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  for (const [kind, fragments] of groups) {
    parts.push(`**${kind}** (${fragments.length}):`);
    for (const f of fragments) {
      parts.push(`  • [${f.id}] ${f.title}`);
      parts.push(`    source: ${f.provenance.noteClass} | confidence: ${f.provenance.confidence} | recency: ${f.provenance.recencyBucket}`);
      parts.push(`    why included: ${f.provenance.inclusionReason}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Render a minimal provenance tag for inline use in system-reminder blocks.
 */
export function renderInlineProvenance(fragment: ProvenancedFragment): string {
  return `[${fragment.id} | ${fragment.provenance.noteClass} | ${fragment.provenance.recencyBucket} | conf:${fragment.provenance.confidence}]`;
}

// ─── Helpers ───────────────────────────────────────────────

function classifyNoteClass(noteClass: string, labels: string[]): string {
  if (noteClass && noteClass !== '') return noteClass;
  for (const l of labels) {
    if (l.startsWith('note:')) return l.replace('note:', '');
  }
  return 'extract';
}

function computeRecencyBucket(createdAt?: string): FragmentProvenance['recencyBucket'] {
  if (!createdAt) return 'older';
  const age = Date.now() - new Date(createdAt).getTime();
  const ONE_DAY = 86400000;
  if (age < ONE_DAY) return 'today';
  if (age < 7 * ONE_DAY) return 'this-week';
  if (age < 30 * ONE_DAY) return 'this-month';
  return 'older';
}

function extractConfidence(labels: string[]): number {
  for (const l of labels) {
    if (l === 'confidence:high') return 0.9;
    if (l === 'confidence:medium') return 0.6;
    if (l === 'confidence:low') return 0.3;
  }
  return 0.5;  // default confidence
}

function extractSourcePath(description?: string): string | undefined {
  if (!description) return undefined;
  const match = description.match(/path:\s*(.+)/);
  return match?.[1]?.trim();
}

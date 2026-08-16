/**
 * context-provenance.test.ts — v4.2.0 Context Provenance Tests
 *
 * TDD behaviors from Plan 03:
 *   B5: Attach machine-readable provenance to every fragment
 *   B6: Render context bundle with explainability
 *   B8: beads_viewer fixture generator (simplified test)
 */

import { describe, it, expect } from 'bun:test';
import {
  attachProvenance,
  renderContextBundle,
  renderInlineProvenance,
  type ProvenancedFragment,
  type ContextBundle,
} from './context-provenance';

// ─── Test Fixtures ──────────────────────────────────────

function makeFragment(overrides: Partial<any> = {}) {
  return {
    id: 'zk-123',
    title: 'JWT tokens expire after 24h',
    kind: 'decision',
    noteClass: 'extract',
    score: 8,
    summary: 'JWT expiry policy for stateless auth',
    created_at: new Date().toISOString(),
    description: 'path: /MEMORY/WORK/auth/PRD.md\nparent: zk-100',
    labels: ['note:extract', 'kind:decision', 'confidence:high'],
    ...overrides,
  };
}

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    mode: 'deep-recall',
    fragments: [
      attachProvenance(makeFragment(), 'direct work match, ranked #1'),
      attachProvenance(
        makeFragment({ id: 'zk-456', title: 'Rate limit logins', kind: 'risk', labels: ['note:extract', 'kind:risk'] }),
        'failure-aware supplement, ranked #2'
      ),
    ],
    totalTokenEstimate: 120,
    assembledAt: new Date().toISOString(),
    ...overrides,
  };
}

// =========================================================================
// Behavior 5: Attach provenance to every fragment
// =========================================================================

describe('attachProvenance', () => {
  it('attaches machine-readable provenance with beadsId', () => {
    const out = attachProvenance(makeFragment(), 'test reason');
    expect(out.provenance.beadsId).toBe('zk-123');
  });

  it('includes recency bucket', () => {
    const out = attachProvenance(makeFragment(), 'test');
    expect(out.provenance.recencyBucket).toBeDefined();
    expect(['today', 'this-week', 'this-month', 'older']).toContain(out.provenance.recencyBucket);
  });

  it('extracts source path from description', () => {
    const out = attachProvenance(makeFragment(), 'test');
    expect(out.provenance.sourcePath).toBe('/MEMORY/WORK/auth/PRD.md');
  });

  it('extracts confidence from labels', () => {
    const out = attachProvenance(makeFragment(), 'test');
    expect(out.provenance.confidence).toBe(0.9);  // confidence:high
  });

  it('uses default confidence when no label present', () => {
    const out = attachProvenance(makeFragment({ labels: ['note:extract'] }), 'test');
    expect(out.provenance.confidence).toBe(0.5);
  });

  it('classifies note class from labels when noteClass is empty', () => {
    const out = attachProvenance(makeFragment({ noteClass: '' }), 'test');
    expect(out.provenance.noteClass).toBe('extract');
  });

  it('includes inclusion reason', () => {
    const out = attachProvenance(makeFragment(), 'direct work match, ranked #1');
    expect(out.provenance.inclusionReason).toBe('direct work match, ranked #1');
  });

  it('provenance fields are deterministic for same input', () => {
    const fragment = makeFragment({ created_at: '2026-04-04T12:00:00Z' });
    const out1 = attachProvenance(fragment, 'reason');
    const out2 = attachProvenance(fragment, 'reason');
    expect(out1.provenance.beadsId).toBe(out2.provenance.beadsId);
    expect(out1.provenance.confidence).toBe(out2.provenance.confidence);
    expect(out1.provenance.recencyBucket).toBe(out2.provenance.recencyBucket);
  });

  it('recency bucket: today for recent fragments', () => {
    const out = attachProvenance(makeFragment({ created_at: new Date().toISOString() }), 'test');
    expect(out.provenance.recencyBucket).toBe('today');
  });

  it('recency bucket: older for very old fragments', () => {
    const out = attachProvenance(makeFragment({ created_at: '2020-01-01T00:00:00Z' }), 'test');
    expect(out.provenance.recencyBucket).toBe('older');
  });
});

// =========================================================================
// Behavior 6: Render context bundle with explainability
// =========================================================================

describe('renderContextBundle', () => {
  it('renders compact context blocks with source and inclusion rationale', () => {
    const out = renderContextBundle(makeBundle());
    expect(out).toContain('source:');
    expect(out).toContain('why included:');
  });

  it('includes mode in header', () => {
    const out = renderContextBundle(makeBundle());
    expect(out).toContain('deep-recall');
  });

  it('includes fragment count', () => {
    const out = renderContextBundle(makeBundle());
    expect(out).toContain('Fragments: 2');
  });

  it('groups fragments by kind', () => {
    const out = renderContextBundle(makeBundle());
    expect(out).toContain('decision');
    expect(out).toContain('risk');
  });

  it('includes beads IDs for traceability', () => {
    const out = renderContextBundle(makeBundle());
    expect(out).toContain('zk-123');
    expect(out).toContain('zk-456');
  });

  it('stays compact (no full artifact expansion)', () => {
    const out = renderContextBundle(makeBundle());
    const lines = out.split('\n');
    expect(lines.length).toBeLessThan(30);
  });
});

// =========================================================================
// renderInlineProvenance
// =========================================================================

describe('renderInlineProvenance', () => {
  it('renders compact inline provenance tag', () => {
    const fragment = attachProvenance(makeFragment(), 'test');
    const tag = renderInlineProvenance(fragment);
    expect(tag).toContain('zk-123');
    expect(tag).toContain('extract');
    expect(tag).toContain('conf:');
  });
});

// =========================================================================
// Behavior 8: Fixture generator (simplified)
// =========================================================================

describe('fixture generator for beads_viewer validation', () => {
  it('can create a representative graph of provenanced fragments', () => {
    const fragments = [
      makeFragment({ id: 'zk-work-1', kind: 'prd', noteClass: 'artifact', labels: ['note:artifact', 'kind:prd'] }),
      makeFragment({ id: 'zk-ext-1', kind: 'criterion', noteClass: 'extract', labels: ['note:extract', 'kind:criterion'] }),
      makeFragment({ id: 'zk-perm-1', kind: 'learning', noteClass: 'permanent', labels: ['note:permanent', 'kind:learning'] }),
      makeFragment({ id: 'zk-hub-1', kind: 'workflow-map', noteClass: 'structure', labels: ['note:structure', 'kind:workflow-map'] }),
    ];

    const provenanced = fragments.map((f, i) =>
      attachProvenance(f, `fixture fragment #${i + 1}`)
    );

    // All fragments have provenance
    expect(provenanced.every(f => f.provenance.beadsId)).toBe(true);

    // All note classes are represented
    const classes = new Set(provenanced.map(f => f.provenance.noteClass));
    expect(classes.has('artifact')).toBe(true);
    expect(classes.has('extract')).toBe(true);
    expect(classes.has('permanent')).toBe(true);
    expect(classes.has('structure')).toBe(true);

    // Bundle renders successfully
    const bundle: ContextBundle = {
      mode: 'deep-recall',
      fragments: provenanced,
      totalTokenEstimate: provenanced.length * 30,
      assembledAt: new Date().toISOString(),
    };
    const rendered = renderContextBundle(bundle);
    expect(rendered.length).toBeGreaterThan(50);
  });
});

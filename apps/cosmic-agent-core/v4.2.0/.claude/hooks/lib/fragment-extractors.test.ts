/**
 * fragment-extractors.test.ts — Tests for semantic fragment extraction
 *
 * v4.2.0 Plan 01: Semantic Fragment Extraction
 * Tests each extractor with markdown fixtures and validates
 * type contracts, provenance, and retrieval-worthiness filtering.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import {
  extractPrdFragments,
  extractLearningFragments,
  extractRelationshipFragments,
  extractResearchFragments,
  buildFragmentProvenance,
  indexFragments,
  type BaseFragment,
  type DecisionFragment,
  type RiskFragment,
  type VerificationFragment,
  type LearningFragment,
  type PreferenceFragment,
  type ResearchFindingFragment,
  type FragmentProvenance,
} from './fragment-extractors';

// ─── Fixtures ───────────────────────────────────────────────

const PRD_WITH_DECISIONS = `---
slug: 20260404-auth-review
task: Add auth rate limiting
phase: build
---

# PRD: Add Auth Rate Limiting

## Decisions

### Decision: Use token bucket algorithm
We chose the token bucket algorithm over sliding window because it handles burst traffic better and has O(1) memory per client.

**Rationale:** Token bucket is well-understood, battle-tested in production at scale, and supported natively by Redis.

### Decision: Rate limit at API gateway level
Rate limiting will be enforced at the API gateway rather than per-service to avoid inconsistent enforcement.

**Rationale:** Centralizing at the gateway ensures uniform policy and simplifies monitoring.

## Criteria
- [x] ISC-001: Rate limiter middleware installed
- [ ] ISC-002: Returns 429 on threshold
`;

const PRD_WITH_RISKS = `---
slug: 20260404-auth-review
task: Add auth rate limiting
phase: build
---

# PRD: Add Auth Rate Limiting

## Risks

### Risk: Redis single point of failure
If Redis goes down, rate limiting fails open, potentially allowing abuse. **Severity: high**

### Risk: False positives for shared IPs
Corporate networks sharing a single IP may hit rate limits unfairly. Severity: medium

### Risk: Configuration drift
Rate limit thresholds may drift across environments without centralized config.

## Criteria
- [x] ISC-001: Rate limiter installed
`;

const PRD_WITH_VERIFICATION = `---
slug: 20260404-auth-review
task: Add auth rate limiting
phase: verify
progress: 3/5
---

# PRD: Add Auth Rate Limiting

## Verification

### Verification: Rate Limiting Tests
All rate limiting tests pass with expected behavior.

- [x] Token bucket algorithm correctly limits requests
- [x] 429 status returned when threshold exceeded
- [x] Rate limit headers included in response
- [ ] Load test passes at 10k req/s
- [ ] Monitoring dashboard shows rate limit metrics
`;

const PRD_EMPTY_SECTIONS = `---
slug: 20260404-empty
task: Empty test
phase: observe
---

# PRD: Empty

## Decisions

## Risks

## Verification
`;

const LEARNING_WITH_PATTERNS = `# Work Completion Learning

**Title:** Auth rate limiting implementation
**Category:** SYSTEM

## Insights

**Root Cause:** The initial sliding window implementation consumed O(n) memory per client because it stored every request timestamp rather than using a fixed-size counter.

**Lesson:** Always benchmark memory usage under realistic cardinality before committing to a rate limiting algorithm. Token bucket's O(1) per-client is strictly better when you have millions of clients.

**Recommendation:** For future rate limiting work, start with token bucket as the default and only switch to sliding window if you need exact per-second precision.

Some transient note about debugging that isn't durable.
`;

const LEARNING_WITH_FAILURE = `# Work Completion Learning

**Title:** Deploy pipeline fix
**Category:** SYSTEM

## Insights

**Root Cause:** The deploy script used a hardcoded path that didn't exist on the new CI runner image.

**Lesson:** CI environment assumptions should be validated at pipeline start, not discovered mid-deploy.

We also chatted about lunch plans.
`;

const LEARNING_MINIMAL = `# Work Completion Learning

**Title:** Quick config change
**Category:** ALGORITHM

## Insights

Just a small config tweak, nothing notable.
`;

const RELATIONSHIP_NOTES_BASIC = [
  {
    type: 'O' as const,
    content: 'Prefers direct progress reporting over status summaries',
    entities: ['@Daniel'],
    confidence: 0.85,
  },
  {
    type: 'W' as const,
    content: 'Currently focused on PAI infrastructure improvements',
    entities: ['@Daniel'],
  },
];

const RELATIONSHIP_NOTES_CONTRADICTION = [
  {
    type: 'O' as const,
    content: 'Actually prefers async updates over real-time notifications [CONTRADICTS: prefers real-time alerts]',
    entities: ['@Daniel'],
    confidence: 0.90,
  },
];

const RELATIONSHIP_NOTES_CORRECTION = [
  {
    type: 'O' as const,
    content: 'Correction: does not want automated daily summaries anymore',
    entities: ['@Daniel'],
    confidence: 0.80,
  },
];

const RESEARCH_WITH_FINDINGS = `# Research: Rate Limiting Algorithms

## Findings

### Finding: Token bucket outperforms sliding window at scale
In benchmarks with 1M+ unique clients, token bucket uses 48 bytes per client compared to sliding window's variable 200-4000 bytes. This difference compounds significantly at scale.

### Finding: Redis-based rate limiting introduces 2-5ms latency per request
Network round-trip to Redis adds measurable latency. For latency-sensitive paths, consider local in-memory rate limiting with periodic sync.

## Topics
- rate-limiting
- redis
- performance

## Entities
- Redis
- token-bucket
- sliding-window
`;

const RESEARCH_EMPTY = `# Research: Nothing interesting

## Summary
No significant findings from this research pass.
`;

// ─── Tests: PRD Fragment Extraction ─────────────────────────

describe('extractPrdFragments', () => {
  describe('decisions', () => {
    it('extracts decision fragments from PRD decision sections', () => {
      const out = extractPrdFragments(PRD_WITH_DECISIONS, 'zk-parent-1');
      const decisions = out.filter((f): f is DecisionFragment => f.kind === 'decision');
      expect(decisions).toHaveLength(2);
      expect(decisions[0].kind).toBe('decision');
      expect(decisions[0].title).toContain('token bucket');
      expect(decisions[1].title).toContain('API gateway');
    });

    it('includes rationale when present', () => {
      const out = extractPrdFragments(PRD_WITH_DECISIONS, 'zk-parent-1');
      const decisions = out.filter((f): f is DecisionFragment => f.kind === 'decision');
      expect(decisions[0].rationale).toContain('battle-tested');
      expect(decisions[1].rationale).toContain('gateway');
    });

    it('produces stable titles across repeated parses', () => {
      const out1 = extractPrdFragments(PRD_WITH_DECISIONS, 'zk-parent-1');
      const out2 = extractPrdFragments(PRD_WITH_DECISIONS, 'zk-parent-1');
      const titles1 = out1.filter(f => f.kind === 'decision').map(f => f.title);
      const titles2 = out2.filter(f => f.kind === 'decision').map(f => f.title);
      expect(titles1).toEqual(titles2);
    });

    it('returns no decisions for empty decision section', () => {
      const out = extractPrdFragments(PRD_EMPTY_SECTIONS, 'zk-parent-1');
      const decisions = out.filter(f => f.kind === 'decision');
      expect(decisions).toHaveLength(0);
    });

    it('sets correct labels including kind:decision', () => {
      const out = extractPrdFragments(PRD_WITH_DECISIONS, 'zk-parent-1');
      const decisions = out.filter(f => f.kind === 'decision');
      expect(decisions[0].labels).toContain('kind:decision');
      expect(decisions[0].labels).toContain('note:extract');
    });
  });

  describe('risks', () => {
    it('extracts risk fragments with severity', () => {
      const out = extractPrdFragments(PRD_WITH_RISKS, 'zk-parent-1');
      const risks = out.filter((f): f is RiskFragment => f.kind === 'risk');
      expect(risks).toHaveLength(3);
      expect(risks[0].severity).toBe('high');
      expect(risks[1].severity).toBe('medium');
    });

    it('defaults severity to undefined when not specified', () => {
      const out = extractPrdFragments(PRD_WITH_RISKS, 'zk-parent-1');
      const risks = out.filter((f): f is RiskFragment => f.kind === 'risk');
      // Third risk has no explicit severity
      expect(risks[2].severity).toBeUndefined();
    });

    it('returns no risks for empty risk section', () => {
      const out = extractPrdFragments(PRD_EMPTY_SECTIONS, 'zk-parent-1');
      const risks = out.filter(f => f.kind === 'risk');
      expect(risks).toHaveLength(0);
    });

    it('sets correct labels including kind:risk', () => {
      const out = extractPrdFragments(PRD_WITH_RISKS, 'zk-parent-1');
      const risks = out.filter(f => f.kind === 'risk');
      expect(risks[0].labels).toContain('kind:risk');
      expect(risks[0].labels).toContain('note:extract');
    });
  });

  describe('verification', () => {
    it('extracts verification fragment with pass/total counts', () => {
      const out = extractPrdFragments(PRD_WITH_VERIFICATION, 'zk-parent-1');
      const verifications = out.filter((f): f is VerificationFragment => f.kind === 'verification');
      expect(verifications).toHaveLength(1);
      expect(verifications[0].passCount).toBe(3);
      expect(verifications[0].totalCount).toBe(5);
    });

    it('returns no verification for empty verification section', () => {
      const out = extractPrdFragments(PRD_EMPTY_SECTIONS, 'zk-parent-1');
      const verifications = out.filter(f => f.kind === 'verification');
      expect(verifications).toHaveLength(0);
    });

    it('sets correct labels including kind:verification', () => {
      const out = extractPrdFragments(PRD_WITH_VERIFICATION, 'zk-parent-1');
      const verifications = out.filter(f => f.kind === 'verification');
      expect(verifications[0].labels).toContain('kind:verification');
      expect(verifications[0].labels).toContain('note:extract');
    });
  });

  describe('provenance', () => {
    it('attaches provenance to every extracted fragment', () => {
      const out = extractPrdFragments(PRD_WITH_DECISIONS, 'zk-parent-1', 'sess-123');
      for (const fragment of out) {
        expect(fragment.provenance).toBeDefined();
        expect(fragment.provenance.artifactType).toBe('prd');
        expect(fragment.provenance.extractionMethod).toBe('section-parser');
        expect(fragment.provenance.extractedAt).toBeTruthy();
      }
    });

    it('includes session ID in provenance when provided', () => {
      const out = extractPrdFragments(PRD_WITH_DECISIONS, 'zk-parent-1', 'sess-456');
      expect(out[0].provenance.sourceSessionId).toBe('sess-456');
    });
  });

  describe('title and summary constraints', () => {
    it('truncates titles to 200 chars', () => {
      const longTitle = 'A'.repeat(300);
      const prd = `---
slug: test
task: test
phase: build
---

## Decisions

### Decision: ${longTitle}
Some rationale here.
`;
      const out = extractPrdFragments(prd, 'zk-parent-1');
      const decisions = out.filter(f => f.kind === 'decision');
      if (decisions.length > 0) {
        expect(decisions[0].title.length).toBeLessThanOrEqual(200);
      }
    });

    it('truncates summaries to 500 chars', () => {
      const longBody = 'B'.repeat(600);
      const prd = `---
slug: test
task: test
phase: build
---

## Decisions

### Decision: Test decision
${longBody}
`;
      const out = extractPrdFragments(prd, 'zk-parent-1');
      const decisions = out.filter(f => f.kind === 'decision');
      if (decisions.length > 0) {
        expect(decisions[0].summary.length).toBeLessThanOrEqual(500);
      }
    });
  });
});

// ─── Tests: Learning Fragment Extraction ────────────────────

describe('extractLearningFragments', () => {
  it('extracts durable lesson, root-cause, and recommendation fragments', () => {
    const out = extractLearningFragments(LEARNING_WITH_PATTERNS, 'SYSTEM');
    const kinds = out.map(f => f.kind);
    expect(kinds).toContain('failure-pattern');
    expect(kinds).toContain('learning');
    expect(kinds).toContain('recommendation');
  });

  it('excludes transient/non-durable content', () => {
    const out = extractLearningFragments(LEARNING_WITH_PATTERNS, 'SYSTEM');
    const summaries = out.map(f => f.summary).join(' ');
    expect(summaries).not.toContain('debugging');
    expect(summaries).not.toContain('transient');
  });

  it('extracts root cause as failure-pattern', () => {
    const out = extractLearningFragments(LEARNING_WITH_FAILURE, 'SYSTEM');
    const failurePatterns = out.filter(f => f.kind === 'failure-pattern');
    expect(failurePatterns.length).toBeGreaterThanOrEqual(1);
    expect(failurePatterns[0].summary).toContain('hardcoded path');
  });

  it('ignores non-durable minimal learnings', () => {
    const out = extractLearningFragments(LEARNING_MINIMAL, 'ALGORITHM');
    // "Just a small config tweak" is not retrieval-worthy
    expect(out).toHaveLength(0);
  });

  it('sets correct labels', () => {
    const out = extractLearningFragments(LEARNING_WITH_PATTERNS, 'SYSTEM');
    for (const fragment of out) {
      expect(fragment.labels).toContain('note:extract');
      expect(fragment.labels).toContain(`kind:${fragment.kind}`);
    }
  });

  it('attaches provenance with learning artifact type', () => {
    const out = extractLearningFragments(LEARNING_WITH_PATTERNS, 'SYSTEM');
    for (const fragment of out) {
      expect(fragment.provenance.artifactType).toBe('learning');
    }
  });
});

// ─── Tests: Relationship Fragment Extraction ────────────────

describe('extractRelationshipFragments', () => {
  it('extracts preference fragments from relationship notes', () => {
    const out = extractRelationshipFragments(RELATIONSHIP_NOTES_BASIC);
    expect(out.length).toBeGreaterThanOrEqual(1);
    const preferences = out.filter((f): f is PreferenceFragment => f.kind === 'preference');
    expect(preferences.length).toBeGreaterThanOrEqual(1);
    expect(preferences[0].actor).toBeTruthy();
  });

  it('preserves actor and confidence', () => {
    const out = extractRelationshipFragments(RELATIONSHIP_NOTES_BASIC);
    const prefs = out.filter((f): f is PreferenceFragment => f.kind === 'preference');
    const opinionPref = prefs.find(p => p.confidence !== undefined);
    expect(opinionPref).toBeDefined();
    expect(opinionPref!.confidence).toBe(0.85);
    expect(opinionPref!.actor).toContain('Daniel');
  });

  it('marks contradictory preferences with explicit marker', () => {
    const out = extractRelationshipFragments(RELATIONSHIP_NOTES_CONTRADICTION);
    const prefs = out.filter((f): f is PreferenceFragment => f.kind === 'preference');
    expect(prefs[0].contradicts).toBeTruthy();
    expect(prefs[0].contradicts!.length).toBeGreaterThan(0);
  });

  it('detects correction language as contradiction', () => {
    const out = extractRelationshipFragments(RELATIONSHIP_NOTES_CORRECTION);
    const prefs = out.filter((f): f is PreferenceFragment => f.kind === 'preference');
    expect(prefs[0].contradicts).toBeTruthy();
  });

  it('filters out non-opinion (W-type) notes from preference extraction', () => {
    // W-type notes are world facts, not preferences
    const worldOnly = [{ type: 'W' as const, content: 'Lives in San Francisco', entities: ['@Daniel'] }];
    const out = extractRelationshipFragments(worldOnly);
    // W-type should not produce preference fragments
    const prefs = out.filter(f => f.kind === 'preference');
    expect(prefs).toHaveLength(0);
  });

  it('attaches provenance with relationship artifact type', () => {
    const out = extractRelationshipFragments(RELATIONSHIP_NOTES_BASIC);
    for (const fragment of out) {
      expect(fragment.provenance.artifactType).toBe('relationship');
    }
  });
});

// ─── Tests: Research Fragment Extraction ────────────────────

describe('extractResearchFragments', () => {
  it('extracts research findings with kind:research-finding', () => {
    const out = extractResearchFragments(RESEARCH_WITH_FINDINGS);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[0].kind).toBe('research-finding');
  });

  it('extracts entities and topics from context', () => {
    const out = extractResearchFragments(RESEARCH_WITH_FINDINGS);
    const finding = out[0] as ResearchFindingFragment;
    // Should pick up topics from the Topics section
    expect(finding.topics).toBeDefined();
    expect(finding.topics!.length).toBeGreaterThan(0);
  });

  it('returns empty array for research with no findings', () => {
    const out = extractResearchFragments(RESEARCH_EMPTY);
    expect(out).toHaveLength(0);
  });

  it('sets correct labels', () => {
    const out = extractResearchFragments(RESEARCH_WITH_FINDINGS);
    for (const fragment of out) {
      expect(fragment.labels).toContain('note:extract');
      expect(fragment.labels).toContain('kind:research-finding');
    }
  });

  it('attaches provenance with research artifact type', () => {
    const out = extractResearchFragments(RESEARCH_WITH_FINDINGS);
    for (const fragment of out) {
      expect(fragment.provenance.artifactType).toBe('research');
    }
  });

  it('normalizes topic labels to lowercase kebab-case', () => {
    const out = extractResearchFragments(RESEARCH_WITH_FINDINGS);
    const finding = out[0] as ResearchFindingFragment;
    if (finding.topics) {
      for (const topic of finding.topics) {
        expect(topic).toBe(topic.toLowerCase());
        expect(topic).not.toMatch(/\s/);
      }
    }
  });
});

// ─── Tests: Provenance Builder ──────────────────────────────

describe('buildFragmentProvenance', () => {
  it('builds spec-compliant provenance', () => {
    const p = buildFragmentProvenance({
      sourcePath: '/MEMORY/WORK/auth/PRD.md',
      artifactType: 'prd',
      extractionMethod: 'section-parser',
      sourceSessionId: 'sess-789',
    });
    expect(p.sourcePath).toBe('/MEMORY/WORK/auth/PRD.md');
    expect(p.artifactType).toBe('prd');
    expect(p.extractionMethod).toBe('section-parser');
    expect(p.extractedAt).toBeTruthy();
    expect(p.sourceSessionId).toBe('sess-789');
  });

  it('generates valid ISO timestamp', () => {
    const p = buildFragmentProvenance({
      sourcePath: '/test',
      artifactType: 'learning',
      extractionMethod: 'pattern-match',
    });
    // Should be parseable as ISO date
    expect(() => new Date(p.extractedAt)).not.toThrow();
    expect(new Date(p.extractedAt).toISOString()).toBe(p.extractedAt);
  });

  it('omits sourceSessionId when not provided', () => {
    const p = buildFragmentProvenance({
      sourcePath: '/test',
      artifactType: 'research',
      extractionMethod: 'section-parser',
    });
    expect(p.sourceSessionId).toBeUndefined();
  });
});

// ─── Tests: Index Fragments ─────────────────────────────────

describe('indexFragments', () => {
  // Note: indexFragments calls brCreate/brDepAdd which need br binary.
  // These tests verify the function signature and silent degradation.

  it('returns empty array when no fragments provided', () => {
    const ids = indexFragments([], 'zk-parent-1');
    expect(ids).toEqual([]);
  });

  it('handles br unavailability gracefully', () => {
    // brCreate will fail since br binary likely not installed in test env
    const fragments: BaseFragment[] = [{
      kind: 'decision',
      title: 'Test decision',
      summary: 'Test summary',
      labels: ['note:extract', 'kind:decision'],
      provenance: buildFragmentProvenance({
        sourcePath: '/test',
        artifactType: 'prd',
        extractionMethod: 'section-parser',
      }),
    }];
    // Should not throw
    const ids = indexFragments(fragments, 'zk-parent-1');
    expect(Array.isArray(ids)).toBe(true);
  });
});

/**
 * # Perplexity Sonar Research Command - Real-Time Cited Web Research
 *
 * This command analyzes your research question, decomposes it into 4-8 targeted
 * sub-queries, and executes them against the Perplexity Sonar API (real-time web
 * search with inline citations). Designed to be invoked by the PerplexityResearcher
 * agent (Ava Chen) as her primary research backend.
 *
 * ## Usage
 * ```bash
 * bun ${SAI_DIR}/skills/Research/Workflows/PerplexityResearch.md "your research question"
 * ```
 *
 * ## Prerequisites
 * - PERPLEXITY_API_KEY must be set in environment (~/.env or shell profile)
 * - Get a key at: https://perplexity.ai/settings/api
 *
 * ## Features
 * - Intelligent query decomposition into focused investigative sub-questions
 * - Parallel execution against Perplexity Sonar API
 * - Real-time web data (not bound by training cutoff)
 * - Inline citations on every claim, with source URLs
 * - Configurable recency filter (hour, day, week, month)
 * - Triple-verification methodology baked into the synthesis prompt
 *
 * ## Advantages vs ClaudeResearch
 * - Live web data with native citation tracking (no separate fetch step)
 * - Sonar's search index is purpose-built for fact-finding
 * - Better signal on breaking news, recent papers, current state of competitive landscapes
 *
 * ## Model selection
 * - sonar          — fast, cheap, single-pass (default for routine queries)
 * - sonar-pro      — deeper synthesis, more citations (default for investigative work)
 * - sonar-reasoning — chain-of-thought + search (use for analytical decomposition)
 */

import { spawn } from 'child_process';

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const DEFAULT_MODEL = 'sonar-pro';
const DEFAULT_RECENCY = 'month'; // hour | day | week | month

const apiKey = process.env.PERPLEXITY_API_KEY;
if (!apiKey) {
  console.error('❌ PERPLEXITY_API_KEY is not set in environment.');
  console.error('   Add to ~/.env: PERPLEXITY_API_KEY=pplx-...');
  console.error('   Get a key at: https://perplexity.ai/settings/api');
  process.exit(2);
}

// ────────────────────────────────────────────────────────────────────────────
// Inputs
// ────────────────────────────────────────────────────────────────────────────

const originalQuestion = process.argv.slice(2).join(' ');
if (!originalQuestion) {
  console.error('❌ Please provide a research question');
  console.error('Usage: bun ${SAI_DIR}/skills/Research/Workflows/PerplexityResearch.md "your question here"');
  process.exit(1);
}

console.log('📅 ' + new Date().toISOString());
console.log('\n📋 SUMMARY: Real-time cited web research via Perplexity Sonar API\n');
console.log('🔍 ANALYSIS: Decomposing research question into investigative sub-queries...\n');
console.log('Original question:', originalQuestion);

// ────────────────────────────────────────────────────────────────────────────
// Query decomposition — modeled on ClaudeResearch but tuned for Sonar's strengths
// (recency, citation tracking, fact-verification). Sonar rewards specific, fact-
// seeking queries; vague/abstract prompts return weaker citation graphs.
// ────────────────────────────────────────────────────────────────────────────

function generateSearchQueries(question: string): string[] {
  const queries: string[] = [];
  const currentYear = new Date().getFullYear();

  queries.push(question);
  queries.push(`${question} — primary sources and citations`);
  queries.push(`${question} latest developments ${currentYear}`);
  queries.push(`${question} expert analysis evidence`);
  queries.push(`${question} contradicting viewpoints critique`);
  queries.push(`${question} key statistics data ${currentYear}`);
  queries.push(`${question} historical context background`);
  queries.push(`${question} practical implications use cases`);

  return queries.slice(0, 8);
}

// ────────────────────────────────────────────────────────────────────────────
// Sonar API call — returns content + citations for a single sub-query
// ────────────────────────────────────────────────────────────────────────────

interface SonarResult {
  query: string;
  content: string;
  citations: string[];
  error?: string;
}

async function sonarSearch(query: string, model = DEFAULT_MODEL): Promise<SonarResult> {
  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an investigative research analyst (Ava Chen voice). Triple-verify every claim against 3+ sources. Cite inline as [1], [2], etc. Be specific, factual, source-credible. No speculation, no hedging.',
          },
          { role: 'user', content: query },
        ],
        return_citations: true,
        search_recency_filter: DEFAULT_RECENCY,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { query, content: '', citations: [], error: `HTTP ${res.status}: ${text}` };
    }

    const json: any = await res.json();
    const content = json.choices?.[0]?.message?.content ?? '';
    const citations: string[] = json.citations ?? [];
    return { query, content, citations };
  } catch (err: any) {
    return { query, content: '', citations: [], error: err?.message ?? String(err) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main execution
// ────────────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const subQueries = generateSearchQueries(originalQuestion);

    console.log('\n⚡ ACTIONS: Generated', subQueries.length, 'targeted Sonar queries:\n');
    subQueries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

    console.log('\n✅ RESULTS: Executing Sonar searches in parallel...\n');
    console.log('═'.repeat(60));

    const results = await Promise.all(subQueries.map((q) => sonarSearch(q)));

    // Per-query output
    results.forEach((r, i) => {
      console.log(`\n### Query ${i + 1}: ${r.query}`);
      if (r.error) {
        console.log(`❌ Error: ${r.error}`);
        return;
      }
      console.log(r.content);
      if (r.citations.length) {
        console.log('\nCitations:');
        r.citations.forEach((url, idx) => console.log(`  [${idx + 1}] ${url}`));
      }
    });

    // Aggregate citation set (deduped)
    const allCitations = Array.from(new Set(results.flatMap((r) => r.citations)));
    console.log('\n═'.repeat(60));
    console.log(`\n📚 AGGREGATE CITATIONS (${allCitations.length} unique sources):`);
    allCitations.forEach((url, i) => console.log(`  [${i + 1}] ${url}`));

    // Errors summary
    const errors = results.filter((r) => r.error);
    if (errors.length) {
      console.log(`\n⚠️ ${errors.length} of ${results.length} queries failed.`);
      errors.forEach((e) => console.log(`   - ${e.query}: ${e.error}`));
    }

    console.log('\n📊 STATUS: Sonar research complete');
    console.log('➡️ NEXT: Synthesize findings — cross-reference citations, flag contradictions, present with inline [n] markers\n');
    console.log('🎯 COMPLETED: Real-time cited research via Perplexity Sonar');
  } catch (error) {
    console.error('❌ Error during Sonar research:', error);
    process.exit(1);
  }
})();

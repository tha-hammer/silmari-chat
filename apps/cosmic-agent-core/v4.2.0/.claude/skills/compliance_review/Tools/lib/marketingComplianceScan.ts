/**
 * Deterministic marketing compliance review scanner.
 *
 * This is a triage tool, not a compliance approval engine. It flags text that
 * needs human review under social-media and financial-marketing rules. The
 * scanner intentionally favors reviewable false positives over quiet misses.
 */

export type ComplianceSeverity = "low" | "medium" | "high" | "critical";

export type ComplianceCategory =
  | "product_recommendation"
  | "performance_claim"
  | "testimonial_or_endorsement"
  | "social_engagement"
  | "outside_business_activity"
  | "solicitation"
  | "disclosure"
  | "misleading_statement";

export interface MarketingComplianceScanInput {
  text: string;
  platform?: string;
  sourceLabel?: string;
}

export interface MarketingComplianceFinding {
  ruleId: string;
  severity: ComplianceSeverity;
  category: ComplianceCategory;
  line: number;
  phrase: string;
  context: string;
  rationale: string;
  source: string;
}

export interface MarketingComplianceVerdict {
  requiresReview: boolean;
  findings: MarketingComplianceFinding[];
  metadata: {
    scannerVersion: "0.1.0";
    platform?: string;
    sourceLabel?: string;
  };
  summary: {
    total: number;
    bySeverity: Record<ComplianceSeverity, number>;
    byCategory: Partial<Record<ComplianceCategory, number>>;
  };
  note: string;
}

interface RuleSpec {
  id: string;
  severity: ComplianceSeverity;
  category: ComplianceCategory;
  re: RegExp;
  rationale: string;
  source: string;
  exception?: (line: string, fullText: string) => boolean;
}

const OBA_DISCLOSURE =
  "guardian and its subsidiaries do not endorse or have any direct or indirect responsibility with respect to this activity";

const DISCLOSURE_TERMS =
  /\b(?:past performance (?:does not|is not)|not (?:a )?guarantee|risks? and limitations?|net performance|important testimonial information|paid testimonial|#ad\b|#sponsored\b|\badvertisement\b|\bsponsored\b)\b/i;

const FINANCIAL_TERMS =
  /\b(?:stock|stocks|bond|bonds|etf|fund|funds|mutual fund|variable annuit(?:y|ies)|annuit(?:y|ies)|security|securities|portfolio|investment|investing|retirement|financial|insurance|return|returns|market)\b/i;

function hasPerformanceDisclosure(line: string): boolean {
  return DISCLOSURE_TERMS.test(line);
}

function hasGuardianObaDisclosure(fullText: string): boolean {
  return fullText.toLowerCase().includes(OBA_DISCLOSURE);
}

function isNegatedGuarantee(line: string, phrase: string): boolean {
  const lower = line.toLowerCase();
  const idx = lower.indexOf(phrase.toLowerCase());
  if (idx < 0) return false;
  const prefix = lower.slice(Math.max(0, idx - 24), idx);
  return /\b(?:not|no|never|without)\s+$/.test(prefix) || /\bnot\s+a\s+$/.test(prefix);
}

const RULES: RuleSpec[] = [
  {
    id: "specific-product-recommendation",
    severity: "critical",
    category: "product_recommendation",
    re: /\b(?:buy|purchase|sell|hold|switch(?:\s+to)?|invest\s+in|allocate\s+to|move\s+(?:your\s+)?money\s+(?:to|into))\b.{0,90}\b(?:stock|stocks|bond|bonds|etf|fund|mutual fund|variable annuit(?:y|ies)|annuit(?:y|ies)|security|securities|portfolio)\b/i,
    rationale:
      "Specific product or strategy recommendations on public social media can trigger suitability or best-interest review.",
    source: "Guardian 4.10.2; FINRA Notice 10-06 Q2-Q3",
  },
  {
    id: "class-wide-should-buy",
    severity: "critical",
    category: "product_recommendation",
    re: /\b(?:everyone|anyone|you|clients|investors|retirees|business owners)\b.{0,70}\b(?:should|must|need to|ought to)\b.{0,90}\b(?:buy|purchase|own|invest\s+in)\b.{0,70}\b(?:annuit(?:y|ies)|stock|bond|fund|etf|portfolio|security|securities)\b/i,
    rationale:
      "Broad calls for an audience to buy a product class are treated as recommendation-risk content.",
    source: "Guardian 4.10.2; FINRA Rule 2210 content standards",
  },
  {
    id: "performance-guarantee",
    severity: "critical",
    category: "performance_claim",
    re: /\b(?:guaranteed?|risk[-\s]?free|no risk|cannot lose|can't lose|sure thing|will double|guaranteed income|guaranteed return|safe return)\b/i,
    rationale:
      "Promissory or no-risk performance language is high-risk in financial marketing.",
    source: "FINRA Rule 2210; SEC Marketing Rule general prohibitions",
    exception: (line) => {
      const m = line.match(/\b(?:guaranteed?|risk[-\s]?free|no risk|cannot lose|can't lose|sure thing|will double|guaranteed income|guaranteed return|safe return)\b/i);
      return m ? isNegatedGuarantee(line, m[0]) : false;
    },
  },
  {
    id: "performance-result-without-risk-context",
    severity: "high",
    category: "performance_claim",
    re: /\b(?:\d+(?:\.\d+)?\s?%|outperform(?:ed|s)?|beat(?:ing)?\s+the\s+market|returns?|performance|backtest(?:ed)?|hypothetical performance|projected|projection|forecast)\b/i,
    rationale:
      "Performance and projection language usually needs fair, balanced risk and limitation context.",
    source: "SEC Marketing Rule performance conditions; FINRA Rule 2210",
    exception: hasPerformanceDisclosure,
  },
  {
    id: "regulator-approval-claim",
    severity: "critical",
    category: "misleading_statement",
    re: /\b(?:(?:sec|finra|commission|regulator).{0,35}(?:approved|reviewed|endorsed)|(?:approved|reviewed|endorsed).{0,35}(?:sec|finra|commission|regulator))\b/i,
    rationale:
      "Claims that regulators approved or reviewed marketing or performance presentations are prohibited or misleading-risk claims.",
    source: "SEC Marketing Rule performance prohibitions; FINRA Rule 2210",
  },
  {
    id: "financial-testimonial-or-review",
    severity: "high",
    category: "testimonial_or_endorsement",
    re: /\b(?:testimonial|review|recommendation|endorsement|5[-\s]?star|five[-\s]?star|recommended me|best advisor|great advisor|client says|customer says)\b/i,
    rationale:
      "Testimonials, endorsements, ratings, and reviews need disclosure, oversight, and context checks.",
    source: "SEC Marketing Rule testimonials; FINRA Notice 17-18 Q8-Q10; FTC Endorsement Guides",
    exception: (line) => !FINANCIAL_TERMS.test(line) && !/\b(?:advisor|agent|planner|wealth|retirement|insurance)\b/i.test(line),
  },
  {
    id: "like-share-financial-content",
    severity: "high",
    category: "social_engagement",
    re: /\b(?:like|liked|liking|share|shared|sharing|comment|commenting)\b.{0,100}\b(?:stock|bond|etf|fund|annuit(?:y|ies)|security|securities|portfolio|market|investment|financial|retirement|insurance|return|returns)\b/i,
    rationale:
      "Likes, shares, and comments can be treated as adoption or endorsement of financial content.",
    source: "Guardian 4.8 and 4.9 charts; FINRA Notice 17-18 Q9",
  },
  {
    id: "third-party-financial-page-engagement",
    severity: "high",
    category: "social_engagement",
    re: /\b(?:like|liked|follow|followed|share|shared)\b.{0,90}\b(?:third[-\s]?party|external|unaffiliated)\b.{0,90}\b(?:financial|investment|advisor|ria|broker|insurance)\b/i,
    rationale:
      "Engagement with third-party financial pages is adoption-risk content.",
    source: "Guardian 4.9 charts; FINRA Notice 10-06 adoption theory",
  },
  {
    id: "competitor-disparagement",
    severity: "high",
    category: "misleading_statement",
    re: /\b(?:competitor|rival|other advisor|other agent|other firm|another firm)\b.{0,100}\b(?:scam|bad|terrible|inferior|avoid|worst|dishonest|untrustworthy)\b/i,
    rationale:
      "The Guardian guidance prohibits disparaging competitor product or service information.",
    source: "Guardian 4.8",
  },
  {
    id: "oba-solicitation-or-link",
    severity: "high",
    category: "outside_business_activity",
    re: /\b(?:outside business activity|oba|side business|my other business|real estate business|tax prep|coaching business)\b.{0,130}\b(?:contact|call|book|schedule|hire|buy|join|sign up|visit|link|https?:\/\/|www\.)/i,
    rationale:
      "OBA mentions must be limited; active promotion, solicitation, and OBA hyperlinks are prohibited in the Guardian guidance.",
    source: "Guardian 4.7",
  },
  {
    id: "oba-disclosure-missing",
    severity: "medium",
    category: "outside_business_activity",
    re: /\b(?:outside business activity|oba|side business|my other business|real estate business|tax prep|coaching business)\b/i,
    rationale:
      "Every OBA summary must carry the required Guardian non-endorsement disclosure.",
    source: "Guardian 4.7",
    exception: (_line, fullText) => hasGuardianObaDisclosure(fullText),
  },
  {
    id: "non-guardian-activity-solicitation",
    severity: "high",
    category: "solicitation",
    re: /\b(?:donate|fundraiser|charity|political campaign|religious|church|vote for)\b.{0,100}\b(?:contact me|call me|support|contribute|buy tickets|join|sign up)\b/i,
    rationale:
      "Solicitation for charitable, political, religious, or other outside activities while conducting Guardian business is prohibited.",
    source: "Guardian 4.10.3",
  },
  {
    id: "financial-service-solicitation-license-check",
    severity: "medium",
    category: "solicitation",
    re: /\b(?:contact me|call me|dm me|message me|schedule|book a call)\b.{0,100}\b(?:life insurance|annuit(?:y|ies)|investment|financial plan|retirement plan|wealth plan)\b/i,
    rationale:
      "Product or service offers should be reviewed for state licensing and approved-channel requirements.",
    source: "Guardian 4.10.1; FINRA Notice 17-18 recordkeeping",
  },
  {
    id: "vague-sponsored-disclosure",
    severity: "medium",
    category: "disclosure",
    re: /(?:#(?:sp|spon|collab)\b|\b(?:collab|ambassador)\b)/i,
    rationale:
      "FTC guidance warns against vague disclosure shorthand; use clear ad or sponsored language.",
    source: "FTC Disclosures 101",
    exception: (line) => /#ad\b|#sponsored\b|\badvertisement\b|\bsponsored\b/i.test(line),
  },
];

function emptySummary(): MarketingComplianceVerdict["summary"] {
  return {
    total: 0,
    bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
    byCategory: {},
  };
}

function addSummary(
  summary: MarketingComplianceVerdict["summary"],
  finding: MarketingComplianceFinding,
): void {
  summary.total += 1;
  summary.bySeverity[finding.severity] += 1;
  summary.byCategory[finding.category] = (summary.byCategory[finding.category] ?? 0) + 1;
}

export function marketingComplianceScan(
  input: MarketingComplianceScanInput,
): MarketingComplianceVerdict {
  const findings: MarketingComplianceFinding[] = [];
  const summary = emptySummary();
  const fullText = input.text;
  const lines = fullText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;

    for (const rule of RULES) {
      const match = line.match(rule.re);
      if (!match) continue;
      if (rule.exception?.(line, fullText)) continue;

      const finding: MarketingComplianceFinding = {
        ruleId: rule.id,
        severity: rule.severity,
        category: rule.category,
        line: i + 1,
        phrase: match[0],
        context: line.trim(),
        rationale: rule.rationale,
        source: rule.source,
      };
      findings.push(finding);
      addSummary(summary, finding);
    }
  }

  return {
    requiresReview: findings.length > 0,
    findings,
    metadata: {
      scannerVersion: "0.1.0",
      ...(input.platform ? { platform: input.platform } : {}),
      ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
    },
    summary,
    note:
      "Regex findings are review triggers only. A human compliance reviewer must evaluate audience, platform, approvals, disclosures, supervision, and recordkeeping context.",
  };
}

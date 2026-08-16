---
name: compliance_review
description: Review marketing or social-media copy for deterministic compliance red flags before human/legal approval. Use when checking LinkedIn, Facebook, adviser, broker-dealer, insurance, testimonial, endorsement, performance, or product-offer copy. Use when "compliance reivew" or "is this email compliant" OR "is this comment compliant" OR "
allowed-tools: Grep, Glob, Read, Bash 
---

# Compliance Review Skill

This skill runs a deterministic scanner over marketing or social-media copy and
returns review triggers. It does not approve content and must not be described
as a legal or compliance determination.

## Workflow

1. Save or receive the draft content to review.
2. Run the scanner:

```bash
bun SAI/skills/compliance_review/Tools/ComplianceReview.ts \
  --input <draft-path> \
  --platform linkedin \
  --json
```

For ephemeral content:

```bash
printf '%s' "$DRAFT" | bun SAI/skills/compliance_review/Tools/ComplianceReview.ts --stdin --json
```

3. Summarize findings by severity and category.
4. Tell the user the scanner found review triggers, not final violations.
5. Route high and critical findings to a human compliance reviewer.

## Scanner Scope

The scanner flags:

- Specific product or strategy recommendations.
- Performance claims, projected returns, guarantees, and no-risk language.
- Testimonials, endorsements, ratings, and reviews.
- Likes, shares, and comments on financial or third-party financial content.
- Outside business activity promotion, links, and missing Guardian disclosure.
- Charitable, political, religious, or other outside-activity solicitation.
- Vague sponsored-content disclosures.

## CLI

```bash
bun SAI/skills/compliance_review/Tools/ComplianceReview.ts --help
```

Use `--fail-on high` or `--fail-on critical` only in automation that should
stop when review-triggering content is found. The default exit code is 0 when
the scan completes, even if findings are present.

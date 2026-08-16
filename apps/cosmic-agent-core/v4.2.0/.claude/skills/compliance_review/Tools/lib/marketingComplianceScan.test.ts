import { describe, expect, it } from "bun:test";
import { marketingComplianceScan } from "./marketingComplianceScan";

describe("marketingComplianceScan", () => {
  it("returns no findings for neutral non-financial content", () => {
    const verdict = marketingComplianceScan({
      text: "Congratulations to the team on volunteering at the community garden.",
    });
    expect(verdict.requiresReview).toBe(false);
    expect(verdict.findings).toEqual([]);
  });

  it("flags specific financial product recommendations", () => {
    const verdict = marketingComplianceScan({
      text: "You should purchase a variable annuity before retirement.",
    });
    expect(verdict.requiresReview).toBe(true);
    expect(verdict.findings.some((f) => f.ruleId === "class-wide-should-buy")).toBe(true);
    expect(verdict.summary.bySeverity.critical).toBeGreaterThan(0);
  });

  it("flags public likes or shares of financial content", () => {
    const verdict = marketingComplianceScan({
      text: "Liking a third-party financial page about stock research.",
    });
    expect(verdict.findings.map((f) => f.ruleId)).toContain("like-share-financial-content");
  });

  it("flags OBA solicitation and missing disclosure", () => {
    const verdict = marketingComplianceScan({
      text: "My side business can help with tax prep. Visit https://example.com to book.",
    });
    expect(verdict.findings.map((f) => f.ruleId)).toContain("oba-solicitation-or-link");
    expect(verdict.findings.map((f) => f.ruleId)).toContain("oba-disclosure-missing");
  });

  it("does not flag OBA disclosure missing when the required disclosure is present", () => {
    const verdict = marketingComplianceScan({
      text:
        "Approved OBA: tax prep.\n" +
        "Guardian and its subsidiaries do not endorse or have any direct or indirect responsibility with respect to this activity.",
    });
    expect(verdict.findings.map((f) => f.ruleId)).not.toContain("oba-disclosure-missing");
  });

  it("flags performance claims unless risk context appears on the line", () => {
    const risky = marketingComplianceScan({
      text: "Our portfolio returned 18% and beat the market.",
    });
    expect(risky.findings.map((f) => f.ruleId)).toContain(
      "performance-result-without-risk-context",
    );

    const balanced = marketingComplianceScan({
      text: "Past performance is not a guarantee; results include risks and limitations.",
    });
    expect(balanced.findings.map((f) => f.ruleId)).not.toContain(
      "performance-result-without-risk-context",
    );
  });

  it("flags vague sponsored disclosure shorthand", () => {
    const verdict = marketingComplianceScan({
      text: "Great retirement calculator from our partner #collab",
    });
    expect(verdict.findings.map((f) => f.ruleId)).toContain("vague-sponsored-disclosure");
  });
});

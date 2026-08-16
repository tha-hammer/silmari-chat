#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  marketingComplianceScan,
  type ComplianceSeverity,
  type MarketingComplianceVerdict,
} from "./lib/marketingComplianceScan";

const HELP = `ComplianceReview - deterministic marketing compliance review scanner.

Usage:
  bun SAI/skills/compliance_review/Tools/ComplianceReview.ts --input <path> [options]
  bun SAI/skills/compliance_review/Tools/ComplianceReview.ts --text <text> [options]
  bun SAI/skills/compliance_review/Tools/ComplianceReview.ts --stdin [options]

Options:
  --input <path>          Read marketing/social content from a file
  --text <text>           Scan the provided text
  --stdin                 Read content from stdin
  --platform <name>       Optional platform label, e.g. linkedin or facebook
  --source-label <label>  Optional source label for downstream review reports
  --json                  Emit JSON only
  --fail-on <severity>    Exit 3 if findings are at or above severity.
                          One of: none, low, medium, high, critical.
                          Default: none
  --help                  Print this help text

Exit codes:
  0  completed, no fail-on threshold reached
  1  usage or input error
  3  completed, but fail-on threshold was reached
`;

type FailOn = ComplianceSeverity | "none";

interface Args {
  input?: string;
  text?: string;
  stdin: boolean;
  platform?: string;
  sourceLabel?: string;
  json: boolean;
  help: boolean;
  failOn: FailOn;
}

interface ParseResult {
  args: Args;
  unknown: string[];
  missingValue: string[];
}

const SEVERITY_RANK: Record<FailOn, number> = {
  none: 99,
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function parseArgs(argv: string[]): ParseResult {
  const args: Args = {
    stdin: false,
    json: false,
    help: false,
    failOn: "none",
  };
  const unknown: string[] = [];
  const missingValue: string[] = [];

  const value = (flag: string, next: string | undefined): string | undefined => {
    if (next === undefined || next.startsWith("--")) {
      missingValue.push(flag);
      return undefined;
    }
    return next;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--json") args.json = true;
    else if (a === "--stdin") args.stdin = true;
    else if (a === "--input") args.input = value(a, argv[++i]);
    else if (a === "--text") args.text = value(a, argv[++i]);
    else if (a === "--platform") args.platform = value(a, argv[++i]);
    else if (a === "--source-label") args.sourceLabel = value(a, argv[++i]);
    else if (a === "--fail-on") {
      const raw = value(a, argv[++i]);
      if (raw && raw in SEVERITY_RANK) args.failOn = raw as FailOn;
      else if (raw) unknown.push(`${a}=${raw}`);
    } else {
      unknown.push(a);
    }
  }

  return { args, unknown, missingValue };
}

function selectedInputCount(args: Args): number {
  return Number(Boolean(args.input)) + Number(Boolean(args.text)) + Number(args.stdin);
}

async function readInput(args: Args): Promise<string> {
  if (args.text !== undefined) return args.text;
  if (args.stdin) return await Bun.stdin.text();

  const path = resolve(args.input ?? "");
  if (!existsSync(path)) {
    throw new Error(`input file not found: ${path}`);
  }
  return await Bun.file(path).text();
}

function thresholdReached(verdict: MarketingComplianceVerdict, failOn: FailOn): boolean {
  if (failOn === "none") return false;
  const threshold = SEVERITY_RANK[failOn];
  return verdict.findings.some((f) => SEVERITY_RANK[f.severity] >= threshold);
}

function printHuman(verdict: MarketingComplianceVerdict): void {
  console.log(
    `ComplianceReview: ${verdict.summary.total} finding(s), requiresReview=${verdict.requiresReview}`,
  );
  console.log(
    `Severity: critical=${verdict.summary.bySeverity.critical}, high=${verdict.summary.bySeverity.high}, medium=${verdict.summary.bySeverity.medium}, low=${verdict.summary.bySeverity.low}`,
  );
  for (const finding of verdict.findings) {
    console.log(
      `\n[${finding.severity}] ${finding.ruleId} line ${finding.line}: ${finding.phrase}`,
    );
    console.log(`  ${finding.context}`);
    console.log(`  ${finding.rationale}`);
    console.log(`  Source: ${finding.source}`);
  }
  if (verdict.findings.length === 0) console.log("\nNo regex review triggers found.");
}

async function main(): Promise<number> {
  const { args, unknown, missingValue } = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    return 0;
  }

  if (unknown.length > 0) {
    console.error(`Error: unknown or invalid flag(s): ${unknown.join(", ")}`);
    console.error("Run --help for usage.");
    return 1;
  }

  if (missingValue.length > 0) {
    console.error(`Error: flag(s) missing a value: ${missingValue.join(", ")}`);
    return 1;
  }

  if (selectedInputCount(args) !== 1) {
    console.error("Error: provide exactly one of --input, --text, or --stdin.");
    return 1;
  }

  let text: string;
  try {
    text = await readInput(args);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }

  const verdict = marketingComplianceScan({
    text,
    platform: args.platform,
    sourceLabel: args.sourceLabel,
  });

  if (args.json) {
    console.log(JSON.stringify(verdict, null, 2));
  } else {
    printHuman(verdict);
  }

  return thresholdReached(verdict, args.failOn) ? 3 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });

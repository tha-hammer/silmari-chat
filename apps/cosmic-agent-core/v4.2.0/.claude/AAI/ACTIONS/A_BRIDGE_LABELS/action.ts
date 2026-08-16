import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ActionContext } from "../../../../../../video-pipeline/reel/lib/actionContext";
import {
  pipelineError,
  parseSubprocessError,
} from "../../../../../../video-pipeline/reel/lib/pipelineError";
import { silmariStoreBinaryPath } from "../../../../../../video-pipeline/reel/silmariStoreBinary";

interface Input {
  video_id: string;
  words_path: string;
  card_graph_path: string;
  ingest_report_path: string;
  [k: string]: unknown;
}

interface Output {
  video_id: string;
  card_graph_path: string;
  matched: number;
  unmatched_count: number;
  unmatched_path: string;
  proposals_path: string;
  proposals_count: number;
  [k: string]: unknown;
}

interface BridgeSummary {
  matched: number;
  unmatched_count: number;
  proposals_count: number;
}

const BRIDGE_ENTRY = process.env.BRIDGE_ENTRY
  ?? `${process.env.HOME}/Dev/cosmic-agent-memory/apps/video-pipeline/cascade/bridge/run.ts`;

function q(s: string): string {
  return JSON.stringify(s);
}

export default {
  async execute(input: Input, ctx: ActionContext): Promise<Output> {
    const {
      video_id,
      words_path,
      card_graph_path,
      ingest_report_path,
      ...upstream
    } = input;
    for (const [k, v] of Object.entries({
      video_id,
      words_path,
      card_graph_path,
      ingest_report_path,
    })) {
      if (!v) {
        throw pipelineError({
          code: "MISSING_REQUIRED",
          category: "validation",
          retryable: false,
          action: "A_BRIDGE_LABELS",
          message: `A_BRIDGE_LABELS requires ${k}`,
        });
      }
    }
    if (!ctx.capabilities.shell) {
      throw pipelineError({
        code: "NO_SHELL",
        category: "internal",
        retryable: false,
        action: "A_BRIDGE_LABELS",
        message: "shell capability required",
      });
    }

    const bin = await silmariStoreBinaryPath();
    const unmatchedPath = join(
      dirname(ingest_report_path),
      `${video_id}.unmatched.jsonl`,
    );
    const proposalsPath = join(
      dirname(ingest_report_path),
      `${video_id}.proposals.jsonl`,
    );

    const bridgeCmd =
      `SILMARI_STORE_BINARY=${q(bin)} ` +
      `bun ${q(BRIDGE_ENTRY)} ` +
      `--video-id ${q(video_id)} ` +
      `--words ${q(words_path)} ` +
      `--ingest-report ${q(ingest_report_path)} ` +
      `--db ${q(card_graph_path)} ` +
      `--unmatched ${q(unmatchedPath)} ` +
      `--proposals ${q(proposalsPath)} ` +
      `--json`;

    const r = await ctx.capabilities.shell(bridgeCmd, {
      timeoutMs: 180_000,
      abortSignal: ctx.abortSignal,
    });
    if (r.exitCode !== 0) {
      throw parseSubprocessError({
        cmd: "bridge/run.ts",
        exitCode: r.exitCode,
        signal: r.signal,
        stderr: r.stderr,
        action: "A_BRIDGE_LABELS",
        stage: "match-and-label",
      });
    }

    const tail = r.stdout.trim().split(/\r?\n/).pop()!;
    let summary: BridgeSummary;
    try {
      summary = JSON.parse(tail);
    } catch (err) {
      throw pipelineError({
        code: "SUMMARY_PARSE_FAILED",
        category: "schema",
        retryable: false,
        action: "A_BRIDGE_LABELS",
        message: "bridge/run.ts did not emit JSON summary on final stdout line",
        detail: { stdoutTail: r.stdout.slice(-500) },
        cause: err,
      });
    }

    if (existsSync(proposalsPath) && statSync(proposalsPath).size > 0) {
      const reconcileCmd =
        `${q(bin)} edge-reconcile-proposals ` +
        `--db ${q(card_graph_path)} ` +
        `--box idea ` +
        `--proposals-file ${q(proposalsPath)} ` +
        `--reviewed-by A_BRIDGE_LABELS ` +
        `--json`;
      const rr = await ctx.capabilities.shell(reconcileCmd, {
        timeoutMs: 60_000,
        abortSignal: ctx.abortSignal,
      });
      if (rr.exitCode !== 0) {
        throw parseSubprocessError({
          cmd: "silmari-store edge-reconcile-proposals",
          exitCode: rr.exitCode,
          signal: rr.signal,
          stderr: rr.stderr,
          action: "A_BRIDGE_LABELS",
          stage: "reconcile-proposals",
        });
      }
    }

    return {
      ...upstream,
      video_id,
      card_graph_path,
      matched: summary.matched ?? 0,
      unmatched_count: summary.unmatched_count ?? 0,
      unmatched_path: unmatchedPath,
      proposals_path: proposalsPath,
      proposals_count: summary.proposals_count ?? 0,
    };
  },
};

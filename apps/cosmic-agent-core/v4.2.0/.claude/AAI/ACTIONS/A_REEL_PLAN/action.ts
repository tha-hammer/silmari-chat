import { dirname, join, resolve } from "node:path";
import type { ActionContext } from "../../../../../../video-pipeline/reel/lib/actionContext";
import {
  pipelineError,
  parseSubprocessError,
} from "../../../../../../video-pipeline/reel/lib/pipelineError";

interface Input {
  video_id: string;
  card_graph_path: string;
  transcript_dir: string;
  seed?: string;
  min?: number;
  target?: number;
  max?: number;
  plan_path?: string;
  [k: string]: unknown;
}

interface Output {
  video_id: string;
  card_graph_path: string;
  plan_path: string;
  cuts: number;
  [k: string]: unknown;
}

const VIDEO_PIPELINE_ROOT = resolve(
  process.env.VIDEO_PIPELINE_ROOT
    ?? process.env.COSMIC_VIDEO_ROOT  // REMOVE-AFTER-2026-08-01: legacy alias from pre-rename
    ?? `${process.env.HOME}/Dev/cosmic-agent-memory/apps/video-pipeline/reel`,
);

function q(s: string): string {
  return JSON.stringify(s);
}

export default {
  async execute(input: Input, ctx: ActionContext): Promise<Output> {
    const { video_id, card_graph_path, transcript_dir, ...upstream } = input;
    for (const [k, v] of Object.entries({ video_id, card_graph_path, transcript_dir })) {
      if (!v) {
        throw pipelineError({
          code: "MISSING_REQUIRED",
          category: "validation",
          retryable: false,
          action: "A_REEL_PLAN",
          message: `A_REEL_PLAN requires ${k}`,
        });
      }
    }
    if (!ctx.capabilities.shell) {
      throw pipelineError({
        code: "NO_SHELL",
        category: "internal",
        retryable: false,
        action: "A_REEL_PLAN",
        message: "shell capability required",
      });
    }

    const planPath = (input.plan_path as string | undefined)
      ?? join(dirname(card_graph_path), `${video_id}.plan.json`);
    const seed = (input.seed as string | undefined) ?? "auto";
    const min = (input.min as number | undefined) ?? 30;
    const target = (input.target as number | undefined) ?? 60;
    const max = (input.max as number | undefined) ?? 90;

    const cmd =
      `bun ${q(`${VIDEO_PIPELINE_ROOT}/cli.ts`)} plan ` +
      `--card-store ${q(card_graph_path)} ` +
      `--transcript-dir ${q(transcript_dir)} ` +
      `--seed ${q(seed)} ` +
      `--min ${min} --target ${target} --max ${max} ` +
      `--out ${q(planPath)} --json`;

    const r = await ctx.capabilities.shell(cmd, {
      timeoutMs: 60_000,
      abortSignal: ctx.abortSignal,
    });
    if (r.exitCode !== 0) {
      throw parseSubprocessError({
        cmd: "cosmic-video plan",
        exitCode: r.exitCode,
        signal: r.signal,
        stderr: r.stderr,
        action: "A_REEL_PLAN",
        stage: "plan",
      });
    }

    let summary: { cuts: number };
    try {
      summary = JSON.parse(r.stdout.trim().split(/\r?\n/).pop()!);
    } catch (err) {
      throw pipelineError({
        code: "SUMMARY_PARSE_FAILED",
        category: "schema",
        retryable: false,
        action: "A_REEL_PLAN",
        message: "cosmic-video plan did not emit JSON summary on final stdout line",
        detail: { stdoutTail: r.stdout.slice(-500) },
        cause: err,
      });
    }

    return {
      ...upstream,
      video_id,
      card_graph_path,
      plan_path: planPath,
      cuts: summary.cuts ?? 0,
    };
  },
};

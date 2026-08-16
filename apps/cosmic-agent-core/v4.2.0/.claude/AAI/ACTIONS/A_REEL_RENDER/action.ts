import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ActionContext } from "../../../../../../video-pipeline/reel/lib/actionContext";
import {
  pipelineError,
  parseSubprocessError,
} from "../../../../../../video-pipeline/reel/lib/pipelineError";

interface Input {
  plan_path: string;
  out: string;
  video_id?: string;
  [k: string]: unknown;
}

interface Output {
  reel_path: string;
  duration_s: number;
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
    const { plan_path, out, ...upstream } = input;
    for (const [k, v] of Object.entries({ plan_path, out })) {
      if (!v) {
        throw pipelineError({
          code: "MISSING_REQUIRED",
          category: "validation",
          retryable: false,
          action: "A_REEL_RENDER",
          message: `A_REEL_RENDER requires ${k}`,
        });
      }
    }
    if (!existsSync(plan_path)) {
      throw pipelineError({
        code: "PLAN_NOT_FOUND",
        category: "io",
        retryable: false,
        action: "A_REEL_RENDER",
        message: `plan_path does not exist: ${plan_path}`,
      });
    }
    if (!ctx.capabilities.shell) {
      throw pipelineError({
        code: "NO_SHELL",
        category: "internal",
        retryable: false,
        action: "A_REEL_RENDER",
        message: "shell capability required",
      });
    }

    const cmd =
      `bun ${q(`${VIDEO_PIPELINE_ROOT}/cli.ts`)} reel ` +
      `--plan ${q(plan_path)} --out ${q(out)} --json`;

    const r = await ctx.capabilities.shell(cmd, {
      // 300s symmetric with A_REEL_COMPOSE — render is ffmpeg-bound
      // rather than LLM-bound but long reels with many clips + transitions
      // can legitimately exceed 2min. Matches the 5min ceiling used
      // throughout the reel pipeline.
      timeoutMs: 300_000,
      abortSignal: ctx.abortSignal,
    });
    if (r.exitCode !== 0) {
      throw parseSubprocessError({
        cmd: "cosmic-video reel",
        exitCode: r.exitCode,
        signal: r.signal,
        stderr: r.stderr,
        action: "A_REEL_RENDER",
        stage: "render",
      });
    }

    let summary: { duration_s: number };
    try {
      summary = JSON.parse(r.stdout.trim().split(/\r?\n/).pop()!);
    } catch (err) {
      throw pipelineError({
        code: "SUMMARY_PARSE_FAILED",
        category: "schema",
        retryable: false,
        action: "A_REEL_RENDER",
        message: "cosmic-video reel did not emit JSON summary on final stdout line",
        detail: { stdoutTail: r.stdout.slice(-500) },
        cause: err,
      });
    }

    return {
      ...upstream,
      reel_path: out,
      duration_s: summary.duration_s ?? 0,
    };
  },
};

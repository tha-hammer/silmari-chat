// A_REEL_RENDER_COMPOSED — render a ComposedPlan (schema_version
// "compose-p2") to MP4 via the cosmic-video render-composed-plan
// subcommand. Mirrors A_REEL_COMPOSE's shape; distinct from A_REEL_RENDER
// (which renders a P1 reel-plan via cosmic-video reel and is left
// untouched for backwards-compat).

import { resolve } from "node:path";
import type { ActionContext } from "../../../../../../video-pipeline/reel/lib/actionContext";
import {
  pipelineError,
  parseSubprocessError,
} from "../../../../../../video-pipeline/reel/lib/pipelineError";

interface Input {
  plan_path: string;
  out: string;
  [k: string]: unknown;
}

interface Output {
  reel_path: string;
  duration_s: number;
  status: "pass" | "fail";
  error?: string;
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
          action: "A_REEL_RENDER_COMPOSED",
          message: `A_REEL_RENDER_COMPOSED requires ${k}`,
        });
      }
    }
    if (!ctx.capabilities.shell) {
      throw pipelineError({
        code: "NO_SHELL",
        category: "internal",
        retryable: false,
        action: "A_REEL_RENDER_COMPOSED",
        message: "shell capability required",
      });
    }

    const cmd =
      `bun ${q(`${VIDEO_PIPELINE_ROOT}/cli.ts`)} render-composed-plan ` +
      `--plan ${q(plan_path)} --out ${q(out)} --json`;

    const r = await ctx.capabilities.shell(cmd, {
      // 900s wrap timeout — must be larger than renderComposedPlan's inner
      // ffmpeg stitch timeout (600s at render/renderComposedPlan.ts:209) so
      // the inner timeout fires first and produces a meaningful error rather
      // than the wrap killing the subprocess mid-transcode. Bumped from 180s
      // after the nolme-test compose-reel run 1780337075 where the final
      // ffmpeg single-pass took longer than the prior 120s/180s ceilings.
      timeoutMs: 900_000,
      abortSignal: ctx.abortSignal,
    });

    // Exit 1 = UNHANDLED — no parseable last-line JSON.
    if (r.exitCode === 1) {
      throw pipelineError({
        code: "UNEXPECTED_FAILURE",
        category: "internal",
        retryable: false,
        action: "A_REEL_RENDER_COMPOSED",
        message: "cosmic-video render-composed-plan exited 1 (UNHANDLED)",
        detail: { stderr: r.stderr.slice(-1000) },
      });
    }

    // Exit 0 (pass) and 2 (validated fail) both emit a parseable summary
    // on the final stdout line; bubble both as data. Other non-zero exits
    // (signal, OS-level kill) → parseSubprocessError.
    if (r.exitCode !== 0 && r.exitCode !== 2) {
      throw parseSubprocessError({
        cmd: "cosmic-video render-composed-plan",
        exitCode: r.exitCode,
        signal: r.signal,
        stderr: r.stderr,
        action: "A_REEL_RENDER_COMPOSED",
        stage: "render-composed",
      });
    }

    let summary: Output;
    try {
      summary = JSON.parse(r.stdout.trim().split(/\r?\n/).pop()!);
    } catch (err) {
      throw pipelineError({
        code: "SUMMARY_PARSE_FAILED",
        category: "schema",
        retryable: false,
        action: "A_REEL_RENDER_COMPOSED",
        message: "cosmic-video render-composed-plan did not emit JSON summary on final stdout line",
        detail: { stdoutTail: r.stdout.slice(-500), exitCode: r.exitCode },
        cause: err,
      });
    }

    return {
      ...upstream,
      reel_path: summary.reel_path ?? out,
      duration_s: summary.duration_s ?? 0,
      status: summary.status,
      ...(summary.error ? { error: summary.error } : {}),
    };
  },
};

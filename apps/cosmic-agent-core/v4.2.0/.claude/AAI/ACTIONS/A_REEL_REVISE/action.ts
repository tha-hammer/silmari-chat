// A_REEL_REVISE — apply a single revise op (swap-clip | regen-art | swap-art)
// to a prior ComposedPlan (schema_version "compose-p3") via the cosmic-video
// revise subcommand. Mirrors A_REEL_RENDER_COMPOSED's shape. Distinct from
// A_REEL_COMPOSE (which builds from scratch).
//
// op_args is a discriminated union keyed on op_args.op. Per-op required fields:
//   swap-clip → {clip_index, new_card_id, store, corpus_root, transcript_dir}
//   regen-art → {slot}
//   swap-art  → {slot, image_path}
//
// CLI flag mapping is mechanical; the switch below is the canonical encoding.

import { resolve } from "node:path";
import type { ActionContext } from "../../../../../../video-pipeline/reel/lib/actionContext";
import {
  pipelineError,
  parseSubprocessError,
} from "../../../../../../video-pipeline/reel/lib/pipelineError";

type SwapClipArgs = {
  op: "swap-clip";
  clip_index: number;
  new_card_id: string;
  store: string;
  corpus_root: string;
  transcript_dir: string;
};

type RegenArtArgs = {
  op: "regen-art";
  slot: "intro" | "outro";
};

type SwapArtArgs = {
  op: "swap-art";
  slot: "intro" | "outro";
  image_path: string;
};

type ReviseOpArgs = SwapClipArgs | RegenArtArgs | SwapArtArgs;

interface Input {
  plan_path: string;
  out: string;
  op_args: ReviseOpArgs;
  [k: string]: unknown;
}

interface Output {
  plan_path: string;
  preview_path?: string;
  status: "pass" | "warn" | "fail";
  warnings?: string[];
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

function buildOpFlags(op_args: ReviseOpArgs): string {
  switch (op_args.op) {
    case "swap-clip":
      return (
        `--op swap-clip ` +
        `--clip-index ${op_args.clip_index} ` +
        `--new-card-id ${q(op_args.new_card_id)} ` +
        `--store ${q(op_args.store)} ` +
        `--corpus-root ${q(op_args.corpus_root)} ` +
        `--transcript-dir ${q(op_args.transcript_dir)}`
      );
    case "regen-art":
      return `--op regen-art --slot ${q(op_args.slot)}`;
    case "swap-art":
      return (
        `--op swap-art ` +
        `--slot ${q(op_args.slot)} ` +
        `--image ${q(op_args.image_path)}`
      );
    default: {
      // Exhaustiveness check; pipelineError below catches the runtime fallout.
      const _exhaust: never = op_args;
      void _exhaust;
      throw pipelineError({
        code: "UNKNOWN_OP",
        category: "validation",
        retryable: false,
        action: "A_REEL_REVISE",
        message: `A_REEL_REVISE received unknown op_args.op: ${JSON.stringify((op_args as { op?: string }).op)}`,
        detail: { op_args },
      });
    }
  }
}

export default {
  async execute(input: Input, ctx: ActionContext): Promise<Output> {
    const { plan_path, out, op_args, ...upstream } = input;
    const removedStoreField = ["card", "store"].join("_");
    if (
      typeof op_args === "object"
      && op_args !== null
      && Object.hasOwn(op_args, removedStoreField)
    ) {
      throw pipelineError({
        code: "STORE_PATH_INPUT_REMOVED",
        category: "validation",
        retryable: false,
        action: "A_REEL_REVISE",
        message: `op_args.${removedStoreField} was removed; use op_args.store`,
      });
    }
    for (const [k, v] of Object.entries({ plan_path, out, op_args })) {
      if (!v) {
        throw pipelineError({
          code: "MISSING_REQUIRED",
          category: "validation",
          retryable: false,
          action: "A_REEL_REVISE",
          message: `A_REEL_REVISE requires ${k}`,
        });
      }
    }
    if (!ctx.capabilities.shell) {
      throw pipelineError({
        code: "NO_SHELL",
        category: "internal",
        retryable: false,
        action: "A_REEL_REVISE",
        message: "shell capability required",
      });
    }

    // buildOpFlags throws UNKNOWN_OP for bad op values; intentionally before
    // shell call so we don't spawn a subprocess on a malformed input.
    const opFlags = buildOpFlags(op_args);

    const cmd =
      `bun ${q(`${VIDEO_PIPELINE_ROOT}/cli.ts`)} revise ` +
      `--plan ${q(plan_path)} ` +
      `${opFlags} ` +
      `--out ${q(out)} --json`;

    const r = await ctx.capabilities.shell(cmd, {
      timeoutMs: 180_000,
      abortSignal: ctx.abortSignal,
    });

    // Exit 1 = UNHANDLED — no parseable last-line JSON.
    if (r.exitCode === 1) {
      throw pipelineError({
        code: "UNEXPECTED_FAILURE",
        category: "internal",
        retryable: false,
        action: "A_REEL_REVISE",
        message: "cosmic-video revise exited 1 (UNHANDLED)",
        detail: { stderr: r.stderr.slice(-1000) },
      });
    }

    // Exit 0 (pass/warn) and 2 (validated fail) both emit a parseable summary
    // on the final stdout line; bubble both as data. Other non-zero exits
    // (signal, OS-level kill) → parseSubprocessError.
    if (r.exitCode !== 0 && r.exitCode !== 2) {
      throw parseSubprocessError({
        cmd: "cosmic-video revise",
        exitCode: r.exitCode,
        signal: r.signal,
        stderr: r.stderr,
        action: "A_REEL_REVISE",
        stage: "revise",
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
        action: "A_REEL_REVISE",
        message: "cosmic-video revise did not emit JSON summary on final stdout line",
        detail: { stdoutTail: r.stdout.slice(-500), exitCode: r.exitCode },
        cause: err,
      });
    }

    return {
      ...upstream,
      plan_path: summary.plan_path ?? out,
      status: summary.status,
      ...(summary.preview_path !== undefined ? { preview_path: summary.preview_path } : {}),
      ...(summary.warnings !== undefined ? { warnings: summary.warnings } : {}),
      ...(summary.error ? { error: summary.error } : {}),
    };
  },
};

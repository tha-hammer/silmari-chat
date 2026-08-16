import { resolve } from "node:path";
import type { ActionContext } from "../../../../../../video-pipeline/reel/lib/actionContext";
import {
  pipelineError,
  parseSubprocessError,
} from "../../../../../../video-pipeline/reel/lib/pipelineError";

interface Input {
  brief: string;
  store?: string;
  corpus_root: string;
  transcript_dir: string;
  walk_shape?: "linear-follows" | "branches-explore" | "mixed";
  hop_budget?: number;
  cross_video?: "exclude" | "offer" | "prefer";
  strict_seed?: boolean;
  best_effort?: boolean;
  out?: string;
  compose_mode?: "deterministic" | "zk-native";
  [k: string]: unknown;
}

interface ClarifyShape {
  rephrased_briefs: [string, string, string];
  weak_match_cards: Array<{ card_id: string; title: string; excerpt: string; score: number }>;
  question: string;
}

interface Output {
  plan_path: string;
  status: "pass" | "warn" | "fail" | "clarify";
  clip_count: number;
  walk_summary: Record<string, unknown>;
  cross_video_candidates_count: number;
  clarify?: ClarifyShape;
  warnings: string[];
  // PV-5 (slice 8) — optional preview MP4 path emitted by the compose CLI
  // when preview generation succeeded. Absent on --no-preview, on
  // fail/clarify, and on PREVIEW_FFMPEG_FAILED (warning lands instead).
  preview_path?: string;
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

interface ComposeShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
}

function maybeEmitProgressLine(line: string, ctx: ActionContext): void {
  if (!ctx.onProgress) return;
  const trimmed = line.trim();
  if (!trimmed.startsWith("{\"_progress\":")) return;
  try {
    const parsed = JSON.parse(trimmed) as { _progress?: unknown };
    if (parsed._progress && typeof parsed._progress === "object") {
      ctx.onProgress(parsed._progress as Parameters<NonNullable<ActionContext["onProgress"]>>[0]);
    }
  } catch {
    // Ignore malformed progress lines; stderr still flows through unchanged.
  }
}

async function collectStderrWithProgress(
  stderr: ReadableStream<Uint8Array>,
  ctx: ActionContext,
): Promise<string> {
  const reader = stderr.getReader();
  const decoder = new TextDecoder();
  let stderrText = "";
  let pending = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk = decoder.decode(value, { stream: true });
    stderrText += chunk;
    pending += chunk;

    while (true) {
      const newline = pending.indexOf("\n");
      if (newline === -1) break;
      const line = pending.slice(0, newline).replace(/\r$/, "");
      pending = pending.slice(newline + 1);
      maybeEmitProgressLine(line, ctx);
    }
  }

  const flush = decoder.decode();
  if (flush) {
    stderrText += flush;
    pending += flush;
  }
  if (pending.length > 0) {
    maybeEmitProgressLine(pending.replace(/\r$/, ""), ctx);
  }
  return stderrText;
}

async function runComposeCommand(cmd: string, ctx: ActionContext): Promise<ComposeShellResult> {
  // Default path preserves existing runner/shell behavior.
  if (!ctx.onProgress) {
    const r = await ctx.capabilities.shell(cmd, {
      // 300s matches INFERENCE_DEFAULT_TIMEOUT_MS in
      // apps/video-pipeline/reel/lib/inferenceClient.ts — the wrapping
      // action MUST allow at least one full inference call to complete
      // before killing. zk-native compose hit INFERENCE_TIMEOUT under
      // the prior 120s ceiling because the wrapping subprocess was
      // killed before the LLM call could finish.
      timeoutMs: 300_000,
      abortSignal: ctx.abortSignal,
    });
    return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode, signal: r.signal };
  }

  // Progress path streams stderr for `_progress` lines while preserving output semantics.
  const child = Bun.spawn(["sh", "-c", cmd], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    signal: ctx.abortSignal,
  });
  const stdoutPromise = child.stdout ? new Response(child.stdout).text() : Promise.resolve("");
  const stderrPromise = child.stderr
    ? collectStderrWithProgress(child.stderr as ReadableStream<Uint8Array>, ctx)
    : Promise.resolve("");
  const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, child.exited]);
  return { stdout, stderr, exitCode, signal: null };
}

export default {
  async execute(input: Input, ctx: ActionContext): Promise<Output> {
    const removedStoreField = ["card", "graph", "path"].join("_");
    if (Object.hasOwn(input, removedStoreField)) {
      throw pipelineError({
        code: "STORE_PATH_INPUT_REMOVED",
        category: "validation",
        retryable: false,
        action: "A_REEL_COMPOSE",
        message: `${removedStoreField} was removed; use store`,
      });
    }
    const { brief, store, corpus_root, transcript_dir, ...upstream } = input;
    for (const [k, v] of Object.entries({ brief, corpus_root, transcript_dir })) {
      if (!v) {
        throw pipelineError({
          code: "MISSING_REQUIRED",
          category: "validation",
          retryable: false,
          action: "A_REEL_COMPOSE",
          message: `A_REEL_COMPOSE requires ${k}`,
        });
      }
    }
    if (!ctx.capabilities.shell) {
      throw pipelineError({
        code: "NO_SHELL",
        category: "internal",
        retryable: false,
        action: "A_REEL_COMPOSE",
        message: "shell capability required",
      });
    }

    const walk_shape = input.walk_shape;
    const hop_budget = input.hop_budget;
    const cross_video = input.cross_video;
    const strict_seed = input.strict_seed === true;
    const best_effort = input.best_effort === true;
    const out = input.out;

    const compose_mode = input.compose_mode;
    const cmd =
      `bun ${q(`${VIDEO_PIPELINE_ROOT}/cli.ts`)} compose ` +
      `--brief ${q(brief)} ` +
      (store ? `--store ${q(store)} ` : "") +
      `--corpus-root ${q(corpus_root)} ` +
      `--transcript-dir ${q(transcript_dir)} ` +
      (walk_shape ? `--walk-shape ${q(walk_shape)} ` : "") +
      (hop_budget !== undefined ? `--hop-budget ${hop_budget} ` : "") +
      (cross_video ? `--cross-video ${q(cross_video)} ` : "") +
      (strict_seed ? `--strict-seed ` : "") +
      (best_effort ? `--best-effort ` : "") +
      (compose_mode ? `--compose-mode ${q(compose_mode)} ` : "") +
      (out ? `--out ${q(out)}` : "");

    const r = await runComposeCommand(cmd, ctx);

    // Exit 1 = UNHANDLED — no parseable last-line JSON. Surface the stderr tail
    // in the message (not just detail) so the bridge/UI shows the real cause
    // (e.g. MEDIA_VIDEO_NOT_FOUND) for the user to relay to support.
    if (r.exitCode === 1) {
      const tail = r.stderr.trim().slice(-1500);
      throw pipelineError({
        code: "UNEXPECTED_FAILURE",
        category: "internal",
        retryable: false,
        action: "A_REEL_COMPOSE",
        message: `cosmic-video compose failed (exit 1):\n${tail || "(no stderr output)"}`,
        detail: { stderr: r.stderr.slice(-1000) },
      });
    }

    // Exit 2 (fail) and 3 (strict-seed clarify) both emit a parseable summary; bubble as data.
    if (r.exitCode !== 0 && r.exitCode !== 2 && r.exitCode !== 3) {
      throw parseSubprocessError({
        cmd: "cosmic-video compose",
        exitCode: r.exitCode,
        signal: r.signal,
        stderr: r.stderr,
        action: "A_REEL_COMPOSE",
        stage: "compose",
      });
    }

    let summary: Output;
    try {
      summary = JSON.parse(r.stdout.trim().split(/\r?\n/).pop()!);
    } catch (err) {
      const errTail = r.stderr.trim().slice(-1200);
      const outTail = r.stdout.trim().slice(-400);
      throw pipelineError({
        code: "SUMMARY_PARSE_FAILED",
        category: "schema",
        retryable: false,
        action: "A_REEL_COMPOSE",
        message:
          `cosmic-video compose (exit ${r.exitCode}) did not emit a JSON summary.\n` +
          (errTail ? `stderr:\n${errTail}` : `stdout tail:\n${outTail}`),
        detail: { stdoutTail: r.stdout.slice(-1000), stderrTail: r.stderr.slice(-1000), exitCode: r.exitCode },
        cause: err,
      });
    }

    return {
      ...upstream,
      plan_path: summary.plan_path,
      status: summary.status,
      clip_count: summary.clip_count ?? 0,
      walk_summary: summary.walk_summary ?? {},
      cross_video_candidates_count: summary.cross_video_candidates_count ?? 0,
      clarify: summary.clarify,
      warnings: summary.warnings ?? [],
      // PV-5 — propagate preview_path when present (omit field entirely
      // otherwise; consumers test `out.preview_path === undefined`).
      ...(summary.preview_path !== undefined ? { preview_path: summary.preview_path } : {}),
    };
  },
};

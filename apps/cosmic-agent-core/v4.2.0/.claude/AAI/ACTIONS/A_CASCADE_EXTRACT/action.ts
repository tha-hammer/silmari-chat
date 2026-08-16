import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ActionContext } from "../../../../../../video-pipeline/reel/lib/actionContext";
import {
  pipelineError,
  parseSubprocessError,
} from "../../../../../../video-pipeline/reel/lib/pipelineError";

interface Input {
  video_id: string;
  transcript_path: string;
  extracted_dir: string;
  [k: string]: unknown;
}

interface Output {
  video_id: string;
  extracted_dir: string;
  themes_path: string;
  ideas_path: string;
  micros_path: string;
  flagged_path: string;
  micros_v2_path: string;
  [k: string]: unknown;
}

const CASCADE_ROOT = process.env.CASCADE_ROOT
  ?? `${process.env.HOME}/Dev/cosmic-agent-memory/apps/video-pipeline/cascade`;
const FIXTURES_ROOT = `${process.env.HOME}/Dev/cosmic-agent-memory/apps/video-pipeline/cascade/tests/fixtures/golden`;

interface CascadeStage {
  readonly name: "pass1" | "pass2" | "pass3" | "gate" | "fix";
  readonly script: string;
  readonly outFile: string;
}

const STAGES: readonly CascadeStage[] = [
  { name: "pass1", script: "extract/pass1-themes.ts",     outFile: "themes.json" },
  { name: "pass2", script: "extract/pass2-ideas.ts",      outFile: "ideas.json" },
  { name: "pass3", script: "extract/pass3-micros.ts",     outFile: "micros.json" },
  { name: "gate",  script: "gates/atomicity.ts",          outFile: "flagged.json" },
  // TODO: fix-micros.ts removed during the video-pipeline rename refactor; this
  // stage will fail until a canonical replacement lands. Tracked separately.
  { name: "fix",   script: "extract/fix-micros.ts",       outFile: "micros.v2.json" },
];

function q(s: string): string {
  return JSON.stringify(s);
}

export default {
  async execute(input: Input, ctx: ActionContext): Promise<Output> {
    const { video_id, transcript_path, extracted_dir, ...upstream } = input;
    for (const [k, v] of Object.entries({ video_id, transcript_path, extracted_dir })) {
      if (!v) {
        throw pipelineError({
          code: "MISSING_REQUIRED",
          category: "validation",
          retryable: false,
          action: "A_CASCADE_EXTRACT",
          message: `A_CASCADE_EXTRACT requires ${k}`,
        });
      }
    }
    if (!ctx.capabilities.shell) {
      throw pipelineError({
        code: "NO_SHELL",
        category: "internal",
        retryable: false,
        action: "A_CASCADE_EXTRACT",
        message: "shell capability required",
      });
    }

    mkdirSync(extracted_dir, { recursive: true });

    if (process.env.MOCK_LLM === "1") {
      const src = join(FIXTURES_ROOT, video_id);
      for (const stage of STAGES) {
        const from = join(src, stage.outFile);
        const to = join(extracted_dir, stage.outFile);
        if (!existsSync(from)) {
          throw pipelineError({
            code: "MOCK_FIXTURE_MISSING",
            category: "io",
            retryable: false,
            action: "A_CASCADE_EXTRACT",
            stage: stage.name,
            message: `MOCK_LLM=1 requested but fixture not found: ${from}`,
          });
        }
        copyFileSync(from, to);
      }
    } else {
      for (const stage of STAGES) {
        const cmd =
          `bun ${q(`${CASCADE_ROOT}/${stage.script}`)} ` +
          `--video-id ${q(video_id)} ` +
          `--transcript ${q(transcript_path)} ` +
          `--out-dir ${q(extracted_dir)}`;
        const r = await ctx.capabilities.shell(cmd, {
          timeoutMs: 300_000,
          abortSignal: ctx.abortSignal,
        });
        if (r.exitCode !== 0) {
          throw parseSubprocessError({
            cmd,
            exitCode: r.exitCode,
            signal: r.signal,
            stderr: r.stderr,
            action: "A_CASCADE_EXTRACT",
            stage: stage.name,
          });
        }
      }
    }

    return {
      ...upstream,
      video_id,
      extracted_dir,
      themes_path:    join(extracted_dir, "themes.json"),
      ideas_path:     join(extracted_dir, "ideas.json"),
      micros_path:    join(extracted_dir, "micros.json"),
      flagged_path:   join(extracted_dir, "flagged.json"),
      micros_v2_path: join(extracted_dir, "micros.v2.json"),
    };
  },
};

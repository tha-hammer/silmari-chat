import { dirname, join } from "node:path";
import type { ActionContext } from "../../../../../../video-pipeline/reel/lib/actionContext";
import {
  pipelineError,
  parseSubprocessError,
} from "../../../../../../video-pipeline/reel/lib/pipelineError";

interface Input {
  url?: string;
  playlist?: string;
  single_file?: string;
  video_id?: string;
  out_dir: string;
  audio_dir?: string;
  [k: string]: unknown;
}

function resolveAudioDir(audioDir: string | undefined): string {
  if (audioDir && audioDir.length > 0) return audioDir;
  return join(process.cwd(), "transcribe-artifacts", "audio");
}

interface Output {
  video_id: string;
  source_url: string;
  audio_path: string;
  transcript_path: string;
  transcript_json_path: string;
  transcript_dir: string;
  words_path: string;
  duration_s: number;
  [k: string]: unknown;
}

const REQUIRED_MANIFEST_KEYS = [
  "video_id",
  "source_url",
  "audio_path",
  "transcript_path",
  "transcript_json_path",
  "words_path",
  "duration_s",
] as const;

const TRANSCRIBER = process.env.BULK_TRANSCRIBER
  ?? `${process.env.HOME}/Dev/cosmic-agent-memory/apps/bulk-transcribe-youtube-videos/bulk_transcribe_youtube_videos_from_playlist.py`;

function q(s: string): string {
  return JSON.stringify(s);
}

export default {
  async execute(input: Input, ctx: ActionContext): Promise<Output> {
    const { url, playlist, single_file, video_id, out_dir, audio_dir, ...upstream } = input;

    const sources = [url, playlist, single_file].filter(Boolean) as string[];
    if (sources.length === 0) {
      throw pipelineError({
        code: "MISSING_SOURCE",
        category: "validation",
        retryable: false,
        action: "A_YT_ACQUIRE",
        message: "A_YT_ACQUIRE requires exactly one of --url / --playlist / --single-file",
      });
    }
    if (sources.length > 1) {
      throw pipelineError({
        code: "AMBIGUOUS_SOURCE",
        category: "validation",
        retryable: false,
        action: "A_YT_ACQUIRE",
        message: "A_YT_ACQUIRE requires exactly one of --url / --playlist / --single-file",
        detail: { provided: { url, playlist, single_file } },
      });
    }
    if (!out_dir) {
      throw pipelineError({
        code: "MISSING_OUT_DIR",
        category: "validation",
        retryable: false,
        action: "A_YT_ACQUIRE",
        message: "A_YT_ACQUIRE requires --out-dir",
      });
    }
    if (!ctx.capabilities.shell) {
      throw pipelineError({
        code: "NO_SHELL",
        category: "internal",
        retryable: false,
        action: "A_YT_ACQUIRE",
        message: "shell capability required",
      });
    }

    const sourceFlag = url
      ? `--url ${q(url)}`
      : playlist
        ? `--playlist ${q(playlist)}`
        : `--single-file ${q(single_file!)}`;
    const idFlag = video_id ? `--video-id ${q(video_id)}` : "";
    const audioDirFlag = `--audio-dir ${q(resolveAudioDir(audio_dir as string | undefined))}`;

    const cmd = `python3 ${q(TRANSCRIBER)} ${sourceFlag} --out-dir ${q(out_dir)} ${audioDirFlag} ${idFlag} --json`;

    const r = await ctx.capabilities.shell(cmd, {
      timeoutMs: 600_000,
      abortSignal: ctx.abortSignal,
    });
    if (r.exitCode !== 0) {
      throw parseSubprocessError({
        cmd: "bulk_transcribe_youtube_videos_from_playlist.py",
        exitCode: r.exitCode,
        signal: r.signal,
        stderr: r.stderr,
        action: "A_YT_ACQUIRE",
        stage: "transcribe",
      });
    }

    const lines = r.stdout.trim().split(/\r?\n/);
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(lines[lines.length - 1]!);
    } catch (err) {
      throw pipelineError({
        code: "MANIFEST_PARSE_FAILED",
        category: "schema",
        retryable: false,
        action: "A_YT_ACQUIRE",
        message: "transcriber did not emit a JSON manifest on the final stdout line",
        detail: { stdoutTail: r.stdout.slice(-500) },
        cause: err,
      });
    }
    if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") {
      throw pipelineError({
        code: "MANIFEST_PARSE_FAILED",
        category: "schema",
        retryable: false,
        action: "A_YT_ACQUIRE",
        message: "transcriber final stdout line must be a JSON object manifest",
        detail: { parsedType: Array.isArray(manifest) ? "array" : typeof manifest },
      });
    }
    const missing = REQUIRED_MANIFEST_KEYS.filter((k) => !(k in manifest));
    if (missing.length > 0) {
      throw pipelineError({
        code: "MANIFEST_PARSE_FAILED",
        category: "schema",
        retryable: false,
        action: "A_YT_ACQUIRE",
        message: "transcriber manifest is missing required keys",
        detail: { missing, stdoutTail: r.stdout.slice(-500) },
      });
    }

    const transcriptPath = String(manifest.transcript_path ?? "");
    return {
      ...upstream,
      ...manifest,
      transcript_dir: (manifest.transcript_dir as string | undefined) ?? dirname(transcriptPath),
    } as Output;
  },
};

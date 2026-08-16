import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync } from "node:fs";
import action from "../action";
import type { ActionContext, ShellOptions, ShellResult } from "../../../../../../video-pipeline/reel/lib/actionContext";

const ORIG_CWD = process.cwd();
const FAKE_PROJECT_DIR = "/tmp/fake-cc-agent-ui-project";

interface Captured {
  cmd: string;
  opts?: ShellOptions;
}

function makeCtx(captured: Captured): ActionContext {
  return {
    abortSignal: new AbortController().signal,
    capabilities: {
      shell: async (cmd: string, opts?: ShellOptions): Promise<ShellResult> => {
        captured.cmd = cmd;
        captured.opts = opts;
        return {
          stdout: JSON.stringify({
            video_id: "x",
            source_url: "https://y/v",
            audio_path: "/x.mp4",
            transcript_path: "/x.txt",
            transcript_json_path: "/x.json",
            transcript_dir: "/",
            words_path: "/x.words.json",
            duration_s: 1.0,
          }),
          stderr: "",
          exitCode: 0,
          signal: null,
          durationMs: 12,
        };
      },
    },
  };
}

beforeEach(() => {
  mkdirSync(FAKE_PROJECT_DIR, { recursive: true });
  process.chdir(FAKE_PROJECT_DIR);
});

afterEach(() => {
  process.chdir(ORIG_CWD);
});

describe("A_YT_ACQUIRE --audio-dir injection", () => {
  it("B5: passes --audio-dir resolved from action CWD when input.audio_dir unset", async () => {
    const captured: Captured = { cmd: "" };
    await action.execute(
      { url: "https://youtube.com/watch?v=x", out_dir: "/tmp/out" },
      makeCtx(captured),
    );
    expect(captured.cmd).toContain(`--audio-dir "${FAKE_PROJECT_DIR}/transcribe-artifacts/audio"`);
  });

  it("B6: input.audio_dir override beats CWD default", async () => {
    const captured: Captured = { cmd: "" };
    await action.execute(
      { url: "https://youtube.com/watch?v=x", out_dir: "/tmp/out", audio_dir: "/custom/audio" },
      makeCtx(captured),
    );
    expect(captured.cmd).toContain(`--audio-dir "/custom/audio"`);
    expect(captured.cmd).not.toContain(`${FAKE_PROJECT_DIR}/transcribe-artifacts/audio`);
  });

  it("B6 edge: empty-string audio_dir falls back to CWD default", async () => {
    const captured: Captured = { cmd: "" };
    await action.execute(
      { url: "https://youtube.com/watch?v=x", out_dir: "/tmp/out", audio_dir: "" },
      makeCtx(captured),
    );
    expect(captured.cmd).toContain(`--audio-dir "${FAKE_PROJECT_DIR}/transcribe-artifacts/audio"`);
  });

  it("B5: --audio-dir flag is properly shell-quoted via q() helper", async () => {
    const captured: Captured = { cmd: "" };
    await action.execute(
      { url: "https://youtube.com/watch?v=x", out_dir: "/tmp/out", audio_dir: "/path with spaces/audio" },
      makeCtx(captured),
    );
    // q() returns JSON-quoted string — double quotes around the path
    expect(captured.cmd).toContain(`--audio-dir "/path with spaces/audio"`);
  });
});

import { describe, it, expect } from "bun:test";

import action from "./action";

// The compose CLI exits 1 (UNHANDLED) on a thrown PipelineError (e.g.
// MEDIA_VIDEO_NOT_FOUND) and writes the actionable message to stderr. The
// action must surface that stderr in the thrown error's MESSAGE — runAction
// returns err.message to the bridge, which renders it in the descriptor the
// UI shows. A generic "exited 1 (UNHANDLED)" hides the cause from support.
const STDERR_SAMPLE =
  'UNHANDLED: PipelineError[MEDIA_VIDEO_NOT_FOUND]: Source video missing at ' +
  '/home/cloudcli/Dev/cosmic-agent-memory/media/videos/kc_bakers_words_of_wisdom.mp4.';

function ctxWith(shellResult: {
  stdout: string;
  stderr: string;
  exitCode: number;
}) {
  return {
    capabilities: {
      shell: async () => ({ signal: null, code: shellResult.exitCode, ...shellResult }),
    },
    env: { mode: "native" },
  } as never;
}

const INPUT = {
  brief: "b",
  store: "surface-error-test",
  corpus_root: "/tmp/corpus",
  transcript_dir: "/tmp/td",
};

describe("A_REEL_COMPOSE — surfaces the real stderr on failure", () => {
  it("exit 1 (UNHANDLED): thrown message includes the stderr cause", async () => {
    try {
      await action.execute(INPUT, ctxWith({ stdout: "", stderr: STDERR_SAMPLE, exitCode: 1 }));
      throw new Error("expected throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("MEDIA_VIDEO_NOT_FOUND");
      expect(msg).toContain("media/videos/kc_bakers_words_of_wisdom.mp4");
    }
  });

  it("exit 0 but no JSON summary: thrown message includes stderr + stdout tail", async () => {
    try {
      await action.execute(
        INPUT,
        ctxWith({ stdout: "some non-json log line", stderr: STDERR_SAMPLE, exitCode: 0 }),
      );
      throw new Error("expected throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("MEDIA_VIDEO_NOT_FOUND");
    }
  });
});

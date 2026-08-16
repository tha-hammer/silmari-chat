import { describe, expect, it, spyOn } from "bun:test";

import action from "../action";

function streamFromString(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

const INPUT = {
  brief: "test brief",
  store: "action-stream-test",
  corpus_root: "/tmp/corpus",
  transcript_dir: "/tmp/transcripts",
};

function summaryLine(status: "pass" | "warn" | "fail" | "clarify"): string {
  return JSON.stringify({
    plan_path: "/tmp/plan.json",
    status,
    clip_count: 3,
    walk_summary: {},
    cross_video_candidates_count: 0,
    warnings: [],
  }) + "\n";
}

describe("A_REEL_COMPOSE progress streaming", () => {
  it("forwards _progress stderr lines to onProgress observer", async () => {
    const events: Array<{ operation: string; phase: string; pct?: number }> = [];
    const spawn = spyOn(Bun, "spawn").mockImplementation(() => {
      const stderrText =
        `non-progress line\n` +
        `{"_progress":{"operation":"compose","phase":"seed_resolved"}}\n` +
        `{"_progress":{"operation":"compose","phase":"walk_complete","pct":0.4}}\n` +
        `{"_progress":{"operation":"compose","phase":"intro_outro_selected"}}\n` +
        `{"_progress":{"operation":"compose","phase":"preview_started"}}\n` +
        `{"_progress":{"operation":"compose","phase":"preview_complete","pct":1}}\n`;
      return {
        stdout: streamFromString(summaryLine("pass")),
        stderr: streamFromString(stderrText),
        exited: Promise.resolve(0),
      } as never;
    });

    try {
      const out = await action.execute(INPUT, {
        capabilities: {
          shell: async () => {
            throw new Error("shell should not be called when onProgress is set");
          },
        },
        env: { mode: "local" },
        onProgress: (event) => {
          events.push(event as never);
        },
      } as never);

      expect(out.status).toBe("pass");
      expect(events.map((e) => e.phase)).toEqual([
        "seed_resolved",
        "walk_complete",
        "intro_outro_selected",
        "preview_started",
        "preview_complete",
      ]);
      expect(events[1]?.pct).toBe(0.4);
      expect(events[4]?.pct).toBe(1);
      expect(spawn).toHaveBeenCalledTimes(1);
    } finally {
      spawn.mockRestore();
    }
  });

  it("keeps compose exit semantics unchanged on streaming path", async () => {
    const spawn = spyOn(Bun, "spawn").mockImplementation(() => {
      return {
        stdout: streamFromString(summaryLine("fail")),
        stderr: streamFromString(`{"_progress":{"operation":"compose","phase":"seed_resolved"}}\n`),
        exited: Promise.resolve(2),
      } as never;
    });

    try {
      const out = await action.execute(INPUT, {
        capabilities: {
          shell: async () => {
            throw new Error("shell should not be called when onProgress is set");
          },
        },
        env: { mode: "local" },
        onProgress: () => {},
      } as never);
      expect(out.status).toBe("fail");
      expect(out.plan_path).toBe("/tmp/plan.json");
    } finally {
      spawn.mockRestore();
    }
  });

  it("B13: keeps non-observer path semantics unchanged (exit 3 clarify via shell)", async () => {
    const spawn = spyOn(Bun, "spawn");
    const shellCalls: string[] = [];
    const clarifySummary = JSON.stringify({
      plan_path: "/tmp/plan.json",
      status: "clarify",
      clip_count: 0,
      walk_summary: {},
      cross_video_candidates_count: 0,
      clarify: {
        rephrased_briefs: ["a", "b", "c"],
        weak_match_cards: [],
        question: "which angle?",
      },
      warnings: [],
    }) + "\n";

    try {
      const out = await action.execute(INPUT, {
        capabilities: {
          shell: async (cmd: string) => {
            shellCalls.push(cmd);
            return {
              stdout: clarifySummary,
              stderr: "",
              exitCode: 3,
              signal: null,
              durationMs: 1,
            };
          },
        },
        env: { mode: "local" },
      } as never);

      expect(spawn).not.toHaveBeenCalled();
      expect(shellCalls).toHaveLength(1);
      expect(shellCalls[0]).toContain("compose");
      expect(out.status).toBe("clarify");
      expect(out.clarify?.question).toBe("which angle?");
    } finally {
      spawn.mockRestore();
    }
  });
});

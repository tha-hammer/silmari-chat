import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  unlinkSync,
  constants as fsConstants,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ActionContext } from "../../../../../../video-pipeline/reel/lib/actionContext";
import {
  pipelineError,
  parseSubprocessError,
} from "../../../../../../video-pipeline/reel/lib/pipelineError";
import {
  silmariStoreBinaryPath,
  silmariStoreVersion,
} from "../../../../../../video-pipeline/reel/silmariStoreBinary";

interface Input {
  video_id: string;
  extracted_dir: string;
  card_graph_path?: string;
  [k: string]: unknown;
}

interface Output {
  video_id: string;
  card_graph_path: string;
  ingest_report_path: string;
  cards_saved: number;
  [k: string]: unknown;
}

const COSMIC_VIDEO_STORE = resolve(
  process.env.COSMIC_VIDEO_STORE
    ?? `${process.env.HOME}/Dev/cosmic-agent-memory/apps/video-pipeline/data/store`,
);
const CASCADE_INGEST_ENTRY = process.env.CASCADE_INGEST_ENTRY
  ?? `${process.env.HOME}/Dev/cosmic-agent-memory/apps/video-pipeline/cascade/ingest/ingest-cascade.ts`;

function q(s: string): string {
  return JSON.stringify(s);
}

/**
 * Atomically initialize the per-video DB.
 *
 * Race: a naïve `existsSync(db) || init(db)` is TOCTOU-vulnerable when two
 * concurrent playlist workers race to init the same per-video DB. We close the
 * race via an O_EXCL sentinel file. The first writer wins, runs `init`, and
 * removes the sentinel. Losers poll for DB existence (bounded by 30 s).
 */
async function initDbIfNeeded(
  ctx: ActionContext,
  bin: string,
  dbPath: string,
): Promise<void> {
  if (existsSync(dbPath)) return;
  mkdirSync(dirname(dbPath), { recursive: true });
  const lock = `${dbPath}.init.lock`;
  let acquired = false;
  try {
    const fd = openSync(
      lock,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o644,
    );
    closeSync(fd);
    acquired = true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code !== "EEXIST") throw err;
    const deadlineMs = Date.now() + 30_000;
    while (!existsSync(dbPath) && Date.now() < deadlineMs) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!existsSync(dbPath)) {
      throw pipelineError({
        code: "INIT_LOCK_TIMEOUT",
        category: "concurrency",
        retryable: true,
        action: "A_CASCADE_INGEST",
        stage: "init",
        message: `init lock held >30s for ${dbPath}`,
      });
    }
    return;
  }
  try {
    const r = await ctx.capabilities.shell(
      `${q(bin)} init --db ${q(dbPath)} --json`,
      { timeoutMs: 20_000, abortSignal: ctx.abortSignal },
    );
    if (r.exitCode !== 0) {
      throw parseSubprocessError({
        cmd: "silmari-store init",
        exitCode: r.exitCode,
        signal: r.signal,
        stderr: r.stderr,
        action: "A_CASCADE_INGEST",
        stage: "init",
      });
    }
  } finally {
    if (acquired) {
      try {
        unlinkSync(lock);
      } catch {
        /* lock already gone */
      }
    }
  }
}

export default {
  async execute(input: Input, ctx: ActionContext): Promise<Output> {
    const { video_id, extracted_dir, card_graph_path, ...upstream } = input;
    for (const [k, v] of Object.entries({ video_id, extracted_dir })) {
      if (!v) {
        throw pipelineError({
          code: "MISSING_REQUIRED",
          category: "validation",
          retryable: false,
          action: "A_CASCADE_INGEST",
          message: `A_CASCADE_INGEST requires ${k}`,
        });
      }
    }
    if (!ctx.capabilities.shell) {
      throw pipelineError({
        code: "NO_SHELL",
        category: "internal",
        retryable: false,
        action: "A_CASCADE_INGEST",
        message: "shell capability required",
      });
    }

    const dbPath = resolve(
      card_graph_path ?? join(COSMIC_VIDEO_STORE, `${video_id}.card-graph.sqlite`),
    );
    const bin = await silmariStoreBinaryPath();
    await initDbIfNeeded(ctx, bin, dbPath);

    const reportPath = join(extracted_dir, `${video_id}.ingest-report.jsonl`);
    const cmd =
      `SILMARI_STORE_BINARY=${q(bin)} ` +
      `SILMARI_MEMORY_DB=${q(dbPath)} ` +
      `CASCADE_ENRICHMENT_MODE=${q(process.env.CASCADE_ENRICHMENT_MODE ?? "off")} ` +
      `bun ${q(CASCADE_INGEST_ENTRY)} ` +
      `--extracted-dir ${q(extracted_dir)} ` +
      `--video-id ${q(video_id)} ` +
      `--report ${q(reportPath)}`;

    const r = await ctx.capabilities.shell(cmd, {
      timeoutMs: 300_000,
      abortSignal: ctx.abortSignal,
    });
    if (r.exitCode !== 0) {
      throw parseSubprocessError({
        cmd: "ingest-cascade.ts",
        exitCode: r.exitCode,
        signal: r.signal,
        stderr: r.stderr,
        action: "A_CASCADE_INGEST",
        stage: "ingest",
      });
    }

    let cards_saved = 0;
    if (existsSync(reportPath)) {
      const lines = readFileSync(reportPath, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
      const last = lines[lines.length - 1];
      try {
        const tail = last ? JSON.parse(last) : null;
        cards_saved =
          tail && tail.trailer === true && typeof tail.cards_saved === "number"
            ? tail.cards_saved
            : lines.length;
      } catch {
        cards_saved = lines.length;
      }
    }

    // Embed silmari-store version for downstream provenance.
    await silmariStoreVersion().catch(() => undefined);

    return {
      ...upstream,
      video_id,
      card_graph_path: dbPath,
      ingest_report_path: reportPath,
      cards_saved,
    };
  },
};

import { describe, it, expect } from "bun:test";

import { createShellCapability } from "./runner.v2";

// Regression: the shell capability used to return `{code}` and drop stdout on
// non-zero exit. Every action reads `r.exitCode` (ActionContext contract), so
// `r.exitCode` was always undefined → "subprocess exited undefined" on every
// shell call, even successful ones. And fail/clarify summaries (parsed from
// stdout on exit 2/3) were lost because stdout was "" on non-zero.
describe("runner.v2 shell capability — ActionContext ShellResult contract", () => {
  const shell = createShellCapability();

  it("exit 0: exitCode is 0 (not undefined) and stdout is captured", async () => {
    const r = await shell("echo hello-world");
    expect(r.exitCode).toBe(0);
    expect(r.code).toBe(0);
    expect(r.signal).toBeNull();
    expect(r.stdout).toContain("hello-world");
  });

  it("non-zero exit: returns the real exitCode AND preserves stdout", async () => {
    const r = await shell("echo partial-summary-line; exit 2");
    expect(r.exitCode).toBe(2); // regression guard: was undefined
    expect(r.code).toBe(2);
    expect(r.stdout).toContain("partial-summary-line"); // regression guard: was ""
  });

  it("captures stderr on failure", async () => {
    const r = await shell("echo oops 1>&2; exit 1");
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("oops");
  });
});

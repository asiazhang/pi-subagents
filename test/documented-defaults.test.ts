// README publishes concrete default values (Persistent settings, README:250).
// Every existing test that looked like it checked one actually SET the value
// first — `test/agent-runner-settings.test.ts` had a `beforeEach(setGraceTurns(5))`
// followed by `it("defaults to 5")`, which asserts the setter, not the default.
//
// The defaults live in module-level `let`s that the settings appliers overwrite
// at boot, so reading them after any other suite has run tells you nothing.
// `vi.resetModules()` + a dynamic import gives a genuinely fresh module, which
// is why this lives in its own file: resetModules is file-wide and hostile to
// suites that hold module references across tests.

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("documented defaults (README:250)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // src/agent-runner.js pulls in the whole pi-coding-agent graph, and
  // `server.deps.inline` means resetModules re-transforms all of it — several
  // seconds under a loaded full run, versus instant in isolation. The default
  // 5s timeout makes these two flaky, so they get an explicit generous one
  // rather than a retry.
  const HEAVY_REIMPORT_MS = 60_000;

  it("grace turns after the soft limit default to 5", async () => {
    const { getGraceTurns } = await import("../src/agent-runner.js");
    expect(getGraceTurns()).toBe(5);
  }, HEAVY_REIMPORT_MS);

  it("max turns is unlimited by default", async () => {
    const { getDefaultMaxTurns } = await import("../src/agent-runner.js");
    expect(getDefaultMaxTurns()).toBeUndefined();
  }, HEAVY_REIMPORT_MS);

  // Raised from 4 when top-level spawns started defaulting to background:
  // foreground bypasses the pool entirely, so a limit tuned for opt-in
  // background would now queue the tail of ordinary parallel fan-outs.
  it("background concurrency defaults to 10", async () => {
    const { AgentManager } = await import("../src/agent-manager.js");
    const manager = new AgentManager();
    try {
      expect(manager.getMaxConcurrent()).toBe(10);
    } finally {
      manager.dispose();
    }
  });

  it("unqualified spawns follow the caller's defaultRunInBackground", async () => {
    const { resolveAgentInvocationConfig } = await import("../src/invocation-config.js");
    // The setting's default (true) is what index.ts passes for top-level calls.
    expect(resolveAgentInvocationConfig(undefined, {}, { defaultRunInBackground: true }).runInBackground).toBe(true);
    // A caller defaulting to foreground (backgroundByDefault off) passes false.
    expect(resolveAgentInvocationConfig(undefined, {}, { defaultRunInBackground: false }).runInBackground).toBe(false);
    // An explicit param still wins over either default.
    expect(resolveAgentInvocationConfig(undefined, { run_in_background: false }, { defaultRunInBackground: true }).runInBackground).toBe(false);
    expect(resolveAgentInvocationConfig(undefined, { run_in_background: true }, { defaultRunInBackground: false }).runInBackground).toBe(true);
  });
});

/**
 * agent-runner-e2e.test.ts — End-to-end test against the REAL pi-mono runtime.
 *
 * Every other agent-runner test mocks `@earendil-works/pi-coding-agent`: it
 * asserts that `runAgent` hands the right `excludeTools` denylist to a
 * *simulated* `createAgentSession`. That proves our scope math, but not the
 * assumption the math rests on — that real pi-mono actually gates a session to
 * that scope, admitting extension-registered tools and dropping the rest.
 *
 * This test closes that loop with NO pi-mono mock:
 *   - a real inline extension fixture registers a tool,
 *   - the real `DefaultResourceLoader` discovers and loads it,
 *   - the real `createAgentSession` builds the session,
 *   - we read the real `session.getActiveToolNames()` at `onSessionCreated`
 *     (fires after construction, before any prompt) and assert what the LLM
 *     would actually be allowed to call.
 *
 * No network/LLM: a faux Model object satisfies `createAgentSession`'s `model`
 * param, and we never depend on a turn completing — the assertion is on the
 * gated tool set, which is fixed at construction. (Driving a live faux model
 * through `session.prompt()` is intentionally avoided: under Vite the faux
 * provider registers in a different `pi-ai` module instance than the one
 * pi-coding-agent streams through, which is brittle and orthogonal to gating.)
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "../src/agent-runner.js";
import { registerFauxProvider } from "./helpers/pi-ai.js";

// These tests spin up the REAL pi-mono runtime (loader + dynamic extension
// import + session construction), so a cold first run under full-suite CPU
// contention can exceed vitest's 5s default. Give the file generous headroom —
// a genuine hang still fails, just later.
vi.setConfig({ testTimeout: 30_000 });

/** The fixture registers exactly this tool. */
const EXT_TOOL = "e2e_probe";
const BUILTINS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const EXPLORE_TOOLS = ["read", "bash", "grep", "find", "ls"];

/** Minimal `pi` stub — `detectEnv` only needs `exec` (returns non-git). */
function makePi() {
  return { exec: async () => ({ code: 1, stdout: "", stderr: "" }) } as any;
}

describe("agent-runner end-to-end (real pi-mono session + real extension)", () => {
  let cwd: string;
  let faux: ReturnType<typeof registerFauxProvider>;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "subagents-e2e-"));
    // pi discovers project extensions from <cwd>/.pi/extensions/ — install the
    // probe there so the REAL loader discovers and loads it. Inline content with
    // no bare imports: a file under /tmp cannot resolve the repo's node_modules,
    // and the tool schema is a plain JSON-Schema object, so none are needed.
    mkdirSync(join(cwd, ".pi", "extensions"), { recursive: true });
    writeFileSync(
      join(cwd, ".pi", "extensions", "package.json"),
      JSON.stringify({ type: "module" }),
    );
    writeFileSync(
      join(cwd, ".pi", "extensions", "e2e-probe.js"),
      [
        "export default function (pi) {",
        "  pi.registerTool({",
        '    name: "e2e_probe",',
        '    label: "E2E Probe",',
        '    description: "Probe tool for the end-to-end test.",',
        '    parameters: { type: "object", properties: {} },',
        "    async execute() {",
        '      return { content: [{ type: "text", text: "probed" }] };',
        "    },",
        "  });",
        "}",
      ].join("\n"),
    );
    // Only used as a valid Model object for createAgentSession; we never rely
    // on it actually streaming (we assert on the pre-prompt gated tool set).
    faux = registerFauxProvider({ provider: "faux", models: [{ id: "faux-1", contextWindow: 200_000 }] });
  });
  afterEach(() => {
    faux.unregister();
    rmSync(cwd, { recursive: true, force: true });
  });

  /**
   * Run `type` through the REAL runAgent in `cwd` (where the fixture extension
   * is discovered) and return the real session's active tool names captured at
   * construction time, plus the session for veto probing.
   */
  async function runType(type: string): Promise<{ active: string[]; session: any }> {
    const model = faux.getModel();
    const modelRegistry: any = {
      find: () => model,
      getAll: () => [model],
      getAvailable: () => [model],
      hasConfiguredAuth: () => true,
      isUsingOAuth: () => false,
      getApiKeyAndHeaders: async () => ({ apiKey: "faux", headers: {} }),
      registerProvider: () => {},
      unregisterProvider: () => {},
    };
    const ctx: any = { cwd, getSystemPrompt: () => "PARENT", model, modelRegistry };

    let active: string[] = [];
    let session: any;
    try {
      await runAgent(ctx, type, "go", {
        pi: makePi(),
        model,
        onSessionCreated: (s) => {
          session = s;
          active = s.getActiveToolNames();
        },
      });
    } catch {
      // A no-op/erroring prompt turn is fine — the gated tool set is fixed at
      // construction, which `onSessionCreated` already captured.
    }
    return { active, session };
  }

  it("real pi-mono admits an extension-registered tool for a type without a tool list (#47)", async () => {
    const { active } = await runType("general-purpose");
    // The extension actually loaded and its tool reached the live session.
    expect(active).toContain(EXT_TOOL);
    for (const b of BUILTINS) expect(active).toContain(b);
    // This extension's own orchestration tools never reach a subagent.
    expect(active).not.toContain("Agent");
  });

  it("a declared tool list is exact: the extension tool is absent, the declared built-ins present", async () => {
    const { active } = await runType("Explore");
    expect(active).not.toContain(EXT_TOOL);
    for (const b of EXPLORE_TOOLS) expect(active).toContain(b);
    for (const b of ["edit", "write"]) expect(active).not.toContain(b);
  });

  it("the turn-1 veto blocks an out-of-scope extension tool on a declared-list type", async () => {
    const { session } = await runType("Explore");
    expect(session).toBeDefined();

    // Turn 1 cannot be narrowed by active-set re-derivation alone; the veto is
    // the guard. It must block the loaded-but-out-of-scope extension tool…
    await expect(
      session.agent.beforeToolCall({ toolCall: { name: EXT_TOOL }, args: {} }),
    ).resolves.toMatchObject({ block: true, reason: expect.any(String) });

    // …and pass an in-scope built-in through to pi's own hook unharmed.
    await expect(
      session.agent.beforeToolCall({ toolCall: { name: "read" }, args: {} }),
    ).resolves.toSatisfy((r: any) => !r?.block);
  });
});

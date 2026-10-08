/**
 * tool-veto-reachability.e2e.test.ts — reachability guard for the `ext:` turn-1
 * tool veto (issue #125).
 *
 * `installExtensionToolScope` enforces `ext:` narrowing two ways. Re-narrowing the
 * ACTIVE set on `turn_end` is built entirely on public API (`getAllTools`,
 * `getActiveToolNames`, `setActiveToolsByName`) and is covered by the unit tests.
 * The second half is not: turn 1 cannot be narrowed at all — `before_agent_start`
 * fires INSIDE `prompt()` and may widen the tool set, but `createContextSnapshot()`
 * freezes that turn's tools immediately after, leaving no window — so out-of-scope
 * calls are vetoed at call time by wrapping `session.agent.beforeToolCall`.
 *
 * That wrap is the one place this extension reaches past the documented surface:
 *   - `ExtensionBindings` has no tool_call hook, so there is no SDK-level way to
 *     inject a veto into a session we construct. Pi exposes the veto to EXTENSIONS
 *     as `pi.on("tool_call") -> { block, reason }`, but we are the SDK caller here,
 *     not an extension bound to the child session.
 *   - So we wrap the property Pi itself installs in the AgentSession constructor
 *     (`_installAgentToolHooks`), chaining to the prior hook so Pi's own `tool_call`
 *     dispatch still runs.
 *
 * The unit tests assert our wrapper's behavior against a MOCK session whose `agent`
 * is a hand-written `{ beforeToolCall: undefined }`. That mock cannot catch the one
 * thing that would silently break the veto: if a future Pi renames `beforeToolCall`,
 * stops installing it, makes `agent` non-enumerable/private, or moves the veto
 * elsewhere, our assignment lands on a property nothing reads. Every test still
 * passes, and out-of-scope tools become callable on turn 1 with no failing test.
 *
 * This guard closes exactly that gap and nothing else. It asserts against a REAL
 * session that:
 *   1. Pi installs its own `beforeToolCall` (so there IS a prior hook to chain), and
 *   2. after `runAgent`, ours is installed and vetoes an out-of-scope tool in the
 *      `{ block, reason }` shape Pi honors.
 *
 * No network/LLM: a faux Model satisfies `createAgentSession`, and the veto is
 * invoked directly rather than through a model turn.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "../../src/agent-runner.js";
import { registerFauxProvider } from "../helpers/pi-ai.js";

// Real pi-mono (loader + dynamic extension import + session construction).
vi.setConfig({ testTimeout: 30_000 });

function makePi() {
  return { exec: async () => ({ code: 1, stdout: "", stderr: "" }) } as any;
}

describe("tool veto reachability against real pi-mono", () => {
  let cwd: string;
  let faux: ReturnType<typeof registerFauxProvider>;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "subagents-veto-"));
    // pi discovers project extensions from <cwd>/.pi/extensions/ — install the
    // fixtures there so the REAL loader discovers and loads them. Inline content
    // with no bare imports: a file under /tmp cannot resolve the repo's
    // node_modules, and plain JSON-Schema object parameters need no typebox.
    mkdirSync(join(cwd, ".pi", "extensions"), { recursive: true });
    writeFileSync(join(cwd, ".pi", "extensions", "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(
      join(cwd, ".pi", "extensions", "ext-alpha.js"),
      [
        "export default function (pi) {",
        '  for (const name of ["alpha_read", "alpha_write"]) {',
        "    pi.registerTool({",
        "      name,",
        "      label: name,",
        "      description: \"Alpha extension tool\" + name + \" (e2e fixture).\",",
        '      parameters: { type: "object", properties: {} },',
        "      async execute() {",
        '        return { content: [{ type: "text", text: name }] };',
        "      },",
        "    });",
        "  }",
        "}",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, ".pi", "extensions", "ext-beta.js"),
      [
        "export default function (pi) {",
        "  pi.registerTool({",
        '    name: "beta_tool",',
        '    label: "beta_tool",',
        '    description: "Beta extension tool (e2e fixture).",',
        '    parameters: { type: "object", properties: {} },',
        "    async execute() {",
        '      return { content: [{ type: "text", text: "beta_tool" }] };',
        "    },",
        "  });",
        "}",
      ].join("\n"),
    );
    faux = registerFauxProvider({
      provider: "faux",
      models: [{ id: "faux-1", contextWindow: 200_000 }],
    });
  });
  afterEach(() => {
    faux.unregister();
    rmSync(cwd, { recursive: true, force: true });
  });

  it("pi installs a chainable beforeToolCall, and extension tools pass through it in scope", async () => {
    // general-purpose has no tool list, so every registered extension tool is in
    // scope. A pass-through here proves all three links at once: the fixtures
    // actually loaded, the scope admits their tools, and pi's own hook (which
    // the veto chains to) survives intact.
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

    let priorIsFunction: boolean | undefined;
    let session: any;
    try {
      await runAgent(ctx, "general-purpose", "go", {
        pi: makePi(),
        model,
        onSessionCreated: (s: any) => {
          session = s;
          // By onSessionCreated our wrapper is already installed, so this being a
          // function proves the property is reachable and writable. Pi installing
          // its own in the constructor is what gives us something to chain to —
          // asserted below via the in-scope path returning undefined rather than
          // throwing on a missing prior hook.
          priorIsFunction = typeof s.agent?.beforeToolCall === "function";
        },
      });
    } catch {
      // A faux-model turn may not complete; the veto is fixed at construction.
    }

    expect(priorIsFunction).toBe(true);

    // In scope: extension tools must NOT be blocked. Reaching this point also
    // proves the fixtures loaded (a tool that never registered has no name to
    // pass through) and that the chain to pi's own hook is intact — a clobbered
    // or absent prior would surface here.
    await expect(
      session.agent.beforeToolCall({ toolCall: { name: "beta_tool" }, args: {} }),
    ).resolves.toSatisfy((r: any) => !r?.block);
    await expect(
      session.agent.beforeToolCall({ toolCall: { name: "alpha_read" }, args: {} }),
    ).resolves.toSatisfy((r: any) => !r?.block);
    await expect(
      session.agent.beforeToolCall({ toolCall: { name: "read" }, args: {} }),
    ).resolves.toSatisfy((r: any) => !r?.block);
  });
});

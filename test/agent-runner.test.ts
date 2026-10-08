import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAgentSession,
  defaultResourceLoaderCtor,
  loaderExtensionsRef,
  getAgentDir,
  sessionManagerInMemory,
  settingsManagerCreate,
} = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  defaultResourceLoaderCtor: vi.fn(),
  loaderExtensionsRef: {
    current: { extensions: [], errors: [], runtime: {} } as {
      extensions: Array<{ path: string; tools: Map<string, unknown> }>;
      errors: Array<{ path: string; error: string }>;
      runtime: Record<string, unknown>;
    },
  },
  getAgentDir: vi.fn(() => "/mock/agent-dir"),
  sessionManagerInMemory: vi.fn(() => ({ kind: "memory-session-manager" })),
  settingsManagerCreate: vi.fn(() => ({ kind: "settings-manager" })),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession,
  // Identity, as pi's own is: `defineTool` exists for the type inference, and
  // the structured-output tool is built through it.
  defineTool: (definition: unknown) => definition,
  // Mock loader simulates pi-mono: reload() is a no-op over the pre-registered
  // extension set (tests seed `loaderExtensionsRef` directly).
  DefaultResourceLoader: class {
    opts: any;
    constructor(options: any) {
      this.opts = options;
      defaultResourceLoaderCtor(options);
    }

    async reload() {
      if (this.opts.extensionsOverride) {
        loaderExtensionsRef.current = this.opts.extensionsOverride(loaderExtensionsRef.current);
      }
    }

    getExtensions() {
      return loaderExtensionsRef.current;
    }
  },
  getAgentDir,
  SessionManager: { inMemory: sessionManagerInMemory },
  SettingsManager: { create: settingsManagerCreate },
}));

vi.mock("../src/agent-types.js", () => ({
  BUILTIN_TOOL_NAMES: ["read", "bash", "edit", "write", "grep", "find", "ls"],
  getConfig: vi.fn(() => ({
    name: "Explore",
    description: "Explore",
    builtinToolNames: ["read"],
    systemPrompt: "You are Explore.",
    promptMode: "replace",
  })),
  getAgentConfig: vi.fn(() => ({
    name: "Explore",
    description: "Explore",
    builtinToolNames: ["read"],
    systemPrompt: "You are Explore.",
    promptMode: "replace",
  })),
}));

vi.mock("../src/env.js", () => ({
  detectEnv: vi.fn(async () => ({ isGitRepo: false, branch: "", platform: "linux" })),
}));

vi.mock("../src/prompts.js", () => ({
  buildAgentPrompt: vi.fn(() => "system prompt"),
}));

import {
  getAgentConversation,
  getDefaultMaxTurns,
  getGraceTurns,
  resolveDefaultModel,
  resolveEffectiveMaxTurns,
  runAgent,
  setDefaultMaxTurns,
  setGraceTurns,
} from "../src/agent-runner.js";
import { getAgentConfig, getConfig } from "../src/agent-types.js";

/** The most recent session built by `createSession` — read by `lastToolsPassed()`. */
let lastSession: ReturnType<typeof createSession>["session"] | undefined;

function createSession(finalText: string) {
  const listeners: Array<(event: any) => void> = [];
  // pi activates only these four by default when no allowlist is given
  // (agent-session.js `defaultActiveToolNames`).
  let activeToolNames: string[] = ["read", "bash", "edit", "write"];
  const session = {
    messages: [] as any[],
    subscribe: vi.fn((listener: (event: any) => void) => {
      listeners.push(listener);
      return () => {};
    }),
    prompt: vi.fn(async () => {
      session.messages.push({
        role: "assistant",
        content: [{ type: "text", text: finalText }],
      });
    }),
    abort: vi.fn(),
    steer: vi.fn(),
    // Stateful, so the active set reflects what the scope installer actually did
    // and `renarrow`'s no-op guard behaves as it does against real pi.
    getActiveToolNames: vi.fn(() => activeToolNames),
    setActiveToolsByName: vi.fn((names: string[]) => {
      activeToolNames = [...names];
    }),
    // pi's tool REGISTRY (`_toolDefinitions`), read live so tests can simulate an
    // extension registering after bind by mutating `loaderExtensionsRef`.
    getAllTools: vi.fn(() => {
      const opts = createAgentSession.mock.calls[0]?.[0];
      return opts ? mockRegistry(opts).map((name) => ({ name })) : [];
    }),
    // pi's Agent; `beforeToolCall` is an optional, assignable hook the scope
    // installer wraps to block out-of-scope calls on turn 1.
    agent: { beforeToolCall: undefined } as {
      beforeToolCall?: (context: any, signal?: any) => Promise<any>;
    },
    setSessionName: vi.fn(),
    bindExtensions: vi.fn(async () => {}),
  };
  lastSession = session;
  return { session, listeners };
}

const ctx = {
  cwd: "/tmp",
  model: undefined,
  modelRegistry: { find: vi.fn(), getAvailable: vi.fn(() => []) },
  getSystemPrompt: vi.fn(() => "parent prompt"),
  sessionManager: {
    getBranch: vi.fn(() => []),
    getSessionFile: vi.fn(() => "/sessions/parent.jsonl"),
  },
} as any;

const pi = {} as any;

const BUILTINS_7 = ["read", "bash", "edit", "write", "grep", "find", "ls"];
/** Names runAgent permanently excludes from every subagent: this extension's own tools. */
const EXCLUDED_3 = ["Agent", "get_subagent_result", "steer_subagent"];

function makeAgentConfig(overrides: Record<string, unknown> = {}) {
  return {
    name: "test-agent",
    description: "Test",
    builtinToolNames: BUILTINS_7,
    systemPrompt: "Test.",
    promptMode: "replace" as const,
    ...overrides,
  };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    name: "test-agent",
    description: "Test",
    builtinToolNames: BUILTINS_7,
    systemPrompt: "Test.",
    promptMode: "replace" as const,
    ...overrides,
  };
}

/** Register extensions for the mock loader, keyed by extension path → tool names. */
function withExtensions(spec: Record<string, string[]>) {
  loaderExtensionsRef.current = {
    extensions: Object.entries(spec).map(([path, tools]) => ({
      path,
      tools: new Map(tools.map((n) => [n, {}])),
    })),
    errors: [],
    runtime: {},
  };
}

/**
 * The tool REGISTRY pi would build for a given `createAgentSession` call —
 * mirroring `_refreshToolRegistry`'s `isAllowedTool`: every built-in plus every
 * loaded extension tool, minus `excludeTools`, and it keeps growing as
 * extensions register later. Read live from `loaderExtensionsRef`, so a test can
 * simulate late registration.
 */
function mockRegistry(opts: Record<string, any>): string[] {
  const excluded = new Set<string>(opts.excludeTools ?? []);
  const all: string[] = [
    ...BUILTINS_7,
    ...loaderExtensionsRef.current.extensions.flatMap((e) => [...e.tools.keys()]),
  ];
  return [...new Set(all)].filter((t) => !excluded.has(t));
}

/**
 * What the LLM can actually call: the registry is scoped by `excludeTools` and
 * then narrowed to the ACTIVE set by the scope installer — so the active set is
 * the real answer, and asserting on it means these tests exercise the narrowing
 * rather than a reimplementation of pi's gate.
 */
function lastToolsPassed(): string[] {
  return lastSession?.getActiveToolNames() ?? [];
}

beforeEach(() => {
  createAgentSession.mockReset();
  defaultResourceLoaderCtor.mockClear();
  getAgentDir.mockClear();
  sessionManagerInMemory.mockClear();
  settingsManagerCreate.mockClear();
  loaderExtensionsRef.current = { extensions: [], errors: [], runtime: {} };
  lastSession = undefined;
});

describe("agent-runner final output capture", () => {
  it("returns the final assistant text even when no text_delta events were streamed", async () => {
    const { session } = createSession("LOCKED");
    createAgentSession.mockResolvedValue({ session });

    const result = await runAgent(ctx, "Explore", "go", { pi });

    expect(result.responseText).toBe("LOCKED");
    expect(result.aborted).toBe(false);
    expect(result.steered).toBe(false);
  });

  it("assembles streamed text deltas into the response", async () => {
    const { session, listeners } = createSession("");
    createAgentSession.mockResolvedValue({ session });
    session.prompt.mockImplementation(async () => {
      for (const l of [...listeners]) {
        l({
          type: "message_start",
          message: { role: "assistant", content: [] },
        });
        l({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "HE" },
        });
        l({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "LLO" },
        });
      }
    });

    const result = await runAgent(ctx, "Explore", "go", { pi });
    expect(result.responseText).toBe("HELLO");
  });
  it("returns an empty result for a session that produced nothing", async () => {
    const { session } = createSession("");
    createAgentSession.mockResolvedValue({ session });

    const result = await runAgent(ctx, "Explore", "go", { pi });
    expect(result.responseText).toBe("");
  });
});

describe("agent-runner failed-final-turn detection (#144)", () => {
  function sessionWithMessages(messages: any[]) {
    const { session } = createSession("");
    // The messages land DURING the run (as a real turn would produce them) —
    // the walk-back in finalTurnError only judges turns produced after the
    // run started, so pre-seeded history is invisible to it.
    session.prompt.mockImplementation(async () => {
      session.messages.push(...messages);
    });
    return session;
  }

  it("flags a provider-error final turn as a failure", async () => {
    const session = sessionWithMessages([
      { role: "assistant", content: [{ type: "text", text: "earlier" }], stopReason: "stop" },
      { role: "assistant", content: [{ type: "text", text: "partial" }], stopReason: "error", errorMessage: "boom" },
    ]);
    createAgentSession.mockResolvedValue({ session });

    const result = await runAgent(ctx, "Explore", "go", { pi });
    expect(result.failure).toBe("boom");
  });

  it("flags a length-stop final turn with no text as a failure", async () => {
    const session = sessionWithMessages([
      { role: "assistant", content: [{ type: "text", text: "earlier" }], stopReason: "stop" },
      { role: "assistant", content: [{ type: "text", text: "" }], stopReason: "length" },
    ]);
    createAgentSession.mockResolvedValue({ session });

    const result = await runAgent(ctx, "Explore", "go", { pi });
    expect(result.failure).toContain("output token limit");
  });

  it("does NOT flag a length-stop final turn that produced text (legit truncation)", async () => {
    const session = sessionWithMessages([
      { role: "assistant", content: [{ type: "text", text: "truncated but real" }], stopReason: "length" },
    ]);
    createAgentSession.mockResolvedValue({ session });

    const result = await runAgent(ctx, "Explore", "go", { pi });
    expect(result.failure).toBeUndefined();
  });

  it("does not let a failed EARLIER turn mark the run failed once a clean turn followed", async () => {
    const session = sessionWithMessages([
      { role: "assistant", content: [{ type: "text", text: "bad" }], stopReason: "error", errorMessage: "boom" },
      { role: "assistant", content: [{ type: "text", text: "recovered" }], stopReason: "stop" },
    ]);
    createAgentSession.mockResolvedValue({ session });

    const result = await runAgent(ctx, "Explore", "go", { pi });
    expect(result.failure).toBeUndefined();
  });

  it("reports a provider error with no message as a generic failure", async () => {
    const session = sessionWithMessages([
      { role: "assistant", content: [], stopReason: "error" },
    ]);
    createAgentSession.mockResolvedValue({ session });

    const result = await runAgent(ctx, "Explore", "go", { pi });
    expect(result.failure).toContain("provider error");
  });
});

describe("agent-runner usage callback wiring", () => {
  it("forwards assistant message_end usage deltas to onAssistantUsage", async () => {
    const onAssistantUsage = vi.fn();
    const { session, listeners } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    // Seed the listener list BEFORE prompt() so the run's own subscription is present.
    session.prompt.mockImplementation(async () => {
      for (const l of [...listeners]) {
        l({
          type: "message_end",
          message: {
            role: "assistant",
            usage: { input: 10, output: 5, cacheWrite: 2, cacheRead: 100, cost: { total: 0.25 } },
          },
        });
      }
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
    });

    await runAgent(ctx, "Explore", "go", { pi, onAssistantUsage });

    expect(onAssistantUsage).toHaveBeenCalledWith({
      input: 10,
      output: 5,
      cacheWrite: 2,
      cacheRead: 100,
      cost: 0.25,
    });
  });

  it("does not fire for user or toolResult message_end events", async () => {
    const onAssistantUsage = vi.fn();
    const { session, listeners } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    session.prompt.mockImplementation(async () => {
      for (const l of [...listeners]) {
        l({ type: "message_end", message: { role: "user", content: "hi" } });
        l({ type: "message_end", message: { role: "toolResult", content: "out" } });
      }
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
    });

    await runAgent(ctx, "Explore", "go", { pi, onAssistantUsage });

    expect(onAssistantUsage).not.toHaveBeenCalled();
  });

  it("coerces missing usage fields to zeros", async () => {
    const onAssistantUsage = vi.fn();
    const { session, listeners } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    session.prompt.mockImplementation(async () => {
      for (const l of [...listeners]) {
        l({ type: "message_end", message: { role: "assistant", usage: { input: 3 } } });
      }
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
    });

    await runAgent(ctx, "Explore", "go", { pi, onAssistantUsage });

    expect(onAssistantUsage).toHaveBeenCalledWith({
      input: 3,
      output: 0,
      cacheWrite: 0,
      cacheRead: 0,
      cost: 0,
    });
  });
});

describe("getAgentConversation", () => {
  function msg(overrides: Record<string, unknown>) {
    return { role: "user", content: "x", ...overrides } as any;
  }

  it("formats user, assistant, tool calls, and truncated tool results", () => {
    const { session } = createSession("");
    session.messages.push(
      msg({ role: "user", content: "do the thing" }),
      msg({
        role: "assistant",
        content: [
          { type: "text", text: "on it" },
          { type: "toolCall", name: "read" },
        ],
      }),
      msg({ role: "toolResult", toolName: "read", content: [{ type: "text", text: "x".repeat(300) }] }),
    );

    const text = getAgentConversation(session as any);
    expect(text).toContain("[User]: do the thing");
    expect(text).toContain("[Assistant]: on it");
    expect(text).toContain("[Tool Calls]:\n  Tool: read");
    expect(text).toMatch(/\[Tool Result \(read\)\]: x{200}\.\.\./);
  });

  it("skips empty user messages", () => {
    const { session } = createSession("");
    session.messages.push(msg({ role: "user", content: "   " }));
    expect(getAgentConversation(session as any)).toBe("");
  });
});

describe("agent-runner session storage", () => {
  it("keeps the subagent session in memory, so nothing is written to pi's session directory", async () => {
    vi.mocked(getAgentConfig).mockReturnValueOnce(makeAgentConfig());
    const { session } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "go", { pi });

    expect(sessionManagerInMemory).toHaveBeenCalledWith("/tmp");
    expect(createAgentSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionManager: { kind: "memory-session-manager" },
    }));
  });
});

describe("agent-runner tool scope", () => {
  it("a declared tool list is an EXACT allowlist — other built-ins are excluded from the registry", async () => {
    vi.mocked(getConfig).mockReturnValueOnce(makeConfig({ builtinToolNames: ["read"] }));
    const { session } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "go", { pi });

    const opts = createAgentSession.mock.calls[0][0];
    expect(opts.excludeTools).toEqual(expect.arrayContaining([
      ...EXCLUDED_3,
      "bash", "edit", "write", "grep", "find", "ls",
    ]));
    expect(opts.excludeTools).not.toContain("read");
  });

  it("an omitted tool list means everything — only this extension's own tools are excluded", async () => {
    vi.mocked(getConfig).mockReturnValueOnce(makeConfig({ builtinToolNames: undefined }));
    const { session } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "general-purpose", "go", { pi });

    const opts = createAgentSession.mock.calls[0][0];
    expect(opts.excludeTools).toEqual(EXCLUDED_3);
  });

  it("extension tools are presented to a type without a tool list, including late registration", async () => {
    vi.mocked(getConfig).mockReturnValueOnce(makeConfig({ builtinToolNames: undefined }));
    withExtensions({ "/ext/mcp.js": ["mcp_search"] });
    const { session } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "general-purpose", "go", { pi });

    const tools = lastToolsPassed();
    expect(tools).toEqual(expect.arrayContaining([...BUILTINS_7, "mcp_search"]));
    expect(tools).not.toEqual(expect.arrayContaining(EXCLUDED_3));
  });

  it("a declared tool list never presents extension tools, even when registered", async () => {
    vi.mocked(getConfig).mockReturnValueOnce(makeConfig({ builtinToolNames: ["read"] }));
    withExtensions({ "/ext/mcp.js": ["mcp_search"] });
    const { session } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "go", { pi });

    const tools = lastToolsPassed();
    expect(tools).toEqual(["read"]);
  });

  it("the turn-1 veto blocks out-of-scope calls the active set cannot express", async () => {
    vi.mocked(getConfig).mockReturnValueOnce(makeConfig({ builtinToolNames: ["read"] }));
    const { session } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "go", { pi });

    const veto = session.agent.beforeToolCall!;
    const blocked = await veto({ toolCall: { name: "bash" } }, undefined);
    expect(blocked.block).toBe(true);

    const allowed = await veto({ toolCall: { name: "read" } }, undefined);
    expect(allowed?.block ?? false).toBeFalsy();
  });

  it("re-narrows the active set on turn_end, so late registrations are judged too", async () => {
    vi.mocked(getConfig).mockReturnValueOnce(makeConfig({ builtinToolNames: undefined }));
    const { session, listeners } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "general-purpose", "go", { pi });
    expect(lastToolsPassed()).toEqual(expect.arrayContaining(BUILTINS_7));

    // An extension registers a tool mid-run (session_start fire), then the turn ends.
    withExtensions({ "/ext/late.js": ["late_tool"] });
    for (const l of [...listeners]) l({ type: "turn_end" });

    expect(lastToolsPassed()).toContain("late_tool");
  });
});

describe("resolveEffectiveMaxTurns", () => {
  let prevDefault: number | undefined;

  beforeEach(() => {
    prevDefault = getDefaultMaxTurns();
    vi.mocked(getAgentConfig).mockReturnValue(makeAgentConfig({ maxTurns: 7 }) as any);
  });

  afterEach(() => {
    setDefaultMaxTurns(prevDefault);
    vi.mocked(getAgentConfig).mockReset();
  });

  it("prefers an explicit value over the agent's own and the project default", () => {
    setDefaultMaxTurns(20);
    expect(resolveEffectiveMaxTurns("test-agent", 3)).toBe(3);
  });

  it("falls back to the agent's own max_turns", () => {
    setDefaultMaxTurns(20);
    expect(resolveEffectiveMaxTurns("test-agent")).toBe(7);
  });

  it("falls back to the project default when the agent sets none", () => {
    setDefaultMaxTurns(20);
    vi.mocked(getAgentConfig).mockReturnValue(makeAgentConfig() as any);
    expect(resolveEffectiveMaxTurns("test-agent")).toBe(20);
  });

  it("is unlimited when nothing sets a limit", () => {
    setDefaultMaxTurns(undefined);
    vi.mocked(getAgentConfig).mockReturnValue(makeAgentConfig() as any);
    expect(resolveEffectiveMaxTurns("test-agent")).toBeUndefined();
  });

  it("treats an explicit 0 as unlimited rather than as 'no opinion'", () => {
    // Not the same as omitting it: 0 is how a caller says "no limit", and
    // falling through to the default would impose one it asked not to have.
    setDefaultMaxTurns(20);
    expect(resolveEffectiveMaxTurns("test-agent", 0)).toBeUndefined();
  });
});

// The soft-limit → grace → hard-abort machine (agent-runner.ts, the `turn_end`
// branch) has never executed in a test: every consumer of the `steered`/`aborted`
// flags mocks `runAgent` outright, so the flags are asserted but never produced.
// The machine is what stops a runaway subagent, so a broken latch is either an
// agent that never wraps up and never aborts, or one that aborts on turn 1.
describe("agent-runner turn limits", () => {
  let prevMax: number | undefined;
  let prevGrace: number;

  beforeEach(() => {
    prevMax = getDefaultMaxTurns();
    prevGrace = getGraceTurns();
  });

  afterEach(() => {
    // Both are module-global; leaking them would silently retune other suites.
    setDefaultMaxTurns(prevMax);
    setGraceTurns(prevGrace);
  });

  /**
   * Run an agent whose prompt fires `turns` synthetic turn_end events before it
   * produces its final message — the same events a real session emits.
   */
  async function runWithTurns(turns: number, options: Record<string, unknown> = {}) {
    vi.mocked(getAgentConfig).mockReturnValueOnce(makeAgentConfig());
    const { session, listeners } = createSession("OK");
    session.prompt.mockImplementation(async () => {
      for (let i = 0; i < turns; i++) {
        for (const l of [...listeners]) l({ type: "turn_end" });
      }
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
    });
    createAgentSession.mockResolvedValue({ session });
    const result = await runAgent(ctx, "Explore", "go", { pi, ...options });
    return { session, result };
  }

  it("does not steer or abort below the limit", async () => {
    const { session, result } = await runWithTurns(3, { maxTurns: 5 });
    expect(session.steer).not.toHaveBeenCalled();
    expect(session.abort).not.toHaveBeenCalled();
    expect(result.steered).toBe(false);
  });

  it("steers exactly once on reaching the limit, and does not abort", async () => {
    setGraceTurns(5);
    const { session, result } = await runWithTurns(5, { maxTurns: 5 });
    expect(session.steer).toHaveBeenCalledTimes(1);
    expect(session.steer.mock.calls[0][0]).toContain("turn limit");
    expect(session.abort).not.toHaveBeenCalled();
    expect(result.steered).toBe(true);
  });

  it("does not re-steer on every turn once the soft limit latched", async () => {
    // Without the latch the agent gets a wrap-up message every single turn,
    // which both burns tokens and drowns out its actual task.
    setGraceTurns(5);
    const { session } = await runWithTurns(8, { maxTurns: 5 });
    expect(session.steer).toHaveBeenCalledTimes(1);
    expect(session.abort).not.toHaveBeenCalled();
  });

  it("hard-aborts once the grace turns are used up", async () => {
    setGraceTurns(2);
    const { session, result } = await runWithTurns(7, { maxTurns: 5 });
    expect(session.steer).toHaveBeenCalledTimes(1);
    expect(session.abort).toHaveBeenCalled();
    expect(result.aborted).toBe(true);
  });

  it("keeps running through the grace window without aborting", async () => {
    setGraceTurns(3);
    const { session, result } = await runWithTurns(7, { maxTurns: 5 });
    expect(session.abort).not.toHaveBeenCalled();
    expect(result.aborted).toBe(false);
    expect(result.steered).toBe(true);
  });

  it("treats maxTurns 0 as unlimited", async () => {
    const { session } = await runWithTurns(30, { maxTurns: 0 });
    expect(session.steer).not.toHaveBeenCalled();
    expect(session.abort).not.toHaveBeenCalled();
  });

  it("is unlimited when nothing configures a limit", async () => {
    setDefaultMaxTurns(undefined);
    const { session } = await runWithTurns(30);
    expect(session.steer).not.toHaveBeenCalled();
    expect(session.abort).not.toHaveBeenCalled();
  });

  it("falls back to the global default when the call sets no limit", async () => {
    setDefaultMaxTurns(4);
    setGraceTurns(5);
    const { session } = await runWithTurns(4);
    expect(session.steer).toHaveBeenCalledTimes(1);
  });

  it("an explicit maxTurns beats the global default", async () => {
    setDefaultMaxTurns(2);
    setGraceTurns(5);
    const { session } = await runWithTurns(4, { maxTurns: 10 });
    expect(session.steer).not.toHaveBeenCalled();
  });

  it("reports each turn to the caller's counter", async () => {
    const onTurnEnd = vi.fn();
    await runWithTurns(3, { maxTurns: 10, onTurnEnd });
    expect(onTurnEnd.mock.calls.map(c => c[0])).toEqual([1, 2, 3]);
  });
});

// A parent Esc / interrupt reaches the child through options.signal. The only
// existing coverage asserts the RECORD flips to "stopped" with runAgent mocked —
// nothing checked that the signal actually reaches the session, so a child could
// be marked stopped while it keeps running and burning tokens.
describe("agent-runner abort signal forwarding", () => {
  it("aborts the session when the parent signal fires mid-run", async () => {
    vi.mocked(getAgentConfig).mockReturnValueOnce(makeAgentConfig());
    const controller = new AbortController();
    const { session } = createSession("OK");
    session.prompt.mockImplementation(async () => {
      controller.abort();
      session.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
    });
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "go", { pi, signal: controller.signal });

    expect(session.abort).toHaveBeenCalled();
  });

  it("removes its listener once the run settles", async () => {
    // A long-lived parent signal outlives many children; a listener left behind
    // per child is a leak that also re-aborts sessions that are already gone.
    vi.mocked(getAgentConfig).mockReturnValueOnce(makeAgentConfig());
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
    const { session } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "go", { pi, signal: controller.signal });

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));

    controller.abort();
    expect(session.abort).not.toHaveBeenCalled(); // detached, so a late abort is inert
  });

  it("registers nothing when no signal is supplied", async () => {
    vi.mocked(getAgentConfig).mockReturnValueOnce(makeAgentConfig());
    const { session } = createSession("OK");
    createAgentSession.mockResolvedValue({ session });

    await runAgent(ctx, "Explore", "go", { pi });

    expect(session.abort).not.toHaveBeenCalled();
  });
});

// resolveDefaultModel picks the model a subagent runs on. Every failure here is
// SILENT BY DESIGN: an unresolvable or unavailable `model:` deliberately falls
// back to the parent's model rather than erroring, because a user's frontmatter
// pin shouldn't hard-fail a spawn. That makes the availability filter untestable
// through observed behavior — a broken check just means every model-pinned agent
// quietly runs on the parent's model, costing whatever the parent costs.
describe("resolveDefaultModel", () => {
  const parent = { provider: "anthropic", id: "parent-model" } as any;
  const haiku = { provider: "opencode-go", id: "claude-haiku-5-5" } as any;

  /** Registry whose `find` always succeeds; `getAvailable` is what varies. */
  function registry(available?: any[]) {
    return {
      find: vi.fn((provider: string, id: string) => ({ provider, id }) as any),
      getAvailable: available ? () => available : undefined,
    };
  }

  it("returns the configured model when the registry has it available", () => {
    const r = registry([haiku]);
    expect(resolveDefaultModel(parent, r, "opencode-go/claude-haiku-5-5"))
      .toEqual({ provider: "opencode-go", id: "claude-haiku-5-5" });
  });

  it("falls back to the parent when the model is NOT in the available set", () => {
    // The branch with teeth: without this filter the subagent is handed a model
    // the user has no credentials for, and the failure surfaces as a runtime
    // auth error from deep inside createAgentSession instead of a clean fallback.
    const r = registry([haiku]);
    expect(resolveDefaultModel(parent, r, "openai/gpt-5")).toBe(parent);
  });

  it("trusts `find` when the registry cannot enumerate availability", () => {
    // getAvailable absent → no filtering possible, so a found model is used.
    const r = registry(undefined);
    expect(resolveDefaultModel(parent, r, "opencode-go/claude-haiku-5-5"))
      .toEqual({ provider: "opencode-go", id: "claude-haiku-5-5" });
  });

  it("falls back to the parent when the registry cannot find the model", () => {
    const r = { find: vi.fn(() => undefined), getAvailable: undefined };
    expect(resolveDefaultModel(parent, r as any, "opencode-go/nope")).toBe(parent);
  });

  it("falls back to the parent for a model string with no provider prefix", () => {
    const r = registry([haiku]);
    expect(resolveDefaultModel(parent, r, "haiku")).toBe(parent);
    expect(r.find).not.toHaveBeenCalled();
  });

  it("returns the parent model when no model is configured", () => {
    expect(resolveDefaultModel(parent, registry([haiku]), undefined)).toBe(parent);
  });

  it("returns undefined when neither a config model nor a parent model exists", () => {
    expect(resolveDefaultModel(undefined, registry([haiku]), undefined)).toBeUndefined();
  });
});

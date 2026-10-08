/**
 * status-note-wiring.test.ts — proves the status note actually reaches the
 * PARENT through the real tool handlers, not just that getStatusNote() returns
 * a string. Drives the registered `Agent` / `get_subagent_result` tools and
 * inspects the text delivered back, for a turn-limit abort and a user stop.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/agent-runner.js", async () => {
  const actual = await vi.importActual<typeof import("../src/agent-runner.js")>("../src/agent-runner.js");
  return { ...actual, runAgent: vi.fn() };
});

import { runAgent } from "../src/agent-runner.js";
import subagentsExtension from "../src/index.js";

function makePi() {
  const tools = new Map<string, any>();
  const eventHandlers = new Map<string, any>();
  const lifecycle = new Map<string, any>();
  const pi = {
    registerMessageRenderer: vi.fn(),
    registerTool: vi.fn((t: any) => tools.set(t.name, t)),
    registerCommand: vi.fn(),
    registerEntryRenderer: vi.fn(),
    registerFlag: vi.fn(),
    getFlag: vi.fn(),
    on: vi.fn((event: string, handler: any) => lifecycle.set(event, handler)),
    events: {
      emit: vi.fn(),
      on: vi.fn((event: string, handler: any) => {
        eventHandlers.set(event, handler);
        return vi.fn();
      }),
    },
    appendEntry: vi.fn(),
    sendMessage: vi.fn(),
  } as any;
  return { pi, tools, eventHandlers, lifecycle };
}

function ctx() {
  return {
    hasUI: false,
    ui: { setStatus: vi.fn(), setWidget: vi.fn(), notify: vi.fn() },
    cwd: "/tmp",
    model: undefined,
    modelRegistry: { find: vi.fn(), getAvailable: vi.fn(() => []) },
    sessionManager: { getSessionId: vi.fn(() => "s1"), getBranch: vi.fn(() => []) },
    getSystemPrompt: vi.fn(() => "parent"),
  } as any;
}

const textOf = (r: any): string => r.content[0].text;

describe("status note reaches the parent through the real handlers", () => {
  afterEach(() => {
    delete (globalThis as any)[Symbol.for("pi-subagents:manager")];
    vi.restoreAllMocks();
  });

  it("foreground turn-limit abort → the Agent result flags an incomplete outcome", async () => {
    vi.mocked(runAgent).mockResolvedValue({
      responseText: "partial work so far",
      session: { dispose: vi.fn() } as any,
      aborted: true, // hard turn-limit abort
      steered: false,
    });
    const { pi, tools } = makePi();
    subagentsExtension(pi);

    const res = await tools.get("Agent").execute(
      "tc1",
      { prompt: "go", description: "d", subagent_type: "general-purpose", run_in_background: false },
      undefined, undefined, ctx(),
    );

    const out = textOf(res);
    // Exact lead clause, not just "turn limit": a steered/aborted mix-up would
    // otherwise slip through, and they are different outcomes.
    expect(out).toContain("aborted at the turn limit");
    expect(out).toContain("partial work so far");     // partial result still delivered
    expect(out).not.toContain("STOPPED BY THE USER"); // not mislabelled as a user stop

    // The two answers a foreground parent needs: is this all of it, and is the
    // task done. The first is what #174 turned on — the parent has no agent id,
    // so it must not read "partial" as "go fetch the rest".
    expect(out).toContain("everything the agent produced is above");
    expect(out).toContain("the task is unfinished");
    // State only, never an instruction to act (see getForegroundOutcomeNote):
    // advising a fresh run to save one wasted tool call is a bet nothing here
    // can measure. And naming the tool we steer away from only raises its salience.
    expect(out).not.toContain("re-spawn");
    expect(out).not.toContain("get_subagent_result");
  });

  it("foreground user-stop → tells the parent NOT to restart it unasked", async () => {
    // Pi delivers a user ESC as an abort on the tool's signal; the manager wires
    // that to abort(id) (#44), landing the record on "stopped" — deliberately
    // distinct from a turn-limit "aborted", because the correct next action is
    // the opposite one.
    let finish: (v: any) => void = () => {};
    vi.mocked(runAgent).mockReturnValue(new Promise((r) => { finish = r; }) as any);

    const { pi, tools } = makePi();
    subagentsExtension(pi);

    const parent = new AbortController();
    const call = tools.get("Agent").execute(
      "tc-stop",
      { prompt: "go", description: "d", subagent_type: "general-purpose", run_in_background: false },
      parent.signal, undefined, ctx(),
    );

    // The manager only wires addEventListener("abort", …) and never checks
    // signal.aborted upfront (agent-manager.ts:240-243), so aborting before the
    // listener is attached would silently land on "completed" instead. Flush
    // first rather than relying on spawn() happening in execute()'s synchronous
    // prefix, which any future await in that path would quietly break.
    await new Promise((r) => setImmediate(r));
    parent.abort(); // the user hits ESC
    finish({ responseText: "partial work so far", session: { dispose: vi.fn() }, aborted: false, steered: false });

    const out = textOf(await call);
    expect(out).toContain("STOPPED BY THE USER");
    expect(out).toContain("everything the agent produced is above");
    // Same claim, same confidence, same words as the aborted case — only the
    // lead clause distinguishes them.
    expect(out).toContain("the task is unfinished");
    // State only, here most of all. Advice to re-spawn would re-run work a human
    // deliberately killed; advice to ask first presumes someone is there to ask,
    // which is false under `pi -p`, scheduled jobs, and background-driven runs.
    expect(out).not.toContain("re-spawn");
    expect(out).not.toContain("ask before");
  });

});


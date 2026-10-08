import { describe, expect, it } from "vitest";
import { resolveAgentInvocationConfig } from "../src/invocation-config.js";
import type { AgentConfig } from "../src/types.js";

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "Explore",
    description: "Explore",
    builtinToolNames: ["read"],
    systemPrompt: "Test agent",
    promptMode: "replace",
    ...overrides,
  };
}

describe("resolveAgentInvocationConfig", () => {
  it("prefers the type's pinned model over tool-call params", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        model: "provider/config-model",
        maxTurns: 42,
      }),
      {
        model: "provider/param-model",
        thinking: "minimal",
        max_turns: 1,
        run_in_background: true,
      },
    );

    expect(resolved.modelInput).toBe("provider/config-model");
    expect(resolved.modelFromParams).toBe(false);
    expect(resolved.maxTurns).toBe(42);
    // Types carry no thinking pin — only the Explore model pin exists.
    expect(resolved.thinking).toBe("minimal");
    expect(resolved.runInBackground).toBe(true);
  });

  it("uses tool-call params when the type pins nothing", () => {
    const resolved = resolveAgentInvocationConfig(undefined, {
      model: "provider/param-model",
      thinking: "minimal",
      max_turns: 3,
      run_in_background: true,
    });

    expect(resolved.modelInput).toBe("provider/param-model");
    expect(resolved.modelFromParams).toBe(true);
    expect(resolved.thinking).toBe("minimal");
    expect(resolved.maxTurns).toBe(3);
    expect(resolved.runInBackground).toBe(true);
  });

  it("defaults runInBackground to the caller-supplied default", () => {
    expect(resolveAgentInvocationConfig(undefined, {}, { defaultRunInBackground: true }).runInBackground).toBe(true);
    expect(resolveAgentInvocationConfig(undefined, {}, { defaultRunInBackground: false }).runInBackground).toBe(false);
    // No options at all (in-tree: tests) → false.
    expect(resolveAgentInvocationConfig(undefined, {}).runInBackground).toBe(false);
    // An explicit call value wins over the default.
    expect(
      resolveAgentInvocationConfig(undefined, { run_in_background: false }, { defaultRunInBackground: true }).runInBackground,
    ).toBe(false);
  });

  describe("overridden params (#182)", () => {
    it("records the caller's values when the type's pin outranks them", () => {
      const resolved = resolveAgentInvocationConfig(
        makeConfig({ model: "provider/config-model", thinking: "low" }),
        { model: "provider/param-model", thinking: "max" },
      );

      expect(resolved.overridden).toEqual({ thinking: "max", model: "provider/param-model" });
    });

    it("records nothing when the caller got what they asked for", () => {
      const resolved = resolveAgentInvocationConfig(
        makeConfig({ model: "provider/same", thinking: "high" }),
        { model: "provider/same", thinking: "high" },
      );

      expect(resolved.overridden).toBeUndefined();
    });

    it("records nothing when only one side named a value", () => {
      // Config-only is the agent's own default, not an override; param-only won
      // outright. Neither is a request that went unhonored.
      expect(resolveAgentInvocationConfig(
        makeConfig({ model: "provider/config-model", thinking: "low" }),
        {},
      ).overridden).toBeUndefined();

      expect(resolveAgentInvocationConfig(
        makeConfig(),
        { model: "provider/param-model", thinking: "max" },
      ).overridden).toBeUndefined();
    });

    it("records each field independently", () => {
      const resolved = resolveAgentInvocationConfig(
        makeConfig({ thinking: "low" }),
        { model: "provider/param-model", thinking: "max" },
      );

      expect(resolved.overridden).toEqual({ thinking: "max", model: undefined });
    });
  });
});

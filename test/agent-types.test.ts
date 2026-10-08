import { describe, expect, it } from "vitest";
import {
  BUILTIN_TOOL_NAMES,
  getAgentConfig,
  getAvailableTypes,
  getConfig,
  getToolNamesForType,
  resolveSpawnType,
} from "../src/agent-types.js";
import { DEFAULT_AGENTS } from "../src/default-agents.js";

describe("agent type registry", () => {
  describe("default agents", () => {
    it("recognizes exactly the default agent types", () => {
      expect(getAvailableTypes()).toEqual([...DEFAULT_AGENTS.keys()]);
      expect(getAgentConfig("general-purpose")).toBeDefined();
      expect(getAgentConfig("Explore")).toBeDefined();
    });

    it("rejects unknown types", () => {
      expect(getAgentConfig("nonexistent")).toBeUndefined();
      expect(getAgentConfig("")).toBeUndefined();
    });

    it("dispatch is exact — no case-folding, no fallback", () => {
      expect(resolveSpawnType("Explore")).toEqual({ ok: true, type: "Explore" });
      expect(resolveSpawnType("general-purpose")).toEqual({ ok: true, type: "general-purpose" });

      for (const wrong of ["explore", "EXPLORE", "General-Purpose", "Plan", "nonexistent"]) {
        const r = resolveSpawnType(wrong);
        expect(r.ok, wrong).toBe(false);
        if (!r.ok) {
          expect(r.message).toContain(`Unknown agent type: "${wrong}"`);
          expect(r.message).toContain("general-purpose");
          expect(r.message).toContain("Explore");
        }
      }
    });

    it("treats a missing type like an unknown one", () => {
      for (const empty of ["", "   ", undefined]) {
        const r = resolveSpawnType(empty);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.message).toContain("No agent type given");
      }
    });

    it("returns correct config for default types", () => {
      const config = getConfig("general-purpose");
      expect(config.name).toBe("general-purpose");
      expect(config.builtinToolNames).toBeUndefined();
      expect(config.promptMode).toBe("append");
    });

    it("Explore has read-only tools", () => {
      const config = getConfig("Explore");
      expect(config.builtinToolNames).toEqual(["read", "bash", "grep", "find", "ls"]);
      expect(config.builtinToolNames).not.toContain("edit");
      expect(config.builtinToolNames).not.toContain("write");
    });

    it("Explore pins an exact model id from the fork owner's registry", () => {
      const cfg = getAgentConfig("Explore");
      expect(cfg?.model).toBe("opencode-go/claude-haiku-5-5");
    });

    it("default agents are marked isDefault", () => {
      const cfg = getAgentConfig("general-purpose");
      expect(cfg?.isDefault).toBe(true);
    });

    // Regression guard for #37 — default agents must not bake in callsite-strategy fields.
    // An explicit `false` here would silently win over the caller's `true` via `??` in
    // resolveAgentInvocationConfig, breaking documented Agent tool params.
    it("default agents do not lock strategy fields (run_in_background)", () => {
      for (const name of ["general-purpose", "Explore"]) {
        const cfg = getAgentConfig(name);
        expect(cfg?.runInBackground, `${name}.runInBackground`).toBeUndefined();
      }
    });

    it("BUILTIN_TOOL_NAMES includes all built-in tools", () => {
      expect(BUILTIN_TOOL_NAMES).toContain("read");
      expect(BUILTIN_TOOL_NAMES).toContain("bash");
      expect(BUILTIN_TOOL_NAMES).toContain("edit");
      expect(BUILTIN_TOOL_NAMES).toContain("write");
      expect(BUILTIN_TOOL_NAMES).toContain("grep");
      expect(BUILTIN_TOOL_NAMES).toContain("find");
      expect(BUILTIN_TOOL_NAMES).toContain("ls");
      expect(BUILTIN_TOOL_NAMES.length).toBeGreaterThanOrEqual(7);
    });

    it("getToolNamesForType: omitted list means all built-ins, declared list is exact", () => {
      expect(getToolNamesForType("general-purpose")).toEqual([...BUILTIN_TOOL_NAMES]);
      expect(getToolNamesForType("Explore")).toEqual(["read", "bash", "grep", "find", "ls"]);
    });

    it("getConfig falls back to general-purpose for unknown types", () => {
      const config = getConfig("nonexistent");
      expect(config.name).toBe("general-purpose");
      expect(config.description).toBe(DEFAULT_AGENTS.get("general-purpose")?.description);
    });
  });

  describe("BUILTIN_TOOL_NAMES", () => {
    // BUILTIN_TOOL_NAMES is derived dynamically from pi's tool factories
    // (createCodingTools + createReadOnlyTools). This guards against pi-mono
    // dropping/renaming a built-in: the set must still contain at least these
    // 7. It's a superset check ("at least") — pi adding a new built-in is fine
    // and won't fail this test.
    const EXPECTED = ["read", "bash", "edit", "write", "grep", "find", "ls"];

    it("contains at least the 7 known built-ins", () => {
      for (const name of EXPECTED) {
        expect(BUILTIN_TOOL_NAMES).toContain(name);
      }
    });

    it("has no duplicate entries", () => {
      expect(new Set(BUILTIN_TOOL_NAMES).size).toBe(BUILTIN_TOOL_NAMES.length);
    });
  });
});

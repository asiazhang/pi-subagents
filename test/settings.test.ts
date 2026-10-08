import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLoaded,
  applySettings,
  loadSettings,
  persistToastFor,
  type SettingsAppliers,
  saveChanged,
  saveSettings,
} from "../src/settings.js";

/**
 * Tests for persistent settings. Project settings live at
 * `<projectDir>/.pi/subagents.json`. The global layer was removed in this fork.
 */
describe("settings persistence", () => {
  let projectDir: string;

  const projectFile = () => join(projectDir, ".pi", "subagents.json");

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "pi-settings-project-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function writeProject(obj: unknown) {
    mkdirSync(join(projectDir, ".pi"), { recursive: true });
    writeFileSync(projectFile(), JSON.stringify(obj));
  }

  it("returns {} when the file is missing", () => {
    expect(loadSettings(projectDir)).toEqual({});
  });

  it("returns {} when the file is malformed JSON", () => {
    writeProject({ maxConcurrent: 2 });
    writeFileSync(projectFile(), "not valid json {{{");
    expect(loadSettings(projectDir)).toEqual({});
  });

  it("round-trips values: saveSettings then loadSettings", () => {
    const values = {
      maxConcurrent: 8,
      maxConcurrentForeground: 2,
      defaultMaxTurns: 40,
      graceTurns: 3,
      defaultJoinMode: "smart" as const,
      backgroundByDefault: false,
      scopeModels: true,
      strictAgentFiles: true,
      disableDefaultAgents: true,
      rememberAgents: false,
      widgetMode: "all" as const,
      outputTranscript: false,
      maxSubagentDepth: 3,
      fallbackSubagent: "Explore",
    };
    saveSettings(values, projectDir);
    expect(loadSettings(projectDir)).toEqual(values);
  });

  it("round-trips rememberAgents (true and false); keeps boolean, drops non-boolean", () => {
    writeProject({ rememberAgents: true });
    expect(loadSettings(projectDir)).toEqual({ rememberAgents: true });
    writeProject({ rememberAgents: false });
    expect(loadSettings(projectDir)).toEqual({ rememberAgents: false });
    writeProject({ rememberAgents: "yes" });
    expect(loadSettings(projectDir)).toEqual({});
  });

  it("round-trips widgetMode; keeps valid values, drops invalid", () => {
    for (const mode of ["all", "background", "off"] as const) {
      writeProject({ widgetMode: mode });
      expect(loadSettings(projectDir)).toEqual({ widgetMode: mode });
    }
    writeProject({ widgetMode: "sometimes" });
    expect(loadSettings(projectDir)).toEqual({});
  });

  it("round-trips outputTranscript; drops non-boolean", () => {
    writeProject({ outputTranscript: false });
    expect(loadSettings(projectDir)).toEqual({ outputTranscript: false });
    writeProject({ outputTranscript: "no" });
    expect(loadSettings(projectDir)).toEqual({});
  });

  it("round-trips backgroundByDefault (true and false), and absence stays absent", () => {
    writeProject({ backgroundByDefault: true });
    expect(loadSettings(projectDir)).toEqual({ backgroundByDefault: true });
    writeProject({ backgroundByDefault: false });
    expect(loadSettings(projectDir)).toEqual({ backgroundByDefault: false });
    writeProject({});
    expect(loadSettings(projectDir)).toEqual({});
  });

  it("sanitize drops non-boolean backgroundByDefault silently", () => {
    writeProject({ backgroundByDefault: "true" });
    expect(loadSettings(projectDir)).toEqual({});
  });

  it("saveSettings writes the project file", () => {
    saveSettings({ maxConcurrent: 2 }, projectDir);

    expect(JSON.parse(readFileSync(projectFile(), "utf-8"))).toEqual({ maxConcurrent: 2 });
  });

  it("saveSettings creates <cwd>/.pi/ when missing", () => {
    expect(existsSync(join(projectDir, ".pi"))).toBe(false);
    saveSettings({ maxConcurrent: 4 }, projectDir);
    expect(existsSync(projectFile())).toBe(true);
  });

  it("round-trips defaultMaxTurns: 0 (unlimited marker)", () => {
    saveSettings({ defaultMaxTurns: 0 }, projectDir);
    expect(loadSettings(projectDir)).toEqual({ defaultMaxTurns: 0 });
  });

  it("ignores unknown extra fields on load (forward-compat)", () => {
    writeProject({ maxConcurrent: 2, futureField: "ignored" });
    const loaded = loadSettings(projectDir);
    expect(loaded.maxConcurrent).toBe(2);
    // Unknown fields are stripped by the sanitizer — old versions won't persist garbage
    expect((loaded as Record<string, unknown>).futureField).toBeUndefined();
  });

  describe("sanitizer", () => {
    it("drops maxConcurrent < 1", () => {
      writeProject({ maxConcurrent: 0, graceTurns: 5 });
      expect(loadSettings(projectDir)).toEqual({ graceTurns: 5 });
    });

    it("drops negative maxConcurrent", () => {
      writeProject({ maxConcurrent: -3 });
      expect(loadSettings(projectDir)).toEqual({});
    });

    it("drops non-integer maxConcurrent (floats, NaN, strings)", () => {
      writeProject({ maxConcurrent: 3.5 });
      expect(loadSettings(projectDir).maxConcurrent).toBeUndefined();
      writeProject({ maxConcurrent: "four" });
      expect(loadSettings(projectDir).maxConcurrent).toBeUndefined();
      writeProject({ maxConcurrent: null });
      expect(loadSettings(projectDir).maxConcurrent).toBeUndefined();
    });

    // Unlike maxConcurrent above, 0 is the DEFAULT here and means unlimited —
    // dropping it would make the default unrepresentable in the file.
    it("keeps maxConcurrentForeground: 0 (explicit unlimited)", () => {
      writeProject({ maxConcurrentForeground: 0 });
      expect(loadSettings(projectDir)).toEqual({ maxConcurrentForeground: 0 });
    });

    it("drops out-of-range or non-integer maxConcurrentForeground", () => {
      writeProject({ maxConcurrentForeground: -1 });
      expect(loadSettings(projectDir)).toEqual({});
      writeProject({ maxConcurrentForeground: 1.5 });
      expect(loadSettings(projectDir)).toEqual({});
    });

    it("accepts defaultMaxTurns: 0 (explicit unlimited)", () => {
      writeProject({ defaultMaxTurns: 0 });
      expect(loadSettings(projectDir)).toEqual({ defaultMaxTurns: 0 });
    });

    it("drops negative defaultMaxTurns", () => {
      writeProject({ defaultMaxTurns: -5 });
      expect(loadSettings(projectDir)).toEqual({});
    });

    it("drops graceTurns < 1", () => {
      writeProject({ graceTurns: 0 });
      expect(loadSettings(projectDir)).toEqual({});
    });

    it("keeps maxSubagentDepth 0 (nesting off) but drops negative, fractional, and over-ceiling values", () => {
      writeProject({ maxSubagentDepth: 0 });
      expect(loadSettings(projectDir)).toEqual({ maxSubagentDepth: 0 });
      writeProject({ maxSubagentDepth: -1 });
      expect(loadSettings(projectDir)).toEqual({});
      writeProject({ maxSubagentDepth: 1.5 });
      expect(loadSettings(projectDir)).toEqual({});
      writeProject({ maxSubagentDepth: 17 });
      expect(loadSettings(projectDir)).toEqual({});
    });

    it("accepts `none` and `false` as the disabled fallback, nothing else", () => {
      // Only the boolean needs an alias: it would otherwise be dropped, leaving
      // the PERMISSIVE default while the author believed strict was on. Every
      // string stays an agent name, so a mistaken "off" fails loudly at dispatch
      // instead of meaning one thing here and another in the resolver.
      for (const spelling of ["none", "NONE", " none ", false]) {
        writeProject({ fallbackSubagent: spelling });
        expect(loadSettings(projectDir).fallbackSubagent?.toLowerCase()).toBe("none");
      }
      writeProject({ fallbackSubagent: "off" });
      expect(loadSettings(projectDir)).toEqual({ fallbackSubagent: "off" });
    });

    it("drops values that aren't a string or `false`, without coercing them", () => {
      // String(["none"]) is "none" — coercing would silently enable strict mode.
      for (const junk of [["none"], null, 42, true, {}]) {
        writeProject({ fallbackSubagent: junk });
        expect(loadSettings(projectDir)).toEqual({});
      }
    });

    it("keeps a named fallback agent and drops non-strings", () => {
      writeProject({ fallbackSubagent: "  my-router  " });
      expect(loadSettings(projectDir)).toEqual({ fallbackSubagent: "my-router" });
      writeProject({ fallbackSubagent: 42 });
      expect(loadSettings(projectDir)).toEqual({});
      writeProject({ fallbackSubagent: "   " });
      expect(loadSettings(projectDir)).toEqual({});
    });

    it("drops invalid defaultJoinMode values", () => {
      writeProject({ defaultJoinMode: "invalid" });
      expect(loadSettings(projectDir)).toEqual({});
      writeProject({ defaultJoinMode: 42 });
      expect(loadSettings(projectDir)).toEqual({});
      writeProject({ defaultJoinMode: "" });
      expect(loadSettings(projectDir)).toEqual({});
    });

    it("accepts all three valid join modes", () => {
      for (const mode of ["async", "group", "smart"] as const) {
        writeProject({ defaultJoinMode: mode });
        expect(loadSettings(projectDir)).toEqual({ defaultJoinMode: mode });
      }
    });

    it("accepts scopeModels boolean (true and false)", () => {
      writeProject({ scopeModels: true });
      expect(loadSettings(projectDir)).toEqual({ scopeModels: true });
      writeProject({ scopeModels: false });
      expect(loadSettings(projectDir)).toEqual({ scopeModels: false });
    });

    it("accepts strictAgentFiles boolean (true and false)", () => {
      writeProject({ strictAgentFiles: true });
      expect(loadSettings(projectDir)).toEqual({ strictAgentFiles: true });
      writeProject({ strictAgentFiles: false });
      expect(loadSettings(projectDir)).toEqual({ strictAgentFiles: false });
    });

    it("drops non-boolean strictAgentFiles", () => {
      writeProject({ strictAgentFiles: "yes" });
      expect(loadSettings(projectDir).strictAgentFiles).toBeUndefined();
      writeProject({ strictAgentFiles: 1 });
      expect(loadSettings(projectDir).strictAgentFiles).toBeUndefined();
    });

    it("drops non-boolean scopeModels", () => {
      writeProject({ scopeModels: "yes" });
      expect(loadSettings(projectDir).scopeModels).toBeUndefined();
      writeProject({ scopeModels: 1 });
      expect(loadSettings(projectDir).scopeModels).toBeUndefined();
      writeProject({ scopeModels: null });
      expect(loadSettings(projectDir).scopeModels).toBeUndefined();
    });

    it("accepts disableDefaultAgents boolean (true and false)", () => {
      writeProject({ disableDefaultAgents: true });
      expect(loadSettings(projectDir)).toEqual({ disableDefaultAgents: true });
      writeProject({ disableDefaultAgents: false });
      expect(loadSettings(projectDir)).toEqual({ disableDefaultAgents: false });
    });

    it("drops non-boolean disableDefaultAgents", () => {
      writeProject({ disableDefaultAgents: "yes" });
      expect(loadSettings(projectDir).disableDefaultAgents).toBeUndefined();
      writeProject({ disableDefaultAgents: 1 });
      expect(loadSettings(projectDir).disableDefaultAgents).toBeUndefined();
      writeProject({ disableDefaultAgents: null });
      expect(loadSettings(projectDir).disableDefaultAgents).toBeUndefined();
    });

    it("returns {} when the JSON root is not an object (array, string, null)", () => {
      mkdirSync(join(projectDir, ".pi"), { recursive: true });
      writeFileSync(projectFile(), '["not", "an", "object"]');
      expect(loadSettings(projectDir)).toEqual({});
      writeFileSync(projectFile(), '"just a string"');
      expect(loadSettings(projectDir)).toEqual({});
      writeFileSync(projectFile(), "null");
      expect(loadSettings(projectDir)).toEqual({});
    });

    it("keeps valid fields while dropping invalid siblings", () => {
      writeProject({
        maxConcurrent: 4, // ok
        defaultMaxTurns: -5, // dropped
        graceTurns: 3, // ok
        defaultJoinMode: "nope", // dropped
      });
      expect(loadSettings(projectDir)).toEqual({ maxConcurrent: 4, graceTurns: 3 });
    });

    it("accepts values at the ceiling (maxConcurrent=1024, defaultMaxTurns=10000, graceTurns=1000)", () => {
      writeProject({ maxConcurrent: 1024, defaultMaxTurns: 10_000, graceTurns: 1_000 });
      expect(loadSettings(projectDir)).toEqual({
        maxConcurrent: 1024,
        defaultMaxTurns: 10_000,
        graceTurns: 1_000,
      });
    });

    it("drops values above the ceiling", () => {
      writeProject({ maxConcurrent: 1025 });
      expect(loadSettings(projectDir).maxConcurrent).toBeUndefined();
      writeProject({ defaultMaxTurns: 10_001 });
      expect(loadSettings(projectDir).defaultMaxTurns).toBeUndefined();
      writeProject({ graceTurns: 1_001 });
      expect(loadSettings(projectDir).graceTurns).toBeUndefined();
    });

    it("drops absurdly large values (e.g. 1e6)", () => {
      writeProject({ maxConcurrent: 1_000_000, defaultMaxTurns: 1_000_000, graceTurns: 1_000_000 });
      expect(loadSettings(projectDir)).toEqual({});
    });
  });

  describe("save result + corrupt-file warning", () => {
    it("saveSettings returns true on success", () => {
      expect(saveSettings({ maxConcurrent: 2 }, projectDir)).toBe(true);
      expect(JSON.parse(readFileSync(projectFile(), "utf-8"))).toEqual({ maxConcurrent: 2 });
    });

    it("saveSettings returns false when the target dir cannot be created", () => {
      // Place a regular file where the parent of the settings file would go —
      // mkdirSync + writeFileSync both fail with ENOTDIR / EEXIST.
      const filePosingAsCwd = join(tmpdir(), `pi-settings-notdir-${Date.now()}`);
      writeFileSync(filePosingAsCwd, "");
      try {
        expect(saveSettings({ maxConcurrent: 1 }, filePosingAsCwd)).toBe(false);
      } finally {
        rmSync(filePosingAsCwd, { force: true });
      }
    });

    it("warns to console.warn when an existing file is malformed", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mkdirSync(join(projectDir, ".pi"), { recursive: true });
      writeFileSync(projectFile(), "not valid json {{{");
      try {
        expect(loadSettings(projectDir)).toEqual({});
        expect(spy).toHaveBeenCalledTimes(1);
        expect(String(spy.mock.calls[0][0])).toMatch(/Ignoring malformed settings/);
      } finally {
        spy.mockRestore();
      }
    });

    it("does NOT warn when a file is simply missing", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        expect(loadSettings(projectDir)).toEqual({});
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("applySettings", () => {
    let appliers: SettingsAppliers;

    beforeEach(() => {
      appliers = {
        setMaxConcurrent: vi.fn(),
        setMaxConcurrentForeground: vi.fn(),
        setDefaultMaxTurns: vi.fn(),
        setGraceTurns: vi.fn(),
        setDefaultJoinMode: vi.fn(),
        setBackgroundByDefault: vi.fn(),
        setScopeModels: vi.fn(),
        setStrictAgentFiles: vi.fn(),
        setDisableDefaultAgents: vi.fn(),
        setRememberAgents: vi.fn(),
        setWidgetMode: vi.fn(),
        setOutputTranscript: vi.fn(),
        setMaxSubagentDepth: vi.fn(),
        setFallbackSubagent: vi.fn(),
      };
    });

    it("applies maxConcurrentForeground, including an explicit 0", () => {
      applySettings({ maxConcurrentForeground: 4 }, appliers);
      expect(appliers.setMaxConcurrentForeground).toHaveBeenCalledWith(4);
      applySettings({ maxConcurrentForeground: 0 }, appliers);
      expect(appliers.setMaxConcurrentForeground).toHaveBeenCalledWith(0);
    });

    it("is a no-op on an empty settings object", () => {
      applySettings({}, appliers);
      expect(appliers.setMaxConcurrent).not.toHaveBeenCalled();
      expect(appliers.setBackgroundByDefault).not.toHaveBeenCalled();
    });

    it("applies fallbackSubagent through to the registry", () => {
      applySettings({ fallbackSubagent: "none" }, appliers);
      expect(appliers.setFallbackSubagent).toHaveBeenCalledWith("none");
    });

    it("applies only the fields that are present", () => {
      applySettings({ graceTurns: 4 }, appliers);
      expect(appliers.setGraceTurns).toHaveBeenCalledWith(4);
      expect(appliers.setMaxConcurrent).not.toHaveBeenCalled();
    });

    it("applies widgetMode; skips it when absent", () => {
      applySettings({ widgetMode: "off" }, appliers);
      expect(appliers.setWidgetMode).toHaveBeenCalledWith("off");
      applySettings({}, appliers);
      expect(appliers.setWidgetMode).toHaveBeenCalledTimes(1);
    });

    it("applies rememberAgents; skips it when absent", () => {
      applySettings({ rememberAgents: false }, appliers);
      expect(appliers.setRememberAgents).toHaveBeenCalledWith(false);
      applySettings({}, appliers);
      expect(appliers.setRememberAgents).toHaveBeenCalledTimes(1);
    });

    it("applies scopeModels: false", () => {
      applySettings({ scopeModels: false }, appliers);
      expect(appliers.setScopeModels).toHaveBeenCalledWith(false);
    });

    it("applies disableDefaultAgents: false", () => {
      applySettings({ disableDefaultAgents: false }, appliers);
      expect(appliers.setDisableDefaultAgents).toHaveBeenCalledWith(false);
    });

    it("applies outputTranscript (both true and false)", () => {
      applySettings({ outputTranscript: false }, appliers);
      expect(appliers.setOutputTranscript).toHaveBeenCalledWith(false);
      applySettings({ outputTranscript: true }, appliers);
      expect(appliers.setOutputTranscript).toHaveBeenCalledWith(true);
    });

    it("applies defaultMaxTurns: 0 as the explicit unlimited marker", () => {
      applySettings({ defaultMaxTurns: 0 }, appliers);
      expect(appliers.setDefaultMaxTurns).toHaveBeenCalledWith(0);
    });

    it("calls setBackgroundByDefault with either boolean", () => {
      applySettings({ backgroundByDefault: false }, appliers);
      expect(appliers.setBackgroundByDefault).toHaveBeenCalledWith(false);
      applySettings({ backgroundByDefault: true }, appliers);
      expect(appliers.setBackgroundByDefault).toHaveBeenCalledWith(true);
    });

    // Absence must leave the in-memory default (background) alone — calling
    // the applier with `undefined` would read as foreground at the spawn site.
    it("does not call setBackgroundByDefault when the field is absent", () => {
      applySettings({ maxConcurrent: 4 }, appliers);
      expect(appliers.setBackgroundByDefault).not.toHaveBeenCalled();
    });
  });

  describe("persistToastFor", () => {
    it("returns info-level toast with the plain message on success", () => {
      expect(persistToastFor("Max concurrency set to 7", true)).toEqual({
        message: "Max concurrency set to 7",
        level: "info",
      });
    });

    it("returns warning-level toast with session-only suffix on failure", () => {
      expect(persistToastFor("Max concurrency set to 7", false)).toEqual({
        message: "Max concurrency set to 7 (session only; failed to persist)",
        level: "warning",
      });
    });
  });

  describe("applyLoaded", () => {
    let appliers: SettingsAppliers;

    beforeEach(() => {
      appliers = {
        setMaxConcurrent: vi.fn(),
        setMaxConcurrentForeground: vi.fn(),
        setDefaultMaxTurns: vi.fn(),
        setGraceTurns: vi.fn(),
        setDefaultJoinMode: vi.fn(),
        setBackgroundByDefault: vi.fn(),
        setScopeModels: vi.fn(),
        setStrictAgentFiles: vi.fn(),
        setDisableDefaultAgents: vi.fn(),
        setRememberAgents: vi.fn(),
        setWidgetMode: vi.fn(),
        setOutputTranscript: vi.fn(),
        setMaxSubagentDepth: vi.fn(),
        setFallbackSubagent: vi.fn(),
      };
    });

    it("loads and applies project settings", () => {
      writeProject({ maxConcurrent: 16, graceTurns: 7 });

      const result = applyLoaded(appliers, projectDir);

      expect(appliers.setMaxConcurrent).toHaveBeenCalledWith(16);
      expect(appliers.setGraceTurns).toHaveBeenCalledWith(7);
      expect(appliers.setDefaultMaxTurns).not.toHaveBeenCalled();
      expect(appliers.setDefaultJoinMode).not.toHaveBeenCalled();
      expect(result).toEqual({ maxConcurrent: 16, graceTurns: 7 });
    });

    it("applies nothing when the file is missing (payload carries {})", () => {
      const result = applyLoaded(appliers, projectDir);

      expect(result).toEqual({});
      // No setters fired — defaults preserved
      expect(appliers.setMaxConcurrent).not.toHaveBeenCalled();
      expect(appliers.setDefaultMaxTurns).not.toHaveBeenCalled();
      expect(appliers.setGraceTurns).not.toHaveBeenCalled();
      expect(appliers.setDefaultJoinMode).not.toHaveBeenCalled();
    });
  });

  describe("saveChanged", () => {
    it("persists and returns info toast on success", () => {
      const snapshot = { maxConcurrent: 5, graceTurns: 2 };

      const toast = saveChanged(snapshot, "Max concurrency set to 5", projectDir);

      expect(toast).toEqual({ message: "Max concurrency set to 5", level: "info" });
      // File actually written
      expect(JSON.parse(readFileSync(projectFile(), "utf-8"))).toEqual(snapshot);
    });

    it("returns warning toast on save failure", () => {
      const filePosingAsCwd = join(tmpdir(), `pi-settings-notdir-${Date.now()}`);
      writeFileSync(filePosingAsCwd, "");
      try {
        const toast = saveChanged(
          { maxConcurrent: 5 },
          "Max concurrency set to 5",
          filePosingAsCwd,
        );
        expect(toast).toEqual({
          message: "Max concurrency set to 5 (session only; failed to persist)",
          level: "warning",
        });
      } finally {
        rmSync(filePosingAsCwd, { force: true });
      }
    });
  });
});

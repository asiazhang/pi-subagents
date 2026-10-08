// Persistence for pi-subagents operational settings.
// Project: <cwd>/.pi/subagents.json — written by /agents → Settings.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WidgetMode } from "./types.js";

export interface SubagentsSettings {
  maxConcurrent?: number;
  /**
   * 0 = unlimited — the extension's single source of truth for that convention:
   * `normalizeMaxTurns()` in agent-runner.ts treats 0 → `undefined`, and the
   * `/agents` → Settings input prompt explicitly says "0 = unlimited".
   */
  defaultMaxTurns?: number;
  graceTurns?: number;
  /**
   * Whether a top-level `Agent` spawn that doesn't say runs detached.
   * Defaults to `true`, following Claude Code, where the agent backgrounds
   * unless the caller passes `run_in_background: false`. Set `false` to restore
   * the previous behaviour, where an unqualified spawn blocked the turn and
   * returned its result inline.
   *
   * An explicit `run_in_background` on the call overrides this in both
   * directions; the setting only decides what "unspecified" means.
   */
  backgroundByDefault?: boolean;
  /**
   * Whether subagents persist their pi session by default. Defaults to `true`.
   * Persisted sessions appear nested under the spawning session in pi's
   * `/resume`.
   */
  rememberAgents?: boolean;
  /**
   * Display mode for the persistent above-editor agent widget:
   *   - `all`: show every agent (foreground + background).
   *   - `background`: hide foreground agents — they already render inline as the
   *     Agent tool result, so the widget would otherwise double-render them
   *     (#118); everything else stays.
   *   - `off`: hide the widget entirely.
   * Defaults to `background`. Pure-UI and applied live (toggling refreshes the
   * widget).
   */
  widgetMode?: WidgetMode;
  /**
   * Project default for writing each subagent's `.output` transcript
   * (a JSON-lines copy of the run, stored under the OS temp dir).
   * Defaults to `true`. Set `false` to make transcripts opt-in for the whole
   * project (e.g. a repo that shouldn't leave run transcripts on disk for backup
   * or DLP tooling to ingest).
   */
  outputTranscript?: boolean;
}

/** Setter hooks used by applySettings to wire persisted values into in-memory state. */
export interface SettingsAppliers {
  setMaxConcurrent: (n: number) => void;
  setDefaultMaxTurns: (n: number) => void;
  setGraceTurns: (n: number) => void;
  setBackgroundByDefault: (b: boolean) => void;
  setRememberAgents: (b: boolean) => void;
  setWidgetMode: (mode: WidgetMode) => void;
  setOutputTranscript: (b: boolean) => void;
}

const VALID_WIDGET_MODES: ReadonlySet<string> = new Set<WidgetMode>(["all", "background", "off"]);

// Sanity ceilings — prevent hand-edited configs from asking for values that
// make no operational sense (e.g. 1e6 concurrent subagents). Permissive enough
// that any realistic power-user setting passes through.
const MAX_CONCURRENT_CEILING = 1024;
const MAX_TURNS_CEILING = 10_000;
const GRACE_TURNS_CEILING = 1_000;

/** Drop fields that don't match the expected shape. Silent — garbage becomes absent. */
function sanitize(raw: unknown): SubagentsSettings {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: SubagentsSettings = {};
  if (
    Number.isInteger(r.maxConcurrent) &&
    (r.maxConcurrent as number) >= 1 &&
    (r.maxConcurrent as number) <= MAX_CONCURRENT_CEILING
  ) {
    out.maxConcurrent = r.maxConcurrent as number;
  }
  if (
    Number.isInteger(r.defaultMaxTurns) &&
    (r.defaultMaxTurns as number) >= 0 &&
    (r.defaultMaxTurns as number) <= MAX_TURNS_CEILING
  ) {
    out.defaultMaxTurns = r.defaultMaxTurns as number;
  }
  if (
    Number.isInteger(r.graceTurns) &&
    (r.graceTurns as number) >= 1 &&
    (r.graceTurns as number) <= GRACE_TURNS_CEILING
  ) {
    out.graceTurns = r.graceTurns as number;
  }
  if (typeof r.backgroundByDefault === "boolean") {
    out.backgroundByDefault = r.backgroundByDefault;
  }
  if (typeof r.rememberAgents === "boolean") {
    out.rememberAgents = r.rememberAgents;
  }
  if (typeof r.widgetMode === "string" && VALID_WIDGET_MODES.has(r.widgetMode)) {
    out.widgetMode = r.widgetMode as WidgetMode;
  }
  if (typeof r.outputTranscript === "boolean") {
    out.outputTranscript = r.outputTranscript;
  }
  return out;
}

function projectPath(cwd: string): string {
  return join(cwd, ".pi", "subagents.json");
}

/**
 * Read a settings file. Missing file is silent (returns `{}`). A file that
 * exists but can't be parsed emits a warning to stderr so users aren't
 * silently reverted to defaults — and still returns `{}` so startup proceeds.
 */
function readSettingsFile(path: string): SubagentsSettings {
  if (!existsSync(path)) return {};
  try {
    return sanitize(JSON.parse(readFileSync(path, "utf-8")));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[pi-subagents] Ignoring malformed settings at ${path}: ${reason}`);
    return {};
  }
}

/** Load project settings; missing file → defaults. */
export function loadSettings(cwd: string = process.cwd()): SubagentsSettings {
  return readSettingsFile(projectPath(cwd));
}

/**
 * Write project-local settings.
 * Returns `true` on success, `false` if the write (or mkdir) failed so the
 * caller can surface a warning — persistence isn't fatal but isn't silent.
 */
export function saveSettings(s: SubagentsSettings, cwd: string = process.cwd()): boolean {
  const path = projectPath(cwd);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(s, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Apply persisted settings to the in-memory state via caller-supplied setters. */
export function applySettings(s: SubagentsSettings, appliers: SettingsAppliers): void {
  if (typeof s.maxConcurrent === "number") appliers.setMaxConcurrent(s.maxConcurrent);
  if (typeof s.defaultMaxTurns === "number") appliers.setDefaultMaxTurns(s.defaultMaxTurns);
  if (typeof s.graceTurns === "number") appliers.setGraceTurns(s.graceTurns);
  if (typeof s.backgroundByDefault === "boolean") appliers.setBackgroundByDefault(s.backgroundByDefault);
  if (typeof s.rememberAgents === "boolean") appliers.setRememberAgents(s.rememberAgents);
  if (s.widgetMode) appliers.setWidgetMode(s.widgetMode);
  if (typeof s.outputTranscript === "boolean") appliers.setOutputTranscript(s.outputTranscript);
}

/**
 * Format the user-facing toast for a settings mutation. Pure function —
 * routes the success/failure of `saveSettings` into the right message + level
 * so the UI layer (index.ts) stays a thin wire between input and notification.
 */
export function persistToastFor(
  successMsg: string,
  persisted: boolean,
): { message: string; level: "info" | "warning" } {
  return persisted
    ? { message: successMsg, level: "info" }
    : { message: `${successMsg} (session only; failed to persist)`, level: "warning" };
}

/** Load project settings and apply them to in-memory state. Extension init wires this once. */
export function applyLoaded(appliers: SettingsAppliers, cwd: string = process.cwd()): SubagentsSettings {
  const settings = loadSettings(cwd);
  applySettings(settings, appliers);
  return settings;
}

/**
 * Persist a settings snapshot and return the toast the UI should display.
 */
export function saveChanged(
  snapshot: SubagentsSettings,
  successMsg: string,
  cwd: string = process.cwd(),
): { message: string; level: "info" | "warning" } {
  const persisted = saveSettings(snapshot, cwd);
  return persistToastFor(successMsg, persisted);
}

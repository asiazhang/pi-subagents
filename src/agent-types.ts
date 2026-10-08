/**
 * agent-types.ts — Agent type registry.
 *
 * The registry is the two embedded default agents. Strict dispatch: a
 * caller-supplied type must match exactly; unknown types are refused with the
 * available list.
 */

import { createCodingTools, createReadOnlyTools } from "@earendil-works/pi-coding-agent";
import { DEFAULT_AGENTS } from "./default-agents.js";
import type { AgentConfig } from "./types.js";

/**
 * All known built-in tool names, derived from pi's own tool factories rather
 * than hardcoded so the set tracks pi-mono if it adds/renames a built-in.
 * `createCodingTools` → read/bash/edit/write; `createReadOnlyTools` →
 * read/grep/find/ls; their de-duplicated union is the 7 built-ins
 * (read, bash, edit, write, grep, find, ls). The `cwd` only binds tool
 * operations we never invoke here — we read each tool's `.name` and discard it.
 */
export const BUILTIN_TOOL_NAMES: string[] = [
  ...new Set([...createCodingTools("."), ...createReadOnlyTools(".")].map((t) => t.name)),
];

/** Registry of spawnable agent types. */
const agents: Map<string, AgentConfig> = DEFAULT_AGENTS;

/** Outcome of resolving a caller-supplied `subagent_type` into a spawnable type. */
export type SpawnTypeResolution =
  | { ok: true; type: string }
  | { ok: false; message: string };

/**
 * Resolve a caller-supplied agent type. Strict: the name must match one
 * registered type exactly — no fallback, no case-folding. The single decision
 * point for every spawn, so a type that fails here never reaches `runAgent`.
 */
export function resolveSpawnType(requested: unknown): SpawnTypeResolution {
  const raw = typeof requested === "string" ? requested.trim() : "";
  if (raw && agents.has(raw)) return { ok: true, type: raw };
  const reason = raw ? `Unknown agent type: "${raw}".` : "No agent type given.";
  const available = getAvailableTypes().join(", ") || "(none)";
  return { ok: false, message: `${reason} Available: ${available}.` };
}

/** Get the agent config for a type. */
export function getAgentConfig(name: string): AgentConfig | undefined {
  return agents.get(name);
}

/** Get all type names (for spawning and tool descriptions). */
export function getAvailableTypes(): string[] {
  return [...agents.keys()];
}

/** Get built-in tool names for a type. */
export function getToolNamesForType(type: string): string[] {
  const config = agents.get(type);
  // `undefined` (definition omitted the field) → all built-ins.
  return config?.builtinToolNames ?? [...BUILTIN_TOOL_NAMES];
}

/** Get config for a type, normalized for the runner. Unknown types resolve to general-purpose. */
export function getConfig(type: string): AgentConfig {
  const config = agents.get(type) ?? agents.get("general-purpose");
  if (config) return config;
  // Absolute fallback (should never happen — DEFAULT_AGENTS always has general-purpose)
  return {
    name: "Agent",
    description: "General-purpose agent for complex, multi-step tasks",
    systemPrompt: "",
    promptMode: "append",
  };
}

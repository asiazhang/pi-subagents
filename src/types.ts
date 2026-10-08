/**
 * types.ts — Type definitions for the subagent system.
 */

import type { ThinkingLevel } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { LifetimeUsage } from "./usage.js";

export type { ThinkingLevel };

/** Agent type: any string name (built-in defaults). */
export type SubagentType = string;

/** Names of the embedded default agents. */
export const DEFAULT_AGENT_NAMES = ["general-purpose", "Explore"] as const;

/** Unified agent configuration — the embedded default agents. */
export interface AgentConfig {
  name: string;
  description: string;
  /** Built-in tools the agent may call. Omitted = all built-ins. */
  builtinToolNames?: string[];
  model?: string;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  systemPrompt: string;
  promptMode: "replace" | "append";
  /** Default for spawn: run in background. undefined = caller decides. */
  runInBackground?: boolean;
  /** true = this is an embedded default agent (informational) */
  isDefault?: boolean;
}

/**
 * Display mode for the persistent above-editor agent widget.
 * - `all`: show every agent (foreground + background).
 * - `background`: hide foreground agents (they already render inline as the
 *   Agent tool result, #118); show background/queued agents.
 * - `off`: hide the widget entirely.
 */
export type WidgetMode = 'all' | 'background' | 'off';

/**
 * How much of the conversation viewer's transcript is rendered as Markdown.
 * - `off`: every line wraps as literal text, as it did before the mode existed.
 * - `assistant`: assistant text renders as Markdown; tool results stay verbatim
 *   and dim. The default, because assistant text *is* Markdown by contract
 *   while a tool result is arbitrary bytes — a Markdown pass over a log or a
 *   diff eats `#` from shell comments, swallows a `---` line into a setext
 *   heading, re-fences indented output and redraws `| a | b |` as a table.
 *   (Ordered-list renumbering is the one such rewrite actively suppressed —
 *   see `MARKDOWN_OPTIONS` — because it silently changes data, not layout.)
 * - `all`: tool results render as Markdown too, for tools that genuinely emit
 *   it (#210's `ctx_execute`), accepting the rewrites above on ones that don't.
 */
export type ViewerMarkdownMode = 'off' | 'assistant' | 'all';

export interface AgentRecord {
  id: string;
  type: SubagentType;
  description: string;
  status: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error";
  result?: string;
  error?: string;
  toolUses: number;
  startedAt: number;
  completedAt?: number;
  session?: AgentSession;
  abortController?: AbortController;
  promise?: Promise<string>;
  /**
   * Present only while the record is "queued": resolves when it leaves the
   * queue, started or aborted. Always resolves, never rejects — a rejection
   * would escape into the caller's tool `execute` and take down pi's whole
   * Promise.all tool batch.
   */
  startGate?: Promise<void>;
  groupId?: string;
  /** Set when result was already consumed via get_subagent_result — suppresses completion notification. */
  resultConsumed?: boolean;
  /** Steering messages queued before the session was ready. */
  pendingSteers?: string[];
  /** The tool_use_id from the original Agent tool call. */
  toolCallId?: string;
  /** Path to the streaming output transcript file. */
  outputFile?: string;
  /** Cleanup function for the output file stream subscription. */
  outputCleanup?: () => void;
  /**
   * Lifetime usage breakdown, accumulated via `message_end` events. Survives
   * compaction. Total = input + output + cacheWrite (cacheRead deliberately
   * excluded — see issue #38). Initialized to zeros at spawn.
   */
  lifetimeUsage: LifetimeUsage;
  /** Number of times this agent's session has compacted. Initialized to 0 at spawn. */
  compactionCount: number;
  /**
   * Whether this agent was spawned to run in the background. Tri-state, set at
   * spawn from `SpawnOptions.isBackground`: `true` = background, `false` =
   * foreground (has an inline Agent tool-result surface), `undefined` = the
   * caller never declared it. The widget's background-only filter keys off this
   * — and excludes only explicit `false`, so `undefined` agents stay visible.
   * Reliable across ALL spawn paths, unlike the UI-only `invocation` snapshot,
   * which only the Agent-tool path populates.
   */
  isBackground?: boolean;
  /** Resolved spawn params, captured for UI display. Fixed at spawn time. */
  invocation?: AgentInvocation;
}

/**
 * What a session reports as its level: pi's `ThinkingLevel` plus the `"off"` a
 * model with thinking disabled reports. Display-only — spawning still takes a
 * `ThinkingLevel`, so this widening cannot leak into an invocation.
 */
export type EffectiveThinkingLevel = ThinkingLevel | "off";

export interface AgentInvocation {
  /** Short display name for tight rows, e.g. "haiku 4.5". Always set once known. */
  modelName?: string;
  /** Canonical `provider/id`, for surfaces with room to disambiguate providers. */
  modelId?: string;
  /** The level actually in effect, once a session exists to report one. */
  thinking?: EffectiveThinkingLevel;
  /**
   * What the caller asked for, kept only when they did not get it — pi clamped
   * the level to the model's capabilities, or the agent type's pinned model
   * outranked the parameter (#182). The snapshot exists to answer "did the spawn
   * honor my instructions?" (#62), which it cannot do if the request is lost, so
   * neither `requested*` field is overwritten once set.
   */
  requestedThinking?: EffectiveThinkingLevel;
  /** The caller's `model` parameter, as written, when the type's pin won. */
  requestedModel?: string;
  maxTurns?: number;
  runInBackground?: boolean;
}

/** Details attached to custom notification messages for visual rendering. */
export interface NotificationDetails {
  id: string;
  description: string;
  status: string;
  toolUses: number;
  turnCount: number;
  maxTurns?: number;
  totalTokens: number;
  durationMs: number;
  outputFile?: string;
  error?: string;
  resultPreview: string;
  /** Additional agents in a group notification. */
  others?: NotificationDetails[];
}

export interface EnvInfo {
  isGitRepo: boolean;
  branch: string;
  platform: string;
}

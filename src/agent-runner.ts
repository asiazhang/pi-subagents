/**
 * agent-runner.ts — Core execution engine: creates sessions, runs agents, collects results.
 */

import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionAPI,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { BUILTIN_TOOL_NAMES, getAgentConfig, getConfig } from "./agent-types.js";
import { runInChildSessionContext } from "./child-context.js";
import { extractText } from "./context.js";
import { detectEnv } from "./env.js";
import { buildAgentPrompt } from "./prompts.js";
import type { SubagentType, ThinkingLevel } from "./types.js";
import type { LifetimeUsage } from "./usage.js";

/**
 * Tool names registered by THIS extension. Single source of truth so the
 * registration sites (index.ts) and the subagent exclusion list below can't
 * drift apart. These are our own tools, not pi built-ins, so they can't be
 * derived from pi — but they only need defining once.
 */
export const SUBAGENT_TOOL_NAMES = {
  AGENT: "Agent",
  GET_RESULT: "get_subagent_result",
  STEER: "steer_subagent",
} as const;

/** Names of tools registered by this extension that subagents must NOT inherit. */
const EXCLUDED_TOOL_NAMES: string[] = Object.values(SUBAGENT_TOOL_NAMES);

/** Default max turns. undefined = unlimited (no turn limit). */
let defaultMaxTurns: number | undefined;

/** Normalize max turns. undefined or 0 = unlimited, otherwise minimum 1. */
export function normalizeMaxTurns(n: number | undefined): number | undefined {
  if (n == null || n === 0) return undefined;
  return Math.max(1, n);
}

/** Get the default max turns value. undefined = unlimited. */
export function getDefaultMaxTurns(): number | undefined { return defaultMaxTurns; }
/** Set the default max turns value. undefined or 0 = unlimited, otherwise minimum 1. */
export function setDefaultMaxTurns(n: number | undefined): void { defaultMaxTurns = normalizeMaxTurns(n); }

/**
 * The turn limit a run of `type` will actually enforce: an explicit value if the
 * caller supplied one, else the type's own `maxTurns`, else the project
 * default. `undefined` = unlimited.
 *
 * Exported because the widget's turn counter (`↻3≤20`) has to predict this
 * before the run starts, and a second copy of the expression would drift from
 * the one below that enforces it.
 */
export function resolveEffectiveMaxTurns(type: string, explicit?: number): number | undefined {
  return normalizeMaxTurns(explicit ?? getAgentConfig(type)?.maxTurns ?? defaultMaxTurns);
}

/**
 * Project default for `persist_session`, from the `rememberAgents` setting.
 * On by default: a persisted session is what lets an agent's conversation be
 * reopened from pi's `/resume` after its record has been evicted.
 */
let rememberAgents = true;

/** Whether subagent sessions are persisted by default. */
export function getRememberAgents(): boolean { return rememberAgents; }
/** Set whether subagent sessions are persisted by default. */
export function setRememberAgents(b: boolean): void { rememberAgents = b; }

/** Additional turns allowed after the soft limit steer message. */
let graceTurns = 5;

/** Get the grace turns value. */
export function getGraceTurns(): number { return graceTurns; }
/** Set the grace turns value (minimum 1). */
export function setGraceTurns(n: number): void { graceTurns = Math.max(1, n); }

/**
 * Try to find the right model for an agent type.
 * Priority: explicit option > type's pinned model > parent model.
 */
export function resolveDefaultModel(
  parentModel: Model<any> | undefined,
  registry: { find(provider: string, modelId: string): Model<any> | undefined; getAvailable?(): Model<any>[] },
  configModel?: string,
): Model<any> | undefined {
  if (configModel) {
    const slashIdx = configModel.indexOf("/");
    if (slashIdx !== -1) {
      const provider = configModel.slice(0, slashIdx);
      const modelId = configModel.slice(slashIdx + 1);

      // Build a set of available model keys for fast lookup
      const available = registry.getAvailable?.();
      const availableKeys = available
        ? new Set(available.map((m: any) => `${m.provider}/${m.id}`))
        : undefined;
      const isAvailable = (p: string, id: string) =>
        !availableKeys || availableKeys.has(`${p}/${id}`);

      const found = registry.find(provider, modelId);
      if (found && isAvailable(provider, modelId)) return found;
    }
  }

  return parentModel;
}

/** Info about a tool event in the subagent. */
export interface ToolActivity {
  type: "start" | "end";
  toolName: string;
}

export interface RunOptions {
  /** ExtensionAPI instance — used for pi.exec() instead of execSync. */
  pi: ExtensionAPI;
  /** Manager-assigned id; suffixes session name to disambiguate parallel spawns (e.g. `Explore#a1b2c3d4`). */
  agentId?: string;
  model?: Model<any>;
  maxTurns?: number;
  signal?: AbortSignal;
  thinkingLevel?: ThinkingLevel;
  /**
   * Reopen this pi session file rather than starting an empty conversation.
   * `createAgentSession` seeds itself from whatever its SessionManager holds,
   * so pointing it at an existing file rehydrates that agent's history and the
   * prompt continues it. Everything else — tools, model, system prompt, turn
   * caps — is still resolved from the agent type, so the continuation runs
   * under the type's *current* definition, not the one the original run used.
   */
  resumeSessionFile?: string;
  /** Called on tool start/end with activity info. */
  onToolActivity?: (activity: ToolActivity) => void;
  /** Called on streaming text deltas from the assistant response. */
  onTextDelta?: (delta: string, fullText: string) => void;
  onSessionCreated?: (session: AgentSession) => void;
  /** Called at the end of each agentic turn with the cumulative count. */
  onTurnEnd?: (turnCount: number) => void;
  /**
   * Called once per assistant message_end with that message's usage delta.
   * Lets callers maintain a lifetime accumulator that survives compaction
   * (which replaces session.state.messages and resets stats-derived sums).
   *
   * `cost` is pi's own `usage.cost.total` for that message — priced from the
   * model's rates, so it is 0 (not missing) for a model pi has no pricing for.
   * We never price anything ourselves; every dollar figure this extension shows
   * or reports traces back to this field.
   */
  onAssistantUsage?: (usage: LifetimeUsage) => void;
  /**
   * Called when the session successfully compacts. `tokensBefore` is upstream's
   * pre-compaction context size estimate. Aborted compactions don't fire.
   */
  onCompaction?: (info: { reason: "manual" | "threshold" | "overflow"; tokensBefore: number }) => void;
}

export interface RunResult {
  responseText: string;
  session: AgentSession;
  /** True if the agent was hard-aborted (max_turns + grace exceeded). */
  aborted: boolean;
  /** True if the agent was steered to wrap up (hit soft turn limit) but finished in time. */
  steered: boolean;
  /**
   * A failure message for the run's FINAL assistant turn, when that turn failed:
   * a provider error (stopReason "error"), or a "length" stop that produced no
   * text (a silent max-token death). pi resolves an exhausted-retries failure
   * normally instead of rejecting, so without this the manager would report such
   * a run as completed — with an empty result, or worse, an earlier turn's text
   * presented as the answer (#144). Undefined for a clean stop, or a "length"
   * stop that produced text (a legitimate truncated answer).
   */
  failure?: string;
}

/**
 * Subscribe to a session and collect the last assistant message text.
 * Returns an object with a `getText()` getter and an `unsubscribe` function.
 */
function collectResponseText(session: AgentSession) {
  let text = "";
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    // message_start also fires for user and toolResult messages — resetting on
    // those would wipe assistant text already collected. Reset only when a new
    // ASSISTANT message begins, so getText() is the last assistant message's text.
    if (event.type === "message_start" && event.message.role === "assistant") {
      text = "";
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      text += event.assistantMessageEvent.delta;
    }
  });
  return { getText: () => text, unsubscribe };
}

/**
 * Get the last non-empty assistant text produced during THIS invocation.
 * `startIndex` is the message count captured before the prompt, so the walk-back
 * never crosses into a previous turn: on a resume whose new turn failed empty,
 * this returns "" instead of the prior turn's answer (#144). Defaults to 0 (a
 * fresh spawn, where the whole history belongs to this run).
 */
function getLastAssistantText(session: AgentSession, startIndex = 0): string {
  for (let i = session.messages.length - 1; i >= startIndex; i--) {
    const msg = session.messages[i];
    if (msg.role !== "assistant") continue;
    const text = extractText(msg.content).trim();
    if (text) return text;
  }
  return "";
}

/**
 * Error message of THIS invocation's final assistant message, when that turn
 * failed. Two failure shapes, both keyed off how the final turn STOPPED:
 *   - stopReason "error": a provider failure pi resolved instead of rejecting
 *     (any text; partial output is surfaced separately).
 *   - stopReason "length" with NO text: a silent max-token death — the run hit
 *     the output-token ceiling before writing anything, which would otherwise
 *     land as a "completed" run with an empty result (the #144 symptom).
 * Everything else completes: a clean "stop"/"toolUse" final, and — crucially — a
 * "length" stop that DID produce text (a legitimate truncated-but-useful answer).
 * "aborted" is handled by the manager's abort flag / "stopped" guard, not here.
 * Bounded by `startIndex` (like the text fallback) so a resume that produced no
 * assistant message of its own never inherits a PRIOR turn's stop reason.
 */
function finalTurnError(session: AgentSession, startIndex = 0): string | undefined {
  for (let i = session.messages.length - 1; i >= startIndex; i--) {
    const msg = session.messages[i];
    if (msg.role !== "assistant") continue;
    if (msg.stopReason === "error") {
      return (msg as { errorMessage?: string }).errorMessage?.trim() || "provider error with no output";
    }
    if (msg.stopReason === "length" && !extractText(msg.content).trim()) {
      return "run hit the output token limit before producing any text";
    }
    return undefined;
  }
  return undefined;
}

/**
 * Wire an AbortSignal to abort a session.
 * Returns a cleanup function to remove the listener.
 */
function forwardAbortSignal(session: AgentSession, signal?: AbortSignal): () => void {
  if (!signal) return () => {};
  const onAbort = () => session.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

/**
 * Keep a subagent's tool scope correct as extensions register tools over time.
 *
 * Extensions may call `registerTool` long after load — pi-mcp from `session_start`,
 * context-mode from `before_agent_start` — so scope has to be re-derived rather than
 * snapshotted. `registerTool` writes into the very `extension.tools` maps this reads,
 * so late arrivals are judged on the next call.
 *
 * Two enforcement points, because neither covers the whole picture:
 *
 *   - `turn_end` re-narrows the ACTIVE set. pi emits `turn_end` immediately before
 *     `prepareNextTurn` re-snapshots `agent.state.tools`, and session listeners run
 *     synchronously, so the narrow lands in time for turns 2..N.
 *   - `beforeToolCall` blocks out-of-scope calls. Turn 1 cannot be narrowed at all:
 *     `before_agent_start` fires INSIDE `prompt()` and may widen the tool set, but
 *     `createContextSnapshot()` freezes that turn's tools immediately after — there
 *     is no hook in between. A call-time check is the only correct guard there.
 *
 * Both are installed on the session and deliberately NOT unsubscribed: they must
 * outlive the `runAgent` call so resumed/steered turns stay scoped. pi's `dispose()`
 * clears `_eventListeners`, so they die with the session rather than leaking.
 *
 * Scope semantics (Q11 of the fork narrowing): an agent type that declares a
 * built-in tool list gets EXACTLY that list — no extension tools. A type that
 * omits the list (general-purpose) gets every built-in plus every extension
 * tool. Extensions always load either way; only presentation differs.
 */
function installExtensionToolScope(
  session: AgentSession,
  ctx: {
    loader: DefaultResourceLoader;
    /** Exact built-in allowlist, or undefined for "all built-ins + all extension tools". */
    builtinToolNames: Set<string> | undefined;
  },
): void {
  const { loader, builtinToolNames } = ctx;

  const inScope = (): Set<string> => {
    const keep = new Set<string>();
    if (builtinToolNames === undefined) {
      for (const t of BUILTIN_TOOL_NAMES) keep.add(t);
      for (const extension of loader.getExtensions().extensions) {
        for (const name of extension.tools.keys()) keep.add(name);
      }
    } else {
      for (const t of builtinToolNames) keep.add(t);
    }
    for (const name of EXCLUDED_TOOL_NAMES) keep.delete(name);
    return keep;
  };

  const renarrow = () => {
    const allowed = inScope();
    const next = session.getAllTools().map((t) => t.name).filter((n) => allowed.has(n));
    const current = session.getActiveToolNames();
    // setActiveToolsByName unconditionally rebuilds the system prompt, so skip
    // the no-op that steady-state turns would otherwise pay for every turn.
    if (next.length !== current.length || next.some((n, i) => n !== current[i])) {
      session.setActiveToolsByName(next);
    }
  };

  // Activate what registered during session_start (eager MCP servers); pi would
  // otherwise leave only its four default built-ins active at turn 1.
  renarrow();

  session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "turn_end") renarrow();
  });

  const priorBeforeToolCall = session.agent.beforeToolCall;
  session.agent.beforeToolCall = async (context, signal) => {
    if (!inScope().has(context.toolCall.name)) {
      return {
        block: true,
        reason: `Tool "${context.toolCall.name}" is not available to this subagent.`,
      };
    }
    return priorBeforeToolCall?.(context, signal);
  };
}

export async function runAgent(
  ctx: ExtensionContext,
  type: SubagentType,
  prompt: string,
  options: RunOptions,
): Promise<RunResult> {
  const config = getConfig(type);

  const effectiveCwd = ctx.cwd;
  const env = await detectEnv(options.pi, effectiveCwd);

  // Get parent system prompt for append-mode agents
  const parentSystemPrompt = ctx.getSystemPrompt();

  // Build system prompt from agent config
  const systemPrompt = buildAgentPrompt(config, effectiveCwd, env, parentSystemPrompt);

  const agentDir = getAgentDir();

  // Extensions: all default-discovered extensions always load. What differs
  // per type is which TOOLS are presented — see installExtensionToolScope.
  //
  // Suppress AGENTS.md/CLAUDE.md and APPEND_SYSTEM.md — upstream's
  // buildSystemPrompt() re-appends both AFTER systemPromptOverride, which
  // would defeat prompt_mode: replace. The parent's identity reaches an
  // append-mode agent via parentSystemPrompt embedded in the override.
  const loader = new DefaultResourceLoader({
    cwd: effectiveCwd,
    agentDir,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => systemPrompt,
    appendSystemPromptOverride: () => [],
  });
  await runInChildSessionContext(() => loader.reload());

  // Resolve model: explicit option > type's pinned model > parent model
  const model = options.model ?? resolveDefaultModel(
    ctx.model, ctx.modelRegistry, config.model,
  );

  // Resolve thinking level: explicit option > type's pinned level > undefined (inherit)
  const thinkingLevel = options.thinkingLevel ?? config.thinking;

  // Undefined list = the type didn't narrow its built-ins → also allow
  // extension tools. A declared list is an EXACT allowlist — no extension
  // tools are presented (they still load and run, handlers and all).
  const builtinToolNames = config.builtinToolNames !== undefined
    ? new Set(config.builtinToolNames)
    : undefined;

  // ─── Tool scoping (registry gate) ────────────────────────────────────────
  //
  // Some extensions register their tools ASYNCHRONOUSLY, long after the
  // `loader.reload()` above: pi-mcp calls registerTool from `session_start`
  // (once its MCP servers connect), context-mode from `before_agent_start`.
  // That is deliberate on their part — eagerly spawning an MCP bridge during
  // extension discovery orphans child processes on pi's non-agent code paths
  // (--help, config, trust probing).
  //
  // So the tool set cannot be snapshotted here. pi's `allowedToolNames` gates
  // tool *registration* (`_refreshToolRegistry`'s `isAllowedTool`), not merely
  // the active set, and is frozen at construction — a name absent from the
  // snapshot is dropped forever, even once the tool actually registers (#125).
  //
  // We therefore leave `allowedToolNames` unset, so pi's live gate admits
  // tools whenever they register, and express the name-stable, permanent part
  // of the scope (our own orchestration tools, and built-ins the type didn't
  // allow) as `excludeTools`, which pi re-applies on every registry refresh.
  // The ACTIVE set is then narrowed live by installExtensionToolScope below.
  const allowedBuiltins = builtinToolNames ?? new Set(BUILTIN_TOOL_NAMES);
  const sessionExcludeTools = [
    ...EXCLUDED_TOOL_NAMES,
    ...BUILTIN_TOOL_NAMES.filter((name) => !allowedBuiltins.has(name)),
  ];

  const settingsManager = SettingsManager.create(effectiveCwd, agentDir);
  const defaultSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR ?? settingsManager.getSessionDir?.();
  const sessionManager = options.resumeSessionFile
    // Reopening an existing conversation: the file already carries its own
    // header (cwd, parent) and history, so none of the create-time options
    // apply. The session dir still matters for a later /new or /branch off it.
    ? SessionManager.open(options.resumeSessionFile, defaultSessionDir)
    : rememberAgents
      ? SessionManager.create(effectiveCwd, defaultSessionDir, {
          // Optional metadata — it only nests the subagent under its spawner in
          // `/resume`. A context without a session manager (a bare programmatic
          // ctx) must still persist rather than take the whole spawn down.
          parentSession: ctx.sessionManager?.getSessionFile?.(),
        })
      : SessionManager.inMemory(effectiveCwd);

  // Pi 0.80.8 replaced createAgentSession's modelRegistry option with
  // modelRuntime, but ExtensionContext still exposes only the registry facade.
  // Pass both so the full supported Pi range retains the parent's providers.
  const parentModelRuntime = (ctx.modelRegistry as unknown as { runtime?: unknown }).runtime;
  const sessionOpts: Parameters<typeof createAgentSession>[0] & {
    modelRegistry: ExtensionContext["modelRegistry"];
    modelRuntime?: unknown;
  } = {
    cwd: effectiveCwd,
    agentDir,
    sessionManager,
    settingsManager,
    modelRegistry: ctx.modelRegistry,
    // `as never` is what keeps this assignable across the supported Pi range:
    // pre-0.80.8 the field exists only via the `modelRuntime?: unknown` shim
    // above, while newer Pi types it as `ModelRuntime` — a shape an opaque
    // `unknown` read off the private facade field can never satisfy.
    ...(parentModelRuntime !== undefined && { modelRuntime: parentModelRuntime as never }),
    model,
    excludeTools: sessionExcludeTools,
    resourceLoader: loader,
  };
  if (thinkingLevel) {
    sessionOpts.thinkingLevel = thinkingLevel;
  }

  const { session } = await runInChildSessionContext(() => createAgentSession(sessionOpts));

  session.setSessionName(
    options.agentId ? `${config.name}#${options.agentId.slice(0, 8)}` : config.name,
  );

  // Bind extensions so that session_start fires and extensions can initialize
  // (e.g. loading credentials, setting up state). Tool gating already happened
  // at session construction via `excludeTools` above — no separate post-bind
  // filter is needed.
  await session.bindExtensions({
    onError: (err) => {
      options.onToolActivity?.({
        type: "end",
        toolName: `extension-error:${err.extensionPath}`,
      });
    },
  });

  // With `allowedToolNames` unset, the registry is scoped by `excludeTools` but
  // the ACTIVE set still needs managing: pi activates only its four default
  // built-ins at turn 1, and lazily-registered extension tools appear later.
  // Both are handled by re-deriving scope from the loader's live extension maps
  // — `registerTool` writes into those same maps, so late arrivals are judged.
  installExtensionToolScope(session, { loader, builtinToolNames });

  options.onSessionCreated?.(session);

  // Track turns for graceful max_turns enforcement
  let turnCount = 0;
  const maxTurns = resolveEffectiveMaxTurns(type, options.maxTurns);
  let softLimitReached = false;
  let aborted = false;

  let currentMessageText = "";
  const unsubTurns = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "turn_end") {
      turnCount++;
      options.onTurnEnd?.(turnCount);
      if (maxTurns != null) {
        if (!softLimitReached && turnCount >= maxTurns) {
          softLimitReached = true;
          session.steer("You have reached your turn limit. Wrap up immediately — provide your final answer now.");
        } else if (softLimitReached && turnCount >= maxTurns + graceTurns) {
          aborted = true;
          session.abort();
        }
      }
    }
    if (event.type === "message_start") {
      currentMessageText = "";
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      currentMessageText += event.assistantMessageEvent.delta;
      options.onTextDelta?.(event.assistantMessageEvent.delta, currentMessageText);
    }
    if (event.type === "tool_execution_start") {
      options.onToolActivity?.({ type: "start", toolName: event.toolName });
    }
    if (event.type === "tool_execution_end") {
      options.onToolActivity?.({ type: "end", toolName: event.toolName });
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      const u = (event.message as any).usage;
      if (u) options.onAssistantUsage?.({
        input: u.input ?? 0,
        output: u.output ?? 0,
        cacheWrite: u.cacheWrite ?? 0,
        cacheRead: u.cacheRead ?? 0,
        cost: u.cost?.total ?? 0,
      });
    }
    if (event.type === "compaction_end" && !event.aborted && event.result) {
      options.onCompaction?.({ reason: event.reason, tokensBefore: event.result.tokensBefore });
    }
  });

  const collector = collectResponseText(session);
  const cleanupAbort = forwardAbortSignal(session, options.signal);

  // Boundary for the history fallback: only assistant text produced from here
  // on counts as this run's output (a fresh session, so usually 0).
  const startLen = session.messages.length;
  try {
    await session.prompt(prompt);
  } finally {
    unsubTurns();
    collector.unsubscribe();
    cleanupAbort();
  }

  const responseText = collector.getText().trim() || getLastAssistantText(session, startLen);
  return {
    responseText,
    session,
    aborted,
    steered: softLimitReached,
    failure: finalTurnError(session, startLen),
  };
}

/**
 * Send a new prompt to an existing session (resume).
 */
export async function resumeAgent(
  session: AgentSession,
  prompt: string,
  options: {
    onToolActivity?: (activity: ToolActivity) => void;
    onAssistantUsage?: (usage: LifetimeUsage) => void;
    onCompaction?: (info: { reason: "manual" | "threshold" | "overflow"; tokensBefore: number }) => void;
    signal?: AbortSignal;
  } = {},
): Promise<{ text: string; failure?: string }> {
  // Boundary for the history fallback: the session already holds prior turns,
  // so only assistant text produced by THIS resume prompt counts as its output
  // — a failed resume must not surface the previous turn's answer (#144).
  const startLen = session.messages.length;
  const collector = collectResponseText(session);
  const cleanupAbort = forwardAbortSignal(session, options.signal);

  const unsubEvents = (options.onToolActivity || options.onAssistantUsage || options.onCompaction)
    ? session.subscribe((event: AgentSessionEvent) => {
        if (event.type === "tool_execution_start") options.onToolActivity?.({ type: "start", toolName: event.toolName });
        if (event.type === "tool_execution_end") options.onToolActivity?.({ type: "end", toolName: event.toolName });
        if (event.type === "message_end" && event.message.role === "assistant") {
          const u = (event.message as any).usage;
          if (u) options.onAssistantUsage?.({
            input: u.input ?? 0,
            output: u.output ?? 0,
            cacheWrite: u.cacheWrite ?? 0,
            cacheRead: u.cacheRead ?? 0,
            cost: u.cost?.total ?? 0,
          });
        }
        if (event.type === "compaction_end" && !event.aborted && event.result) {
          options.onCompaction?.({ reason: event.reason, tokensBefore: event.result.tokensBefore });
        }
      })
    : () => {};

  try {
    await session.prompt(prompt);
  } finally {
    collector.unsubscribe();
    unsubEvents();
    cleanupAbort();
  }

  return {
    text: collector.getText().trim() || getLastAssistantText(session, startLen),
    failure: finalTurnError(session, startLen),
  };
}

/**
 * Send a steering message to a running subagent.
 * The message will interrupt the agent after its current tool execution.
 */
export async function steerAgent(
  session: AgentSession,
  message: string,
): Promise<void> {
  await session.steer(message);
}

/**
 * Get the subagent's conversation messages as formatted text.
 */
export function getAgentConversation(session: AgentSession): string {
  const parts: string[] = [];

  for (const msg of session.messages) {
    if (msg.role === "user") {
      const text = typeof msg.content === "string"
        ? msg.content
        : extractText(msg.content);
      if (text.trim()) parts.push(`[User]: ${text.trim()}`);
    } else if (msg.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: string[] = [];
      for (const c of msg.content) {
        if (c.type === "text" && c.text) textParts.push(c.text);
        else if (c.type === "toolCall") toolCalls.push(`  Tool: ${(c as any).name ?? (c as any).toolName ?? "unknown"}`);
      }
      if (textParts.length > 0) parts.push(`[Assistant]: ${textParts.join("\n")}`);
      if (toolCalls.length > 0) parts.push(`[Tool Calls]:\n${toolCalls.join("\n")}`);
    } else if (msg.role === "toolResult") {
      const text = extractText(msg.content);
      const truncated = text.length > 200 ? text.slice(0, 200) + "..." : text;
      parts.push(`[Tool Result (${msg.toolName})]: ${truncated}`);
    }
  }

  return parts.join("\n\n");
}

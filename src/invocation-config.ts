import type { AgentConfig, ThinkingLevel } from "./types.js";


interface AgentInvocationParams {
  model?: string;
  thinking?: string;
  max_turns?: number;
  run_in_background?: boolean;
}

interface ResolveOptions {
  /**
   * What an unqualified spawn means — the call didn't say.
   *
   * Top-level callers pass the `backgroundByDefault` setting (default `true`,
   * following Claude Code). The `false` fallback only covers a caller that
   * supplies no options at all, which in-tree means tests.
   */
  defaultRunInBackground?: boolean;
}

export function resolveAgentInvocationConfig(
  agentConfig: AgentConfig | undefined,
  params: AgentInvocationParams,
  opts?: ResolveOptions,
): {
  modelInput?: string;
  modelFromParams: boolean;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  runInBackground: boolean;
  /**
   * Caller parameters a type's pinned config outranked, so the surfaces can
   * say "(asked X)" instead of presenting the effective value as the requested
   * one (#182). Populated only where both sides named something and they
   * disagree — a caller who asked for what they got was still honored.
   *
   * `max_turns` is deliberately absent: no surface renders a requested-vs-
   * effective turn limit, so recording one would be dead data.
   */
  overridden?: { thinking?: ThinkingLevel; model?: string };
} {

  const overriddenThinking = agentConfig?.thinking != null && params.thinking != null
    && agentConfig.thinking !== params.thinking
    ? params.thinking as ThinkingLevel
    : undefined;
  const overriddenModel = agentConfig?.model != null && params.model != null
    && agentConfig.model !== params.model
    ? params.model
    : undefined;

  return {
    modelInput: agentConfig?.model ?? params.model,
    modelFromParams: agentConfig?.model == null && params.model != null,
    thinking: (agentConfig?.thinking ?? params.thinking) as ThinkingLevel | undefined,
    maxTurns: agentConfig?.maxTurns ?? params.max_turns,
    runInBackground: params.run_in_background ?? opts?.defaultRunInBackground ?? false,
    // Undefined rather than an empty object when nothing was overridden: callers
    // spread this into the invocation snapshot, and an always-present key would
    // put `requestedThinking: undefined` on every record.
    overridden: overriddenThinking || overriddenModel
      ? { thinking: overriddenThinking, model: overriddenModel }
      : undefined,
  };
}

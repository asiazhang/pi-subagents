/** usage.ts — Token usage: shapes, accumulator operators, session-stats readers. */

/**
 * Lifetime usage components, accumulated via `message_end` events. Survives
 * compaction (which replaces session.state.messages and would reset any
 * stats-derived sum). cacheRead is excluded because each turn's cacheRead is
 * the cumulative cached prefix re-read on that one call — summing across
 * turns counts the prefix N times. See issue #38.
 *
 * That exclusion is about this *display* total, not about what was billed: the
 * prefix really is re-read and re-charged on every call. So `cacheRead` is
 * accumulated here anyway, kept out of `getLifetimeTotal` and used only where
 * billing is the question — reporting to the parent session, whose own messages
 * pi counts the same way (`addUsageToTotals`). Reporting 0 there would make a
 * subagent's rows count differently from every other row in one total.
 *
 * `cost` is a plain sum for the same reason: it is what pi charged for that one
 * message (`usage.cost.total`, priced from the model's rates), not a cumulative
 * figure. Both are optional because a model with no pricing data reports no
 * cost, and because every accumulator predates them; absent reads as 0.
 */
export type LifetimeUsage = { input: number; output: number; cacheWrite: number; cacheRead?: number; cost?: number };

/**
 * Sum of lifetime *token* components for DISPLAY, or 0 if undefined.
 * Deliberately excludes `cacheRead` (see above) and `cost` — that is money, not
 * tokens, and lives on the same object only because it accumulates on the same
 * events.
 */
export function getLifetimeTotal(u?: LifetimeUsage): number {
  return u ? u.input + u.output + u.cacheWrite : 0;
}


/** Add a usage delta into a target accumulator (mutates target). */
export function addUsage(into: LifetimeUsage, delta: LifetimeUsage): void {
  into.input += delta.input;
  into.output += delta.output;
  into.cacheWrite += delta.cacheWrite;
  if (delta.cacheRead) into.cacheRead = (into.cacheRead ?? 0) + delta.cacheRead;
  if (delta.cost) into.cost = (into.cost ?? 0) + delta.cost;
}



/** Minimal shape we read from upstream `getSessionStats()`. */
export type SessionStatsLike = {
  tokens: { input: number; output: number; cacheWrite: number };
  contextUsage?: { percent: number | null };
};
export type SessionLike = { getSessionStats(): SessionStatsLike };

/**
 * Session-scoped token count: input + output + cacheWrite as reported by
 * upstream `getSessionStats().tokens` for the *current* session window.
 *
 * RESETS at compaction — upstream replaces `session.state.messages` and the
 * stats are derived from that array. For a lifetime total that survives
 * compaction, use `getLifetimeTotal(lifetimeUsage)` instead, which reads
 * from an independent accumulator fed by `message_end` events.
 *
 * Avoids upstream's `tokens.total` field, which sums per-turn `cacheRead`
 * and so counts the cumulative cached prefix N times across N turns
 * (issue #38).
 */
export function getSessionTokens(session: SessionLike | undefined): number {
  if (!session) return 0;
  try {
    const t = session.getSessionStats().tokens;
    return t.input + t.output + t.cacheWrite;
  } catch { return 0; }
}

/**
 * Context-window utilization (0–100), or null when unavailable
 * (no model contextWindow, or post-compaction before the next response).
 */
export function getSessionContextPercent(session: SessionLike | undefined): number | null {
  if (!session) return null;
  try { return session.getSessionStats().contextUsage?.percent ?? null; }
  catch { return null; }
}

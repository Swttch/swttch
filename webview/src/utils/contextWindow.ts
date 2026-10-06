import { parseContextUsage, parseTokenValue } from './parseContextUsage';

const SYSTEM_OVERHEAD = 13_000;

/**
 * Share of the whole context window that `totalTokens` fills, as a plain
 * percentage cut off at `decimals` places. The denominator is the window itself
 * (what Claude Desktop and the CLI's `/context` divide by), not the smaller
 * budget left before auto-compact.
 *
 * Integer arithmetic keeps the cut exact: dividing first can land a hair under
 * a whole number and floor one step too low.
 */
export function calculateContextWindowPercent(
  totalTokens: number,
  contextWindow: number,
  decimals: number,
): number {
  if (contextWindow <= 0) return 0;
  const scale = 10 ** decimals;
  const percent = Math.floor((totalTokens * 100 * scale) / contextWindow) / scale;
  return Math.min(percent, 100);
}

/**
 * How much of the context is still free before the CLI compacts on its own,
 * whole percent, cut off. The CLI compacts before the window is full: it
 * reserves room for the longest reply and a fixed system overhead.
 */
export function calculateAutoCompactRemainingPercent(
  totalTokens: number,
  contextWindow: number,
  maxOutputTokens: number,
): number {
  const availableTokens = Math.max(contextWindow - maxOutputTokens - SYSTEM_OVERHEAD, 1);
  const usedPercent = Math.min((totalTokens / availableTokens) * 100, 100);
  return Math.floor(100 - usedPercent);
}

/**
 * Compact token count: `66.2k`, `81k`, `1M`, `1.05M`. At most one decimal for
 * thousands and two for millions; a trailing `.0` is dropped. Cut off, not
 * rounded, so 999,999 reads `999.9k` rather than the nonsensical `1000k`.
 */
export function formatTokenCount(tokens: number): string {
  const whole = Math.floor(tokens);
  if (whole >= 1_000_000) return `${Math.floor(whole / 10_000) / 100}M`;
  if (whole >= 1_000) return `${Math.floor(whole / 100) / 10}k`;
  return String(whole);
}

/**
 * The context window size, in tokens, out of a `/context` report ("Tokens: 43.3k / 1m
 * (4%)" reads as 1,000,000). Null when the report is not one, or its total is unreadable.
 */
export function contextWindowFromReport(markdown: string): number | null {
  const usage = parseContextUsage(markdown);
  if (!usage) return null;
  const total = parseTokenValue(usage.tokensTotalLabel);
  return Number.isFinite(total) && total > 0 ? total : null;
}

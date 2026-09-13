import { ModelInfo } from '@/types/slashCommand';
import { resolveModelInfo } from '@/types/models';

/**
 * Reformat a CLI model description segment into the TUI's parenthesized style:
 *   "Opus 4.8 with 1M context" → "Opus 4.8 (1M context)"
 * When the segment carries no "with …" qualifier it is returned unchanged.
 */
function toParenthesizedName(segment: string): string {
  const match = segment.match(/^(.*?)\s+with\s+(.+)$/i);
  if (!match) return segment.trim();
  return `${match[1].trim()} (${match[2].trim()})`;
}

/**
 * Resolve a human model name for the context card from the CLI model catalog.
 * The `/context` markdown only carries the model id (e.g. "claude-opus-4-8[1m]"),
 * so we look the id up against the catalog and reconstruct the friendly name the
 * native TUI shows ("Opus 4.8 (1M context)") from the model's description. Falls
 * back to the catalog `displayName`, then to '' when nothing resolves — the
 * caller then shows the raw id alone.
 */
export function resolveContextModelName(
  models: ModelInfo[],
  modelId: string,
): string {
  if (models.length === 0 || !modelId) return '';
  const info = resolveModelInfo(models, modelId);
  if (!info) return '';
  const firstSegment = info.description?.split('·')[0]?.trim();
  if (firstSegment) return toParenthesizedName(firstSegment);
  return info.displayName ?? '';
}

/**
 * Normalize the CLI's token summary spacing into the TUI form:
 *   used "58.3k", total "1m", percent 6 → "58.3k/1m tokens (6%)"
 * (no spaces around the slash, "tokens" inserted).
 */
export function formatTokensSummary(
  used: string,
  total: string,
  percent: number,
): string {
  return `${used || '—'}/${total || '—'} tokens (${percent}%)`;
}

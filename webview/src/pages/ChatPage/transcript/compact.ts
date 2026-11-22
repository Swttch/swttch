import { getTextContent, type LoadedMessageDto } from '../../../types';

/** What the CLI writes at the start of the summary it carries over a compaction. */
const SUMMARY_OPENING = 'This session is being continued from a previous conversation';

/** The entry that marks where a conversation was compacted. */
export function isCompactBoundary(message: LoadedMessageDto): boolean {
  return message.type === 'system' && message.subtype === 'compact_boundary';
}

/**
 * The summary the CLI hands the model in place of what it dropped. It is written for the model, not the reader: the
 * desktop app does not draw it, and draws the boundary before it instead.
 */
export function isCompactSummaryEntry(message: LoadedMessageDto): boolean {
  if (message.isCompactSummary) return true;
  return message.type === 'user' && !message.isMeta && getTextContent(message).trimStart().startsWith(SUMMARY_OPENING);
}

/** A notice the CLI raised about the session itself ("Compacted using a summary written while you were away …"). */
export function isCliNotice(message: LoadedMessageDto): boolean {
  return message.type === 'system' && message.subtype === 'informational' && Boolean(message.content?.trim());
}

/**
 * How many tokens this compaction saved: what the conversation held before it minus what it holds after. The saved
 * session also carries a running total over every compaction so far (`cumulativeDroppedTokens`), which the desktop
 * app does not show; it only equals this figure for the first compaction of a session.
 */
export function compactSavedTokens(message: LoadedMessageDto): number | undefined {
  const meta = message.compactMetadata;
  if (!meta) return undefined;
  const { preTokens, postTokens, cumulativeDroppedTokens } = meta;
  if (typeof preTokens === 'number' && typeof postTokens === 'number') return preTokens - postTokens;
  return typeof cumulativeDroppedTokens === 'number' ? cumulativeDroppedTokens : undefined;
}

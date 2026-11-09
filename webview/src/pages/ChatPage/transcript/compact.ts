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

/** `828311` as `828.3k`, `1250000` as `1.3M`: the way the desktop app writes how many tokens a compaction saved. */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

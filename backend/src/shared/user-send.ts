/**
 * Which entries of a transcript are messages the user sent: the one rule behind the user bubble, the tick on the
 * send index rail and the entry in the composer's Up/Down history (#735). Each of them draws a send its own way,
 * and none of them decides for itself what a send is.
 *
 * The rule is the one the chat is drawn by: an entry the chat draws as the user's own message (a bubble, or the
 * pictures that stand in its place) is a send. Everything else that the CLI, the desktop app or another session
 * writes as a `user` entry is not, whatever it is drawn as.
 */
import { withoutAppEvents, carriesAppEvent, carriesUserSend } from './app-event';
import { withoutIdeContext, withoutSystemReminders } from './cli-authored-text';
import { parseCrossSessionMessage } from './cross-session';
import { parseSessionBrief } from './session-brief';

/** A transcript entry as it is read, on either side: the raw record, not edited. */
export type TranscriptEntry = Record<string, unknown>;

function asEntry(value: unknown): TranscriptEntry | null {
  return value && typeof value === 'object' ? (value as TranscriptEntry) : null;
}

function contentOf(entry: TranscriptEntry): unknown {
  return (entry.message as { content?: unknown } | undefined)?.content;
}

function blocksOf(entry: TranscriptEntry): Array<Record<string, unknown>> {
  const content = contentOf(entry);
  if (!Array.isArray(content)) return [];
  return content.filter((block): block is Record<string, unknown> => !!block && typeof block === 'object');
}

/** The text an entry carries: its string content, or its text blocks. */
export function entryText(entry: unknown): string {
  const record = asEntry(entry);
  if (!record) return '';
  const content = contentOf(record);
  if (typeof content === 'string') return content;
  return blocksOf(record)
    .filter((block) => block.type === 'text')
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('\n');
}

/** How many pictures the entry holds. */
export function entryImageCount(entry: unknown): number {
  const record = asEntry(entry);
  return record ? blocksOf(record).filter((block) => block.type === 'image').length : 0;
}

/** The name of the slash command an entry records, without the slash, or undefined when it records none. */
export function entryCommandName(entry: unknown): string | undefined {
  const match = /<command-name>([\s\S]*?)<\/command-name>/.exec(entryText(entry));
  return match ? match[1].trim().replace(/^\/+/, '') : undefined;
}

/**
 * The part of an entry's text that a person typed: what is left once what the GUI, the IDE and the app wrote around
 * it is taken out. Command tags stay, since the command they hold is what was typed.
 */
export function typedPartOf(text: string): string {
  return withoutIdeContext(withoutSystemReminders(withoutAppEvents(text)))
    .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '');
}

/** A name made only of characters that draw nothing would be a lone slash in a box. */
const INVISIBLE_CHARACTERS = /[\s­͏؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/** True when the entry is a message the user sent. */
export function isUserSendEntry(value: unknown): boolean {
  const entry = asEntry(value);
  if (!entry || entry.type !== 'user') return false;

  // Entries the CLI writes itself, and marks as such: a note for Claude, a synthetic entry, the summary a compaction
  // carries over, and what a skill or command expands to.
  if (entry.isMeta || entry.isSynthetic || entry.isCompactSummary || entry.isVisibleInTranscriptOnly) return false;
  if (entry.sourceToolUseID) return false;

  // A tool result is a `user` entry too, and outnumbers sends many times over.
  if (entry.toolUseResult !== undefined) return false;
  if (typeof contentOf(entry) !== 'string' && !Array.isArray(contentOf(entry))) return false;
  if (blocksOf(entry).some((block) => block.type === 'tool_result')) return false;

  // Sent by another session, or the notice that a background task is over.
  const origin = (entry.origin as { kind?: unknown } | undefined)?.kind;
  if (origin === 'peer' || origin === 'task-notification') return false;

  const text = entryText(entry);
  // The app writes its reports into the entry of the next send, so one entry can be a report, a send, or both.
  if (carriesAppEvent(entry) && !carriesUserSend(entry)) return false;
  // A message another session sent, and the brief a session is started with: both are drawn as their own cards.
  if (parseCrossSessionMessage(text)) return false;
  if (parseSessionBrief(withoutSystemReminders(text).trimStart())) return false;

  const typed = typedPartOf(text).trim();
  if (typed.startsWith('[Request interrupted by user')) return false;
  // The output of a command the CLI ran by itself, and the model change, which is drawn as a notice.
  if (typed.includes('<local-command-stdout>')) return false;
  const command = entryCommandName(entry);
  if (command !== undefined) return command !== 'model' && command.replace(INVISIBLE_CHARACTERS, '') !== '';

  const words = typed.replace(/<command-message>[\s\S]*?<\/command-message>/g, '').replace(INVISIBLE_CHARACTERS, '');
  return words !== '' || entryImageCount(entry) > 0;
}

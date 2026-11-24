import type { TFunction } from 'i18next';
import type { LoadedMessageDto } from '../../../types';
import { isContentBlockArray } from '../../../types';
import { ContentBlockType, type ToolUseBlockDto } from '../../../dto/message/ContentBlockDto';
import { baseName, pathOf, toolKindOf, type ToolKind } from './toolSummary';
import { isCardTool, type ToolCall } from './buildSegments';
import type { WorkingActivity } from './WorkingMark';

/** What the model is doing while a turn runs and a call has not come back yet: the call, and what it is doing in words. */
export interface StreamingActivity {
  /** The id of the call being waited on, so the run that holds it can tell it is the live one. */
  toolUseId: string;
  /** The call's own line about what it is for (a command's `description`), when it gave one. */
  description: string | null;
  /** Which of the desktop app's progress phrases says it when the call has no description. */
  phrase: 'command' | 'pageScript' | 'editing' | 'reading' | 'searching' | 'fetching' | 'agent' | 'working';
  /** Which mark says it: a command runs with the square of four dots, a file is read with the circling dots, and any other call with the row of three. */
  mark: WorkingActivity;
  /** The file a change is being made to, for a file edit or a new file: the line then names it ("Editing x") instead of counting seconds. */
  file: { name: string; creating: boolean } | null;
}

const PHRASE_OF: Partial<Record<ToolKind, StreamingActivity['phrase']>> = {
  command: 'command',
  pageScript: 'pageScript',
  edit: 'editing',
  write: 'editing',
  read: 'reading',
  searchCode: 'searching',
  searchFiles: 'searching',
  webSearch: 'searching',
  webFetch: 'fetching',
  agent: 'agent',
};

const MARK_OF: Partial<Record<ToolKind, WorkingActivity>> = {
  command: 'code',
  read: 'read',
};

/** How many of the newest entries are looked through: the call that is running is in the last of them. */
const LOOK_BACK = 6;

/**
 * Whether an entry is what a person sent, where the calls before it belong to an earlier turn and no longer wait on
 * anything. A send of plain text has a string for its content; one that carries a picture has a list of blocks (the
 * text and the pictures), so the content's shape cannot tell a send from the CLI writing a call's result. What can: a
 * result has a `tool_result` block, and a send has text or a picture and was not written by the CLI itself (a skill's
 * prompt, a note under a picture, a hook's feedback).
 */
export function isASend(message: LoadedMessageDto): boolean {
  if (message.type !== 'user') return false;
  const content = message.message?.content;
  if (!isContentBlockArray(content)) return true;
  if (message.isSynthetic || message.isMeta || message.sourceToolUseID) return false;
  if (content.some((block) => block.type === ContentBlockType.ToolResult)) return false;
  return content.some((block) => block.type === ContentBlockType.Text || block.type === ContentBlockType.Image);
}

/**
 * The call the running turn is waiting on, read from the newest entries: the last tool call that has no result yet.
 * Null when nothing is being waited on, which is when the model is thinking or writing.
 */
export function runningActivity(messages: LoadedMessageDto[]): StreamingActivity | null {
  for (let index = messages.length - 1, seen = 0; index >= 0 && seen < LOOK_BACK; index--, seen++) {
    const message = messages[index];
    if (isASend(message)) return null;
    const content = message.message?.content;
    if (!isContentBlockArray(content)) continue;
    for (let at = content.length - 1; at >= 0; at--) {
      const block = content[at];
      if (block.type !== ContentBlockType.ToolUse) continue;
      const toolUse = block as ToolUseBlockDto;
      if (toolUse.tool_result) continue;
      // A question, a plan, what was sent: drawn as a card of its own, not as a call in a run, so no run can say it is working.
      if (isCardTool(toolUse.name, toolUse.input as Record<string, unknown> | undefined)) return null;
      return activityOfCall({ toolUse, message });
    }
  }
  return null;
}

/**
 * Whether two readings say the same thing, so that a view can keep handing out the object it has while the call is
 * the same, however many words arrive (#680).
 */
export function isSameActivity(a: StreamingActivity | null, b: StreamingActivity | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.toolUseId === b.toolUseId &&
    a.description === b.description &&
    a.phrase === b.phrase &&
    a.mark === b.mark &&
    a.file?.name === b.file?.name &&
    a.file?.creating === b.file?.creating
  );
}

/** What one call is doing, in the terms the summary line says it: the call itself, whether or not it has answered. */
export function activityOfCall(call: ToolCall): StreamingActivity {
  const { toolUse } = call;
  const description = typeof toolUse.input?.description === 'string' ? (toolUse.input.description as string).trim() : '';
  const kind = toolKindOf(call);
  const path = kind === 'edit' || kind === 'write' ? pathOf(call) : '';
  return {
    toolUseId: toolUse.id,
    description: description || null,
    phrase: PHRASE_OF[kind] ?? 'working',
    mark: MARK_OF[kind] ?? 'default',
    file: path ? { name: baseName(path), creating: kind === 'write' } : null,
  };
}

/** What a call is doing, in words: its own description, or the desktop app's phrase for the kind of call. */
export function activityLabel(activity: StreamingActivity, t: TFunction): string {
  return activity.file
    ? t(activity.file.creating ? 'transcript.tools.creatingFile' : 'transcript.tools.editingFile', { name: activity.file.name })
    : (activity.description ?? t(`transcript.streaming.activity.${activity.phrase}`));
}

/** 725 stays 725; 3712 is 3.7k; 12000 is 12k. */
export function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  const thousands = Math.round(count / 100) / 10;
  return `${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
}

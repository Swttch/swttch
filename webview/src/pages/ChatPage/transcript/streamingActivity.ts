import type { LoadedMessageDto } from '../../../types';
import { isContentBlockArray } from '../../../types';
import { ContentBlockType, type ToolUseBlockDto } from '../../../dto/message/ContentBlockDto';
import { toolKindOf, type ToolKind } from './toolSummary';
import { isCardTool, type ToolCall } from './buildSegments';

/** What the model is doing while a turn runs and a call has not come back yet: the call, and what it is doing in words. */
export interface StreamingActivity {
  /** The id of the call being waited on, so the run that holds it can tell it is the live one. */
  toolUseId: string;
  /** The call's own line about what it is for (a command's `description`), when it gave one. */
  description: string | null;
  /** Which of the desktop app's progress phrases says it when the call has no description. */
  phrase: 'command' | 'pageScript' | 'editing' | 'reading' | 'searching' | 'fetching' | 'agent' | 'working';
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

/** How many of the newest entries are looked through: the call that is running is in the last of them. */
const LOOK_BACK = 6;

/**
 * The call the running turn is waiting on, read from the newest entries: the last tool call that has no result yet.
 * Null when nothing is being waited on, which is when the model is thinking or writing.
 */
export function runningActivity(messages: LoadedMessageDto[]): StreamingActivity | null {
  for (let index = messages.length - 1, seen = 0; index >= 0 && seen < LOOK_BACK; index--, seen++) {
    const message = messages[index];
    if (message.type === 'user' && !isContentBlockArray(message.message?.content)) return null;
    const content = message.message?.content;
    if (!isContentBlockArray(content)) continue;
    for (let at = content.length - 1; at >= 0; at--) {
      const block = content[at];
      if (block.type !== ContentBlockType.ToolUse) continue;
      const toolUse = block as ToolUseBlockDto;
      if (toolUse.tool_result) continue;
      // A question, a plan, what was sent: drawn as a card of its own, not as a call in a run, so no run can say it is working.
      if (isCardTool(toolUse.name)) return null;
      const call: ToolCall = { toolUse, message };
      const description = typeof toolUse.input?.description === 'string' ? (toolUse.input.description as string).trim() : '';
      return { toolUseId: toolUse.id, description: description || null, phrase: PHRASE_OF[toolKindOf(call)] ?? 'working' };
    }
  }
  return null;
}

/** 725 stays 725; 3712 is 3.7k; 12000 is 12k. */
export function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  const thousands = Math.round(count / 100) / 10;
  return `${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
}

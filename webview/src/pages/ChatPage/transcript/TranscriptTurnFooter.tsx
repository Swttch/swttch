import { useMemo } from 'react';
import type { LoadedMessageDto } from '@/types';
import { useSendActionsValue } from '../SendActionsContext';
import { TranscriptReplyFooter } from './TranscriptReplyFooter';

/** The words the turn's replies say, in order, and the last entry that said any: what the line's copy and read aloud act on. */
function replyOfTurn(body: LoadedMessageDto[]): { text: string; last: LoadedMessageDto | null } {
  const parts: string[] = [];
  let last: LoadedMessageDto | null = null;
  // A turn that said nothing but asked a question, which was answered in the chat, has its line too (the desktop app draws it under that question's line).
  let lastQuestion: LoadedMessageDto | null = null;
  for (const entry of body) {
    if (entry.type !== 'assistant' || entry.isSidechain === true) continue;
    const content = (entry.message as { content?: unknown } | undefined)?.content;
    const words: string[] = [];
    if (typeof content === 'string') {
      if (content.trim() !== '') words.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content as Array<{ type?: unknown; text?: unknown }>) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') words.push(block.text);
      }
    }
    if (Array.isArray(content) && (content as Array<{ type?: unknown; name?: unknown }>).some((block) => block.type === 'tool_use' && block.name === 'AskUserQuestion')) lastQuestion = entry;
    if (words.length === 0) continue;
    parts.push(...words);
    last = entry;
  }
  return { text: parts.join('\n\n'), last: last ?? lastQuestion };
}

/**
 * The copy / fork / read aloud / time line of a reply, at the end of the whole turn: the last thing in the box that
 * holds the turn (`data-section-body`, which is the hover group), so that it shows while the pointer is anywhere on
 * the turn. Copy and read aloud take the words of every reply of the turn; fork takes the turn at its last reply.
 */
export function TranscriptTurnFooter({ body, sectionKey, running }: { body: LoadedMessageDto[]; sectionKey: string; running: boolean }) {
  const sendActions = useSendActionsValue();
  const { text, last } = useMemo(() => replyOfTurn(body), [body]);
  if (running || last === null) return null;
  const uuid = last.uuid;
  return (
    <div className="px-4 -mt-2">
      <TranscriptReplyFooter
        copyText={text === '' ? undefined : text}
        readAloudKey={text === '' ? undefined : `${sectionKey}:turn`}
        timestamp={last.timestamp}
        onFork={sendActions && uuid && sendActions.canForkReply(uuid) ? () => sendActions.forkAtReply(uuid) : undefined}
      />
    </div>
  );
}

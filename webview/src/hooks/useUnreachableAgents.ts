import { useMemo } from 'react';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import type { LoadedMessageDto } from '@/types';

/**
 * The CLI's refusal to resume an agent:
 *
 *   Agent "ab5ae1f1b104ce2f7" could not be resumed: No transcript found for
 *   agent ID: ab5ae1f1b104ce2f7. …it never ran in this session…
 *
 * Matched on the wording rather than on `success:false`, which any number of
 * transient problems could also produce. This one is definitive: an agent lives
 * in the CLI session that started it, and once that session is gone there is no
 * transcript to resume from and never will be again.
 */
const REFUSAL = /Agent\s+\\?"([a-zA-Z0-9_-]+)\\?"\s+could not be resumed/g;

/** Text of every tool_result in a message, however its content is shaped. */
function toolResultTexts(message: LoadedMessageDto): string[] {
  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const raw of content) {
    const block = raw as Record<string, unknown>;
    if (block['type'] !== 'tool_result') continue;
    const inner = block['content'];
    if (typeof inner === 'string') {
      out.push(inner);
      continue;
    }
    if (!Array.isArray(inner)) continue;
    for (const part of inner) {
      const text = (part as Record<string, unknown>)['text'];
      if (typeof text === 'string') out.push(text);
    }
  }
  return out;
}

/**
 * Agents this session can no longer reach, read off the conversation itself.
 *
 * Deliberately the webview's job rather than the backend's. The backend's
 * tracker only knows tasks it saw start: a task rebuilt from the transcript on
 * reload never enters it, and those are exactly the ones most likely to be
 * refused — an agent from a run that happened before the current CLI process
 * began. A refusal aimed at one of them would find no task to mark.
 *
 * The conversation has no such gap. Every SendMessage and every answer to one
 * is in it, live or reloaded alike, so reading it catches both.
 */
export function useUnreachableAgents(): ReadonlySet<string> {
  const { messages } = useChatStreamContext();

  return useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      for (const text of toolResultTexts(message)) {
        if (!text.includes('could not be resumed')) continue;
        for (const match of text.matchAll(REFUSAL)) ids.add(match[1]);
      }
    }
    return ids;
  }, [messages]);
}

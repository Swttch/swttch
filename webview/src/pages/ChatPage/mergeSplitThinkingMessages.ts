import { LoadedMessageDto, isContentBlockArray } from '../../types';
import { LoadedMessageType } from '../../dto/common';
import { ContentBlockType, ThinkingBlockDto } from '../../dto/message/ContentBlockDto';
import { joinThinkingBlocks } from './message-renderers/mergeAdjacentThinkingBlocks';

/** The API response an entry came from: the loaded JSONL keeps it on `message.id`, a live entry on `message_id`. */
function responseIdOf(message: LoadedMessageDto): string | undefined {
  return message.message?.id ?? message.message_id;
}

/**
 * Put back together a thinking stretch that one response split across two
 * session entries.
 *
 * The session file writes each content block of a response as its own entry,
 * so a response that sent its thinking as an empty block followed by a block
 * with the summary text (#496) loads as two neighbouring entries. When an
 * entry ends in a thinking block and the next entry starts with one, and both
 * carry the same response id, the two blocks are joined into the later entry.
 * An earlier entry left with nothing is dropped.
 *
 * Entries from different responses are never joined, even when they arrive
 * back to back. Entries without a response id are left alone.
 *
 * Returns a new array; the input messages and their blocks are never mutated.
 */
export function mergeSplitThinkingMessages(messages: LoadedMessageDto[]): LoadedMessageDto[] {
  const result: LoadedMessageDto[] = [];
  for (const message of messages) {
    const prev = result[result.length - 1];
    const content = message.message?.content;
    const prevContent = prev?.message?.content;
    const responseId = responseIdOf(message);

    if (
      prev !== undefined &&
      message.type === LoadedMessageType.Assistant &&
      prev.type === LoadedMessageType.Assistant &&
      responseId !== undefined &&
      responseIdOf(prev) === responseId &&
      isContentBlockArray(content) &&
      isContentBlockArray(prevContent) &&
      content[0]?.type === ContentBlockType.Thinking &&
      prevContent[prevContent.length - 1]?.type === ContentBlockType.Thinking
    ) {
      const joined = joinThinkingBlocks(
        prevContent[prevContent.length - 1] as ThinkingBlockDto,
        content[0] as ThinkingBlockDto,
      );
      const remaining = prevContent.slice(0, -1);
      if (remaining.length === 0) {
        result.pop();
      } else {
        result[result.length - 1] = { ...prev, message: { ...prev.message!, content: remaining } } as LoadedMessageDto;
      }
      result.push({ ...message, message: { ...message.message!, content: [joined, ...content.slice(1)] } } as LoadedMessageDto);
      continue;
    }

    result.push(message);
  }
  return result;
}

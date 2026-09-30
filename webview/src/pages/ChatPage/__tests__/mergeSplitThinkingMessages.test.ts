import { describe, it, expect } from 'vitest';
import { mergeSplitThinkingMessages } from '../mergeSplitThinkingMessages';
import { LoadedMessageDto } from '../../../types';
import { LoadedMessageType, MessageRole } from '../../../dto/common';
import { AnyContentBlockDto, ContentBlockType, ThinkingBlockDto } from '../../../dto/message/ContentBlockDto';

const thinking = (text: string) => ({ type: ContentBlockType.Thinking, thinking: text }) as ThinkingBlockDto;
const text = (t: string) => ({ type: ContentBlockType.Text, text: t }) as AnyContentBlockDto;

const assistant = (uuid: string, responseId: string | undefined, content: AnyContentBlockDto[]) =>
  ({
    type: LoadedMessageType.Assistant,
    uuid,
    message: { role: MessageRole.Assistant, id: responseId, content },
  }) as unknown as LoadedMessageDto;

const contentOf = (m: LoadedMessageDto) => m.message!.content as AnyContentBlockDto[];

/**
 * The session file writes each block of a response as its own entry, so a
 * thinking stretch the response split into an empty block and a text block
 * loads as two neighbouring entries with the same response id (#496).
 */
describe('mergeSplitThinkingMessages', () => {
  it('joins the split thinking of one response into the later entry', () => {
    const merged = mergeSplitThinkingMessages([
      assistant('a', 'msg_1', [thinking('')]),
      assistant('b', 'msg_1', [thinking('Checking the log first.')]),
      assistant('c', 'msg_1', [text('Done.')]),
    ]);

    expect(merged.map(m => m.uuid)).toEqual(['b', 'c']);
    expect(contentOf(merged[0])).toEqual([
      expect.objectContaining({ type: ContentBlockType.Thinking, thinking: 'Checking the log first.' }),
    ]);
  });

  it('never joins thinking from two different responses, even back to back', () => {
    const merged = mergeSplitThinkingMessages([
      assistant('a', 'msg_1', [thinking('First response.')]),
      assistant('b', 'msg_2', [thinking('Second response.')]),
    ]);

    expect(merged.map(m => m.uuid)).toEqual(['a', 'b']);
    expect((contentOf(merged[0])[0] as ThinkingBlockDto).thinking).toBe('First response.');
    expect((contentOf(merged[1])[0] as ThinkingBlockDto).thinking).toBe('Second response.');
  });

  it('leaves entries without a response id alone', () => {
    const merged = mergeSplitThinkingMessages([
      assistant('a', undefined, [thinking('')]),
      assistant('b', undefined, [thinking('Text.')]),
    ]);
    expect(merged.map(m => m.uuid)).toEqual(['a', 'b']);
  });

  it('keeps the rest of the earlier entry when it held more than the thinking block', () => {
    const merged = mergeSplitThinkingMessages([
      assistant('a', 'msg_1', [text('Before.'), thinking('')]),
      assistant('b', 'msg_1', [thinking('After.')]),
    ]);

    expect(merged.map(m => m.uuid)).toEqual(['a', 'b']);
    expect(contentOf(merged[0])).toEqual([expect.objectContaining({ type: ContentBlockType.Text, text: 'Before.' })]);
    expect((contentOf(merged[1])[0] as ThinkingBlockDto).thinking).toBe('After.');
  });

  it('does not touch the input', () => {
    const input = [
      assistant('a', 'msg_1', [thinking('')]),
      assistant('b', 'msg_1', [thinking('Text.')]),
    ];
    mergeSplitThinkingMessages(input);
    expect(input).toHaveLength(2);
    expect((contentOf(input[1])[0] as ThinkingBlockDto).thinking).toBe('Text.');
  });
});

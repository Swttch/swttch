import { describe, it, expect } from 'vitest';
import { mergeAdjacentThinkingBlocks } from '../mergeAdjacentThinkingBlocks';
import {
  AnyContentBlockDto,
  ContentBlockType,
  ThinkingBlockDto,
} from '../../../../dto/message/ContentBlockDto';

const thinking = (text: string, extra: Partial<ThinkingBlockDto> = {}) =>
  ({ type: ContentBlockType.Thinking, thinking: text, ...extra }) as ThinkingBlockDto;
const text = (t: string) => ({ type: ContentBlockType.Text, text: t }) as AnyContentBlockDto;

/**
 * One response can send one stretch of thinking as an empty block followed by
 * a block holding the summary text (#496). Inside one message every block is
 * from the same response, so neighbouring thinking blocks are joined.
 */
describe('mergeAdjacentThinkingBlocks', () => {
  it('joins an empty thinking block with the text block that follows it', () => {
    const merged = mergeAdjacentThinkingBlocks([
      thinking('', { durationMillis: 5000 }),
      thinking('Checking the log first.', { durationMillis: 40 }),
      text('Done.'),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ type: ContentBlockType.Thinking, thinking: 'Checking the log first.', durationMillis: 5040 });
    expect(merged[1]).toMatchObject({ type: ContentBlockType.Text, text: 'Done.' });
  });

  it('separates two texts with a blank line', () => {
    const merged = mergeAdjacentThinkingBlocks([thinking('First.'), thinking('Second.')]);
    expect((merged[0] as ThinkingBlockDto).thinking).toBe('First.\n\nSecond.');
  });

  it('leaves the duration open while either block is still thinking', () => {
    const merged = mergeAdjacentThinkingBlocks([
      thinking('', { durationMillis: 5000 }),
      thinking('Still going', { estimatedTokens: 120 }),
    ]);
    expect((merged[0] as ThinkingBlockDto).durationMillis).toBeUndefined();
    expect((merged[0] as ThinkingBlockDto).estimatedTokens).toBe(120);
  });

  it('keeps thinking blocks apart when something sits between them', () => {
    const merged = mergeAdjacentThinkingBlocks([thinking('A'), text('x'), thinking('B')]);
    expect(merged).toHaveLength(3);
  });
});

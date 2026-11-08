import { describe, it, expect } from 'vitest';
import type { LoadedMessageDto } from '../../../../types';
import { hasTextAfterWrapUp } from '../wrapUpPreview';

type Block = Record<string, unknown>;

const wrapUp: Block = { type: 'tool_use', id: 'w', name: 'mcp__ccd_turn__wrap_up', input: { recap: 'done' } };
const text = (value: string): Block => ({ type: 'text', text: value });

function assistant(uuid: string, blocks: Block[]): LoadedMessageDto {
  return { uuid, type: 'assistant', message: { role: 'assistant', content: blocks } } as unknown as LoadedMessageDto;
}

describe('hasTextAfterWrapUp', () => {
  it('is false while the wrap-up call is the last thing: the recap stands in for the closing message', () => {
    expect(hasTextAfterWrapUp([assistant('a', [text('working')]), assistant('b', [wrapUp])])).toBe(false);
  });

  it('is true once the closing message has started in a later entry', () => {
    expect(hasTextAfterWrapUp([assistant('a', [wrapUp]), assistant('b', [text('All done.')])])).toBe(true);
  });

  it('is true when the closing text follows the call in the same entry', () => {
    expect(hasTextAfterWrapUp([assistant('a', [wrapUp, text('All done.')])])).toBe(true);
  });

  it('does not count text from before the call', () => {
    expect(hasTextAfterWrapUp([assistant('a', [text('earlier'), wrapUp])])).toBe(false);
  });

  it('does not count a blank text block that has begun streaming', () => {
    expect(hasTextAfterWrapUp([assistant('a', [wrapUp, text('  ')])])).toBe(false);
  });

  it('is false for a turn with no wrap-up call', () => {
    expect(hasTextAfterWrapUp([assistant('a', [text('hello')])])).toBe(false);
  });
});

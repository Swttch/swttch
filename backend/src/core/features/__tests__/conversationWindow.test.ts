import { describe, it, expect } from 'vitest';
import { CONVERSATION_PAGE_ENTRIES, conversationWindowStart, sanitizePages } from '../conversationWindow';

const TURN = ['user', 'assistant'];

describe('conversationWindowStart', () => {
  it('starts at 0 when the record holds no more conversation than one page', () => {
    const types = ['user', 'attachment', 'assistant', 'attachment'];
    expect(conversationWindowStart(types, 1)).toBe(0);
  });

  it('starts at the earliest of the last page of conversation entries, counting only user and assistant', () => {
    // 3 attachments, then 50 conversation entries each followed by an attachment.
    const types: string[] = ['attachment', 'attachment', 'attachment'];
    for (let i = 0; i < 25; i += 1) types.push(...TURN.flatMap((t) => [t, 'attachment']));
    const start = conversationWindowStart(types, 1);
    const kept = types.slice(start);
    expect(kept.filter((t) => t === 'user' || t === 'assistant')).toHaveLength(CONVERSATION_PAGE_ENTRIES);
    expect(kept[0]).toMatch(/user|assistant/);
    // The entries between the conversation entries are kept with them.
    expect(kept).toContain('attachment');
  });

  it('is not cut short by non-conversation entries however many there are', () => {
    // The shape that was cut by a size cap: a big run of hook entries before the first reply.
    const types = ['user', ...Array.from({ length: 500 }, () => 'attachment'), 'assistant', 'user', 'assistant'];
    expect(conversationWindowStart(types, 1)).toBe(0);
  });

  it('reaches further back by a page for every page asked for', () => {
    const types = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 'user' : 'assistant'));
    const one = conversationWindowStart(types, 1);
    const two = conversationWindowStart(types, 2);
    expect(one).toBe(200 - CONVERSATION_PAGE_ENTRIES);
    expect(two).toBe(200 - 2 * CONVERSATION_PAGE_ENTRIES);
    expect(conversationWindowStart(types, 99)).toBe(0);
  });
});

describe('sanitizePages', () => {
  it('takes a whole number from 1 and nothing else', () => {
    expect(sanitizePages(undefined)).toBe(1);
    expect(sanitizePages('3')).toBe(1);
    expect(sanitizePages(0)).toBe(1);
    expect(sanitizePages(-4)).toBe(1);
    expect(sanitizePages(2.9)).toBe(2);
    expect(sanitizePages(1e9)).toBe(1000);
  });
});

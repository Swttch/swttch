import { describe, expect, it } from 'vitest';
import { countsTowardPage, PAGE_RECORDS_PER_ENTRY } from '../page-entry';

/** One page of a transcript is so many entries of the conversation, not so many records of the file (#708). */
describe('countsTowardPage', () => {
  it.each([
    ['a message the user sent', { type: 'user', message: { role: 'user', content: 'hello' } }],
    ['a message with pictures', { type: 'user', message: { content: [{ type: 'image' }] } }],
    ['an answer', { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }],
    ['a tool call', { type: 'assistant', message: { content: [{ type: 'tool_use' }] } }],
    ['an entry that does not say what it is', { uuid: 'a' }],
  ])('counts %s', (_, entry) => {
    expect(countsTowardPage(entry)).toBe(true);
  });

  it.each([
    ['a tool result, drawn inside its call', { type: 'user', message: { content: [{ type: 'tool_result' }] } }],
    ['a note the CLI wrote for Claude', { type: 'user', isMeta: true, message: { content: 'note' } }],
    ['a subagent entry', { type: 'assistant', isSidechain: true }],
    ['an attachment', { type: 'attachment' }],
    ['a queue record', { type: 'queue-operation' }],
    ['a progress record', { type: 'progress' }],
    ['a record of an API request', { type: 'api-request' }],
    ['a system record', { type: 'system' }],
  ])('does not count %s', (_, entry) => {
    expect(countsTowardPage(entry)).toBe(false);
  });

  it('limits how many records one counted entry may bring into a page', () => {
    expect(PAGE_RECORDS_PER_ENTRY).toBe(20);
  });
});

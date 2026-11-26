import { describe, it, expect } from 'vitest';
import type { LoadedMessageDto } from '../../../../types';
import { buildSegments } from '../buildSegments';

type Block = Record<string, unknown>;

const tool = (id: string, name = 'Bash'): Block => ({ type: 'tool_use', id, name, input: {} });
const text = (value: string): Block => ({ type: 'text', text: value });
const thinking = (value: string): Block => ({ type: 'thinking', thinking: value });

function assistant(uuid: string, blocks: Block[], isStreaming = false): LoadedMessageDto {
  return { uuid, type: 'assistant', isStreaming, message: { role: 'assistant', content: blocks } } as unknown as LoadedMessageDto;
}

const kinds = (body: LoadedMessageDto[]) => buildSegments(body).map((s) => s.kind);

describe('buildSegments', () => {
  // A reply being streamed takes over the uuid of each finished block's session entry (see `rowKey`). The keys
  // of its segments follow the id it was first drawn under, so the text and thinking blocks are not drawn again
  // from scratch at every rename.
  it('keeps the keys of a streamed reply through the uuid it takes from each finished block', () => {
    const reply = (uuid: string): LoadedMessageDto =>
      ({ ...assistant(uuid, [thinking('Reading first.'), text('Editing it now.')], true), rowKey: 'placeholder-1' }) as LoadedMessageDto;
    const keysOf = (uuid: string) => buildSegments([reply(uuid)]).map((s) => s.key);
    expect(keysOf('entry-thinking')).toEqual(keysOf('entry-text'));
    expect(keysOf('entry-text').every((key) => key.startsWith('placeholder-1'))).toBe(true);
  });

  // #747. An older page is put in front of a reply; a key counting the segments before it would change for every
  // block of text already on screen, and each would be parsed and drawn again.
  it('keeps the keys of what is drawn when entries are put in front of it', () => {
    const held = [assistant('c', [text('third'), tool('3')]), assistant('d', [text('fourth')])];
    const before = buildSegments(held).map((s) => s.key);
    const after = buildSegments([assistant('a', [text('first')]), assistant('b', [text('second')]), ...held]).map((s) => s.key);
    expect(after.slice(2)).toEqual(before);
    expect(new Set(after).size).toBe(after.length);
  });

  it('gathers calls from consecutive entries into one run', () => {
    const body = [assistant('a', [tool('1')]), assistant('b', [tool('2')]), assistant('c', [tool('3', 'Read')])];
    const segments = buildSegments(body);
    expect(segments.map((s) => s.kind)).toEqual(['tools']);
    expect(segments[0].kind === 'tools' && segments[0].calls.map((c) => c.toolUse.id)).toEqual(['1', '2', '3']);
  });

  it('keeps one run when an empty thinking block sits ahead of a call', () => {
    const body = [assistant('a', [thinking(''), tool('1')]), assistant('b', [thinking(''), tool('2')])];
    expect(kinds(body)).toEqual(['tools']);
  });

  it('does not let an entry with nothing in it end a run', () => {
    const body = [assistant('a', [tool('1')]), assistant('b', [thinking('')]), assistant('c', [tool('2')])];
    expect(kinds(body)).toEqual(['tools']);
  });

  it('ends the run at text and starts another after it', () => {
    const body = [assistant('a', [tool('1')]), assistant('b', [text('done with that')]), assistant('c', [tool('2')])];
    expect(kinds(body)).toEqual(['tools', 'blocks', 'tools']);
  });

  it('splits an entry that has text and a call', () => {
    const body = [assistant('a', [text('looking'), tool('1'), tool('2')])];
    expect(kinds(body)).toEqual(['blocks', 'tools']);
  });

  it('gathers file changes into the run, so a summary line can count them', () => {
    const body = [assistant('a', [tool('1'), tool('2', 'Edit'), tool('3', 'Write')])];
    const segments = buildSegments(body);
    expect(segments.map((s) => s.kind)).toEqual(['tools']);
    expect(segments[0].kind === 'tools' && segments[0].calls).toHaveLength(3);
  });

  it('draws a question as a card of its own and ends the run', () => {
    const body = [assistant('a', [tool('1'), tool('2', 'AskUserQuestion'), tool('3')])];
    expect(kinds(body)).toEqual(['tools', 'card', 'tools']);
  });

  it('leaves the turn wrap-up out of the run: the box after the turn draws it', () => {
    const body = [assistant('a', [tool('1'), tool('2', 'mcp__ccd_turn__wrap_up')])];
    const segments = buildSegments(body);
    expect(segments.map((s) => s.kind)).toEqual(['tools']);
    expect(segments[0].kind === 'tools' && segments[0].calls.map((c) => c.toolUse.name)).toEqual(['Bash']);
  });

  it('does not let the wrap-up split a run', () => {
    const body = [assistant('a', [tool('1'), tool('2', 'mcp__ccd_turn__wrap_up'), tool('3')])];
    const segments = buildSegments(body);
    expect(segments.map((s) => s.kind)).toEqual(['tools']);
    expect(segments[0].kind === 'tools' && segments[0].calls).toHaveLength(2);
  });

  it('leaves the checklist out of the segments: it is one box at the turn\'s end, and neither a line of a run nor a break in one', () => {
    const body = [assistant('a', [tool('1'), tool('2', 'mcp__ccd_turn__update_plan'), tool('3')])];
    const segments = buildSegments(body);
    expect(segments.map((s) => s.kind)).toEqual(['tools']);
    expect(segments[0].kind === 'tools' && segments[0].calls).toHaveLength(2);
  });

  it('draws a reply that only has text in blocks too, so its text can be drawn without the status bullet', () => {
    expect(kinds([assistant('a', [text('hello')])])).toEqual(['blocks']);
  });

  it('keeps a thinking block that is still streaming', () => {
    const body = [assistant('a', [thinking(''), tool('1')], true)];
    expect(kinds(body)).toEqual(['blocks', 'tools']);
  });
});

describe('buildSegments, task notices', () => {
  const notice = (uuid: string): LoadedMessageDto =>
    ({
      uuid,
      type: 'user',
      origin: { kind: 'task-notification' },
      message: { role: 'user', content: '<task-notification>\n<status>completed</status>\n<summary>Agent "x" finished</summary>\n</task-notification>' },
    }) as unknown as LoadedMessageDto;

  it('draws the notice as a line of its own where it arrived', () => {
    expect(kinds([assistant('a', [text('Started it.')]), notice('n'), assistant('b', [text('It finished.')])])).toEqual([
      'blocks',
      'taskNotice',
      'blocks',
    ]);
  });

  it('does not split a run of calls it arrives in: it is drawn after the run', () => {
    expect(kinds([assistant('a', [tool('1')]), notice('n'), assistant('b', [tool('2')])])).toEqual(['tools', 'taskNotice']);
  });
});

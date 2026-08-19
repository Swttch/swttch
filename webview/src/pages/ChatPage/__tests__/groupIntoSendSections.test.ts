import { describe, it, expect } from 'vitest';
import { groupIntoSendSections } from '../groupIntoSendSections';
import { LoadedMessageType } from '../../../dto/common';
import type { LoadedMessageDto } from '../../../types';

/** A message the human actually typed: content is a plain string. */
function typed(uuid: string, content = 'hello'): LoadedMessageDto {
  return {
    type: LoadedMessageType.User,
    uuid,
    message: { role: 'user', content },
  } as unknown as LoadedMessageDto;
}

function assistant(uuid: string): LoadedMessageDto {
  return { type: LoadedMessageType.Assistant, uuid } as LoadedMessageDto;
}

/** The CLI writes tool results as `type: "user"` entries too. */
function toolResult(uuid: string): LoadedMessageDto {
  return {
    type: LoadedMessageType.User,
    uuid,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: `t-${uuid}`, content: 'ok' }],
    },
    toolUseResult: { stdout: 'ok' },
  } as unknown as LoadedMessageDto;
}

describe('groupIntoSendSections', () => {
  it('returns no sections for an empty list', () => {
    expect(groupIntoSendSections([])).toEqual([]);
  });

  it('opens a section at each user send and attaches the replies that follow', () => {
    const sections = groupIntoSendSections([
      typed('u-1'),
      assistant('a-1'),
      assistant('a-2'),
      typed('u-2'),
      assistant('a-3'),
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0].head?.uuid).toBe('u-1');
    expect(sections[0].body.map(m => m.uuid)).toEqual(['a-1', 'a-2']);
    expect(sections[1].head?.uuid).toBe('u-2');
    expect(sections[1].body.map(m => m.uuid)).toEqual(['a-3']);
  });

  it('keeps tool results inside the current section instead of opening one', () => {
    // The regression this guards: tool results are `type: "user"` entries, so
    // treating type alone as a section head pins a header the renderer draws
    // nothing for — a blank strip stuck to the top of the viewport.
    const sections = groupIntoSendSections([
      typed('u-1'),
      assistant('a-1'),
      toolResult('tr-1'),
      assistant('a-2'),
      toolResult('tr-2'),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0].head?.uuid).toBe('u-1');
    expect(sections[0].body.map(m => m.uuid)).toEqual(['a-1', 'tr-1', 'a-2', 'tr-2']);
  });

  it('carries a headless leading section when the transcript starts mid-reply', () => {
    // An older page can begin partway through a reply, and a session resumed
    // from a compact summary opens with CLI-authored entries.
    const sections = groupIntoSendSections([
      assistant('a-0'),
      toolResult('tr-0'),
      typed('u-1'),
      assistant('a-1'),
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0].head).toBeNull();
    expect(sections[0].body.map(m => m.uuid)).toEqual(['a-0', 'tr-0']);
    expect(sections[1].head?.uuid).toBe('u-1');
  });

  it('gives consecutive sends their own section each', () => {
    const sections = groupIntoSendSections([typed('u-1'), typed('u-2'), typed('u-3')]);

    expect(sections.map(s => s.head?.uuid)).toEqual(['u-1', 'u-2', 'u-3']);
    expect(sections.every(s => s.body.length === 0)).toBe(true);
  });

  it('preserves every message exactly once, in order', () => {
    const input = [
      assistant('a-0'),
      typed('u-1'),
      assistant('a-1'),
      toolResult('tr-1'),
      typed('u-2'),
      assistant('a-2'),
    ];

    const flattened = groupIntoSendSections(input).flatMap(s =>
      s.head ? [s.head, ...s.body] : s.body,
    );

    expect(flattened.map(m => m.uuid)).toEqual(input.map(m => m.uuid));
  });

  it('keys each section by its head uuid', () => {
    const sections = groupIntoSendSections([typed('u-1'), assistant('a-1'), typed('u-2')]);
    expect(sections.map(s => s.key)).toEqual(['u-1', 'u-2']);
  });
});

import { describe, it, expect } from 'vitest';
import { reuseSections } from '../reuseSections';
import { groupIntoSendSections } from '../groupIntoSendSections';
import { LoadedMessageType, MessageRole } from '../../../dto/common';
import type { LoadedMessageDto } from '../../../types';

/**
 * #680. While a reply streams the sections are grouped again for every word. The ones that did not change must come
 * back as the very objects that were drawn, or the transcript draws every one of them again for each word.
 */

function send(uuid: string): LoadedMessageDto {
  return { uuid, type: LoadedMessageType.User, message: { role: MessageRole.User, content: 'hi' } } as unknown as LoadedMessageDto;
}
function reply(uuid: string, text = 'ok'): LoadedMessageDto {
  return { uuid, type: LoadedMessageType.Assistant, message: { role: MessageRole.Assistant, content: [{ type: 'text', text }] } } as unknown as LoadedMessageDto;
}

describe('reuseSections', () => {
  it('hands back every section already drawn when nothing changed', () => {
    const messages = [send('s1'), reply('r1'), send('s2'), reply('r2')];
    const drawn = groupIntoSendSections(messages);
    const next = groupIntoSendSections(messages);
    expect(next[0]).not.toBe(drawn[0]);
    const result = reuseSections(drawn, next);
    expect(result).toBe(drawn);
  });

  it('keeps the sections above a changed one and takes the new object for the changed one', () => {
    const s1 = send('s1');
    const r1 = reply('r1');
    const s2 = send('s2');
    const drawn = groupIntoSendSections([s1, r1, s2, reply('r2', 'one')]);
    const grown = reply('r2', 'one two');
    const result = reuseSections(drawn, groupIntoSendSections([s1, r1, s2, grown]));
    expect(result[0]).toBe(drawn[0]);
    expect(result[1]).not.toBe(drawn[1]);
    expect(result[1].body[0]).toBe(grown);
  });

  it('takes the new section when one more message arrived in it', () => {
    const s1 = send('s1');
    const r1 = reply('r1');
    const drawn = groupIntoSendSections([s1, r1]);
    const result = reuseSections(drawn, groupIntoSendSections([s1, r1, reply('r2')]));
    expect(result[0]).not.toBe(drawn[0]);
    expect(result[0].body).toHaveLength(2);
  });

  it('does not match a section by key alone: the same key with another head is a new section', () => {
    const drawn = groupIntoSendSections([send('s1'), reply('r1')]);
    const other = groupIntoSendSections([{ ...send('s1') }, reply('r1')]);
    const result = reuseSections(drawn, other);
    expect(result[0]).toBe(other[0]);
  });

  it('starts from nothing drawn', () => {
    const next = groupIntoSendSections([send('s1'), reply('r1')]);
    expect(reuseSections([], next)).toEqual(next);
  });
});

/**
 * #747. A section opening mid-reply is named after the first entry held, so every older page renames it, and a
 * section drawn under a new name is drawn again from nothing: dozens of messages parsed again, for a pause on
 * screen at each page. `mountKey` is the name React draws it under, and stays while it is the same stretch.
 */
describe('reuseSections: the name a section is drawn under', () => {
  const drawnUnder = (sections: ReturnType<typeof groupIntoSendSections>) => sections.map((s) => s.mountKey ?? s.key);
  const [s1, r1, r2, r3, s2, r4] = [send('s1'), reply('r1'), reply('r2'), reply('r3'), send('s2'), reply('r4')];

  it('holds for a section opening mid-reply when entries are put in front of it', () => {
    const first = reuseSections([], groupIntoSendSections([r2, r3, s2, r4]));
    const older = reuseSections(first, groupIntoSendSections([r1, r2, r3, s2, r4]));
    expect(older[0].key).toBe('r1');
    expect(drawnUnder(older)).toEqual(['r2', 's2']);
  });

  it('holds when the send it answers arrives, and through the pages after that', () => {
    const first = reuseSections([], groupIntoSendSections([r3, s2, r4]));
    const second = reuseSections(first, groupIntoSendSections([r2, r3, s2, r4]));
    const third = reuseSections(second, groupIntoSendSections([s1, r1, r2, r3, s2, r4]));
    expect(third[0].key).toBe('s1');
    expect(drawnUnder(third)).toEqual(['r3', 's2']);
  });

  it('holds when the entries at the top are let go of', () => {
    const first = reuseSections([], groupIntoSendSections([s1, r1, r2, r3, s2, r4]));
    const trimmed = reuseSections(first, groupIntoSendSections([r2, r3, s2, r4]));
    expect(trimmed[0].head).toBeNull();
    expect(drawnUnder(trimmed)).toEqual(['s1', 's2']);
  });

  it('keeps the section drawn once it is the same again, under the name it was given', () => {
    const first = reuseSections([], groupIntoSendSections([r2, r3]));
    const older = reuseSections(first, groupIntoSendSections([r1, r2, r3]));
    expect(reuseSections(older, groupIntoSendSections([r1, r2, r3]))).toBe(older);
  });

  it('never draws two sections under one name', () => {
    // The name a section was given can be the own name of another one that appears later.
    const first = reuseSections([], groupIntoSendSections([r2]));
    const older = reuseSections(first, groupIntoSendSections([r1, r2]));
    const split = reuseSections(older, groupIntoSendSections([r1, send('r2')]));
    expect(split.map((s) => s.key)).toEqual(['r1', 'r2']);
    expect(new Set(drawnUnder(split)).size).toBe(2);
  });
});

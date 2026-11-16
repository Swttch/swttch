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

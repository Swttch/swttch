import { describe, expect, it } from 'vitest';
import type { LoadedMessageDto } from '../../../types';
import { splitSectionsAtGap } from '../windowGapSections';

// A prompt starts a send; everything after it, up to the next prompt, is its reply.
const user = (uuid: string): LoadedMessageDto =>
  ({ type: 'user', uuid, message: { role: 'user', content: `prompt ${uuid}` } }) as unknown as LoadedMessageDto;
const reply = (uuid: string): LoadedMessageDto =>
  ({ type: 'assistant', uuid, message: { role: 'assistant', content: [{ type: 'text', text: uuid }] } }) as unknown as LoadedMessageDto;

describe('splitSectionsAtGap', () => {
  it('groups everything together when there is no gap', () => {
    const merged = [user('u1'), reply('a1'), user('u2'), reply('a2')];
    const { sections, gapSectionIndex } = splitSectionsAtGap(merged, merged, null);
    expect(gapSectionIndex).toBeNull();
    expect(sections.map(s => s.key)).toEqual(['u1', 'u2']);
  });

  it('starts a new section after the gap even when a reply carries on across it', () => {
    // u1's reply is a1, a2 before the gap and a3 after it.
    const held = [user('u1'), reply('a1'), reply('a2'), reply('a3'), user('u2'), reply('a4')];
    const gap = { afterUuid: 'a2', beforeUuid: 'a3' };
    const { sections, gapSectionIndex } = splitSectionsAtGap(held, held, gap);
    expect(gapSectionIndex).toBe(1);
    expect(sections.map(s => s.key)).toEqual(['u1', 'a3', 'u2']);
    // The section after the gap opens without a head: the rest of a reply.
    expect(sections[1].head).toBeNull();
    expect(sections[0].body.map(m => m.uuid)).toEqual(['a1', 'a2']);
  });

  it('puts the gap before a section that begins with a prompt', () => {
    const held = [user('u1'), reply('a1'), user('u2'), reply('a2')];
    const gap = { afterUuid: 'a1', beforeUuid: 'u2' };
    const { sections, gapSectionIndex } = splitSectionsAtGap(held, held, gap);
    expect(gapSectionIndex).toBe(1);
    expect(sections.map(s => s.key)).toEqual(['u1', 'u2']);
  });

  it('splits after the last message that belongs to the history when the first one after the gap was folded away', () => {
    // The entry the gap names (r1, a tool result) is folded into the call before it,
    // so it is not among the merged messages.
    const held = [user('u1'), reply('c1'), reply('r1'), reply('a2')];
    const merged = [user('u1'), reply('c1'), reply('a2')];
    const gap = { afterUuid: 'c1', beforeUuid: 'r1' };
    const { sections, gapSectionIndex } = splitSectionsAtGap(merged, held, gap);
    expect(gapSectionIndex).toBe(1);
    expect(sections[1].body.map(m => m.uuid)).toEqual(['a2']);
  });

  it('ignores a gap that names an entry that is not held', () => {
    const held = [user('u1'), reply('a1')];
    const { gapSectionIndex } = splitSectionsAtGap(held, held, { afterUuid: 'x', beforeUuid: 'gone' });
    expect(gapSectionIndex).toBeNull();
  });

  it('keeps every section key unique when messages have no uuid', () => {
    const noUuid = (): LoadedMessageDto => ({ type: 'assistant', message: { role: 'assistant', content: [] } }) as unknown as LoadedMessageDto;
    const held = [noUuid(), reply('x'), noUuid()];
    const gap = { afterUuid: 'x', beforeUuid: 'x' };
    // The gap names the entry at index 1; the tail is index 1 onwards.
    const { sections } = splitSectionsAtGap(held, held, gap);
    expect(new Set(sections.map(s => s.key)).size).toBe(sections.length);
  });
});

import { describe, it, expect } from 'vitest';
import { hideCliNotes } from '../hideCliNotes';
import { LoadedMessageDto } from '../../../types';
import { LoadedMessageType } from '../../../dto/common';

function user(uuid: string, content: string, extra: Partial<LoadedMessageDto> = {}): LoadedMessageDto {
  return { type: LoadedMessageType.User, uuid, message: { role: 'user', content }, ...extra } as LoadedMessageDto;
}

describe('hideCliNotes', () => {
  it('drops the note the CLI writes under an attached picture', () => {
    const list = [
      user('u1', 'look at this'),
      user('u2', '[Image: source: /tmp/1.png, original 3024x1824, displayed at 2000x1206. Multiply coordinates by 1.51 to map to original image.]', { isMeta: true }),
    ];
    expect(hideCliNotes(list).map((m) => m.uuid)).toEqual(['u1']);
  });

  it('drops what a slash command expands to, and keeps the line the user typed', () => {
    const list = [
      user('c1', '<command-message>slides</command-message>\n<command-name>/slides</command-name>\n<command-args>a deck</command-args>'),
      user('c2', '`/slides` was invoked: a request for a slide deck…', { isMeta: true, parentUuid: 'c1' }),
    ];
    expect(hideCliNotes(list).map((m) => m.uuid)).toEqual(['c1']);
  });

  it('keeps other isMeta entries: another session\'s message, an injected prompt', () => {
    const list = [
      user('m1', 'Another Claude session sent a message:\n<cross-session-message from="x">hi</cross-session-message>', { isMeta: true }),
      user('m2', 'Run the health check', { isMeta: true }),
      user('m3', '[Cross-session idle notice] "x" is idle', { isMeta: true }),
    ];
    expect(hideCliNotes(list).map((m) => m.uuid)).toEqual(['m1', 'm2', 'm3']);
  });

  it('drops the same note while it streams: no isMeta, isSynthetic, a text block (what the live event carries)', () => {
    const live = {
      type: LoadedMessageType.User,
      uuid: 'l1',
      isSynthetic: true,
      message: { role: 'user', content: [{ type: 'text', text: '[Image: original 3200x2400, displayed at 2000x1500. Multiply coordinates by 1.60 to map to original image.]' }] },
    } as unknown as LoadedMessageDto;
    expect(hideCliNotes([user('u1', 'look'), live]).map((m) => m.uuid)).toEqual(['u1']);
  });

  it('keeps a synthetic entry that is not that note', () => {
    expect(hideCliNotes([user('s1', 'Stop hook feedback: …', { isSynthetic: true })])).toHaveLength(1);
  });

  it('leaves an entry that is not isMeta alone, even if it begins like a note', () => {
    expect(hideCliNotes([user('u1', '[Image: mine]')])).toHaveLength(1);
    expect(hideCliNotes([user('u2', 'Output token limit hit, what does that mean?')])).toHaveLength(1);
  });

  const cutOff = 'Your response above was cut off mid-stream. Resume directly from where it stops — no apology, no recap.';

  it('drops the request the CLI writes to Claude when an answer was cut off', () => {
    const list = [user('u1', 'hi'), user('n1', cutOff, { isMeta: true, turnCompanion: true })];
    expect(hideCliNotes(list).map((m) => m.uuid)).toEqual(['u1']);
  });

  it('drops that request while it streams, and in a record that does not mark it a companion', () => {
    expect(hideCliNotes([user('l1', cutOff, { isSynthetic: true })])).toEqual([]);
    expect(hideCliNotes([user('o1', cutOff, { isMeta: true })])).toEqual([]);
  });

  it('drops a companion note in words it has not met', () => {
    expect(hideCliNotes([user('n1', 'Some later request of the CLI.', { isMeta: true, turnCompanion: true })])).toEqual([]);
  });

  it('keeps a companion entry that says where it came from', () => {
    const list = [user('p1', 'from elsewhere', { isMeta: true, turnCompanion: true, origin: { kind: 'peer' } })];
    expect(hideCliNotes(list)).toHaveLength(1);
  });
});

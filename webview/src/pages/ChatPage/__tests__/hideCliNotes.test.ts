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

  it('leaves an entry that is not isMeta alone, even if it begins like a note', () => {
    expect(hideCliNotes([user('u1', '[Image: mine]')])).toHaveLength(1);
  });
});

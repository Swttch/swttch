import { describe, it, expect } from 'vitest';
import { buildEntries } from '../SendIndex';
import { LoadedMessageType } from '../../../dto/common';
import type { LoadedMessageDto } from '../../../types';
import type { SendSection } from '../groupIntoSendSections';

function section(key: string, text = key): SendSection {
  return {
    key,
    head: { type: LoadedMessageType.User, uuid: key, message: { role: 'user', content: text } } as unknown as LoadedMessageDto,
    body: [],
  };
}
const send = (uuid: string) => ({ uuid, timestamp: null, preview: uuid });

describe('buildEntries', () => {
  it('draws the whole index in front of the loaded run', () => {
    const entries = buildEntries([send('a'), send('b'), send('c'), send('d')], [section('c'), section('d')]);
    expect(entries.map(e => e.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(entries.map(e => e.loaded)).toEqual([false, false, true, true]);
  });

  it('keeps the index when the loaded run opens with a send the index has no entry for (#657)', () => {
    const entries = buildEntries([send('a'), send('b'), send('c')], [section('queued-local'), section('b'), section('c')]);
    expect(entries.map(e => e.key)).toEqual(['a', 'queued-local', 'b', 'c']);
  });

  it('shows the loaded run alone when the index shares nothing with it', () => {
    const entries = buildEntries([send('x'), send('y')], [section('c')]);
    expect(entries.map(e => e.key)).toEqual(['c']);
  });
});

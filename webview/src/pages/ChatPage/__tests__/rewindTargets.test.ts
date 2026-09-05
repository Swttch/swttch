import { describe, it, expect } from 'vitest';
import { canRewindTo, rewindableSendUuids } from '../rewindTargets';
import type { LoadedMessageDto } from '../../../types';
import { LoadedMessageType } from '@/dto/common';

/**
 * Entry shapes are the ones the CLI writes, taken from a real session: a
 * snapshot carries no `uuid` of its own and names the send it belongs to in
 * `messageId`.
 */
function snapshot(messageId: string, backups: Record<string, unknown> = {}): LoadedMessageDto {
  return {
    type: LoadedMessageType.FileHistorySnapshot,
    messageId,
    snapshot: { messageId, trackedFileBackups: backups },
  } as unknown as LoadedMessageDto;
}

function send(uuid: string): LoadedMessageDto {
  return { type: LoadedMessageType.User, uuid } as LoadedMessageDto;
}

describe('canRewindTo', () => {
  it('is true for a send that has a snapshot entry', () => {
    const messages = [send('u1'), snapshot('u1')];

    expect(canRewindTo(messages, 'u1')).toBe(true);
  });

  it('is false for a send with no snapshot entry', () => {
    // What a session recorded before file checkpointing was enabled looks like:
    // the sends are there, the snapshots never were.
    const messages = [send('u1'), send('u2')];

    expect(canRewindTo(messages, 'u1')).toBe(false);
  });

  // 2.1.261 leaves `trackedFileBackups` empty and still rewinds correctly, so a
  // check that read the contents would grey out a working rewind.
  it('is true even when the snapshot lists no backups', () => {
    const messages = [send('u1'), snapshot('u1', {})];

    expect(canRewindTo(messages, 'u1')).toBe(true);
  });

  it('does not match a snapshot belonging to a different send', () => {
    const messages = [send('u1'), send('u2'), snapshot('u2')];

    expect(canRewindTo(messages, 'u1')).toBe(false);
    expect(canRewindTo(messages, 'u2')).toBe(true);
  });

  // A snapshot has no uuid of its own, so a check written against `uuid` instead
  // of `messageId` would find nothing at all.
  it('reads messageId, not the entry uuid', () => {
    const entry = snapshot('u1');

    expect(entry.uuid).toBeUndefined();
    expect(canRewindTo([entry], 'u1')).toBe(true);
  });
});

describe('rewindableSendUuids', () => {
  it('collects every send that has a snapshot', () => {
    const messages = [send('u1'), snapshot('u1'), send('u2'), snapshot('u2'), send('u3')];

    expect(rewindableSendUuids(messages)).toEqual(new Set(['u1', 'u2']));
  });

  it('is empty for a transcript with no snapshots', () => {
    expect(rewindableSendUuids([send('u1')])).toEqual(new Set());
  });
});

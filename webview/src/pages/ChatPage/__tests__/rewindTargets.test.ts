import { describe, it, expect } from 'vitest';
import { canRewindTo, forkPointFor, isRecordedSend, rewindableSendUuids } from '../rewindTargets';
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

describe('isRecordedSend', () => {
  // `useChatStream` mints this shape while a turn streams, because the CLI does
  // not echo user messages back and its uuid only arrives from disk.
  it('rejects the id the webview mints for a send in flight', () => {
    expect(isRecordedSend('msg-1757049600000-ab12cd34e')).toBe(false);
  });

  it('accepts a uuid the CLI recorded', () => {
    expect(isRecordedSend('65653f1e-09ff-4570-a371-ea968d39c2d0')).toBe(true);
  });
});

describe('forkPointFor', () => {
  function assistant(uuid: string): LoadedMessageDto {
    return { type: LoadedMessageType.Assistant, uuid } as LoadedMessageDto;
  }
  // Attachments sit between a send and the entry before it in a real transcript.
  function attachment(uuid: string): LoadedMessageDto {
    return { type: 'attachment', uuid } as unknown as LoadedMessageDto;
  }
  function system(uuid: string): LoadedMessageDto {
    return { type: LoadedMessageType.System, uuid } as LoadedMessageDto;
  }

  it('points at the assistant entry before the send', () => {
    const messages = [send('u1'), assistant('a1'), send('u2')];

    expect(forkPointFor(messages, 'u2')).toBe('a1');
  });

  // The CLI rejects an attachment uuid outright ("No message found with
  // message.uuid of: ..."), so walking back has to step over them.
  it('skips attachments between the send and its predecessor', () => {
    const messages = [send('u1'), assistant('a1'), attachment('att1'), attachment('att2'), send('u2')];

    expect(forkPointFor(messages, 'u2')).toBe('a1');
  });

  it('skips system entries', () => {
    const messages = [send('u1'), assistant('a1'), system('s1'), send('u2')];

    expect(forkPointFor(messages, 'u2')).toBe('a1');
  });

  // A tool result is a `user` entry too, and it is a legitimate point to resume
  // from — the walk asks what the entry is, not who wrote it.
  it('accepts a user entry as the point', () => {
    const messages = [send('u1'), send('toolresult'), send('u2')];

    expect(forkPointFor(messages, 'u2')).toBe('toolresult');
  });

  // Not a failure: the send opens the conversation, so there is no shared
  // history to branch from and the caller opens a new session instead.
  it('is undefined for the first send in a conversation', () => {
    const messages = [attachment('att1'), send('u1'), assistant('a1')];

    expect(forkPointFor(messages, 'u1')).toBeUndefined();
  });

  it('is undefined for a uuid that is not in the transcript', () => {
    expect(forkPointFor([send('u1')], 'nope')).toBeUndefined();
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

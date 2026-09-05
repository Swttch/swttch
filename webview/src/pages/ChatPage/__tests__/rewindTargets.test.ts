import { describe, it, expect } from 'vitest';
import { canRewindTo, forkPointFor, isRecordedSend, recordedUuidOf } from '../rewindTargets';
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

/** A send read back from the transcript: its uuid is the CLI's own. */
function send(uuid: string): LoadedMessageDto {
  return { type: LoadedMessageType.User, uuid } as LoadedMessageDto;
}

/** A send the webview is showing from its own copy, before SEND_RECORDED. */
function inFlight(localId = 'msg-1757049600000-ab12cd34e'): LoadedMessageDto {
  return { type: LoadedMessageType.User, uuid: localId } as LoadedMessageDto;
}

/** The same send once the turn ended and the CLI's uuid was attached. */
function recorded(localId: string, cliUuid: string, canRewind?: boolean): LoadedMessageDto {
  return { type: LoadedMessageType.User, uuid: localId, cliUuid, canRewind } as LoadedMessageDto;
}

describe('recordedUuidOf', () => {
  it('uses the uuid of a send read from the transcript', () => {
    expect(recordedUuidOf(send('65653f1e-09ff-4570-a371-ea968d39c2d0'))).toBe(
      '65653f1e-09ff-4570-a371-ea968d39c2d0',
    );
  });

  // `useChatStream` mints this shape while a turn streams, because the CLI does
  // not echo user messages back.
  it('has no answer for a send still carrying a locally minted id', () => {
    expect(recordedUuidOf(inFlight())).toBeUndefined();
  });

  // SEND_RECORDED attaches the real uuid without replacing the React key.
  it('prefers the uuid SEND_RECORDED attached', () => {
    expect(recordedUuidOf(recorded('msg-1-abc', '65653f1e-09ff-4570-a371-ea968d39c2d0'))).toBe(
      '65653f1e-09ff-4570-a371-ea968d39c2d0',
    );
  });

  it('has no answer for a send that is not there', () => {
    expect(recordedUuidOf(undefined)).toBeUndefined();
  });
});

describe('isRecordedSend', () => {
  it('is false while the send carries only a locally minted id', () => {
    expect(isRecordedSend(inFlight())).toBe(false);
  });

  it('is true once the CLI uuid is known', () => {
    expect(isRecordedSend(recorded('msg-1-abc', '65653f1e-09ff-4570-a371-ea968d39c2d0'))).toBe(true);
    expect(isRecordedSend(send('65653f1e-09ff-4570-a371-ea968d39c2d0'))).toBe(true);
  });
});

describe('canRewindTo', () => {
  it('is true for a send that has a snapshot entry', () => {
    const messages = [send('u1'), snapshot('u1')];

    expect(canRewindTo(messages, send('u1'))).toBe(true);
  });

  it('is false for a send with no snapshot entry', () => {
    // What a session recorded before file checkpointing was enabled looks like:
    // the sends are there, the snapshots never were.
    const messages = [send('u1'), send('u2')];

    expect(canRewindTo(messages, send('u1'))).toBe(false);
  });

  // 2.1.261 leaves `trackedFileBackups` empty and still rewinds correctly, so a
  // check that read the contents would grey out a working rewind.
  it('is true even when the snapshot lists no backups', () => {
    const messages = [send('u1'), snapshot('u1', {})];

    expect(canRewindTo(messages, send('u1'))).toBe(true);
  });

  it('does not match a snapshot belonging to a different send', () => {
    const messages = [send('u1'), send('u2'), snapshot('u2')];

    expect(canRewindTo(messages, send('u1'))).toBe(false);
    expect(canRewindTo(messages, send('u2'))).toBe(true);
  });

  // The turn that just ended has no snapshot entry in this list yet — the CLI
  // wrote one to the transcript and SEND_RECORDED reports it directly. Without
  // this the rewind would be hidden on the very edit the user is looking at.
  it('takes the answer SEND_RECORDED brought over the missing entry', () => {
    const justEnded = recorded('msg-1-abc', 'u9', true);

    expect(canRewindTo([justEnded], justEnded)).toBe(true);
  });

  it('honours a negative answer from SEND_RECORDED even if an entry exists', () => {
    const justEnded = recorded('msg-1-abc', 'u9', false);

    expect(canRewindTo([justEnded, snapshot('u9')], justEnded)).toBe(false);
  });

  it('is false while the send has no uuid the CLI would accept', () => {
    expect(canRewindTo([inFlight()], inFlight())).toBe(false);
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

  // An entry the webview drew from its own copy carries an id the CLI rejects,
  // so it cannot serve as the point either.
  it('skips an entry that still carries a locally minted id', () => {
    const messages = [assistant('a1'), inFlight('msg-2-def'), send('u2')];

    expect(forkPointFor(messages, 'u2')).toBe('a1');
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

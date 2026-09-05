import type { LoadedMessageDto } from '../../types';
import { LoadedMessageType } from '@/dto/common';

/**
 * Whether the code can be rewound to a given user send (issue #356).
 *
 * The CLI answers this from the transcript itself: it writes a
 * `file-history-snapshot` entry per send, and its own check is
 *
 *   snapshots.some(s => s.messageId === uuid)
 *
 * This mirrors that check rather than inspecting what the snapshot contains.
 * The distinction matters — measured across CLI versions, 2.1.170 fills the
 * snapshot's `trackedFileBackups` and 2.1.261 leaves it empty while still
 * rewinding correctly, so reading the contents would report "cannot rewind" for
 * a session that rewinds fine.
 *
 * A send from before file checkpointing was on for this backend has no snapshot
 * entry at all, which is exactly the case the menu has to grey out: the backups
 * were never taken and no command can bring them back.
 */
export function canRewindTo(messages: LoadedMessageDto[], sendUuid: string): boolean {
  return messages.some(
    (message) =>
      message.type === LoadedMessageType.FileHistorySnapshot && message.messageId === sendUuid,
  );
}

/**
 * The uuids of every send the code can be rewound to, for callers that ask about
 * a whole transcript rather than one send.
 *
 * Built once and shared, so a long transcript does not rescan the message list
 * per rendered send.
 */
export function rewindableSendUuids(messages: LoadedMessageDto[]): Set<string> {
  const uuids = new Set<string>();
  for (const message of messages) {
    if (message.type !== LoadedMessageType.FileHistorySnapshot) continue;
    if (message.messageId) uuids.add(message.messageId);
  }
  return uuids;
}

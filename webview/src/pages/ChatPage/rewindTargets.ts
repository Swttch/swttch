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
 * The entry a fork of this send should resume from, or undefined when the send
 * opens the conversation and there is nothing before it (issue #356).
 *
 * Forking excludes the send itself: `--resume-session-at` copies the transcript
 * up to and including the entry it is given, so pointing it at the entry BEFORE
 * the send produces a session that stops where the user was about to type. That
 * is what "fork conversation from here" means — the send is retyped on the new
 * branch, not replayed on it.
 *
 * Only `assistant` and `user` entries qualify. Attachments sit between a send
 * and its predecessor in the transcript, and the CLI rejects one outright:
 * measured, `--resume-session-at <attachment uuid>` exits 1 with "No message
 * found with message.uuid of: ...". `system` entries are skipped as well, which
 * matches how the Cursor extension picks the same point.
 *
 * An undefined result is not a failure. It means the send is the first thing in
 * the conversation, so there is no shared history to branch from and the caller
 * should open a new session carrying this prompt instead of forking.
 */
export function forkPointFor(
  messages: LoadedMessageDto[],
  sendUuid: string,
): string | undefined {
  const index = messages.findIndex((message) => message.uuid === sendUuid);
  if (index < 0) return undefined;

  for (let i = index - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (!candidate.uuid) continue;
    if (
      candidate.type === LoadedMessageType.Assistant ||
      candidate.type === LoadedMessageType.User
    ) {
      return candidate.uuid;
    }
  }
  return undefined;
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

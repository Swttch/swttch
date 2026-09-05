import type { LoadedMessageDto } from '../../types';
import { LoadedMessageType } from '@/dto/common';

/**
 * The uuid the CLI knows this send by, or undefined while it knows none.
 *
 * A send read from the transcript already carries it as `uuid`. A send the
 * webview is showing from its own copy carries a locally minted id there instead
 * (`msg-<time>-<random>`, see `useChatStream`), because the CLI never echoes user
 * messages back — for those the real uuid arrives on SEND_RECORDED when the turn
 * ends and is attached as `cliUuid`.
 *
 * Both fork and rewind name a send on a command line, and the CLI answers a
 * locally minted id with "not a user message in this session", so every caller
 * has to ask through here rather than reading `uuid` directly.
 */
export function recordedUuidOf(send: LoadedMessageDto | undefined): string | undefined {
  if (!send) return undefined;
  if (send.cliUuid) return send.cliUuid;
  if (send.uuid && !send.uuid.startsWith('msg-')) return send.uuid;
  return undefined;
}

/** Whether the CLI can be asked about this send at all — see [recordedUuidOf]. */
export function isRecordedSend(send: LoadedMessageDto | undefined): boolean {
  return recordedUuidOf(send) !== undefined;
}

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
export function canRewindTo(messages: LoadedMessageDto[], send: LoadedMessageDto | undefined): boolean {
  const uuid = recordedUuidOf(send);
  if (!uuid) return false;
  // A send whose turn just ended has no snapshot entry in this list yet — the CLI
  // wrote one to the transcript, and SEND_RECORDED reports it directly.
  if (send?.canRewind !== undefined) return send.canRewind;
  return messages.some(
    (message) =>
      message.type === LoadedMessageType.FileHistorySnapshot && message.messageId === uuid,
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
    if (
      candidate.type !== LoadedMessageType.Assistant &&
      candidate.type !== LoadedMessageType.User
    ) {
      continue;
    }
    // Through `recordedUuidOf` for the same reason the send is: an entry the
    // webview drew from its own copy carries an id the CLI would reject.
    const uuid = recordedUuidOf(candidate);
    if (uuid) return uuid;
  }
  return undefined;
}

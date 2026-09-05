import { randomUUID } from 'crypto';
import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { basename, join } from 'path';
import { getProjectSessionsPath } from '../features/getProjectSessionsPath';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';

/**
 * The transcript a branch of `sendUuid` starts from, copied from the original.
 *
 * The range is the CLI's own: `--resume-session-at` takes everything up to AND
 * INCLUDING the entry it is given, and that entry is the one before the send
 * being forked from — so the branch stops where the user was about to type. The
 * cut lands on the last `assistant` or `user` entry, since attachments trail
 * their message and the CLI refuses one as a resume point ("No message found
 * with message.uuid of: ...").
 *
 * Lines are copied verbatim, and nothing here reads inside an entry beyond the
 * `uuid` and `type` needed to find the cut. That is what keeps this from being a
 * second implementation of the CLI's format: an entry we do not understand is
 * copied as faithfully as one we do.
 *
 * Returns null when the send opens the conversation — a branch from before it
 * would be an empty session rather than a fork.
 */
async function copyTranscriptForFork(
  sourcePath: string,
  sendUuid: string,
): Promise<string[] | null> {
  const lines = (await readFile(sourcePath, 'utf8')).split('\n');

  const kept: string[] = [];
  let lastMessageIndex = -1;

  for (const line of lines) {
    if (!line.trim()) continue;

    let entry: { type?: string; uuid?: string };
    try {
      entry = JSON.parse(line) as { type?: string; uuid?: string };
    } catch {
      // A line we cannot parse is still part of the transcript, so it is kept in
      // place rather than dropped; it falls outside the cut if it sits past the
      // fork point.
      kept.push(line);
      continue;
    }

    if (entry.uuid === sendUuid) break;

    kept.push(line);
    if (typeof entry.uuid === 'string' && (entry.type === 'assistant' || entry.type === 'user')) {
      lastMessageIndex = kept.length - 1;
    }
  }

  if (lastMessageIndex < 0) return null;
  return kept.slice(0, lastMessageIndex + 1);
}

/**
 * Branch a session at a given send and answer with the new session's id.
 *
 * ## Why this writes a transcript instead of asking the CLI to
 *
 * The CLI can produce exactly this file — `--resume-session-at X --fork-session
 * --session-id Y` does it — but only together with a first message, because it
 * creates a session and its opening message as one act. Measured three ways: an
 * empty prompt is refused outright, a closed stdin runs the SessionStart hook
 * and writes nothing, and an interactive resume answers "Provide a prompt to
 * continue".
 *
 * Going through the CLI therefore meant injecting a message the user never
 * wrote. That was built and tried: it needed a `<system-reminder>` seed, cost an
 * API round trip and about ten seconds per fork, and still left a reply in the
 * branch, because a model asked to say nothing says something anyway.
 *
 * Copying the lines has none of that. The branch opens immediately and reads
 * exactly like the conversation it came from, which is what a fork is. The trade
 * is recorded in
 * docs/principle-exceptions/356-rewind-and-fork-hidden-cli-flags.md.
 *
 * Everything after this point is the CLI's again: the branch is resumed, sent to
 * and rewound like any other session.
 */
export async function forkSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const sessionId = message.payload?.sessionId as string | undefined;
  const sendUuid = message.payload?.sendUuid as string | undefined;
  const workingDir = message.payload?.workingDir as string | undefined;

  const fail = (error: string) =>
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error,
    });

  if (!sessionId) return fail('Missing sessionId');
  if (!sendUuid) return fail('Missing sendUuid');
  if (!workingDir) return fail('workingDir is required');

  // `sessionId` becomes a path component, so anything that is not a plain file
  // name is refused (same guard shape as deleteSession). `sendUuid` gets no such
  // check because it never reaches the filesystem — it is only ever compared
  // against the `uuid` of an entry already in the transcript.
  if (sessionId !== basename(sessionId) || sessionId.includes('..')) {
    return fail('Invalid sessionId');
  }

  const forkedSessionId = randomUUID();

  try {
    const sessionsDir = await getProjectSessionsPath(workingDir);
    const kept = await copyTranscriptForFork(join(sessionsDir, `${sessionId}.jsonl`), sendUuid);

    if (!kept) {
      return fail('This message opens the conversation, so there is nothing to branch from');
    }

    // Written to a sibling temp file and renamed, so nothing can read a
    // half-written transcript — the discipline atomic-json applies to the
    // settings files, for the same reason. The sibling matters: rename is only
    // atomic within a filesystem.
    const target = join(sessionsDir, `${forkedSessionId}.jsonl`);
    const temp = join(sessionsDir, `.${forkedSessionId}.jsonl.tmp`);
    try {
      await writeFile(temp, kept.join('\n') + '\n', { mode: 0o600 });
      await rename(temp, target);
    } catch (writeError) {
      await unlink(temp).catch(() => {});
      throw writeError;
    }

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      sessionId: forkedSessionId,
    });

    // The session list is what the user checks to see the branch exists.
    connections.broadcastToAll(MessageType.SESSIONS_UPDATED, {
      action: 'upsert',
      session: { sessionId: forkedSessionId },
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

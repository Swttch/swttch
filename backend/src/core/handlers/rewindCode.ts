import { basename } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';
import { buildCheckpointingEnv } from '../claude-process';
import { readMergedClaudeSettings } from '../features/claude-settings';
import { MessageType } from '../../shared';

/** A rewind reads and rewrites files; give it room without hanging the caller. */
const REWIND_TIMEOUT_MS = 60_000;

/**
 * Restore the files a send edited back to their state at that send (issue #356).
 *
 * The CLI does the whole job behind one flag:
 *
 *   claude --resume <session> --rewind-files <user message uuid>
 *
 * `--rewind-files` is a standalone operation — the CLI refuses to take a prompt
 * alongside it — so this runs the binary once and reports what it said. Which
 * files are restored, from which backups, and whether the originals are
 * overwritten are all the CLI's decisions, not ours.
 *
 * The env has to carry file checkpointing for the same reason the chat spawn
 * does: without it the CLI answers "File rewinding is not enabled." and exits 1.
 * Reusing [buildCheckpointingEnv] keeps that answer identical to the one the
 * session was recorded under, so a user who turned checkpointing off is told the
 * feature is off rather than being silently handed a rewind that restores
 * nothing.
 */
export async function rewindCodeHandler(
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

  // Both ids go on a command line. They are uuids everywhere they come from, so
  // anything carrying a path separator or `..` is not one and is refused rather
  // than passed on (same guard shape as deleteSession).
  for (const [name, value] of [['sessionId', sessionId], ['sendUuid', sendUuid]] as const) {
    if (value !== basename(value) || value.includes('..')) return fail(`Invalid ${name}`);
  }

  try {
    const { settings } = await readMergedClaudeSettings(workingDir);
    const { stdout } = await Claude.execAuthed(
      ['--resume', sessionId, '--rewind-files', sendUuid],
      workingDir,
      { timeout: REWIND_TIMEOUT_MS, cwd: workingDir, env: buildCheckpointingEnv(settings) },
    );

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      // The CLI's own line ("Files rewound to state at message ..."). Relayed
      // rather than replaced: the user can compare it against the same command
      // in a terminal, and writing our own sentence would make one event read as
      // two different ones.
      message: stdout.trim(),
    });
  } catch (err) {
    // The CLI explains its own refusals ("--rewind-files requires a user message
    // UUID, but ...", "File rewinding is not enabled."), and those sentences are
    // more useful than anything we could substitute.
    const stderr = (err as { stderr?: string }).stderr?.trim();
    fail(stderr || (err instanceof Error ? err.message : String(err)));
  }
}

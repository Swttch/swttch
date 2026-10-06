import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { Claude } from '../claude';

/** A session id is a UUID. Anything else never reaches the command line. */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The CLI starts, loads the session and answers; measured at about 5 to 8 seconds. */
const CONTEXT_USAGE_TIMEOUT_MS = 60_000;

/**
 * The argv of the one-shot run. `--no-session-persistence` is what keeps this
 * invisible: the resumed session's file is read and never written, so the user
 * finds no `/context` entry in their history afterwards.
 */
export function buildContextUsageArgs(sessionId: string): string[] {
  return ['-p', '--resume', sessionId, '--no-session-persistence', '/context'];
}

/**
 * GET_CONTEXT_USAGE: the official `/context` command's report for a saved
 * session, as the markdown the CLI printed (passed through untouched).
 *
 * It exists because the context window size is not stored anywhere on disk: the
 * live CLI reports it only when a turn finishes. A session reopened before its
 * next reply therefore cannot say how big its window is, and `/context` is the
 * documented way to ask. The command is local (no model call).
 */
export async function getContextUsageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { sessionId?: string; workingDir?: string } | undefined;
  const sessionId = payload?.sessionId;
  const workingDir = payload?.workingDir;

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'a valid sessionId is required',
    });
    return;
  }

  try {
    const { stdout } = await Claude.exec(buildContextUsageArgs(sessionId), {
      timeout: CONTEXT_USAGE_TIMEOUT_MS,
      cwd: workingDir || undefined,
      closeStdin: true,
    });
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      markdown: stdout,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * A message written to a CLI that has not read it yet, and taking it back.
 *
 * A message written while a turn runs waits in the CLI's own queue until the turn reaches a place where it reads one:
 * the end of the call that is running, or the end of the turn. Claude Desktop draws it as a bubble with a cross that
 * takes it back. That answers to a request the CLI understands and its `--help` does not list (see
 * `docs/principle-exceptions/697-cancel-async-message.md`):
 *
 *   - `cancel_async_message` with the message's `message_uuid`: takes the message out of the CLI's queue. It answers
 *     `cancelled: true`, or `false` when the CLI had already taken it up.
 *
 * There is no official way to take a message back from the CLI's queue, so there is no fallback: a CLI that does not
 * know the request answers `unsupported` and the chat stops offering the cross.
 */
import type { ConnectionManager } from '../../ws/connection-manager';
import { sendControlRequestToProcess } from '../claude-process';
import {
  cancelControlResponse,
  nextControlRequestId,
  waitForControlResponse,
} from '../control-response-waiter';

/** The reply is local to a CLI that is already running, so a slow one is a wedged one. */
const REQUEST_TIMEOUT_MS = 8_000;

/** What a CLI that predates the request answers with, or has no callback for it. */
const UNSUPPORTED_REQUEST = /unsupported control request subtype|not supported in this context/i;

/** The ids the webview mints with `crypto.randomUUID()`; anything else is not written to a request. */
const MESSAGE_UUID = /^[0-9a-fA-F-]{8,64}$/;

export function isMessageUuid(value: unknown): value is string {
  return typeof value === 'string' && MESSAGE_UUID.test(value);
}

export type CancelResult =
  /** The message left the CLI's queue; it will not be read. */
  | 'cancelled'
  /** The CLI had already taken it up, or never held it. */
  | 'too_late'
  /** The CLI does not know the request. */
  | 'unsupported'
  | 'not_running'
  | 'failed';

/** Take the message `messageUuid` out of the CLI's queue before it reads it. Never throws. */
export async function cancelPendingMessage(
  connections: ConnectionManager,
  sessionId: string,
  messageUuid: string,
): Promise<CancelResult> {
  if (!connections.getSession(sessionId)?.process?.stdin?.writable) return 'not_running';

  const requestId = nextControlRequestId('cancel_async_message');
  const waiting = waitForControlResponse<unknown>(requestId, REQUEST_TIMEOUT_MS);
  const written = sendControlRequestToProcess(connections, sessionId, requestId, {
    subtype: 'cancel_async_message',
    message_uuid: messageUuid,
  });
  if (!written) {
    cancelControlResponse(requestId);
    await waiting.catch(() => undefined);
    return 'not_running';
  }
  try {
    const response = await waiting;
    const cancelled = response && typeof response === 'object' && (response as { cancelled?: unknown }).cancelled === true;
    return cancelled ? 'cancelled' : 'too_late';
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (UNSUPPORTED_REQUEST.test(reason)) return 'unsupported';
    console.error('[node-backend]', `cancel_async_message failed: ${reason}`);
    return 'failed';
  }
}

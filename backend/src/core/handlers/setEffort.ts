import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { applyEffortToLiveCli, type EffortChange } from '../features/effort-runtime';

/**
 * The CLI's effort vocabulary is its own to grow (`max` joined the flag before the
 * settings file), so the level is checked for shape, not against a list. The shape
 * matters: on the fallback path the level is written into a `/effort` command.
 */
const EFFORT_LEVEL_SHAPE = /^[a-z]{2,16}$/;

interface SetEffortPayload {
  effortLevel?: string | null;
  ultracode?: boolean;
}

/** The change the payload asks for, or null when it asks for nothing or something malformed. */
function parseChange(payload: SetEffortPayload | undefined): EffortChange | null {
  if (!payload) return null;
  const change: EffortChange = {};
  if (payload.effortLevel !== undefined) {
    if (payload.effortLevel !== null && !EFFORT_LEVEL_SHAPE.test(payload.effortLevel)) return null;
    change.effortLevel = payload.effortLevel;
  }
  if (payload.ultracode !== undefined) {
    if (typeof payload.ultracode !== 'boolean') return null;
    change.ultracode = payload.ultracode;
  }
  return change.effortLevel === undefined && change.ultracode === undefined ? null : change;
}

/**
 * SET_EFFORT: tell the subscribed session's live CLI to run at a new effort level.
 *
 * The level is already stored by the time this arrives (the webview writes it first),
 * and a CLI spawned later is started with it as `--effort`. This is only for the CLI
 * that is running now. See effort-runtime.ts for how it is told and why.
 */
export async function setEffortHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const change = parseChange(message.payload as SetEffortPayload | undefined);
  if (!change) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'a valid effortLevel and/or ultracode is required',
    });
    return;
  }

  const sessionId = connections.getClient(connectionId)?.subscribedSessionId;
  // A chat that has sent nothing yet has no CLI; the first message spawns one that reads the settings.
  const via = sessionId ? await applyEffortToLiveCli(connections, sessionId, change) : 'not_running';

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    via,
  });
}

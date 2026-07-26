import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { randomUUID } from 'crypto';
import { MessageType, ScheduledMessageKind, type ScheduledMessage } from '../../shared';
import {
  scheduleMessage,
  cancelSchedule,
} from '../features/scheduled-messages';
import { readSchedulesForSession } from '../features/scheduled-messages-store';
import { getSponsorStatus } from '../features/license';

/**
 * Handlers for the scheduled-message ("send later") engine:
 *   SCHEDULE_MESSAGE          → create a reservation for a session
 *   CANCEL_SCHEDULED_MESSAGE  → cancel a reservation by id
 *   GET_SCHEDULED_MESSAGES    → list a session's reservations (ACK)
 *
 * ACK/requestId conventions follow the other request handlers (e.g. getUsage.ts).
 */

/** SCHEDULE_MESSAGE: persist + arm a reservation, then ACK with the created reservation. */
export async function scheduleMessageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as
    | { sessionId?: string; sendAt?: string; message?: string; kind?: ScheduledMessageKind }
    | undefined;
  const sessionId = payload?.sessionId;
  const sendAt = payload?.sendAt;
  const messageText = payload?.message;
  const kind = payload?.kind ?? ScheduledMessageKind.AUTO_RESUME;

  if (!sessionId || !sendAt || !messageText) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'sessionId, sendAt and message are required',
    });
    return;
  }

  // Server-side sponsor gate: auto-resume is a sponsor-only feature. The webview
  // hides the UI for non-sponsors, but reject here too so a non-sponsor cannot
  // create a reservation by sending SCHEDULE_MESSAGE directly over IPC.
  const sponsor = await getSponsorStatus();
  if (!sponsor.isSponsor) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'Auto-resume is a sponsor-only feature',
    });
    return;
  }

  const reservation: ScheduledMessage = {
    id: randomUUID(),
    sessionId,
    sendAt,
    message: messageText,
    kind,
    createdAt: new Date().toISOString(),
  };

  await scheduleMessage(reservation, connections);

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    scheduledMessage: reservation,
  });
}

/** CANCEL_SCHEDULED_MESSAGE: clear a reservation's timer + remove it, then ACK. */
export async function cancelScheduledMessageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { sessionId?: string; id?: string } | undefined;
  const sessionId = payload?.sessionId;
  const id = payload?.id;

  if (!sessionId || !id) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'sessionId and id are required',
    });
    return;
  }

  await cancelSchedule(sessionId, id, connections);

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}

/** GET_SCHEDULED_MESSAGES: return a session's current reservation list (ACK). */
export async function getScheduledMessagesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { sessionId?: string } | undefined;
  const sessionId = payload?.sessionId;

  if (!sessionId) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'sessionId is required',
    });
    return;
  }

  const schedules = await readSchedulesForSession(sessionId);

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    schedules,
  });
}

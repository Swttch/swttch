import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { randomUUID } from 'crypto';
import { MessageType, ScheduledMessageKind, ErrorCode, type ScheduledMessage } from '../../shared';
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

  // Server-side sponsor gate: scheduling a message is a sponsor-only feature
  // (both auto-resume and user-created "schedule send" go through here). The
  // webview gates its controls too, but reject here so a non-sponsor cannot
  // create a reservation by sending SCHEDULE_MESSAGE directly over IPC.
  const sponsor = await getSponsorStatus();
  if (!sponsor.isSponsor) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'Sponsor-only feature',
      errorCode: ErrorCode.SPONSOR_REQUIRED,
    });
    return;
  }

  // Record which tab set the reservation (read from the server-side client
  // record, not the payload, so it always reflects the actual requesting tab).
  // Delivery prefers this tab; undefined for standalone/browser tabs with no
  // panelId, in which case delivery falls back by session/focus.
  const panelId = connections.getClient(connectionId)?.panelId ?? undefined;

  const reservation: ScheduledMessage = {
    id: randomUUID(),
    sessionId,
    sendAt,
    message: messageText,
    kind,
    createdAt: new Date().toISOString(),
    panelId,
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

/**
 * SCHEDULED_MESSAGE_DELIVERED: a webview finished delivering a due reservation
 * (it ran the normal send path). Now — and only now — drop the reservation and
 * broadcast the updated list. Fire-and-forget from the webview's side (no ACK
 * back): if this notification is lost the reservation simply redelivers, which
 * is the intended at-least-once behavior.
 */
export async function scheduledMessageDeliveredHandler(
  _connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { sessionId?: string; id?: string } | undefined;
  const sessionId = payload?.sessionId;
  const id = payload?.id;
  if (!sessionId || !id) return;

  await cancelSchedule(sessionId, id, connections);
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

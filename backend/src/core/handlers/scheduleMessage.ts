import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { randomUUID } from 'crypto';
import {
  MessageType,
  ScheduledMessageKind,
  ErrorCode,
  SponsorGate,
  type ScheduledMessage,
} from '../../shared';
import {
  scheduleMessage,
  cancelSchedule,
  editScheduledMessage,
} from '../features/scheduled-messages';
import { readSchedulesForSession } from '../features/scheduled-messages-store';
import { readRegistry } from '../features/account-store';
import { readAccountPoolRecovery } from '../features/account-pool-recovery-store';
import { getSponsorStatus } from '../features/license';

/**
 * Handlers for the scheduled-message ("send later") engine:
 *   SCHEDULE_MESSAGE          → create a reservation for a session
 *   CANCEL_SCHEDULED_MESSAGE  → cancel a reservation by id
 *   GET_SCHEDULED_MESSAGES    → list a session's reservations (ACK)
 *
 * ACK/requestId conventions follow the other request handlers (e.g. getUsage.ts).
 */

/**
 * Which feature a refused reservation was being made for.
 *
 * One handler serves two paid features, so a bare SPONSOR_REQUIRED would arrive
 * at the webview's error interceptor with no way to tell them apart, and both
 * would be measured as one. The refusal names the gate so the toast it triggers
 * can be attributed to the feature that actually raised it.
 */
function gateForKind(kind: ScheduledMessageKind): SponsorGate {
  return kind === ScheduledMessageKind.AUTO_RESUME ? SponsorGate.AutoResume : SponsorGate.Schedule;
}

/** SCHEDULE_MESSAGE: persist + arm a reservation, then ACK with the created reservation. */
export async function scheduleMessageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as
    | { sessionId?: string; sendAt?: string; message?: string; kind?: ScheduledMessageKind; model?: string }
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
      gate: gateForKind(kind),
    });
    return;
  }

  // Record which tab set the reservation (read from the server-side client
  // record, not the payload, so it always reflects the actual requesting tab).
  // Delivery prefers this tab; undefined for standalone/browser tabs with no
  // panelId, in which case delivery falls back by session/focus.
  const panelId = connections.getClient(connectionId)?.panelId ?? undefined;

  const create = async (): Promise<ScheduledMessage> => {
    const recovery = kind === ScheduledMessageKind.AUTO_RESUME ? await readAccountPoolRecovery(sessionId) : null;
    if (recovery?.awaitingLimit) throw new Error('Waiting for the selected account limit response');
    const accountId = kind === ScheduledMessageKind.AUTO_RESUME
      ? recovery?.accountId ?? (await readRegistry()).current ?? undefined : undefined;
    const effectiveSendAt = recovery?.resetsAt
      ? new Date(Math.max(Date.parse(sendAt), Date.parse(recovery.resetsAt) + 30_000)).toISOString() : sendAt;
    const reservation: ScheduledMessage = {
      id: randomUUID(),
      sessionId,
      sendAt: effectiveSendAt,
      accountId,
      model: payload?.model,
      message: messageText,
      kind,
      createdAt: new Date().toISOString(),
      panelId,
    };

    await scheduleMessage(reservation, connections);
    return reservation;
  };
  const reservation = kind === ScheduledMessageKind.AUTO_RESUME
    ? await createAutoResumeOnce(sessionId, create) : await create();

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
 * UPDATE_SCHEDULED_MESSAGE: edit a reservation in place (message and/or sendAt)
 * by id, then ACK. Sponsor-gated like create — editing is part of the same
 * sponsor-only feature. A missing id/session errors; an unknown id is a no-op
 * (still ACKed) since the list may have changed under the editor.
 */
export async function updateScheduledMessageHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = message.payload as
    | { sessionId?: string; id?: string; message?: string; sendAt?: string }
    | undefined;
  const sessionId = payload?.sessionId;
  const id = payload?.id;

  if (!sessionId || !id) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'sessionId and id are required',
    });
    return;
  }

  const sponsor = await getSponsorStatus();
  if (!sponsor.isSponsor) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'Sponsor-only feature',
      // An edit carries no kind, but it is only ever reachable from the
      // schedule-send popover, whose own gate runs first — so anything arriving
      // here is a direct IPC call against that same feature.
      gate: SponsorGate.Schedule,
      errorCode: ErrorCode.SPONSOR_REQUIRED,
    });
    return;
  }

  await editScheduledMessage(
    sessionId,
    id,
    { message: payload?.message, sendAt: payload?.sendAt },
    connections,
  );

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

const creatingAutoResume = new Map<string, Promise<ScheduledMessage>>();
async function createAutoResumeOnce(sessionId: string, create: () => Promise<ScheduledMessage>): Promise<ScheduledMessage> {
  const pending = creatingAutoResume.get(sessionId);
  if (pending) return pending;
  const operation = (async () => {
    const existing = (await readSchedulesForSession(sessionId)).find(s => s.kind === ScheduledMessageKind.AUTO_RESUME);
    return existing ?? await create();
  })();
  creatingAutoResume.set(sessionId, operation);
  try { return await operation; } finally { creatingAutoResume.delete(sessionId); }
}

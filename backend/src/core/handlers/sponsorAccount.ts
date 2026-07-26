import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import {
  listSponsorDevices,
  removeSponsorDevice,
  listSponsorInvoices,
  cancelSponsorSubscription,
} from '../features/license';
import { MessageType } from '../../shared';

/**
 * Sponsor self-service: the machines a license is active on, and the payments
 * behind it.
 *
 * All three go through www with the stored sponsor key as the credential — the
 * key never leaves the backend, and www scopes every query to the license it
 * resolves from that key. Failures come back as empty lists rather than errors,
 * because this is supporting detail on the Sponsor screen: an outage should cost
 * the list, not the screen.
 */

export async function getSponsorDevicesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const devices = await listSponsorDevices();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    devices,
  });
}

export async function removeSponsorDeviceHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const telemetryId = message.payload?.telemetryId as string | undefined;
  if (telemetryId === undefined || telemetryId === '') {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'telemetryId is required',
    });
    return;
  }

  const ok = await removeSponsorDevice(telemetryId);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ok,
  });
}

export async function getSponsorInvoicesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const invoices = await listSponsorInvoices();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    invoices,
  });
}

/**
 * End the recurring payment. Unlike DEACTIVATE_LICENSE — which only clears the
 * key on this install and is undone by pasting it back — this stops the billing
 * relationship itself.
 */
export async function cancelSponsorSubscriptionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const ok = await cancelSponsorSubscription();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    ok,
  });
}

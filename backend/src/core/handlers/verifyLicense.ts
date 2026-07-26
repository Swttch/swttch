import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { verifyLicenseRemote, saveLicense, reportActivation } from '../features/license';
import { MessageType } from '../../shared';

/**
 * Verify a sponsor license key against www. On success the key is persisted so
 * the sponsor state survives restarts; on failure nothing is stored. Returns the
 * verification result to the webview (valid / status / error).
 */
export async function verifyLicenseHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const licenseKey =
    typeof message.payload?.licenseKey === 'string' ? message.payload.licenseKey.trim() : '';

  if (licenseKey === '') {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      valid: false,
      error: 'licenseKey required',
    });
    return;
  }

  const result = await verifyLicenseRemote(licenseKey);

  if (result.valid) {
    await saveLicense({
      licenseKey,
      status: result.status ?? null,
      // Stamped at write time. Date.now-based ISO is fine in the backend runtime.
      verifiedAt: new Date().toISOString(),
      // Cached so the sponsor screen can show the plan without a round-trip.
      tier: result.tier ?? null,
      interval: result.interval ?? null,
    });
    // Report this install's activation to www (fire-and-forget; must not delay the ACK).
    void reportActivation(licenseKey);
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    valid: result.valid,
    licenseStatus: result.status,
    error: result.error,
  });
}

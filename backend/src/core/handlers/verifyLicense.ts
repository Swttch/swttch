import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { verifyLicenseRemote, saveLicense, reportActivation } from '../features/license';
import { MessageType, ErrorCode } from '../../shared';

/**
 * Verify a sponsor license key against www. On success the key is persisted so
 * the sponsor state survives restarts; on failure nothing is stored. Returns the
 * verification result to the webview (valid / status / error / errorCode).
 *
 * A failure is reported with an `errorCode` saying WHICH kind it was, because
 * "we asked and the key is bad" and "we never got to ask" need opposite advice.
 * The two are told apart the same way `revalidateStoredLicense` tells them apart:
 * `verifyLicenseRemote` returns an `error` only when the round-trip itself failed
 * (transport/non-2xx), so `valid:false` WITHOUT an `error` is www's authoritative
 * "not a valid key". Using one rule in both places keeps a single definition of
 * what an authoritative rejection is.
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
      // Nothing was sent anywhere, so this is about the input, not the network.
      errorCode: ErrorCode.SPONSOR_KEY_INVALID,
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
    // Only meaningful on failure; omitted on success so the webview has nothing
    // to branch on when the key went through.
    errorCode: result.valid
      ? undefined
      : result.error === undefined
        ? ErrorCode.SPONSOR_KEY_INVALID
        : ErrorCode.SPONSOR_VERIFY_UNREACHABLE,
  });
}

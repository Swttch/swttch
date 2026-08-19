import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType, ErrorCode } from '../../../shared';

// Mock the license feature so the handler test never touches the network or fs.
const verifyLicenseRemote = vi.fn(async (_key: string) => ({ valid: false }) as {
  valid: boolean;
  status?: string;
  tier?: string;
  interval?: string;
  error?: string;
});
const saveLicense = vi.fn(async (..._args: unknown[]) => {});
const reportActivation = vi.fn(async (..._args: unknown[]) => {});
vi.mock('../../features/license', () => ({
  verifyLicenseRemote: (key: string) => verifyLicenseRemote(key),
  saveLicense: (...args: unknown[]) => saveLicense(...args),
  reportActivation: (...args: unknown[]) => reportActivation(...args),
}));

import { verifyLicenseHandler } from '../verifyLicense';

function makeConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}
const bridge = {} as Bridge;

function makeMessage(licenseKey: unknown = 'CCG-KEY'): IPCMessage {
  return {
    type: MessageType.VERIFY_LICENSE,
    requestId: 'req-1',
    payload: { licenseKey },
  } as unknown as IPCMessage;
}

/** The ACK payload the handler sent back. */
function sentPayload(connections: ConnectionManager) {
  const sendTo = connections.sendTo as unknown as ReturnType<typeof vi.fn>;
  return sendTo.mock.calls[0][2] as Record<string, unknown>;
}

describe('verifyLicenseHandler failure classification', () => {
  beforeEach(() => {
    verifyLicenseRemote.mockReset();
    saveLicense.mockClear();
    reportActivation.mockClear();
  });

  // The whole point of the errorCode: a key we could not check must never be
  // reported as a key we know to be wrong, because the two need opposite advice.
  it('reports an unreachable server distinctly from an invalid key', async () => {
    // verifyLicenseRemote returns an `error` only when the round-trip failed.
    verifyLicenseRemote.mockResolvedValue({ valid: false, error: 'fetch failed' });
    const connections = makeConnections();

    await verifyLicenseHandler('c1', makeMessage(), connections, bridge);

    const payload = sentPayload(connections);
    expect(payload.valid).toBe(false);
    expect(payload.errorCode).toBe(ErrorCode.SPONSOR_VERIFY_UNREACHABLE);
    // Nothing may be persisted when we never got an answer.
    expect(saveLicense).not.toHaveBeenCalled();
  });

  it('reports an authoritative rejection as an invalid key', async () => {
    // Reached www, and www said no — `valid:false` with no transport error.
    verifyLicenseRemote.mockResolvedValue({ valid: false });
    const connections = makeConnections();

    await verifyLicenseHandler('c1', makeMessage(), connections, bridge);

    const payload = sentPayload(connections);
    expect(payload.valid).toBe(false);
    expect(payload.errorCode).toBe(ErrorCode.SPONSOR_KEY_INVALID);
    expect(saveLicense).not.toHaveBeenCalled();
  });

  it('treats an empty key as invalid input without asking www', async () => {
    const connections = makeConnections();

    await verifyLicenseHandler('c1', makeMessage('   '), connections, bridge);

    const payload = sentPayload(connections);
    expect(payload.valid).toBe(false);
    expect(payload.errorCode).toBe(ErrorCode.SPONSOR_KEY_INVALID);
    expect(verifyLicenseRemote).not.toHaveBeenCalled();
  });

  it('carries no errorCode on success and persists the key', async () => {
    verifyLicenseRemote.mockResolvedValue({
      valid: true,
      status: 'active',
      tier: 'allround',
      interval: 'monthly',
    });
    const connections = makeConnections();

    await verifyLicenseHandler('c1', makeMessage(), connections, bridge);

    const payload = sentPayload(connections);
    expect(payload.valid).toBe(true);
    expect(payload.errorCode).toBeUndefined();
    expect(saveLicense).toHaveBeenCalledOnce();
    expect(saveLicense).toHaveBeenCalledWith(
      expect.objectContaining({ licenseKey: 'CCG-KEY', tier: 'allround', interval: 'monthly' }),
    );
  });
});

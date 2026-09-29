import { describe, it, expect, vi, afterEach } from 'vitest';
import { issueLocalPairingHandler } from '../issueLocalPairing';
import { tunnelPairing } from '../../features/tunnel-pairing';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

describe('issueLocalPairingHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('issues a fresh single-use code and returns it in an ok ACK (no running tunnel required)', async () => {
    // A LOCAL code, deliberately: minting one for this webview must not revoke
    // the operator's tunnel QR, nor the code a sibling panel is about to redeem
    // (issue #479). `issueCode` is the rotating tunnel mint and stays untouched.
    const issueSpy = vi.spyOn(tunnelPairing, 'issueLocalCode').mockReturnValue('fresh-code');
    const rotateSpy = vi.spyOn(tunnelPairing, 'issueCode');
    const sendTo = vi.fn();
    const connections = { sendTo } as unknown as ConnectionManager;
    const message = {
      type: MessageType.ISSUE_LOCAL_PAIRING,
      requestId: 'req-1',
      payload: {},
    } as unknown as IPCMessage;

    await issueLocalPairingHandler('conn-1', message, connections, {} as unknown as Bridge);

    // A fresh code was minted (not gated on tunnel state, unlike ISSUE_TUNNEL_PAIRING).
    expect(issueSpy).toHaveBeenCalledTimes(1);
    expect(rotateSpy).not.toHaveBeenCalled();
    // Returned to the requesting webview as an ok ACK carrying ONLY the code.
    expect(sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
      code: 'fresh-code',
    });
  });
});

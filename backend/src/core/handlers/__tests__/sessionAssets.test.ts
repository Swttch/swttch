import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const collectSessionAssets = vi.fn();
const readSessionAsset = vi.fn();
vi.mock('../../features/collectSessionAssets', () => ({
  collectSessionAssets: (...a: unknown[]) => collectSessionAssets(...a),
  readSessionAsset: (...a: unknown[]) => readSessionAsset(...a),
}));

const { getSessionAssetsHandler } = await import('../getSessionAssets');
const { getSessionAssetDataHandler } = await import('../getSessionAssetData');

const bridge = {} as Bridge;
let sent: { type: string; payload: Record<string, unknown> }[] = [];
const connections = {
  sendTo: (_id: string, type: string, payload: Record<string, unknown>) => {
    sent.push({ type, payload });
  },
} as unknown as ConnectionManager;

const last = () => sent[sent.length - 1];

function message(type: MessageType, payload: Record<string, unknown>): IPCMessage {
  return { type, payload, requestId: 'r1', timestamp: 0 } as IPCMessage;
}

const BASE = { workingDir: '/w', sessionId: 's1' };

beforeEach(() => {
  sent = [];
  collectSessionAssets.mockReset();
  readSessionAsset.mockReset();
});

describe('getSessionAssetsHandler', () => {
  it('answers with the index for the requested session', async () => {
    const assets = [{ entryUuid: 'u1', blockIndex: 1, mediaType: 'image/png', timestamp: null, byteSize: 3 }];
    collectSessionAssets.mockResolvedValue(assets);

    await getSessionAssetsHandler('c1', message(MessageType.GET_SESSION_ASSETS, BASE), connections, bridge);

    expect(collectSessionAssets).toHaveBeenCalledWith('/w', 's1');
    expect(last().type).toBe(MessageType.ACK);
    expect(last().payload).toEqual({ requestId: 'r1', status: 'ok', assets });
  });

  it('rejects a request missing the session it should index', async () => {
    await getSessionAssetsHandler('c1', message(MessageType.GET_SESSION_ASSETS, { workingDir: '/w' }), connections, bridge);

    expect(collectSessionAssets).not.toHaveBeenCalled();
    expect(last().payload.status).toBe('error');
  });

  it('reports a read failure instead of leaving the caller waiting', async () => {
    // The webview awaits this reply; throwing without answering would hang the
    // Assets screen on a spinner forever.
    collectSessionAssets.mockRejectedValue(new Error('disk exploded'));

    await getSessionAssetsHandler('c1', message(MessageType.GET_SESSION_ASSETS, BASE), connections, bridge);

    expect(last().payload).toMatchObject({ requestId: 'r1', status: 'error', error: 'disk exploded' });
  });
});

describe('getSessionAssetDataHandler', () => {
  const REF = { ...BASE, entryUuid: 'u1', blockIndex: 1 };

  it('passes the block source through untouched', async () => {
    const source = { type: 'base64', media_type: 'image/png', data: 'AAAA' };
    readSessionAsset.mockResolvedValue(source);

    await getSessionAssetDataHandler('c1', message(MessageType.GET_SESSION_ASSET_DATA, REF), connections, bridge);

    expect(readSessionAsset).toHaveBeenCalledWith('/w', 's1', { entryUuid: 'u1', blockIndex: 1 });
    expect(last().payload).toEqual({ requestId: 'r1', status: 'ok', source });
  });

  it('answers "gone" — not an error — for a coordinate that no longer resolves', async () => {
    // A rewind can drop the entry while the viewer is open. Calling that an
    // error would surface a failure for an ordinary outcome.
    readSessionAsset.mockResolvedValue(null);

    await getSessionAssetDataHandler('c1', message(MessageType.GET_SESSION_ASSET_DATA, REF), connections, bridge);

    expect(last().payload).toEqual({ requestId: 'r1', status: 'gone' });
  });

  it('accepts blockIndex 0 rather than treating it as missing', async () => {
    // A falsy-check on blockIndex would reject the very first block.
    readSessionAsset.mockResolvedValue({ type: 'base64', data: 'AAAA' });

    await getSessionAssetDataHandler(
      'c1',
      message(MessageType.GET_SESSION_ASSET_DATA, { ...REF, blockIndex: 0 }),
      connections,
      bridge,
    );

    expect(last().payload.status).toBe('ok');
  });

  it('rejects a request with no coordinate', async () => {
    await getSessionAssetDataHandler('c1', message(MessageType.GET_SESSION_ASSET_DATA, BASE), connections, bridge);

    expect(readSessionAsset).not.toHaveBeenCalled();
    expect(last().payload.status).toBe('error');
  });
});

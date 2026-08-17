import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../extend-kit', () => ({
  getExtendKitVersion: vi.fn(async () => '0.4.0'),
  resetExtendKitCache: vi.fn(),
  loadSpeechToText: vi.fn(),
  ExtendKitMissingError: class extends Error {},
  EXTEND_KIT_PACKAGE: '@swttch/extend-kit',
}));
vi.mock('../getCliUpdateInfo', () => ({
  fetchDistTags: vi.fn(async () => ({ stable: null, latest: '0.4.0' })),
}));

import { getExtendKitInfoHandler } from '../dictation';
import { resetExtendKitCache } from '../../extend-kit';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockReset = vi.mocked(resetExtendKitCache);
const bridge = {} as Bridge;

function mockConns() {
  return { sendTo: vi.fn(), broadcastToAll: vi.fn() } as unknown as ConnectionManager;
}

function msg(payload: Record<string, unknown>): IPCMessage {
  return { type: MessageType.GET_EXTEND_KIT_INFO, payload, timestamp: 0, requestId: 'req-1' };
}

function lastPayload(conns: ConnectionManager): Record<string, unknown> {
  const calls = (conns.sendTo as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][2];
}

describe('GET_EXTEND_KIT_INFO — re-checking on demand', () => {
  beforeEach(() => vi.clearAllMocks());

  // Resolving where the kit lives spawns package managers, so the loader caches
  // it. Every ordinary read must keep using that cache.
  it('keeps the cached resolution for a normal read', async () => {
    await getExtendKitInfoHandler('c1', msg({}), mockConns(), bridge);
    expect(mockReset).not.toHaveBeenCalled();
  });

  // The version is clickable precisely to catch a change made OUTSIDE this app.
  // Honouring the cache there would make the control do nothing at the one
  // moment it is pressed — which is what happened before this flag existed:
  // after removing the kit the cache held the old path, and reinstalling it in
  // a terminal never showed up.
  it('drops the cached resolution when the caller asks to refresh', async () => {
    await getExtendKitInfoHandler('c1', msg({ refresh: true }), mockConns(), bridge);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('still answers with the version either way', async () => {
    const conns = mockConns();
    await getExtendKitInfoHandler('c1', msg({ refresh: true }), conns, bridge);
    expect(lastPayload(conns)).toMatchObject({
      status: 'ok',
      packageName: '@swttch/extend-kit',
      installed: '0.4.0',
      latest: '0.4.0',
      updatable: false,
    });
  });
});

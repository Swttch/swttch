import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MessageType } from '@/shared';
import { INSTALL_REQUEST_TIMEOUT_MS } from '@/api/bridge/Bridge';
import { createTestQueryClient, makeQueryWrapper } from './testQueryClient';

const { mockSend, mockSubscribe } = vi.hoisted(() => ({ mockSend: vi.fn(), mockSubscribe: vi.fn() }));
let connected = true;

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: connected, send: mockSend, subscribe: mockSubscribe, lastError: null }),
}));

import { useExtendKit } from '../useExtendKit';

const info = {
  status: 'ok',
  packageName: '@swttch/extend-kit',
  installed: null,
  latest: '0.4.0',
  updatable: false,
};

let current: ReturnType<typeof useExtendKit> | null = null;
function Probe({ enabled }: { enabled?: boolean }) {
  current = useExtendKit(enabled === undefined ? undefined : { enabled });
  return null;
}

function renderHook(enabled?: boolean) {
  const client = createTestQueryClient();
  render(<Probe enabled={enabled} />, { wrapper: makeQueryWrapper(client) });
}

describe('useExtendKit', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSubscribe.mockReset();
    connected = true;
    current = null;
  });

  it('does not query GET_EXTEND_KIT_INFO while disabled (composer keeps it off the wire)', async () => {
    mockSend.mockResolvedValue(info);
    renderHook(false);
    // Give any (unwanted) query a chance to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(mockSend).not.toHaveBeenCalledWith(MessageType.GET_EXTEND_KIT_INFO, {});
    expect(current?.info).toBeUndefined();
  });

  it('install() sends INSTALL_CCB with the long install timeout, not the 30s default', async () => {
    mockSend.mockResolvedValue(info);
    renderHook();
    await waitFor(() => expect(current?.info).not.toBeUndefined());

    mockSend.mockResolvedValueOnce({ status: 'ok' });
    await act(async () => { await current!.install(); });

    // A global npm install runs past 30s; without the longer timeout the bridge
    // gives up first and the user sees a silent stall instead of the result.
    expect(mockSend).toHaveBeenCalledWith(
      MessageType.INSTALL_CCB,
      {},
      { timeout: INSTALL_REQUEST_TIMEOUT_MS },
    );
  });
});

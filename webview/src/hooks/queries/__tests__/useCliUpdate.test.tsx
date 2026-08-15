import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MessageType, PackageManager, UpdateMode } from '@/shared';
import { INSTALL_REQUEST_TIMEOUT_MS } from '@/api/bridge/Bridge';
import { createTestQueryClient, makeQueryWrapper } from './testQueryClient';

const { mockSend, mockSubscribe } = vi.hoisted(() => ({ mockSend: vi.fn(), mockSubscribe: vi.fn() }));
let connected = true;

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: connected, send: mockSend, subscribe: mockSubscribe, lastError: null }),
}));

import { useCliUpdate, type UseCliUpdateResult } from '../useCliUpdate';

const versionedInfo = {
  status: 'ok',
  cliVersion: '2.1.179',
  packageManager: PackageManager.VOLTA,
  updateMode: UpdateMode.VERSIONED,
  stable: '2.1.185',
  latest: '2.1.197',
  updatable: true,
};

let current: UseCliUpdateResult | null = null;
function Probe() {
  current = useCliUpdate();
  return null;
}

function renderHook() {
  const client = createTestQueryClient();
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  render(<Probe />, { wrapper: makeQueryWrapper(client) });
  return { invalidateSpy };
}

describe('useCliUpdate', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSubscribe.mockReset();
    connected = true;
    current = null;
  });

  it('loads install method + available versions from GET_CLI_UPDATE_INFO', async () => {
    mockSend.mockResolvedValue(versionedInfo);
    renderHook();

    await waitFor(() => expect(current?.info).not.toBeNull());
    expect(current?.info?.packageManager).toBe(PackageManager.VOLTA);
    expect(current?.info?.updateMode).toBe(UpdateMode.VERSIONED);
    expect(current?.info?.stable).toBe('2.1.185');
    expect(current?.info?.latest).toBe('2.1.197');
    expect(current?.info?.updatable).toBe(true);
  });

  it('update() sends UPDATE_CLI with the version and invalidates version + info queries', async () => {
    mockSend.mockResolvedValue(versionedInfo);
    const { invalidateSpy } = renderHook();
    await waitFor(() => expect(current?.info).not.toBeNull());

    mockSend.mockResolvedValueOnce({ status: 'ok', newVersion: '2.1.185' });
    let returned: string | null = null;
    await act(async () => { returned = await current!.update('2.1.185'); });

    expect(returned).toBe('2.1.185');
    // Long-running: sent with the install/update timeout, not the 30s default,
    // so a slow update's result is not lost to a premature bridge timeout.
    expect(mockSend).toHaveBeenCalledWith(
      MessageType.UPDATE_CLI,
      { version: '2.1.185' },
      { timeout: INSTALL_REQUEST_TIMEOUT_MS },
    );
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toContain(MessageType.GET_VERSION);
    expect(keys).toContain(MessageType.GET_CLI_UPDATE_INFO);
  });

  it('SIMPLE update sends UPDATE_CLI with no version', async () => {
    mockSend.mockResolvedValue({ ...versionedInfo, packageManager: PackageManager.NATIVE, updateMode: UpdateMode.SIMPLE });
    renderHook();
    await waitFor(() => expect(current?.info).not.toBeNull());

    mockSend.mockResolvedValueOnce({ status: 'ok', newVersion: '2.1.197' });
    await act(async () => { await current!.update(null); });

    expect(mockSend).toHaveBeenCalledWith(
      MessageType.UPDATE_CLI,
      {},
      { timeout: INSTALL_REQUEST_TIMEOUT_MS },
    );
  });

  it('update() rejects when the backend returns an error status', async () => {
    mockSend.mockResolvedValue(versionedInfo);
    renderHook();
    await waitFor(() => expect(current?.info).not.toBeNull());

    mockSend.mockResolvedValueOnce({ status: 'error', error: 'volta not found' });
    await expect(current!.update('2.1.197')).rejects.toThrow(/volta not found/);
  });
});

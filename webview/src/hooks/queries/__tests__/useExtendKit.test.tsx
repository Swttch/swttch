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
    expect(
      mockSend.mock.calls.some((c) => c[0] === MessageType.GET_EXTEND_KIT_INFO),
    ).toBe(false);
    expect(current?.info).toBeUndefined();
  });

  /** The payload of the last GET_EXTEND_KIT_INFO that went out. */
  function lastInfoPayload(): { refresh?: boolean } | undefined {
    const calls = mockSend.mock.calls.filter((c) => c[0] === MessageType.GET_EXTEND_KIT_INFO);
    return calls[calls.length - 1]?.[1] as { refresh?: boolean } | undefined;
  }

  it('reads normally without asking the backend to re-resolve', async () => {
    mockSend.mockResolvedValue(info);
    renderHook();
    await waitFor(() => expect(current?.info).not.toBeUndefined());
    // Resolving where the kit lives spawns package managers; ordinary reads must
    // keep using the backend's cache.
    expect(lastInfoPayload()).toEqual({ refresh: false });
  });

  it('refresh() asks the backend to re-resolve', async () => {
    mockSend.mockResolvedValue(info);
    renderHook();
    await waitFor(() => expect(current?.info).not.toBeUndefined());

    await act(async () => { await current!.refresh(); });

    expect(lastInfoPayload()).toEqual({ refresh: true });
  });

  // The flag lives at module scope, not in a ref, because several components
  // call this hook against ONE react-query entry and only one of their queryFn
  // closures runs. A per-instance ref set by the clicked control was routinely
  // read as `false` by another instance's closure, so the backend answered from
  // its cache — measured as a version line that kept showing a kit already gone
  // from disk.
  it('carries the refresh flag across hook instances sharing the query', async () => {
    mockSend.mockResolvedValue(info);
    const client = createTestQueryClient();
    let a: ReturnType<typeof useExtendKit> | null = null;
    let b: ReturnType<typeof useExtendKit> | null = null;
    function A() { a = useExtendKit(); return null; }
    function B() { b = useExtendKit(); return null; }
    render(<><A /><B /></>, { wrapper: makeQueryWrapper(client) });
    await waitFor(() => expect(a?.info).not.toBeUndefined());

    // One instance asks; the shared query may run either closure.
    await act(async () => { await a!.refresh(); });

    expect(lastInfoPayload()).toEqual({ refresh: true });
    expect(b).not.toBeNull();
  });

  // After removing, the backend's cached resolution points at the copy that was
  // just deleted, so the refetch this triggers has to make it look again.
  it('re-resolves after a removal', async () => {
    mockSend.mockResolvedValue(info);
    renderHook();
    await waitFor(() => expect(current?.info).not.toBeUndefined());

    mockSend.mockResolvedValueOnce({ status: 'ok' });
    await act(async () => { await current!.uninstall(); });
    await waitFor(() => expect(lastInfoPayload()).toEqual({ refresh: true }));
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

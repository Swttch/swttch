import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MessageType } from '@/shared';
import { createTestQueryClient, makeQueryWrapper } from '../queries/__tests__/testQueryClient';

const { mockSend, mockSubscribe } = vi.hoisted(() => ({ mockSend: vi.fn(), mockSubscribe: vi.fn() }));
let connected = true;

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: connected, send: mockSend, subscribe: mockSubscribe, lastError: null }),
}));

import { useVersionInfo } from '../useVersionInfo';

type VersionReturn = ReturnType<typeof useVersionInfo>;

const okResponse = {
  status: 'ok',
  pluginVersion: '0.22.0',
  cliVersion: '2.1.179',
  requiresRestart: true,
};

let current: VersionReturn | null = null;
function Probe() {
  current = useVersionInfo();
  return null;
}

function renderHook() {
  const client = createTestQueryClient();
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  render(<Probe />, { wrapper: makeQueryWrapper(client) });
  return { invalidateSpy };
}

describe('useVersionInfo', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSubscribe.mockReset();
    connected = true;
    current = null;
  });

  it('loads plugin + CLI version from GET_VERSION', async () => {
    mockSend.mockResolvedValue(okResponse);
    renderHook();

    await waitFor(() => expect(current?.pluginVersion).toBe('0.22.0'));
    expect(current?.cliVersion).toBe('2.1.179');
    expect(current?.requiresRestart).toBe(true);
    expect(mockSend.mock.calls.filter((c) => c[0] === MessageType.GET_VERSION).length).toBe(1);
  });

  it('does not fetch while disconnected', async () => {
    connected = false;
    mockSend.mockResolvedValue(okResponse);
    renderHook();

    // Query is disabled → placeholder values, no send.
    expect(current?.pluginVersion).toBe('...');
    expect(current?.cliVersion).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refresh() invalidates the shared version query', async () => {
    mockSend.mockResolvedValue(okResponse);
    const { invalidateSpy } = renderHook();
    await waitFor(() => expect(current).not.toBeNull());

    invalidateSpy.mockClear();
    await act(async () => { await current!.refresh(); });

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toContain(MessageType.GET_VERSION);
  });

  it('refetches the version after a background CLI update', async () => {
    mockSend.mockResolvedValue(okResponse);
    const { invalidateSpy } = renderHook();
    await waitFor(() => expect(current?.cliVersion).toBe('2.1.179'));

    const callback = mockSubscribe.mock.calls.find((c) => c[0] === MessageType.CLI_UPDATED)?.[1] as () => void;
    expect(callback).toBeTypeOf('function');
    mockSend.mockResolvedValue({ ...okResponse, cliVersion: '2.1.180' });
    invalidateSpy.mockClear();
    act(() => callback());

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toContain(MessageType.GET_CLI_UPDATE_INFO);
    await waitFor(() => expect(current?.cliVersion).toBe('2.1.180'));
  });

  it('keeps placeholder values when the response is not ok', async () => {
    mockSend.mockResolvedValue({ status: 'error', error: 'boom' });
    renderHook();

    await waitFor(() => expect(current?.isLoading).toBe(false));
    expect(current?.pluginVersion).toBe('...');
    expect(current?.cliVersion).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const sendMock = vi.fn();

vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

import { useAgentTranscript } from '../useAgentTranscript';
import { MessageType } from '@/shared';
import { createTestQueryClient, makeQueryWrapper } from '@/hooks/queries/__tests__/testQueryClient';

describe('useAgentTranscript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests the transcript with transcriptDir/agentId and returns entries', async () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [{ type: 'user', uuid: 'u1' }], truncated: false });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useAgentTranscript('/x/y', 'a1'), { wrapper: makeQueryWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sendMock).toHaveBeenCalledWith(MessageType.GET_AGENT_TRANSCRIPT, { transcriptDir: '/x/y', agentId: 'a1' });
    expect(result.current.data).toEqual({ entries: [{ type: 'user', uuid: 'u1' }], truncated: false });
  });

  it('does not fire the request when transcriptDir or agentId is missing', () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useAgentTranscript(undefined, undefined), { wrapper: makeQueryWrapper(client) });

    expect(sendMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('surfaces a status:error ack as a query error', async () => {
    sendMock.mockResolvedValue({ status: 'error', error: 'boom' });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useAgentTranscript('/x/y', 'a1'), { wrapper: makeQueryWrapper(client) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('boom');
  });

  it('uses a distinct query key per fingerprint so live updates refetch', async () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [], truncated: false });
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(
      ({ fingerprint }: { fingerprint: string }) => useAgentTranscript('/x/y', 'a1', fingerprint),
      { wrapper: makeQueryWrapper(client), initialProps: { fingerprint: '0:0:0' } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sendMock).toHaveBeenCalledTimes(1);

    rerender({ fingerprint: '10:1:2' });
    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
  });
});

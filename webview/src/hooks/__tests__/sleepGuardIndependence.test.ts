import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * Sleep prevention and the remote tunnel are two independent features that happen
 * to share one modal. Nothing but the user's own click on the sleep switch may
 * move sleep prevention.
 *
 * Stopping the tunnel used to send SLEEP_GUARD_DISABLE on the user's behalf, so a
 * user who had turned sleep prevention on for their own reasons lost it by turning
 * off an unrelated feature, with no warning and no way to see it happen.
 */

const send = vi.fn();
const subscribe = vi.fn(() => () => {});

vi.mock('../useBridge', () => ({
  useBridge: () => ({ send, subscribe }),
}));

import { useTunnelStatus } from '../useTunnelStatus';

/** Message types sent so far, so an absence can be asserted precisely. */
function sentTypes(): string[] {
  return send.mock.calls.map((call) => String(call[0]));
}

/**
 * Mount the hook with the backend reporting a given starting state, and wait for
 * the mount-time probes to land so the hook's own state matches it.
 *
 * Starting state matters more than it looks here: the behavior being guarded
 * against only ever ran when sleep prevention was already ON, so a test that
 * starts with it OFF passes no matter what the code does.
 */
async function mountWith(state: { tunnel: boolean; sleep: boolean }) {
  send.mockResolvedValue({
    status: 'ok',
    tunnel: { enabled: state.tunnel, url: state.tunnel ? 'https://example.test' : null },
    sleepGuard: { enabled: state.sleep },
    cloudflaredAvailable: true,
  });
  const { result } = renderHook(() => useTunnelStatus());
  await waitFor(() => expect(result.current.preventSleep).toBe(state.sleep));
  await waitFor(() => expect(result.current.tunnelEnabled).toBe(state.tunnel));
  send.mockClear();
  return result;
}

beforeEach(() => {
  send.mockReset();
  subscribe.mockClear();
  send.mockResolvedValue({ status: 'ok', tunnel: { enabled: false, url: null }, sleepGuard: { enabled: false } });
});

describe('sleep prevention is independent of the tunnel', () => {
  it('turning the tunnel OFF does not turn sleep prevention off', async () => {
    // The reporter's shape: sleep prevention is ON for the user's own reasons,
    // and the user now switches off an unrelated feature.
    const result = await mountWith({ tunnel: true, sleep: true });

    await act(async () => {
      await result.current.handleTunnelToggle(false);
    });

    expect(sentTypes()).toContain(MessageType.TUNNEL_STOP);
    expect(sentTypes()).not.toContain(MessageType.SLEEP_GUARD_DISABLE);
  });

  it('turning the tunnel ON does not turn sleep prevention on', async () => {
    const { result } = renderHook(() => useTunnelStatus());
    await waitFor(() => expect(send).toHaveBeenCalled());
    send.mockClear();

    await act(async () => {
      await result.current.handleTunnelToggle(true);
    });

    expect(sentTypes()).not.toContain(MessageType.SLEEP_GUARD_ENABLE);
  });

  it('the user turning the sleep switch off still reaches the backend', async () => {
    // The point above is that only the user may move it, not that it stopped moving.
    const { result } = renderHook(() => useTunnelStatus());
    await waitFor(() => expect(send).toHaveBeenCalled());
    send.mockClear();

    await act(async () => {
      await result.current.handleSleepToggle(false);
    });

    expect(sentTypes()).toContain(MessageType.SLEEP_GUARD_DISABLE);
  });

  it('the user turning the sleep switch on still reaches the backend', async () => {
    const { result } = renderHook(() => useTunnelStatus());
    await waitFor(() => expect(send).toHaveBeenCalled());
    send.mockClear();

    await act(async () => {
      await result.current.handleSleepToggle(true);
    });

    expect(sentTypes()).toContain(MessageType.SLEEP_GUARD_ENABLE);
  });
});

describe('the notice that someone else changed the lid setting', () => {
  it('comes from the status the backend reports at start', async () => {
    send.mockResolvedValue({
      status: 'ok', tunnel: { enabled: false, url: null },
      sleepGuard: { enabled: true, externalChange: 'scheme' }, cloudflaredAvailable: true,
    });
    const { result } = renderHook(() => useTunnelStatus());

    await waitFor(() => expect(result.current.sleepExternalChange).toBe('scheme'));
  });

  it('ignores a value it does not know rather than showing a notice for it', async () => {
    send.mockResolvedValue({
      status: 'ok', tunnel: { enabled: false, url: null },
      sleepGuard: { enabled: true, externalChange: 'something-new' }, cloudflaredAvailable: true,
    });
    const { result } = renderHook(() => useTunnelStatus());

    await waitFor(() => expect(result.current.preventSleep).toBe(true));
    expect(result.current.sleepExternalChange).toBe('none');
  });
});

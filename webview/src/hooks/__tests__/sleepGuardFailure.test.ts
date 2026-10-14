import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * #554: turning on sleep prevention failed with "Could not read the lid close
 * setting from the system", and the dialog showed it under the title "Couldn't
 * start the tunnel" with a "Try again" that started the tunnel. The failure was
 * stored in the tunnel's own `error`. It belongs to sleep prevention, so it has
 * its own state and never touches the tunnel's.
 */

const send = vi.fn();
const subscribe = vi.fn(() => () => {});

vi.mock('../useBridge', () => ({
  useBridge: () => ({ send, subscribe }),
}));

import { useTunnelStatus } from '../useTunnelStatus';

const LID_ERROR = 'Could not read the lid close setting from the system';
const OK = {
  status: 'ok',
  tunnel: { enabled: false, url: null },
  sleepGuard: { enabled: false },
  cloudflaredAvailable: true,
};

/** Answer every request with a healthy backend, except the types given. */
function backend(overrides: Partial<Record<MessageType, unknown>> = {}) {
  send.mockImplementation(async (type: MessageType) => overrides[type] ?? OK);
}

async function mount() {
  const { result } = renderHook(() => useTunnelStatus());
  await waitFor(() => expect(result.current.cloudflaredAvailable).toBe(true));
  return result;
}

beforeEach(() => {
  send.mockReset();
  subscribe.mockClear();
});

describe('a failed attempt to turn sleep prevention on', () => {
  it('lands in sleepError, not in the tunnel error', async () => {
    backend({ [MessageType.SLEEP_GUARD_ENABLE]: { status: 'error', error: LID_ERROR } });
    const result = await mount();

    await act(async () => {
      await result.current.handleSleepToggle(true);
    });

    expect(result.current.sleepError).toBe(LID_ERROR);
    expect(result.current.error).toBeNull();
    expect(result.current.errorCode).toBeNull();
    expect(result.current.preventSleep).toBe(false);
    expect(result.current.sleepLoading).toBe(false);
  });

  it('leaves a tunnel error as it was, and the tunnel error leaves it alone', async () => {
    backend({
      [MessageType.TUNNEL_START]: { status: 'error', error: 'cloudflared exploded' },
      [MessageType.SLEEP_GUARD_ENABLE]: { status: 'error', error: LID_ERROR },
    });
    const result = await mount();

    await act(async () => {
      await result.current.handleTunnelToggle(true);
    });
    await act(async () => {
      await result.current.handleSleepToggle(true);
    });

    expect(result.current.error).toBe('cloudflared exploded');
    expect(result.current.sleepError).toBe(LID_ERROR);

    // Retrying the tunnel clears the tunnel's message and keeps sleep prevention's.
    backend({
      [MessageType.SLEEP_GUARD_ENABLE]: { status: 'error', error: LID_ERROR },
    });
    await act(async () => {
      await result.current.retryTunnel();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.sleepError).toBe(LID_ERROR);
  });

  it('is cleared when the user tries again and it works', async () => {
    backend({ [MessageType.SLEEP_GUARD_ENABLE]: { status: 'error', error: LID_ERROR } });
    const result = await mount();
    await act(async () => {
      await result.current.handleSleepToggle(true);
    });
    expect(result.current.sleepError).toBe(LID_ERROR);

    backend();
    await act(async () => {
      await result.current.handleSleepToggle(true);
    });

    expect(result.current.sleepError).toBeNull();
  });

  it('is cleared when the user turns the switch off', async () => {
    backend({ [MessageType.SLEEP_GUARD_ENABLE]: { status: 'error', error: LID_ERROR } });
    const result = await mount();
    await act(async () => {
      await result.current.handleSleepToggle(true);
    });

    backend();
    await act(async () => {
      await result.current.handleSleepToggle(false);
    });

    expect(result.current.sleepError).toBeNull();
  });
});

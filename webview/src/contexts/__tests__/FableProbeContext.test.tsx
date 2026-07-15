import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ModelInfo } from '@/types/slashCommand';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: mockSend, subscribe: vi.fn(), isConnected: true, lastError: null }),
}));

import { FableProbeProvider, useFableProbe, shouldProbeFable } from '../FableProbeContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <FableProbeProvider>{children}</FableProbeProvider>
);

describe('FableProbeContext (store)', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('starts undetermined (probedAvailable = null)', () => {
    const { result } = renderHook(() => useFableProbe(), { wrapper });
    expect(result.current.probedAvailable).toBeNull();
  });

  it('stores available=true from a successful probe and sends the working dir', async () => {
    mockSend.mockResolvedValue({ status: 'ok', available: true, checkedAt: 1, fromCache: false });
    const { result } = renderHook(() => useFableProbe(), { wrapper });

    await act(async () => {
      await result.current.probeFableAvailability('/tmp/project');
    });

    expect(result.current.probedAvailable).toBe(true);
    expect(mockSend).toHaveBeenCalledWith('PROBE_FABLE_AVAILABILITY', { workingDir: '/tmp/project' });
  });

  it('stores available=false from a successful probe (no working dir → undefined)', async () => {
    mockSend.mockResolvedValue({ status: 'ok', available: false, checkedAt: 2, fromCache: true });
    const { result } = renderHook(() => useFableProbe(), { wrapper });

    await act(async () => {
      await result.current.probeFableAvailability();
    });

    expect(result.current.probedAvailable).toBe(false);
    expect(mockSend).toHaveBeenCalledWith('PROBE_FABLE_AVAILABILITY', { workingDir: undefined });
  });

  it('leaves state null on an error status response (does not falsely flip)', async () => {
    mockSend.mockResolvedValue({ status: 'error', error: 'probe failed' });
    const { result } = renderHook(() => useFableProbe(), { wrapper });

    await act(async () => {
      await result.current.probeFableAvailability();
    });

    expect(result.current.probedAvailable).toBeNull();
  });

  it('leaves state null when the request throws (transient failure)', async () => {
    mockSend.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useFableProbe(), { wrapper });

    await act(async () => {
      await result.current.probeFableAvailability();
    });

    expect(result.current.probedAvailable).toBeNull();
  });

  it('keeps a prior successful result when a later probe errors', async () => {
    mockSend.mockResolvedValueOnce({ status: 'ok', available: true, checkedAt: 1, fromCache: false });
    const { result } = renderHook(() => useFableProbe(), { wrapper });
    await act(async () => {
      await result.current.probeFableAvailability();
    });
    expect(result.current.probedAvailable).toBe(true);

    mockSend.mockResolvedValueOnce({ status: 'error', error: 'boom' });
    await act(async () => {
      await result.current.probeFableAvailability();
    });
    // A flaky follow-up probe must not clobber the known-good value.
    expect(result.current.probedAvailable).toBe(true);
  });
});

// The trigger predicate the model picker consults on open. Kept pure so the
// probe-vs-skip decision is testable without mounting the whole overlay.
describe('shouldProbeFable (trigger condition)', () => {
  const DURING_PROMO = new Date('2026-07-03T00:00:00Z');
  const AFTER_PROMO = new Date('2026-07-20T00:00:00Z'); // past FABLE_PROMO_END (2026-07-19)
  const SUPPORTED_CLI = '2.1.170'; // FABLE_MIN_CLI_VERSION
  const OLD_CLI = '2.1.169';

  const model = (value: string): ModelInfo => ({ value, displayName: value, description: `${value} desc` });
  const CATALOG = [model('default'), model('sonnet'), model('opus')];
  const CATALOG_WITH_FABLE = [...CATALOG, model('fable')];

  it('does NOT probe inside the promo window (Fable offered without proof)', () => {
    expect(shouldProbeFable(CATALOG, DURING_PROMO, SUPPORTED_CLI)).toBe(false);
  });

  it('does NOT probe when the catalog already serves Fable', () => {
    expect(shouldProbeFable(CATALOG_WITH_FABLE, AFTER_PROMO, SUPPORTED_CLI)).toBe(false);
  });

  it('does NOT probe on an old CLI that cannot select Fable', () => {
    expect(shouldProbeFable(CATALOG, AFTER_PROMO, OLD_CLI)).toBe(false);
  });

  it('does NOT probe while the catalog is still loading (empty list)', () => {
    expect(shouldProbeFable([], AFTER_PROMO, SUPPORTED_CLI)).toBe(false);
  });

  it('does NOT probe when the CLI version is unknown (null)', () => {
    expect(shouldProbeFable(CATALOG, AFTER_PROMO, null)).toBe(false);
  });

  it('DOES probe past the window when Fable is absent and the CLI supports it', () => {
    expect(shouldProbeFable(CATALOG, AFTER_PROMO, SUPPORTED_CLI)).toBe(true);
  });
});

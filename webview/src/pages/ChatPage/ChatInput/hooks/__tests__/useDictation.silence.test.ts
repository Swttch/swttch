import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';
import { VOICE_SILENCE_TIMEOUT_MAX } from '@/types/settings';

// ---------------------------------------------------------------------------
// Bridge mock — START_DICTATION acks ok so the hook proceeds to open the
// microphone, which is where the silence timer is armed.
// ---------------------------------------------------------------------------
const sendMock = vi.fn((type: string) => {
  if (type === MessageType.START_DICTATION) return Promise.resolve({ status: 'ok' });
  return Promise.resolve({});
});
const sendRawMock = vi.fn();

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: sendMock,
    sendRaw: sendRawMock,
    subscribe: vi.fn(() => vi.fn()),
    lastError: null,
  }),
}));

/** Seconds of silence before auto-stop; undefined uses the shipped default. */
let silenceTimeout: number | undefined;

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { voice: { silenceTimeout } } }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ settings: {} }),
}));

// ---------------------------------------------------------------------------
// Microphone mock — captures the level callback so a test can drive loudness
// directly instead of trying to synthesise an audio graph.
// ---------------------------------------------------------------------------
let emitLevel: ((level: number) => void) | null = null;
const micStop = vi.fn();

vi.mock('../microphone', async () => {
  const actual = await vi.importActual<typeof import('../microphone')>('../microphone');
  return {
    ...actual,
    startMicrophone: vi.fn((handlers: { onLevel?: (l: number) => void }) => {
      emitLevel = handlers.onLevel ?? null;
      return Promise.resolve({ stop: micStop });
    }),
  };
});

// Imported AFTER vi.mock so the mocks are wired first.
import { useDictation, DictationState } from '../useDictation';

/**
 * What the shipped default actually resolves to. The default is 30s but the
 * service's own limit is 15s, so the effective wait is the clamped value —
 * asserting 30s here would pass only if the clamp were missing.
 */
const EFFECTIVE_TIMEOUT_MS = VOICE_SILENCE_TIMEOUT_MAX * 1000;

function renderDictation() {
  let value = '';
  const setValue = vi.fn((next: string) => {
    value = next;
  });
  const hook = renderHook(() =>
    useDictation(() => ({ value, caret: value.length, setValue })),
  );
  return { hook, setValue };
}

/**
 * Start recording and wait until the hook is actually listening.
 *
 * `start()` is resolved inside act() rather than polled with waitFor: under
 * fake timers waitFor's own polling never advances, so it would hang until the
 * test times out.
 */
async function startListening(hook: ReturnType<typeof renderDictation>['hook']) {
  await act(async () => {
    await hook.result.current.start();
  });
  expect(hook.result.current.state).toBe(DictationState.Listening);
}

describe('useDictation — silence auto-stop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    emitLevel = null;
    silenceTimeout = undefined;
    sendMock.mockClear();
    sendRawMock.mockClear();
    micStop.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops recording once the silence timeout elapses', async () => {
    const { hook } = renderDictation();
    await startListening(hook);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EFFECTIVE_TIMEOUT_MS);
    });

    expect(micStop).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledWith(MessageType.STOP_DICTATION, {});
    expect(hook.result.current.state).toBe(DictationState.Idle);
  });

  it('keeps recording while the user is still speaking', async () => {
    const { hook } = renderDictation();
    await startListening(hook);

    // Speak just before each deadline. Every audible block pushes it back, so
    // total time runs well past the timeout while recording stays live.
    const justUnder = EFFECTIVE_TIMEOUT_MS - 1_000;
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(justUnder);
        emitLevel?.(0.08); // normal speech RMS
      });
    }
    expect(justUnder * 3).toBeGreaterThan(EFFECTIVE_TIMEOUT_MS);

    expect(micStop).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe(DictationState.Listening);
  });

  it('treats room tone as silence rather than speech', async () => {
    const { hook } = renderDictation();
    await startListening(hook);

    // A quiet room still emits levels; they must not hold the session open, so
    // the deadline arrives despite the steady stream of callbacks.
    await act(async () => {
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(EFFECTIVE_TIMEOUT_MS / 2);
        emitLevel?.(0.001);
      }
    });

    expect(micStop).toHaveBeenCalled();
    expect(hook.result.current.state).toBe(DictationState.Idle);
  });

  it('stops a microphone that never emits a level at all', async () => {
    // A muted device or the wrong input produces no callbacks whatsoever, so
    // the timer has to be armed up front rather than only on the first block.
    const { hook } = renderDictation();
    await startListening(hook);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EFFECTIVE_TIMEOUT_MS);
    });

    expect(micStop).toHaveBeenCalled();
    expect(hook.result.current.state).toBe(DictationState.Idle);
  });

  it('honours a shorter timeout from settings', async () => {
    silenceTimeout = 5;
    const { hook } = renderDictation();
    await startListening(hook);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(micStop).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(micStop).toHaveBeenCalled();
  });

  it('never waits longer than the service allows', async () => {
    // The setting accepts any number, but the service stops the recording on
    // its own, so a longer wait here would just be a deadline that never fires.
    silenceTimeout = 600;
    const { hook } = renderDictation();
    await startListening(hook);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EFFECTIVE_TIMEOUT_MS + 100);
    });

    expect(micStop).toHaveBeenCalled();
  });

  it('still stops when a stored 0 says it should not', async () => {
    // 0 used to mean "never stop", before we knew the service ends the
    // recording at 15s of silence regardless. A value saved back then must not
    // leave a timer that never fires, promising something we cannot deliver.
    silenceTimeout = 0;
    const { hook } = renderDictation();
    await startListening(hook);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EFFECTIVE_TIMEOUT_MS);
    });

    expect(micStop).toHaveBeenCalled();
    expect(hook.result.current.state).toBe(DictationState.Idle);
  });

  it('does not fire after the user stopped recording themselves', async () => {
    const { hook } = renderDictation();
    await startListening(hook);

    await act(async () => {
      await hook.result.current.stop();
    });
    sendMock.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EFFECTIVE_TIMEOUT_MS * 2);
    });

    // A leftover timer would send a second, spurious STOP_DICTATION.
    expect(sendMock).not.toHaveBeenCalledWith(MessageType.STOP_DICTATION, {});
  });
});

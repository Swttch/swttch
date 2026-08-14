import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';

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

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { sttLang: null } }),
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

/** The hook's own constant; duplicated here so a change to it fails this test. */
const SILENCE_TIMEOUT_MS = 30_000;

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
    sendMock.mockClear();
    sendRawMock.mockClear();
    micStop.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops recording after 30 seconds of silence', async () => {
    const { hook } = renderDictation();
    await startListening(hook);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SILENCE_TIMEOUT_MS);
    });

    expect(micStop).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledWith(MessageType.STOP_DICTATION, {});
    expect(hook.result.current.state).toBe(DictationState.Idle);
  });

  it('keeps recording while the user is still speaking', async () => {
    const { hook } = renderDictation();
    await startListening(hook);

    // Speak briefly every 20s. Each audible block should push the deadline
    // back, so well past 30s of wall clock the recording is still live.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
        emitLevel?.(0.08); // normal speech RMS
      });
    }

    expect(micStop).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe(DictationState.Listening);
  });

  it('treats room tone as silence rather than speech', async () => {
    const { hook } = renderDictation();
    await startListening(hook);

    // A quiet room still emits levels; they must not hold the session open.
    await act(async () => {
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(10_000);
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
      await vi.advanceTimersByTimeAsync(SILENCE_TIMEOUT_MS);
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
      await vi.advanceTimersByTimeAsync(SILENCE_TIMEOUT_MS * 2);
    });

    // A leftover timer would send a second, spurious STOP_DICTATION.
    expect(sendMock).not.toHaveBeenCalledWith(MessageType.STOP_DICTATION, {});
  });
});

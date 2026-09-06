import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType, DictationErrorKind } from '@/shared';

/**
 * A refused start has to reach the banner as a KIND, not as a sentence.
 *
 * On a machine authenticated by an API key alone the backend has no OAuth token
 * to open the transcription socket with, and the failure used to arrive as the
 * kit's own exception text: "Cannot read properties of undefined (reading
 * 'accessToken')". The banner printed it verbatim, so the user was shown a
 * JavaScript error where an instruction belonged (#355).
 *
 * These tests pin the flag the banner branches on, because that flag is what
 * decides whether the user reads advice or a stack-trace fragment.
 */

const ack: { value: Record<string, unknown> } = { value: { status: 'ok' } };

const sendMock = vi.fn((type: string) => {
  if (type === MessageType.START_DICTATION) return Promise.resolve(ack.value);
  return Promise.resolve({});
});

// Hoisted with the mock factory, which vitest lifts above this declaration.
const { startMicrophoneMock } = vi.hoisted(() => ({
  startMicrophoneMock: vi.fn(() => Promise.resolve({ stop: vi.fn() })),
}));

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: sendMock,
    sendRaw: vi.fn(),
    subscribe: () => () => {},
    lastError: null,
  }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { voice: {} } }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ settings: { language: 'en' } }),
}));

vi.mock('../microphone', async () => {
  const actual = await vi.importActual<typeof import('../microphone')>('../microphone');
  return { ...actual, startMicrophone: startMicrophoneMock };
});

import { useDictation, DictationState } from '../useDictation';

function renderDictation() {
  return renderHook(() =>
    useDictation(() => ({ value: '', caret: 0, setValue: () => {} })),
  );
}

describe('useDictation when the backend refuses a start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ack.value = { status: 'ok' };
  });

  it('flags a missing login so the banner can explain it', async () => {
    ack.value = {
      status: 'error',
      errorKind: DictationErrorKind.NOT_LOGGED_IN,
      error: 'No Claude account login is available for dictation',
    };
    const { result } = renderDictation();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error?.notLoggedIn).toBe(true);
    expect(result.current.error?.kitMissing).toBeFalsy();
  });

  // Opening the microphone would light the recording indicator for a session
  // that cannot transcribe a word, so the refusal has to stop before it.
  it('never opens the microphone for a refused start', async () => {
    ack.value = { status: 'error', errorKind: DictationErrorKind.NOT_LOGGED_IN, error: 'nope' };
    const { result } = renderDictation();

    await act(async () => {
      await result.current.start();
    });

    expect(startMicrophoneMock).not.toHaveBeenCalled();
    expect(result.current.state).toBe(DictationState.Idle);
  });

  it('keeps flagging a missing kit separately', async () => {
    ack.value = {
      status: 'error',
      errorKind: DictationErrorKind.KIT_MISSING,
      error: '@swttch/extend-kit is not installed',
    };
    const { result } = renderDictation();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error?.kitMissing).toBe(true);
    expect(result.current.error?.notLoggedIn).toBeFalsy();
  });

  it('sets neither flag when the start succeeds', async () => {
    const { result } = renderDictation();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toBeNull();
    expect(startMicrophoneMock).toHaveBeenCalledTimes(1);
  });
});

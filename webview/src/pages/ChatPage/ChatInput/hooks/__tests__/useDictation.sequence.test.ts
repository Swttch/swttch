import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * Dictating several times in a row has to append, not prepend.
 *
 * The composer reports its caret from the DOM selection, and
 * `getCaretOffset` answers 0 whenever the selection is not inside the box —
 * which is exactly the state clicking the microphone button leaves it in, since
 * focus moves to the button. Recording three times therefore anchored at 0 every
 * time and stacked the phrases backwards: saying "하이", "안녕하세요",
 * "반갑습니다" produced "반갑습니다. 안녕하세요. Hai."
 *
 * Two things fix that, and these tests cover the hook's half: it remembers
 * where its own last phrase ended and resumes there when the reported caret is
 * 0 and the text is still untouched. The other half lives in the composer,
 * which now asks `isCaretInside` before believing a caret at all — that is what
 * makes the FIRST recording append rather than prepend, and it is tested with
 * the composer.
 *
 * These tests hold the caret at 0 the way a blurred composer did, so the
 * ordering has to come from the hook alone.
 */

const subscribers = new Map<string, (message: IPCMessage) => void>();

const sendMock = vi.fn((type: string, _payload?: Record<string, unknown>) => {
  if (type === MessageType.START_DICTATION) return Promise.resolve({ status: 'ok' });
  return Promise.resolve({});
});

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: sendMock,
    sendRaw: vi.fn(),
    subscribe: (type: string, handler: (message: IPCMessage) => void) => {
      subscribers.set(type, handler);
      return () => subscribers.delete(type);
    },
    lastError: null,
  }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { voice: {} } }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ settings: { language: 'ko' } }),
}));

vi.mock('../microphone', async () => {
  const actual = await vi.importActual<typeof import('../microphone')>('../microphone');
  return {
    ...actual,
    startMicrophone: vi.fn(() => Promise.resolve({ stop: vi.fn() })),
  };
});

import { useDictation, DictationState } from '../useDictation';

function deliverTranscript(text: string, isFinal: boolean) {
  const handler = subscribers.get(MessageType.DICTATION_TRANSCRIPT);
  if (!handler) throw new Error('nothing subscribed to DICTATION_TRANSCRIPT');
  handler({
    type: MessageType.DICTATION_TRANSCRIPT,
    payload: { text, isFinal },
    timestamp: 0,
  } as IPCMessage);
}

/**
 * A composer whose caret always reads 0 — what the real one reports once focus
 * has left the text box.
 */
function renderWithBlurredCaret(initial = '') {
  const box = { value: initial };
  const setValue = vi.fn((next: string) => {
    box.value = next;
  });
  const hook = renderHook(() =>
    useDictation(() => ({ value: box.value, caret: 0, setValue })),
  );
  return { hook, box };
}

/** One full press-record-speak-stop cycle. */
async function dictate(
  hook: ReturnType<typeof renderWithBlurredCaret>['hook'],
  phrase: string,
) {
  await act(async () => {
    await hook.result.current.start();
  });
  expect(hook.result.current.state).toBe(DictationState.Listening);
  await act(async () => deliverTranscript(phrase, true));
  await act(async () => {
    await hook.result.current.stop();
  });
}

describe('useDictation — consecutive recordings keep their order', () => {
  beforeEach(() => {
    subscribers.clear();
    sendMock.mockClear();
  });

  it('appends each recording after the last instead of prepending', async () => {
    const { hook, box } = renderWithBlurredCaret();

    await dictate(hook, '하이');
    await dictate(hook, '안녕하세요');
    await dictate(hook, '반갑습니다');

    expect(box.value).toBe('하이 안녕하세요 반갑습니다');
  });

  it('honours a real caret the user placed, rather than always appending', async () => {
    // The remembered position must not override a caret the composer genuinely
    // reports — dictating mid-sentence still has to splice there.
    const box = { value: 'AB' };
    const setValue = vi.fn((next: string) => {
      box.value = next;
    });
    const hook = renderHook(() =>
      useDictation(() => ({ value: box.value, caret: 1, setValue })),
    );

    await act(async () => {
      await hook.result.current.start();
    });
    await act(async () => deliverTranscript('중간', true));

    expect(box.value).toBe('A 중간 B');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * Dictating several times in a row has to append, not prepend.
 *
 * Saying "하이", then "안녕하세요", then "반갑습니다" produced
 * "반갑습니다. 안녕하세요. Hai." — each recording landed in front of the last.
 *
 * The cause is the caret. Each recording anchors at whatever caret the composer
 * reports, and the composer's editable layer resets the caret to the start
 * whenever its content is replaced wholesale. Dictation replaced the content
 * and never moved the caret back, so every recording after the first started
 * from 0.
 *
 * These tests model that composer: the caret is real state that dictation must
 * update through `setValue`, exactly as paste already does.
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
 * A composer that behaves like the real one: replacing its content resets the
 * caret to 0 unless the writer says where to put it.
 */
function renderComposer(initial = '', initialCaret = initial.length) {
  const box = { value: initial, caret: initialCaret };
  const hook = renderHook(() =>
    useDictation(() => ({
      value: box.value,
      caret: box.caret,
      setValue: (next: string, caret?: number) => {
        box.value = next;
        // The editable layer's reset — the behaviour that caused the bug.
        box.caret = caret ?? 0;
      },
    })),
  );
  return { hook, box };
}

/** One full press-record-speak-stop cycle. */
async function dictate(hook: ReturnType<typeof renderComposer>['hook'], phrase: string) {
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
    const { hook, box } = renderComposer();

    await dictate(hook, '하이');
    await dictate(hook, '안녕하세요');
    await dictate(hook, '반갑습니다');

    expect(box.value).toBe('하이 안녕하세요 반갑습니다');
  });

  it('appends after text the user typed before speaking', async () => {
    const { hook, box } = renderComposer('먼저');

    await dictate(hook, '안녕하세요');

    expect(box.value).toBe('먼저 안녕하세요');
  });

  it('leaves the caret at the end of the dictated run', async () => {
    // This is the whole fix: the next recording reads this caret, so a stale 0
    // here is what ran the phrases backwards.
    const { hook, box } = renderComposer();

    await dictate(hook, '하이');

    expect(box.caret).toBe('하이'.length);
  });

  it('moves the caret as interim text is revised, not only when it settles', async () => {
    // Interim transcripts rewrite the box too. Leaving the caret behind during
    // them would strand it mid-phrase if recording ended on an interim.
    const { hook, box } = renderComposer();
    await act(async () => {
      await hook.result.current.start();
    });

    await act(async () => deliverTranscript('안녕', false));

    expect(box.caret).toBe('안녕'.length);
  });

  it('honours a caret the user placed, rather than always appending', async () => {
    // Dictating mid-sentence still has to splice there.
    const { hook, box } = renderComposer('AB', 1);

    await dictate(hook, '중간');

    expect(box.value).toBe('A 중간 B');
  });
});

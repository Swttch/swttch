import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MessageType } from '@/shared';

// ---------------------------------------------------------------------------
// Bridge mock — keeps the subscribers so a test can deliver a real IPC envelope
// the way the bridge does. The point of this file is the envelope shape: the
// handler is called with the whole message, and reading `text` off the message
// instead of `message.payload` silently drops every transcript.
// ---------------------------------------------------------------------------
const subscribers = new Map<string, (message: IPCMessage) => void>();

const sendMock = vi.fn((type: string) => {
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

vi.mock('../microphone', async () => {
  const actual = await vi.importActual<typeof import('../microphone')>('../microphone');
  return {
    ...actual,
    startMicrophone: vi.fn(() => Promise.resolve({ stop: vi.fn() })),
  };
});

// Imported AFTER vi.mock so the mocks are wired first.
import { useDictation, DictationState } from '../useDictation';

/** Deliver a transcript exactly as the bridge delivers it: a full envelope. */
function deliverTranscript(text: string, isFinal: boolean) {
  const handler = subscribers.get(MessageType.DICTATION_TRANSCRIPT);
  if (!handler) throw new Error('nothing subscribed to DICTATION_TRANSCRIPT');
  handler({
    type: MessageType.DICTATION_TRANSCRIPT,
    payload: { text, isFinal },
    timestamp: 0,
  } as IPCMessage);
}

function renderDictation(initial = '') {
  const box = { value: initial };
  const setValue = vi.fn((next: string) => {
    box.value = next;
  });
  const hook = renderHook(() =>
    useDictation(() => ({ value: box.value, caret: box.value.length, setValue })),
  );
  return { hook, box, setValue };
}

async function startListening(hook: ReturnType<typeof renderDictation>['hook']) {
  await act(async () => {
    await hook.result.current.start();
  });
  expect(hook.result.current.state).toBe(DictationState.Listening);
}

describe('useDictation — transcripts reach the input', () => {
  beforeEach(() => {
    subscribers.clear();
    sendMock.mockClear();
  });

  it('writes an interim transcript into the input', async () => {
    const { hook, box, setValue } = renderDictation();
    await startListening(hook);

    await act(async () => deliverTranscript('안녕하세요', false));

    expect(setValue).toHaveBeenCalledWith('안녕하세요');
    expect(box.value).toBe('안녕하세요');
  });

  it('marks interim text as unsettled and settles it on the final transcript', async () => {
    const { hook } = renderDictation();
    await startListening(hook);

    await act(async () => deliverTranscript('안녕', false));
    expect(hook.result.current.interimRange).toEqual({ start: 0, end: 2 });

    await act(async () => deliverTranscript('안녕하세요', true));
    expect(hook.result.current.interimRange).toBeNull();
  });

  it('replaces the interim text rather than stacking it', async () => {
    const { hook, box } = renderDictation();
    await startListening(hook);

    // The recognizer revises as it goes; each reading supersedes the last.
    await act(async () => deliverTranscript('안녕', false));
    await act(async () => deliverTranscript('안녕하', false));
    await act(async () => deliverTranscript('안녕하세요', false));

    expect(box.value).toBe('안녕하세요');
  });

  it('splices at the caret, keeping what the user already typed', async () => {
    const { hook, box } = renderDictation('먼저 ');
    await startListening(hook);

    await act(async () => deliverTranscript('안녕하세요', true));

    expect(box.value).toBe('먼저 안녕하세요');
  });

  it('ignores an envelope with no text instead of writing undefined', async () => {
    const { hook, setValue } = renderDictation();
    await startListening(hook);

    await act(async () => {
      const handler = subscribers.get(MessageType.DICTATION_TRANSCRIPT)!;
      handler({
        type: MessageType.DICTATION_TRANSCRIPT,
        payload: {},
        timestamp: 0,
      } as IPCMessage);
    });

    expect(setValue).not.toHaveBeenCalled();
  });
});

describe('useDictation — errors reach the banner', () => {
  beforeEach(() => {
    subscribers.clear();
    sendMock.mockClear();
  });

  it('surfaces a stream error from the envelope payload', async () => {
    const { hook } = renderDictation();
    await startListening(hook);

    await act(async () => {
      const handler = subscribers.get(MessageType.DICTATION_ERROR)!;
      handler({
        type: MessageType.DICTATION_ERROR,
        payload: { message: 'transcription service refused', fatal: true },
        timestamp: 0,
      } as IPCMessage);
    });

    expect(hook.result.current.error).toMatchObject({
      message: 'transcription service refused',
      fatal: true,
    });
  });
});

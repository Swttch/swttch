import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const sendMock = vi.fn();

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: sendMock }),
}));

import { useVoicePrompt, VoicePromptStatus } from '../useVoicePrompt';
import { MessageType } from '@/shared';

const pending = { status: VoicePromptStatus.PENDING, askedAt: null, decidedAt: null };

describe('useVoicePrompt', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ voicePrompt: pending });
  });

  it('reads the stored answer on mount', async () => {
    const { result } = renderHook(() => useVoicePrompt());

    await waitFor(() => expect(result.current.prompt).not.toBeNull());
    expect(sendMock).toHaveBeenCalledWith(MessageType.GET_VOICE_PROMPT, {});
    expect(result.current.shouldAsk).toBe(true);
  });

  it('does not ask again once an answer exists', async () => {
    sendMock.mockResolvedValue({
      voicePrompt: {
        status: VoicePromptStatus.DECLINED,
        askedAt: '2026-01-01T00:00:00.000Z',
        decidedAt: '2026-01-01T00:00:05.000Z',
      },
    });

    const { result } = renderHook(() => useVoicePrompt());

    await waitFor(() => expect(result.current.prompt).not.toBeNull());
    expect(result.current.shouldAsk).toBe(false);
  });

  // A backend that cannot answer must not put the question on screen: asking
  // again on every press would be worse than not asking.
  it('does not ask when the state could not be read', async () => {
    sendMock.mockRejectedValue(new Error('disconnected'));

    const { result } = renderHook(() => useVoicePrompt());

    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    expect(result.current.prompt).toBeNull();
    expect(result.current.shouldAsk).toBe(false);
  });

  it('records the question being shown as asked, not answered', async () => {
    const { result } = renderHook(() => useVoicePrompt());
    await waitFor(() => expect(result.current.prompt).not.toBeNull());

    sendMock.mockResolvedValue({
      voicePrompt: { ...pending, askedAt: '2026-01-01T00:00:00.000Z' },
    });
    await act(async () => {
      await result.current.markAsked();
    });

    expect(sendMock).toHaveBeenCalledWith(MessageType.SET_VOICE_PROMPT, { asked: true });
    // Still unanswered, so a user who closes the app here is asked again.
    expect(result.current.shouldAsk).toBe(true);
  });

  it('records an accepted answer', async () => {
    const { result } = renderHook(() => useVoicePrompt());
    await waitFor(() => expect(result.current.prompt).not.toBeNull());

    sendMock.mockResolvedValue({
      voicePrompt: {
        status: VoicePromptStatus.ACCEPTED,
        askedAt: '2026-01-01T00:00:00.000Z',
        decidedAt: '2026-01-01T00:00:05.000Z',
      },
    });
    await act(async () => {
      await result.current.decide(true);
    });

    expect(sendMock).toHaveBeenCalledWith(MessageType.SET_VOICE_PROMPT, { accepted: true });
    expect(result.current.shouldAsk).toBe(false);
  });

  it('records a declined answer', async () => {
    const { result } = renderHook(() => useVoicePrompt());
    await waitFor(() => expect(result.current.prompt).not.toBeNull());

    sendMock.mockResolvedValue({
      voicePrompt: {
        status: VoicePromptStatus.DECLINED,
        askedAt: '2026-01-01T00:00:00.000Z',
        decidedAt: '2026-01-01T00:00:05.000Z',
      },
    });
    await act(async () => {
      await result.current.decide(false);
    });

    expect(sendMock).toHaveBeenCalledWith(MessageType.SET_VOICE_PROMPT, { accepted: false });
    expect(result.current.shouldAsk).toBe(false);
  });
});

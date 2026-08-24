import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const sendRawMock = vi.fn();
// Keyed by message type so multiple subscriptions (unlikely here, but keeps
// the mock honest) don't clobber each other.
const handlers = new Map<string, (message: { type: string; payload?: Record<string, unknown> }) => void>();
const unsubscribeMock = vi.fn();
const subscribeMock = vi.fn((type: string, handler: (message: { type: string; payload?: Record<string, unknown> }) => void) => {
  handlers.set(type, handler);
  return unsubscribeMock;
});

vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ sendRaw: sendRawMock, subscribe: subscribeMock }),
}));

import { useBackgroundTaskOutput } from '../useBackgroundTaskOutput';
import { MessageType } from '@/shared';

function emitChange(outputFile: string, text: string, truncated = false) {
  const handler = handlers.get(MessageType.BACKGROUND_TASK_OUTPUT_CHANGED);
  handler?.({ type: MessageType.BACKGROUND_TASK_OUTPUT_CHANGED, payload: { outputFile, text, truncated } });
}

describe('useBackgroundTaskOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  it('starts loading and does nothing when outputFile is undefined', () => {
    const { result } = renderHook(() => useBackgroundTaskOutput(undefined));
    expect(sendRawMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ text: '', truncated: false, loading: true });
  });

  it('subscribes and sends WATCH_BACKGROUND_TASK_OUTPUT when outputFile is given', () => {
    renderHook(() => useBackgroundTaskOutput('/x/y.output'));

    expect(subscribeMock).toHaveBeenCalledWith(MessageType.BACKGROUND_TASK_OUTPUT_CHANGED, expect.any(Function));
    expect(sendRawMock).toHaveBeenCalledWith(MessageType.WATCH_BACKGROUND_TASK_OUTPUT, { outputFile: '/x/y.output' });
  });

  it('applies a BACKGROUND_TASK_OUTPUT_CHANGED push for the same file', () => {
    const { result } = renderHook(() => useBackgroundTaskOutput('/x/y.output'));

    act(() => emitChange('/x/y.output', 'count: 1\n', false));

    expect(result.current).toEqual({ text: 'count: 1\n', truncated: false, loading: false });
  });

  it('ignores a push for a different outputFile', () => {
    const { result } = renderHook(() => useBackgroundTaskOutput('/x/y.output'));

    act(() => emitChange('/other/file.output', 'unrelated\n', false));

    expect(result.current.loading).toBe(true);
    expect(result.current.text).toBe('');
  });

  it('unsubscribes and sends UNWATCH_BACKGROUND_TASK_OUTPUT on unmount', () => {
    const { unmount } = renderHook(() => useBackgroundTaskOutput('/x/y.output'));

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(sendRawMock).toHaveBeenCalledWith(MessageType.UNWATCH_BACKGROUND_TASK_OUTPUT, { outputFile: '/x/y.output' });
  });

  it('unwatches the old file and watches the new one when outputFile changes', () => {
    const { rerender } = renderHook(({ file }: { file: string }) => useBackgroundTaskOutput(file), {
      initialProps: { file: '/x/y.output' },
    });

    rerender({ file: '/x/z.output' });

    expect(sendRawMock).toHaveBeenCalledWith(MessageType.UNWATCH_BACKGROUND_TASK_OUTPUT, { outputFile: '/x/y.output' });
    expect(sendRawMock).toHaveBeenCalledWith(MessageType.WATCH_BACKGROUND_TASK_OUTPUT, { outputFile: '/x/z.output' });
  });
});

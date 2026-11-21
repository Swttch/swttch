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
    expect(result.current).toMatchObject({ text: '', truncated: false, loading: true, loadingEarlier: false });
  });

  it('subscribes and sends WATCH_BACKGROUND_TASK_OUTPUT when outputFile is given', () => {
    renderHook(() => useBackgroundTaskOutput('/x/y.output'));

    expect(subscribeMock).toHaveBeenCalledWith(MessageType.BACKGROUND_TASK_OUTPUT_CHANGED, expect.any(Function));
    expect(sendRawMock).toHaveBeenCalledWith(MessageType.WATCH_BACKGROUND_TASK_OUTPUT, { outputFile: '/x/y.output' });
  });

  it('applies a BACKGROUND_TASK_OUTPUT_CHANGED push for the same file', () => {
    const { result } = renderHook(() => useBackgroundTaskOutput('/x/y.output'));

    act(() => emitChange('/x/y.output', 'count: 1\n', false));

    expect(result.current).toMatchObject({ text: 'count: 1\n', truncated: false, loading: false, loadingEarlier: false });
  });

  it('asks for the page before with LOAD_EARLIER_BACKGROUND_TASK_OUTPUT, and is loading it until the next push', () => {
    const { result } = renderHook(() => useBackgroundTaskOutput('/x/y.output'));
    act(() => emitChange('/x/y.output', '{"type":"user"}\n', true));
    expect(result.current.truncated).toBe(true);

    act(() => result.current.loadEarlier());

    expect(sendRawMock).toHaveBeenCalledWith(MessageType.LOAD_EARLIER_BACKGROUND_TASK_OUTPUT, { outputFile: '/x/y.output' });
    expect(result.current.loadingEarlier).toBe(true);
    expect(result.current.text).toBe('{"type":"user"}\n'); // what is on screen stays until the larger window arrives

    act(() => emitChange('/x/y.output', '{"type":"user"}\n{"type":"assistant"}\n', false));
    expect(result.current.loadingEarlier).toBe(false);
    expect(result.current.truncated).toBe(false);
  });

  it('asks for nothing when there is no file', () => {
    const { result } = renderHook(() => useBackgroundTaskOutput(undefined));
    act(() => result.current.loadEarlier());
    expect(sendRawMock).not.toHaveBeenCalled();
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

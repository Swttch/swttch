import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const sendMock = vi.fn();

vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: sendMock }),
}));

import { useInputHistory } from '../useInputHistory';
import { MessageType } from '@/shared';

/** A raw JSONL entry as the backend passes it through, untouched. */
function entry(uuid: string, text: string) {
  return {
    type: 'user',
    uuid,
    permissionMode: 'default',
    message: { role: 'user', content: [{ type: 'text', text }] },
  };
}

function page(entries: ReturnType<typeof entry>[], hasMore = false, oldestUuid?: string) {
  return { status: 'ok', entries, hasMore, oldestUuid: oldestUuid ?? entries[0]?.uuid };
}

function render(sessionId: string | null = 's1', workingDirectory: string | null = '/w') {
  return renderHook(() => useInputHistory({ workingDirectory, sessionId }));
}

describe('useInputHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue(page([]));
  });

  it('asks the backend for the session prompts on mount', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'first'), entry('u2', 'second')]));
    const { result } = render();

    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    expect(sendMock).toHaveBeenCalledWith(MessageType.LOAD_PROMPT_HISTORY, {
      workingDir: '/w',
      sessionId: 's1',
      beforeUuid: undefined,
    });
  });

  it('walks the fetched prompts newest first', async () => {
    // The backend sends transcript order (oldest first); Up must start at the newest.
    sendMock.mockResolvedValue(page([entry('u1', 'oldest'), entry('u2', 'newest')]));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    act(() => { expect(result.current.navigateUp('draft')).toBe('newest') });
    act(() => { expect(result.current.navigateUp('draft')).toBe('oldest') });
    // Nothing older: the key falls through instead of sticking on the last entry.
    act(() => { expect(result.current.navigateUp('draft')).toBeNull() });
  });

  it('restores the draft when walking back down past the newest', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'sent before')]));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    act(() => { result.current.navigateUp('half-typed') });
    expect(result.current.isNavigating).toBe(true);

    act(() => { expect(result.current.navigateDown()).toBe('half-typed') });
    expect(result.current.isNavigating).toBe(false);
  });

  it('finds a just-sent prompt without another round trip', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'from the transcript')]));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));
    sendMock.mockClear();

    act(() => { result.current.pushToHistory('just typed') });

    // The CLI has not written it to the transcript yet, so the backend cannot
    // know about it — it has to come from here.
    act(() => { expect(result.current.navigateUp('')).toBe('just typed') });
    act(() => { expect(result.current.navigateUp('')).toBe('from the transcript') });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('resets the walk position without forgetting the prompts', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'a'), entry('u2', 'b')]));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    act(() => { result.current.navigateUp('draft') });
    act(() => { result.current.resetHistory() });

    expect(result.current.isNavigating).toBe(false);
    // The next Up starts from the newest again rather than resuming mid-walk.
    act(() => { expect(result.current.navigateUp('')).toBe('b') });
  });

  it('fetches the next page as the walk nears the end of what is loaded', async () => {
    sendMock.mockResolvedValueOnce(page([entry('u1', 'p1'), entry('u2', 'p2')], true, 'u1'));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));
    sendMock.mockClear();
    sendMock.mockResolvedValue(page([entry('u0', 'p0')], false, 'u0'));

    act(() => { result.current.navigateUp('') });

    await waitFor(() => expect(sendMock).toHaveBeenCalledWith(MessageType.LOAD_PROMPT_HISTORY, {
      workingDir: '/w',
      sessionId: 's1',
      beforeUuid: 'u1',
    }));
    // The older page appends behind what was already there.
    await waitFor(() => {
      act(() => { result.current.navigateUp('') });
      act(() => { expect(result.current.navigateUp('')).toBe('p0') });
    });
  });

  it('does not page past the end when the backend says there is no more', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'only')], false, 'u1'));
    const { result } = render();
    await waitFor(() => expect(result.current.isEmpty).toBe(false));
    sendMock.mockClear();

    act(() => { result.current.navigateUp('') });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('drops the previous session prompts when the session changes', async () => {
    sendMock.mockResolvedValue(page([entry('u1', 'from session one')]));
    const { result, rerender } = renderHook(
      ({ sessionId }) => useInputHistory({ workingDirectory: '/w', sessionId }),
      { initialProps: { sessionId: 's1' as string | null } },
    );
    await waitFor(() => expect(result.current.isEmpty).toBe(false));

    sendMock.mockResolvedValue(page([]));
    rerender({ sessionId: 's2' });

    await waitFor(() => expect(result.current.isEmpty).toBe(true));
    act(() => { expect(result.current.navigateUp('')).toBeNull() });
  });

  it('keeps the first prompt of a session that was created by sending it', async () => {
    // Sending from an uninitialized session creates the session, so sessionId
    // goes null -> id. Treating that as a switch would discard the very prompt
    // that caused it, and Up would find nothing at all.
    const { result, rerender } = renderHook(
      ({ sessionId }) => useInputHistory({ workingDirectory: '/w', sessionId }),
      { initialProps: { sessionId: null as string | null } },
    );

    act(() => { result.current.pushToHistory('the first thing typed') });
    rerender({ sessionId: 's-new' });

    await waitFor(() => expect(result.current.isEmpty).toBe(false));
    act(() => { expect(result.current.navigateUp('')).toBe('the first thing typed') });
    // Nothing to ask the backend for either: the transcript has no prompt this
    // hook does not already hold, and asking would risk showing it twice.
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('requests nothing until there is a session to ask about', () => {
    render(null);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('leaves the history empty when the backend reports an error', async () => {
    sendMock.mockResolvedValue({ status: 'error', error: 'nope' });
    const { result } = render();

    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    expect(result.current.isEmpty).toBe(true);
    act(() => { expect(result.current.navigateUp('')).toBeNull() });
  });

  it('survives a rejected request', async () => {
    sendMock.mockRejectedValue(new Error('socket closed'));
    const { result } = render();

    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    expect(result.current.isEmpty).toBe(true);
  });
});

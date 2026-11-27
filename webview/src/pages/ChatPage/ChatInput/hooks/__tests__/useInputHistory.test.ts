import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const sendMock = vi.fn();
// One object, as the real hook hands out one stable `send`.
const bridge = { send: sendMock };

vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => bridge,
}));

import { useInputHistory } from '../useInputHistory';
import { MessageType } from '@/shared';
import type { SendIndexEntry } from '@/pages/ChatPage/sendList';
import type { LoadedMessageDto } from '@/types';

/** A raw JSONL entry as the backend passes it through, untouched. */
function record(uuid: string, text: string) {
  return { type: 'user', uuid, message: { role: 'user', content: [{ type: 'text', text }] } };
}

/** A send the transcript holds. */
function loaded(key: string, text: string): SendIndexEntry {
  return { key, text, images: 0, loaded: true, message: record(key, text) as unknown as LoadedMessageDto };
}

/** A send known only by its name. */
function unloaded(key: string): SendIndexEntry {
  return { key, text: '', images: 0, loaded: false };
}

function render(sends: SendIndexEntry[], sessionId: string | null = 's1') {
  return renderHook(
    (props: { sends: SendIndexEntry[]; sessionId: string | null }) =>
      useInputHistory({ workingDirectory: '/w', sessionId: props.sessionId, sends: props.sends }),
    { initialProps: { sends, sessionId } },
  );
}

type History = ReturnType<typeof render>['result'];
function up(result: History, current = 'draft') {
  let value: string | null | undefined;
  act(() => { value = result.current.navigateUp(current); });
  return value;
}
function down(result: History) {
  let value: string | null | undefined;
  act(() => { value = result.current.navigateDown(); });
  return value;
}

describe('useInputHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ status: 'ok', entries: [] });
  });

  it('walks the sends of the list newest first, and stops at the oldest', () => {
    const { result } = render([loaded('u1', 'oldest'), loaded('u2', 'newest')]);

    expect(up(result)).toBe('newest');
    expect(up(result)).toBe('oldest');
    // Nothing older: the key falls through instead of sticking on the last entry.
    expect(up(result)).toBeNull();
  });

  it('walks back down to the draft that was being written', () => {
    const { result } = render([loaded('u1', 'older'), loaded('u2', 'newer')]);

    up(result, 'half-typed');
    up(result, 'newer');
    expect(down(result)).toBe('newer');
    expect(down(result)).toBe('half-typed');
    expect(result.current.isNavigating).toBe(false);
    expect(down(result)).toBeNull();
  });

  it('gives back what was typed, without what the GUI and the IDE put around it (#232, #719)', () => {
    const ide = '<ide_selection>The user selected the lines 1 to 2 from src/a.ts:\nfoo\n\nThis may or may not be related to the current task.</ide_selection>';
    const { result } = render([
      loaded('u1', `${ide}fix it`),
      loaded('u2', 'rename the helper\n<system-reminder>Call SendMessage now.</system-reminder>'),
    ]);

    expect(up(result)).toBe('rename the helper');
    expect(up(result)).toBe('fix it');
  });

  it('gives back a command as it reads, not as it is recorded', () => {
    const { result } = render([
      loaded('u1', '<command-name>/rename</command-name>\n<command-message>rename</command-message>\n<command-args>My name</command-args>'),
    ]);

    expect(up(result)).toBe('/rename My name');
  });

  it('reads a send the transcript does not hold from the backend, asking with the send after it', async () => {
    sendMock.mockResolvedValue({ status: 'ok', entries: [record('u0', 'far back')] });
    const { result } = render([unloaded('u0'), loaded('u1', 'near')]);

    await waitFor(() => expect(sendMock).toHaveBeenCalledWith(MessageType.LOAD_PROMPT_HISTORY, {
      workingDir: '/w',
      sessionId: 's1',
      beforeUuid: 'u1',
    }));
    up(result);
    expect(up(result, 'near')).toBe('far back');
  });

  it('holds the walk while a send is still being read', () => {
    sendMock.mockReturnValue(new Promise(() => {}));
    const { result } = render([unloaded('u0')]);

    expect(up(result)).toBeUndefined();
    expect(result.current.isNavigating).toBe(false);
  });

  it('reads a message typed during a turn out of its queue records', async () => {
    sendMock.mockResolvedValue({
      status: 'ok',
      entries: [
        { type: 'queue-operation', operation: 'enqueue', content: 'typed mid-turn', timestamp: 't1' },
        { type: 'queue-operation', operation: 'remove', content: 'typed mid-turn', timestamp: 't2' },
      ],
    });
    const { result } = render([unloaded('queued-t2-1')]);

    await waitFor(() => expect(up(result)).toBe('typed mid-turn'));
  });

  it('finds a send made after the session was opened, as soon as the list has it', () => {
    const { result, rerender } = render([loaded('u1', 'before')]);

    rerender({ sends: [loaded('u1', 'before'), loaded('u2', 'just sent')], sessionId: 's1' });

    expect(up(result)).toBe('just sent');
  });

  it('keeps its place when older sends are added to the list', () => {
    const { result, rerender } = render([loaded('u2', 'b'), loaded('u3', 'c')]);
    up(result);

    rerender({ sends: [loaded('u1', 'a'), loaded('u2', 'b'), loaded('u3', 'c')], sessionId: 's1' });

    expect(up(result, 'c')).toBe('b');
  });

  it('starts from the newest again after a reset', () => {
    const { result } = render([loaded('u1', 'a'), loaded('u2', 'b')]);
    up(result);
    up(result);

    act(() => { result.current.resetHistory(); });

    expect(result.current.isNavigating).toBe(false);
    expect(up(result, '')).toBe('b');
  });

  it('leaves the walk when the session changes', () => {
    const { result, rerender } = render([loaded('u1', 'a')]);
    up(result, 'draft of one');

    rerender({ sends: [loaded('x1', 'other')], sessionId: 's2' });

    expect(result.current.isNavigating).toBe(false);
  });

  it('survives a rejected request', async () => {
    sendMock.mockRejectedValue(new Error('socket closed'));
    const { result } = render([unloaded('u0')]);

    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    expect(up(result)).toBeUndefined();
  });

  it('has nothing to walk in a session with no sends', () => {
    const { result } = render([]);

    expect(up(result)).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MessageType, SessionActivity, resolveSessionActivity } from '@/shared';

const sendMock = vi.fn(() => Promise.resolve({}));

vi.mock('../useBridge', () => ({
  useBridge: () => ({
    isConnected: true,
    send: sendMock,
    sendRaw: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    lastError: null,
  }),
}));

import { useReportSessionActivity } from '../useReportSessionActivity';

/** The activity carried by the last report, or undefined if none was sent. */
function lastReported(): SessionActivity | undefined {
  const calls = sendMock.mock.calls as unknown as Array<
    [string, { sessionId: string; activity: SessionActivity }]
  >;
  return calls[calls.length - 1]?.[1]?.activity;
}

beforeEach(() => {
  sendMock.mockClear();
});

/**
 * What a chat screen tells the backend it is doing (issue #456).
 *
 * The point of the report is that the session list stops deriving an answer of
 * its own. The backend used to decide a turn had started from the moment it
 * wrote to the CLI's stdin, and every turn the CLI began by itself — a
 * background task finishing, a Stop hook, a message from another session — went
 * unnoticed: the transcript animated and the row sat still.
 */
describe('useReportSessionActivity', () => {
  it('reports on mount, before anything has moved', () => {
    // A screen that connects midway through someone else's turn has missed every
    // change there was to hear, so what it says on arrival is all the backend
    // gets until the next one.
    renderHook(() => useReportSessionActivity('sess-1', true, false));

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(MessageType.REPORT_SESSION_ACTIVITY, {
      sessionId: 'sess-1',
      activity: SessionActivity.Running,
    });
  });

  it('reports again when the turn ends', () => {
    const { rerender } = renderHook(
      ({ streaming }) => useReportSessionActivity('sess-1', streaming, false),
      { initialProps: { streaming: true } },
    );
    sendMock.mockClear();

    rerender({ streaming: false });

    expect(lastReported()).toBe(SessionActivity.Idle);
  });

  it('reports again when the CLI resumes without anyone sending anything', () => {
    const { rerender } = renderHook(
      ({ streaming }) => useReportSessionActivity('sess-1', streaming, false),
      { initialProps: { streaming: false } },
    );
    sendMock.mockClear();

    rerender({ streaming: true });

    expect(lastReported()).toBe(SessionActivity.Running);
  });

  it('reports waiting while a prompt is on screen', () => {
    // `isStreaming` stays true through a prompt, because the turn really has not
    // ended. The screen is not animating, though, and that is what it reports.
    renderHook(() => useReportSessionActivity('sess-1', true, true));

    expect(lastReported()).toBe(SessionActivity.Awaiting);
  });

  it('says nothing for a session that does not exist yet', () => {
    renderHook(() => useReportSessionActivity(null, true, false));

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does not report the same thing twice for an unrelated re-render', () => {
    const { rerender } = renderHook(
      ({ streaming }) => useReportSessionActivity('sess-1', streaming, false),
      { initialProps: { streaming: true } },
    );
    sendMock.mockClear();

    rerender({ streaming: true });

    expect(sendMock).not.toHaveBeenCalled();
  });
});

/**
 * The reported value and the streaming animation are the same condition.
 *
 * `ChatPage` draws the animation under `isStreaming && !isAwaitingUser`. If the
 * two ever came apart, a session could animate while its row said nothing, which
 * is the whole family of bug this replaced.
 */
describe('resolveSessionActivity', () => {
  const cases: Array<[boolean, boolean, SessionActivity]> = [
    [false, false, SessionActivity.Idle],
    [true, false, SessionActivity.Running],
    [true, true, SessionActivity.Awaiting],
    [false, true, SessionActivity.Awaiting],
  ];

  for (const [isStreaming, isAwaitingUser, expected] of cases) {
    it(`is ${expected} when streaming=${isStreaming} and awaiting=${isAwaitingUser}`, () => {
      expect(resolveSessionActivity(isStreaming, isAwaitingUser)).toBe(expected);
    });
  }

  it('is Running exactly when the streaming animation is drawn', () => {
    for (const [isStreaming, isAwaitingUser] of cases.map(([s, a]) => [s, a] as const)) {
      const animationDrawn = isStreaming && !isAwaitingUser;
      expect(resolveSessionActivity(isStreaming, isAwaitingUser) === SessionActivity.Running)
        .toBe(animationDrawn);
    }
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportSessionActivityHandler } from '../sessionActivity';
import { MessageType, SessionActivity } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

/**
 * What a chat screen is allowed to say about the session it is showing.
 *
 * The handler is the wire edge, so what is pinned here is which words get past
 * it. The meaning of each word is [ConnectionManager.reportSessionActivity]'s,
 * and is pinned there.
 */
describe('reportSessionActivityHandler', () => {
  let connections: { reportSessionActivity: ReturnType<typeof vi.fn>; sendTo: ReturnType<typeof vi.fn> };

  const bridge = {} as Bridge;

  const report = (payload: Record<string, unknown> | undefined) =>
    reportSessionActivityHandler(
      'conn-1',
      { type: MessageType.REPORT_SESSION_ACTIVITY, requestId: 'req-1', payload, timestamp: 0 } as IPCMessage,
      connections as unknown as ConnectionManager,
      bridge,
    );

  beforeEach(() => {
    connections = { reportSessionActivity: vi.fn(), sendTo: vi.fn() };
  });

  it('passes on what the screen says it is doing', () => {
    report({ sessionId: 'sess-1', activity: SessionActivity.Running });

    expect(connections.reportSessionActivity).toHaveBeenCalledWith('sess-1', SessionActivity.Running);
  });

  it('passes on a screen waiting for an answer', () => {
    report({ sessionId: 'sess-1', activity: SessionActivity.Awaiting });

    expect(connections.reportSessionActivity).toHaveBeenCalledWith('sess-1', SessionActivity.Awaiting);
  });

  it('passes on a screen that has stopped', () => {
    report({ sessionId: 'sess-1', activity: SessionActivity.Idle });

    expect(connections.reportSessionActivity).toHaveBeenCalledWith('sess-1', SessionActivity.Idle);
  });

  /**
   * `done` means "a turn finished and the user has not looked since", which is a
   * statement about the user rather than about the session. Letting a screen
   * assert it would let one tab mark another tab's session unread.
   */
  it('refuses a screen claiming the session is unread', () => {
    report({ sessionId: 'sess-1', activity: SessionActivity.Done });

    expect(connections.reportSessionActivity).not.toHaveBeenCalled();
  });

  it('refuses a word it does not know', () => {
    report({ sessionId: 'sess-1', activity: 'streaming' });

    expect(connections.reportSessionActivity).not.toHaveBeenCalled();
  });

  it('refuses a report with no session named', () => {
    report({ activity: SessionActivity.Running });

    expect(connections.reportSessionActivity).not.toHaveBeenCalled();
  });

  it('answers every report, including the ones it refuses', () => {
    // The sender is fire-and-forget, but a request that is never answered leaves
    // a pending entry on its side for as long as the page lives.
    report({ sessionId: 'sess-1', activity: SessionActivity.Done });

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      status: 'ok',
    });
  });
});

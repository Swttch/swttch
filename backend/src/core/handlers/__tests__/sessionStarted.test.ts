import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../features/awaitSessionTranscript', () => ({ awaitSessionTranscript: vi.fn() }));
vi.mock('../../features/announceSessionCreated', () => ({ announceSessionCreated: vi.fn() }));

import { sessionStartedHandler } from '../sessionStarted';
import { awaitSessionTranscript } from '../../features/awaitSessionTranscript';
import { announceSessionCreated } from '../../features/announceSessionCreated';
import { MessageType } from '../../../shared';

const mockAwait = vi.mocked(awaitSessionTranscript);
const mockCreated = vi.mocked(announceSessionCreated);

/**
 * A tab made a session and says so. The other screens get the row the tab drew at once, and every screen
 * gets the row the transcript gives once the transcript exists, which replaces the drawn one.
 */
describe('sessionStartedHandler', () => {
  const sendTo = vi.fn();
  const broadcastToAll = vi.fn();
  const broadcastToListsHolding = vi.fn();
  const connections = { sendTo, broadcastToAll, broadcastToListsHolding } as never;
  const message = (payload: unknown) => ({ requestId: 'r1', type: MessageType.SESSION_STARTED, payload }) as never;

  beforeEach(() => vi.clearAllMocks());

  it('hands the other screens that can hold the session the row the tab drew, as a create, and answers the tab', () => {
    const drawn = { id: 's1', title: 'T' };

    sessionStartedHandler('c1', message({ sessionId: 's1', workingDir: '/repo', session: drawn }), connections, {} as never);

    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, { requestId: 'r1' });
    expect(broadcastToListsHolding).toHaveBeenCalledWith(
      MessageType.SESSIONS_UPDATED,
      { action: 'create', session: drawn, ts: expect.any(Number) },
      ['/repo'],
      'c1',
    );
  });

  it('hands over the row of the transcript, to every screen that can hold the session, once the transcript exists', () => {
    sessionStartedHandler('c1', message({ sessionId: 's1', workingDir: '/repo', session: { id: 's1' } }), connections, {} as never);

    expect(mockAwait).toHaveBeenCalledWith('s1', '/repo', expect.any(Function));
    expect(mockCreated).not.toHaveBeenCalled();

    mockAwait.mock.calls[0][2]();

    expect(mockCreated).toHaveBeenCalledWith(connections, 's1', '/repo');
  });

  it('hands over no drawn row when the tab sent none', () => {
    sessionStartedHandler('c1', message({ sessionId: 's1', workingDir: '/repo' }), connections, {} as never);

    expect(broadcastToListsHolding).not.toHaveBeenCalled();
    expect(broadcastToAll).not.toHaveBeenCalled();
    expect(mockAwait).toHaveBeenCalled();
  });

  it('waits for no transcript when it does not know the folder', () => {
    sessionStartedHandler('c1', message({ sessionId: 's1', session: { id: 's1' } }), connections, {} as never);

    expect(mockAwait).not.toHaveBeenCalled();
    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, expect.objectContaining({ action: 'create' }), 'c1');
  });

  it('does nothing without a session id', () => {
    sessionStartedHandler('c1', message({ workingDir: '/repo' }), connections, {} as never);

    expect(broadcastToAll).not.toHaveBeenCalled();
    expect(mockAwait).not.toHaveBeenCalled();
  });
});

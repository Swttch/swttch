/**
 * QUEUE_MESSAGE / CANCEL_QUEUED_MESSAGE / GET_QUEUED_MESSAGES — the "queue"
 * composer follow-up-behavior path.
 *
 * Uses a real ConnectionManager (not a mock) so `broadcastToSession` genuinely
 * reaches every subscribed connection, not just whichever ones a spy happened
 * to record calls for — the point of the second test below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import { MessageType } from '../../../shared';
import { queueMessageHandler, cancelQueuedMessageHandler, getQueuedMessagesHandler } from '../queueMessage';
import { getQueuedMessages, clearAllQueuedMessages } from '../../features/messageQueue';

vi.mock('../../claude', () => ({ Claude: { killTree: vi.fn() } }));

function createMockWs() {
  return { readyState: 1, send: vi.fn(), close: vi.fn() } as unknown as import('ws').WebSocket;
}

const bridge = {} as Bridge;

beforeEach(() => clearAllQueuedMessages());

function queue(connections: ConnectionManager, connectionId: string, overrides: Partial<{
  sessionId: string; workingDir: string; content: string;
}> = {}) {
  return queueMessageHandler(connectionId, {
    type: MessageType.QUEUE_MESSAGE,
    requestId: 'r',
    timestamp: 0,
    payload: { sessionId: 'sess-1', workingDir: '/fixture', content: 'hello', ...overrides },
  }, connections, bridge);
}

describe('queueMessageHandler', () => {
  it('holds the message in the backend queue instead of writing it to the CLI stdin', async () => {
    const connections = new ConnectionManager(true);
    const ws = createMockWs();
    const connId = connections.addConnection(ws);

    // A CLI process is already attached to the session (the ordinary case: the
    // turn this follow-up is queued behind is already running).
    const fakeProc = { stdin: { writable: true, write: vi.fn() } } as any;
    connections.subscribe(connId, 'sess-1', '/fixture');
    connections.setProcess('sess-1', fakeProc);

    await queue(connections, connId);

    expect(fakeProc.stdin.write).not.toHaveBeenCalled();
    expect(getQueuedMessages('sess-1').map(e => e.content)).toEqual(['hello']);
  });

  it('pushes the changed queue to every connection watching the session, not just the sender', async () => {
    const connections = new ConnectionManager(true);
    const wsA = createMockWs();
    const wsB = createMockWs();
    const connA = connections.addConnection(wsA);
    const connB = connections.addConnection(wsB);
    connections.subscribe(connA, 'sess-1', '/fixture');
    connections.subscribe(connB, 'sess-1', '/fixture');
    (wsA.send as ReturnType<typeof vi.fn>).mockClear();
    (wsB.send as ReturnType<typeof vi.fn>).mockClear();

    await queue(connections, connA);

    const sentTypes = (ws: typeof wsA) =>
      (ws.send as ReturnType<typeof vi.fn>).mock.calls.map(([raw]) => JSON.parse(raw as string).type);

    expect(sentTypes(wsA)).toContain(MessageType.QUEUED_MESSAGES_CHANGED);
    expect(sentTypes(wsB)).toContain(MessageType.QUEUED_MESSAGES_CHANGED);
  });

  it('rejects a request missing a required field rather than silently queueing nothing', async () => {
    const connections = new ConnectionManager(true);
    const ws = createMockWs();
    const connId = connections.addConnection(ws);

    await queueMessageHandler(connId, {
      type: MessageType.QUEUE_MESSAGE,
      requestId: 'r',
      timestamp: 0,
      payload: { sessionId: 'sess-1', workingDir: '/fixture' /* no content */ },
    }, connections, bridge);

    expect(getQueuedMessages('sess-1')).toEqual([]);
  });
});

describe('cancelQueuedMessageHandler', () => {
  it('removes the message from the queue by id', async () => {
    const connections = new ConnectionManager(true);
    const ws = createMockWs();
    const connId = connections.addConnection(ws);
    connections.subscribe(connId, 'sess-1', '/fixture');

    await queue(connections, connId, { content: 'keep me' });
    await queue(connections, connId, { content: 'cancel me' });
    const [, toCancel] = getQueuedMessages('sess-1');

    await cancelQueuedMessageHandler(connId, {
      type: MessageType.CANCEL_QUEUED_MESSAGE,
      requestId: 'r2',
      timestamp: 0,
      payload: { sessionId: 'sess-1', id: toCancel.id },
    }, connections, bridge);

    expect(getQueuedMessages('sess-1').map(e => e.content)).toEqual(['keep me']);
  });

  it('leaves the queue untouched for an id that is not queued', async () => {
    const connections = new ConnectionManager(true);
    const ws = createMockWs();
    const connId = connections.addConnection(ws);
    connections.subscribe(connId, 'sess-1', '/fixture');
    await queue(connections, connId, { content: 'keep me' });

    await cancelQueuedMessageHandler(connId, {
      type: MessageType.CANCEL_QUEUED_MESSAGE,
      requestId: 'r2',
      timestamp: 0,
      payload: { sessionId: 'sess-1', id: 'not-a-real-id' },
    }, connections, bridge);

    expect(getQueuedMessages('sess-1').map(e => e.content)).toEqual(['keep me']);
  });
});

describe('getQueuedMessagesHandler', () => {
  it('answers with the session\'s current queue', async () => {
    const connections = new ConnectionManager(true);
    const ws = createMockWs();
    const connId = connections.addConnection(ws);
    connections.subscribe(connId, 'sess-1', '/fixture');
    await queue(connections, connId, { content: 'already queued' });
    (ws.send as ReturnType<typeof vi.fn>).mockClear();

    await getQueuedMessagesHandler(connId, {
      type: MessageType.GET_QUEUED_MESSAGES,
      requestId: 'r3',
      timestamp: 0,
      payload: { sessionId: 'sess-1' },
    }, connections, bridge);

    const [raw] = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0];
    const ack = JSON.parse(raw as string);
    expect(ack.payload.queue.map((e: { content: string }) => e.content)).toEqual(['already queued']);
  });
});

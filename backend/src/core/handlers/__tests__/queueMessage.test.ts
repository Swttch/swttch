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
import {
  queueMessageHandler,
  cancelQueuedMessageHandler,
  getQueuedMessagesHandler,
  mergeQueuedMessagesHandler,
  moveQueuedMessageHandler,
  steerQueuedMessageHandler,
} from '../queueMessage';
import { getQueuedMessages, clearAllQueuedMessages, enqueueMessage } from '../../features/messageQueue';
import { sendMessageToProcess } from '../../claude-process';

vi.mock('../../claude', () => ({ Claude: { killTree: vi.fn() } }));
vi.mock('../../claude-process', () => ({ sendMessageToProcess: vi.fn() }));

function createMockWs() {
  return { readyState: 1, send: vi.fn(), close: vi.fn() } as unknown as import('ws').WebSocket;
}

const bridge = {} as Bridge;

beforeEach(() => {
  clearAllQueuedMessages();
  vi.mocked(sendMessageToProcess).mockReset();
});

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

function request(type: MessageType, payload: Record<string, unknown>) {
  return { type, requestId: 'r', timestamp: 0, payload: { sessionId: 'sess-1', ...payload } };
}
function sentTypes(ws: ReturnType<typeof createMockWs>) {
  return (ws.send as ReturnType<typeof vi.fn>).mock.calls.map(([raw]) => JSON.parse(raw as string).type);
}
function seedQueue(...ids: string[]) {
  ids.forEach((id, i) => enqueueMessage('sess-1', { id, content: id.toUpperCase(), queuedAt: i }));
}
function watched() {
  const connections = new ConnectionManager(true);
  const ws = createMockWs();
  const connId = connections.addConnection(ws);
  connections.subscribe(connId, 'sess-1', '/fixture');
  (ws.send as ReturnType<typeof vi.fn>).mockClear();
  return { connections, ws, connId };
}

describe('mergeQueuedMessagesHandler', () => {
  it('merges the dragged message onto the target and broadcasts the new queue', async () => {
    const { connections, ws, connId } = watched();
    seedQueue('a', 'b', 'c');
    await mergeQueuedMessagesHandler(
      connId,
      request(MessageType.MERGE_QUEUED_MESSAGES, { sourceId: 'c', targetId: 'a' }),
      connections,
      bridge,
    );
    expect(getQueuedMessages('sess-1').map(m => m.content)).toEqual(['A\n\nC', 'B']);
    expect(sentTypes(ws)).toEqual(expect.arrayContaining([MessageType.QUEUED_MESSAGES_CHANGED, MessageType.ACK]));
  });

  it('acks a stale id without an error', async () => {
    const { connections, ws, connId } = watched();
    seedQueue('a');
    await mergeQueuedMessagesHandler(
      connId,
      request(MessageType.MERGE_QUEUED_MESSAGES, { sourceId: 'gone', targetId: 'a' }),
      connections,
      bridge,
    );
    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['a']);
    expect(sentTypes(ws)).not.toContain(MessageType.ERROR);
    expect(sentTypes(ws)).toContain(MessageType.ACK);
  });
});

describe('moveQueuedMessageHandler', () => {
  it('moves and broadcasts the new order', async () => {
    const { connections, ws, connId } = watched();
    seedQueue('a', 'b', 'c');
    await moveQueuedMessageHandler(connId, request(MessageType.MOVE_QUEUED_MESSAGE, { id: 'c', toIndex: 0 }), connections, bridge);
    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['c', 'a', 'b']);
    expect(sentTypes(ws)).toContain(MessageType.QUEUED_MESSAGES_CHANGED);
  });

  it('leaves the queue alone for a non-integer index and still acks', async () => {
    const { connections, ws, connId } = watched();
    seedQueue('a', 'b', 'c');
    await moveQueuedMessageHandler(connId, request(MessageType.MOVE_QUEUED_MESSAGE, { id: 'c', toIndex: 0.5 }), connections, bridge);
    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['a', 'b', 'c']);
    expect(sentTypes(ws)).not.toContain(MessageType.ERROR);
    expect(sentTypes(ws)).toContain(MessageType.ACK);
  });
});

describe('steerQueuedMessageHandler', () => {
  it('acks a stale id without sending anything or changing the queue', async () => {
    const { connections, ws, connId } = watched();
    seedQueue('a');
    await steerQueuedMessageHandler(connId, request(MessageType.STEER_QUEUED_MESSAGE, { id: 'gone' }), connections, bridge);
    expect(sendMessageToProcess).not.toHaveBeenCalled();
    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['a']);
    expect(sentTypes(ws)).not.toContain(MessageType.ERROR);
    expect(sentTypes(ws)).toContain(MessageType.ACK);
  });

  it('sends the entry to the CLI now, removes it, and tells every watcher including the sender', async () => {
    const { connections, ws, connId } = watched();
    vi.mocked(sendMessageToProcess).mockReturnValue(true);
    seedQueue('a', 'b');

    await steerQueuedMessageHandler(connId, request(MessageType.STEER_QUEUED_MESSAGE, { id: 'b' }), connections, bridge);

    expect(sendMessageToProcess).toHaveBeenCalledWith(connections, 'sess-1', 'B', undefined);
    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['a']);
    expect(sentTypes(ws)).toEqual(expect.arrayContaining([
      MessageType.USER_MESSAGE_BROADCAST, MessageType.QUEUED_MESSAGES_CHANGED, MessageType.ACK,
    ]));
  });

  it('puts the entry back where it was when no CLI process can take it', async () => {
    const { connections, ws, connId } = watched();
    vi.mocked(sendMessageToProcess).mockReturnValue(false);
    seedQueue('a', 'b', 'c');

    await steerQueuedMessageHandler(connId, request(MessageType.STEER_QUEUED_MESSAGE, { id: 'b' }), connections, bridge);

    expect(getQueuedMessages('sess-1').map(e => e.id)).toEqual(['a', 'b', 'c']);
    expect(sentTypes(ws)).not.toContain(MessageType.USER_MESSAGE_BROADCAST);
    expect(sentTypes(ws)).toContain(MessageType.ACK);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ConnectionManager } from '../connection-manager';
import { createLoopbackRequest } from '../loopback-request';
import type { BridgeMap, MessageHandler } from '../ws-server';
import { MessageType } from '../../shared';

const bridges = {} as BridgeMap;

describe('createLoopbackRequest', () => {
  it('hands the router the message a webview would send, and resolves its ACK', async () => {
    const connections = new ConnectionManager();
    const handle: MessageHandler = vi.fn((connectionId, message, conns) => {
      conns.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok', newVersion: '2.1.285' });
    });
    const request = createLoopbackRequest(connections, bridges, handle);

    const reply = await request(MessageType.UPDATE_CLI, { version: '2.1.285' });

    expect(reply).toMatchObject({ status: 'ok', newVersion: '2.1.285' });
    const [, message] = vi.mocked(handle).mock.calls[0];
    expect(message).toMatchObject({ type: MessageType.UPDATE_CLI, payload: { version: '2.1.285' } });
    expect(typeof message.requestId).toBe('string');
  });

  it('ignores other messages sent to the loopback until the ACK for its request', async () => {
    const connections = new ConnectionManager();
    const handle: MessageHandler = (connectionId, message, conns) => {
      conns.sendTo(connectionId, MessageType.CLI_UPDATED, {});
      conns.sendTo(connectionId, MessageType.ACK, { requestId: 'someone-else', status: 'error' });
      conns.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
    };
    const reply = await createLoopbackRequest(connections, bridges, handle)(MessageType.GET_CLI_UPDATE_INFO);
    expect(reply).toMatchObject({ status: 'ok' });
  });

  it('rejects when the router throws, and is never broadcast to', async () => {
    const connections = new ConnectionManager();
    const seen: string[] = [];
    const handle: MessageHandler = (connectionId, _message, conns) => {
      conns.broadcastToAll(MessageType.CLI_UPDATED, {});
      seen.push(connectionId);
      throw new Error('boom');
    };
    await expect(createLoopbackRequest(connections, bridges, handle)(MessageType.UPDATE_CLI)).rejects.toThrow('boom');
    expect(seen).toHaveLength(1);
    expect(connections.getConnectionCount()).toBe(0);
  });
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../claude-process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../claude-process')>();
  return { ...actual, ensureClaudeProcess: vi.fn().mockResolvedValue(undefined) };
});

import { sendControlRequestHandler } from '../sendControlRequest';
import { ensureClaudeProcess } from '../../claude-process';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockBridge = {} as Bridge;

function createMockConnections(options: { sessionId?: string; writable?: boolean } = {}) {
  const { sessionId = 'session-1', writable = true } = options;
  const write = vi.fn();
  const connections = {
    getClient: vi.fn(() => (sessionId ? { subscribedSessionId: sessionId } : undefined)),
    getSession: vi.fn(() => ({ process: { stdin: { writable, write } } })),
    subscribe: vi.fn(),
    sendTo: vi.fn(),
  } as unknown as ConnectionManager;
  return { connections, write };
}

function message(payload: Record<string, unknown>): IPCMessage {
  return {
    type: MessageType.SEND_CONTROL_REQUEST,
    requestId: 'req-1',
    payload,
    timestamp: 0,
  };
}

describe('sendControlRequestHandler', () => {
  it('writes the control_request to the session stdin verbatim', async () => {
    const { connections, write } = createMockConnections();

    await sendControlRequestHandler(
      'conn-1',
      message({ requestId: 'ccg-cmd-reload_plugins-1', request: { subtype: 'reload_plugins' } }),
      connections,
      mockBridge,
    );

    expect(write).toHaveBeenCalledTimes(1);
    const written = JSON.parse((write.mock.calls[0][0] as string).trim());
    expect(written).toEqual({
      type: 'control_request',
      request_id: 'ccg-cmd-reload_plugins-1',
      request: { subtype: 'reload_plugins' },
    });
  });

  // The request object is handed through untouched, so a command's arguments
  // reach the CLI exactly as the webview built them.
  it('passes request arguments through unchanged', async () => {
    const { connections, write } = createMockConnections();

    await sendControlRequestHandler(
      'conn-1',
      message({
        requestId: 'ccg-cmd-side_question-1',
        request: { subtype: 'side_question', question: 'why?' },
      }),
      connections,
      mockBridge,
    );

    const written = JSON.parse((write.mock.calls[0][0] as string).trim());
    expect(written.request).toEqual({ subtype: 'side_question', question: 'why?' });
  });

  it('acks with sent:true when the request reached stdin', async () => {
    const { connections } = createMockConnections();

    await sendControlRequestHandler(
      'conn-1',
      message({ requestId: 'ccg-cmd-reload_plugins-1', request: { subtype: 'reload_plugins' } }),
      connections,
      mockBridge,
    );

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      sent: true,
    });
  });

  // A false `sent` is the webview's cue to deliver the command as text instead,
  // so the user still gets the CLI's own answer rather than silence.
  it('acks with sent:false when stdin is not writable', async () => {
    const { connections, write } = createMockConnections({ writable: false });

    await sendControlRequestHandler(
      'conn-1',
      message({ requestId: 'ccg-cmd-reload_plugins-1', request: { subtype: 'reload_plugins' } }),
      connections,
      mockBridge,
    );

    expect(write).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      sent: false,
    });
  });

  // Running a command as the very first action in an empty chat must start a
  // CLI rather than give up — falling back to text there hits exactly the
  // refusal this feature exists to avoid (#270).
  it('spawns a session when none is subscribed yet', async () => {
    const { connections, write } = createMockConnections({ sessionId: '' });

    await sendControlRequestHandler(
      'conn-1',
      message({
        requestId: 'ccg-cmd-reload_plugins-1',
        request: { subtype: 'reload_plugins' },
        sessionId: 'new-session',
        workingDir: '/tmp/project',
        inputMode: 'default',
      }),
      connections,
      mockBridge,
    );

    expect(connections.subscribe).toHaveBeenCalledWith('conn-1', 'new-session');
    expect(ensureClaudeProcess).toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      sent: true,
    });
  });

  it('acks with sent:false when there is no session and no workingDir to start one', async () => {
    const { connections, write } = createMockConnections({ sessionId: '' });

    await sendControlRequestHandler(
      'conn-1',
      message({ requestId: 'ccg-cmd-reload_plugins-1', request: { subtype: 'reload_plugins' } }),
      connections,
      mockBridge,
    );

    expect(write).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      sent: false,
    });
  });

  it('acks with sent:false when the payload is incomplete', async () => {
    const { connections, write } = createMockConnections();

    await sendControlRequestHandler('conn-1', message({ requestId: 'ccg-cmd-x-1' }), connections, mockBridge);

    expect(write).not.toHaveBeenCalled();
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, {
      requestId: 'req-1',
      sent: false,
    });
  });
});

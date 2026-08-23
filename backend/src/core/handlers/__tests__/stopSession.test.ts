import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../claude-process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../claude-process')>();
  return {
    ...actual,
    sendInterruptToProcess: vi.fn(() => true),
    stopWorkflowsForSession: vi.fn(),
  };
});

import { stopSessionHandler } from '../stopSession';
import { stopGenerationHandler } from '../stopGeneration';
import * as claudeProcess from '../../claude-process';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockBridge = {} as Bridge;

function createMockConnections() {
  const connections = {
    getClient: vi.fn(() => ({ subscribedSessionId: 'session-1' })),
    getSession: vi.fn(() => ({ process: { stdin: { writable: true, write: vi.fn() } } })),
    sendTo: vi.fn(),
  } as unknown as ConnectionManager;
  return connections;
}

function message(type: MessageType): IPCMessage {
  return { type, requestId: 'req-1', payload: {}, timestamp: 0 };
}

/**
 * Escape stops the foreground turn only — background tasks keep running, the
 * way they do in the CLI (issue #330).
 *
 * The interrupt assertion is what makes the "leaves background tasks alone"
 * assertion mean something: without it a handler that did nothing at all would
 * pass too.
 */
describe.each([
  ['stopSessionHandler', stopSessionHandler, MessageType.STOP_SESSION],
  ['stopGenerationHandler', stopGenerationHandler, MessageType.STOP_GENERATION],
] as const)('%s', (_name, handler, messageType) => {
  beforeEach(() => {
    vi.mocked(claudeProcess.sendInterruptToProcess).mockClear();
    vi.mocked(claudeProcess.stopWorkflowsForSession).mockClear();
  });

  it('interrupts the current turn', () => {
    const connections = createMockConnections();

    handler('conn-1', message(messageType), connections, mockBridge);

    expect(claudeProcess.sendInterruptToProcess).toHaveBeenCalledWith(connections, 'session-1');
  });

  it('leaves background tasks running', () => {
    const connections = createMockConnections();

    handler('conn-1', message(messageType), connections, mockBridge);

    expect(claudeProcess.stopWorkflowsForSession).not.toHaveBeenCalled();
  });
});

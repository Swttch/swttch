import { clearAccountPoolRecovery } from '../../features/account-pool-recovery-store';
vi.mock('../../features/account-pool-recovery-store', () => ({ clearAccountPoolRecovery: vi.fn(async () => {}) }));
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../claude-process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../claude-process')>();
  return {
    ...actual,
    sendInterruptToProcess: vi.fn(() => true),
    stopWorkflowsForSession: vi.fn(),
  };
});

const forwardToHolder = vi.fn();
vi.mock('../../forward-to-holder', () => ({ forwardToHolder: (...a: unknown[]) => forwardToHolder(...a) }));

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

    expect(clearAccountPoolRecovery).toHaveBeenCalledWith('session-1');
    expect(claudeProcess.sendInterruptToProcess).toHaveBeenCalledWith(connections, 'session-1');
  });

  it('leaves background tasks running', () => {
    const connections = createMockConnections();

    handler('conn-1', message(messageType), connections, mockBridge);

    expect(claudeProcess.stopWorkflowsForSession).not.toHaveBeenCalled();
  });
});

// The stop button of a tab sends STOP_SESSION. A tab of another IDE window's backend only watches the session,
// so the stop is handed to the backend that runs the CLI (#711).
describe('stopSessionHandler: a session this backend does not run', () => {
  beforeEach(() => forwardToHolder.mockReset().mockResolvedValue('forwarded'));

  it('hands the stop to the backend that runs the CLI', () => {
    const connections = {
      getClient: vi.fn(() => ({ subscribedSessionId: 'session-1' })),
      getSession: vi.fn(() => undefined),
      sendTo: vi.fn(),
    } as unknown as ConnectionManager;
    stopSessionHandler('conn-1', message(MessageType.STOP_SESSION), connections, mockBridge);
    expect(forwardToHolder).toHaveBeenCalledWith('session-1', { action: 'interrupt' });
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, { requestId: 'req-1' });
  });

  it('hands nothing over when this backend runs the CLI', () => {
    stopSessionHandler('conn-1', message(MessageType.STOP_SESSION), createMockConnections(), mockBridge);
    expect(forwardToHolder).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendInterruptToProcess = vi.fn();
vi.mock('../../claude-process', () => ({ sendInterruptToProcess: (...a: unknown[]) => sendInterruptToProcess(...a) }));
const forwardToHolder = vi.fn();
vi.mock('../../forward-to-holder', () => ({ forwardToHolder: (...a: unknown[]) => forwardToHolder(...a) }));
vi.mock('../../claude', () => ({ Claude: { killTree: vi.fn() } }));
vi.mock('../../features/account-pool-recovery-store', () => ({ clearAccountPoolRecovery: vi.fn(async () => undefined) }));

import { stopGenerationHandler } from '../stopGeneration';

const connectionsWith = (process: unknown) =>
  ({
    getClient: () => ({ subscribedSessionId: 's1' }),
    getSession: () => (process ? { process } : undefined),
    sendTo: vi.fn(),
  }) as any;

beforeEach(() => {
  sendInterruptToProcess.mockReset().mockReturnValue(true);
  forwardToHolder.mockReset().mockResolvedValue('forwarded');
});

describe('stopGenerationHandler (#711)', () => {
  it('interrupts the CLI this backend runs, and hands nothing over', () => {
    stopGenerationHandler('c1', { requestId: 'r' } as any, connectionsWith({}), {} as any);
    expect(sendInterruptToProcess).toHaveBeenCalledTimes(1);
    expect(forwardToHolder).not.toHaveBeenCalled();
  });

  it('hands the stop to the backend that runs the CLI when this backend runs none', () => {
    const connections = connectionsWith(undefined);
    stopGenerationHandler('c1', { requestId: 'r' } as any, connections, {} as any);
    expect(sendInterruptToProcess).not.toHaveBeenCalled();
    expect(forwardToHolder).toHaveBeenCalledWith('s1', { action: 'interrupt' });
    expect(connections.sendTo).toHaveBeenCalled(); // still ACKs the request
  });
});

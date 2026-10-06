import { describe, it, expect, vi, beforeEach } from 'vitest';

const applyEffortToLiveCli = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock('../../features/effort-runtime', () => ({
  applyEffortToLiveCli: (...args: unknown[]) => applyEffortToLiveCli(...args),
}));

import { setEffortHandler } from '../setEffort';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function connectionsFor(sessionId: string | undefined) {
  const sendTo = vi.fn();
  const connections = {
    sendTo,
    getClient: () => ({ subscribedSessionId: sessionId }),
  } as unknown as ConnectionManager;
  return { connections, sendTo };
}

const message = (payload: Record<string, unknown> | undefined): IPCMessage =>
  ({ type: MessageType.SET_EFFORT, requestId: 'r1', payload }) as unknown as IPCMessage;

beforeEach(() => {
  vi.clearAllMocks();
  applyEffortToLiveCli.mockResolvedValue('control_request');
});

describe('setEffortHandler', () => {
  it('tells the subscribed session its new level and says how it was delivered', async () => {
    const { connections, sendTo } = connectionsFor('s1');

    await setEffortHandler('c1', message({ effortLevel: 'high', ultracode: false }), connections, {} as Bridge);

    expect(applyEffortToLiveCli).toHaveBeenCalledWith(connections, 's1', { effortLevel: 'high', ultracode: false });
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, { requestId: 'r1', status: 'ok', via: 'control_request' });
  });

  it('passes a dropped override (null) through as such, which is not the same as no change', async () => {
    const { connections } = connectionsFor('s1');
    await setEffortHandler('c1', message({ effortLevel: null }), connections, {} as Bridge);
    expect(applyEffortToLiveCli).toHaveBeenCalledWith(connections, 's1', { effortLevel: null });
  });

  it('has no CLI to tell in a chat that has not started', async () => {
    const { connections, sendTo } = connectionsFor(undefined);
    await setEffortHandler('c1', message({ effortLevel: 'low' }), connections, {} as Bridge);
    expect(applyEffortToLiveCli).not.toHaveBeenCalled();
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, { requestId: 'r1', status: 'ok', via: 'not_running' });
  });

  it.each([
    ['nothing', undefined],
    ['an empty change', {}],
    ['a level with a shell metacharacter, since the fallback writes it into a command', { effortLevel: 'high; rm -rf ~' }],
    ['a level with a space', { effortLevel: 'very high' }],
    ['a non-boolean ultracode', { ultracode: 'yes' }],
  ])('refuses %s before it can reach the CLI', async (_label, payload) => {
    const { connections, sendTo } = connectionsFor('s1');
    await setEffortHandler('c1', message(payload as Record<string, unknown> | undefined), connections, {} as Bridge);
    expect(applyEffortToLiveCli).not.toHaveBeenCalled();
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ requestId: 'r1', status: 'error' }));
  });
});

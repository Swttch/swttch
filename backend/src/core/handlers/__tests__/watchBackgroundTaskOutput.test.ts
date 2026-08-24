import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../features/backgroundTaskOutputWatcher', () => ({
  watchBackgroundTaskOutput: vi.fn(),
  unwatchBackgroundTaskOutput: vi.fn(),
}));

import { watchBackgroundTaskOutputHandler, unwatchBackgroundTaskOutputHandler } from '../watchBackgroundTaskOutput';
import { watchBackgroundTaskOutput, unwatchBackgroundTaskOutput } from '../../features/backgroundTaskOutputWatcher';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

describe('watchBackgroundTaskOutputHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to watchBackgroundTaskOutput with connectionId, outputFile, connections', () => {
    const connections = {} as ConnectionManager;
    const message: IPCMessage = {
      type: MessageType.WATCH_BACKGROUND_TASK_OUTPUT,
      payload: { outputFile: '/x/y.output' },
      timestamp: 0,
    };

    watchBackgroundTaskOutputHandler('conn-1', message, connections, {} as Bridge);

    expect(watchBackgroundTaskOutput).toHaveBeenCalledWith('conn-1', '/x/y.output', connections);
  });

  it('does nothing when outputFile is missing from the payload', () => {
    const connections = {} as ConnectionManager;
    const message: IPCMessage = { type: MessageType.WATCH_BACKGROUND_TASK_OUTPUT, payload: {}, timestamp: 0 };

    watchBackgroundTaskOutputHandler('conn-1', message, connections, {} as Bridge);

    expect(watchBackgroundTaskOutput).not.toHaveBeenCalled();
  });
});

describe('unwatchBackgroundTaskOutputHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to unwatchBackgroundTaskOutput with connectionId and outputFile', () => {
    const connections = {} as ConnectionManager;
    const message: IPCMessage = {
      type: MessageType.UNWATCH_BACKGROUND_TASK_OUTPUT,
      payload: { outputFile: '/x/y.output' },
      timestamp: 0,
    };

    unwatchBackgroundTaskOutputHandler('conn-1', message, connections, {} as Bridge);

    expect(unwatchBackgroundTaskOutput).toHaveBeenCalledWith('conn-1', '/x/y.output');
  });

  it('does nothing when outputFile is missing from the payload', () => {
    const connections = {} as ConnectionManager;
    const message: IPCMessage = { type: MessageType.UNWATCH_BACKGROUND_TASK_OUTPUT, payload: {}, timestamp: 0 };

    unwatchBackgroundTaskOutputHandler('conn-1', message, connections, {} as Bridge);

    expect(unwatchBackgroundTaskOutput).not.toHaveBeenCalled();
  });
});

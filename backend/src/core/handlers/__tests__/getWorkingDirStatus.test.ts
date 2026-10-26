import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { getWorkingDirStatusHandler } from '../getWorkingDirStatus';
import { MessageType } from '../../../shared';
import type { IPCMessage } from '../../types';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';

/**
 * A session is opened on a folder that may have been deleted since the project was last
 * used. The screen asks the backend, which answers from the same check that sending a
 * message makes.
 */
describe('getWorkingDirStatusHandler', () => {
  let root: string;
  let sendTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ccg-dir-status-'));
    sendTo = vi.fn();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function ask(payload: Record<string, unknown>): Promise<void> {
    const message = { type: MessageType.GET_WORKING_DIR_STATUS, requestId: 'r1', payload } as unknown as IPCMessage;
    await getWorkingDirStatusHandler('c1', message, { sendTo } as unknown as ConnectionManager, {} as Bridge);
  }

  it('answers that a folder on disk is not gone', async () => {
    await ask({ workingDir: root });
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.WORKING_DIR_STATUS, { workingDir: root, gone: false });
  });

  it('answers that a deleted folder is gone', async () => {
    const deleted = join(root, 'was-here');
    await ask({ workingDir: deleted });
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.WORKING_DIR_STATUS, { workingDir: deleted, gone: true });
  });

  it('does not call a client without a folder gone', async () => {
    await ask({});
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.WORKING_DIR_STATUS, { workingDir: '', gone: false });
  });

  it('acknowledges the request', async () => {
    await ask({ workingDir: root });
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, { requestId: 'r1' });
  });
});

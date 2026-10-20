import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({ exec: vi.fn(), execFile: vi.fn() }));
vi.mock('../../win-job', () => ({
  assertPowerShellUsable: (what: string) => {
    throw new Error(`${what} needs PowerShell, which cannot be launched on this computer.`);
  },
}));

import { exec } from 'child_process';
import { openFolderDialogHandler } from '../openFolderDialog';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

describe('openFolderDialogHandler on Windows where PowerShell cannot be launched', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('answers with no folder and the reason, the message the waiting screens listen for', async () => {
    const sendTo = vi.fn();

    await openFolderDialogHandler(
      'c1',
      { type: MessageType.OPEN_FOLDER_DIALOG, payload: {}, timestamp: 0 } as IPCMessage,
      { sendTo } as unknown as ConnectionManager,
      {} as Bridge,
    );

    expect(exec).not.toHaveBeenCalled();
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.FOLDER_SELECTED, {
      path: null,
      error: 'Choosing a folder needs PowerShell, which cannot be launched on this computer.',
    });
  });
});

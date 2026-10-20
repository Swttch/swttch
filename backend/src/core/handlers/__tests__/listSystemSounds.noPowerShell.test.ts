import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../system-sounds', () => ({ scanSystemSounds: vi.fn() }));
vi.mock('../../win-job', () => ({
  assertPowerShellUsable: (what: string) => {
    throw new Error(`${what} needs PowerShell, which cannot be launched on this computer.`);
  },
}));

import { scanSystemSounds } from '../../../system-sounds';
import { listSystemSoundsHandler } from '../listSystemSounds';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

describe('listSystemSoundsHandler on Windows where PowerShell cannot be launched', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  const ask = async (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    vi.mocked(scanSystemSounds).mockResolvedValue([{ id: 'Ding', label: 'Ding', path: 'x' }]);
    const sendTo = vi.fn();
    await listSystemSoundsHandler(
      'c1',
      { type: MessageType.LIST_SYSTEM_SOUNDS, payload: {}, timestamp: 0, requestId: 'r1' } as IPCMessage,
      { sendTo } as unknown as ConnectionManager,
      {} as Bridge,
    );
    return sendTo.mock.calls[0][2] as Record<string, unknown>;
  };

  it('answers with the reason, so the dropdown says why it is off', async () => {
    const ack = await ask('win32');

    expect(ack).toMatchObject({
      status: 'error',
      error: 'Playing a sound needs PowerShell, which cannot be launched on this computer.',
    });
  });

  it('does not ask about PowerShell on the systems that never use it', async () => {
    const ack = await ask('darwin');

    expect(ack).toMatchObject({ status: 'ok' });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { MessageType } from '../../../shared';
import type { IPCMessage } from '../../types';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import { getMigrationStatusHandler } from '../getMigrationStatus';
import { migrationStatus } from '../../features/migration-status';

describe('getMigrationStatusHandler', () => {
  it('tells the window the state as it stands, then acknowledges the request', async () => {
    const sendTo = vi.fn();
    const connections = { sendTo } as unknown as ConnectionManager;

    await getMigrationStatusHandler('conn-1', { requestId: 'req-1' } as unknown as IPCMessage, connections, {} as Bridge);

    expect(sendTo).toHaveBeenNthCalledWith(1, 'conn-1', MessageType.MIGRATION_STATUS, {
      status: migrationStatus.snapshot().status,
      due: [],
      failedMigration: null,
      reason: null,
      unreadable: [],
    });
    expect(sendTo).toHaveBeenNthCalledWith(2, 'conn-1', MessageType.ACK, { requestId: 'req-1' });
  });
});

import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { migrationRetry } from '../features/migration-retry';
import { MessageType } from '../../shared';

/**
 * Run the data migrations again after a run failed. Answers once the run is over,
 * whatever came of it: the outcome reaches every window through the migration
 * status, so the answer carries nothing.
 */
export async function retryMigrationsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await migrationRetry.run();
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}

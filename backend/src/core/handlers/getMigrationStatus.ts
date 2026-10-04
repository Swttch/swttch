import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { migrationStatus } from '../features/migration-status';
import { MessageType } from '../../shared';

/**
 * Tell a window the state of the data migrations as it stands. A window that opens
 * after a run began (or after it failed) was not there for the push, and would
 * otherwise never learn of it.
 */
export async function getMigrationStatusHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  connections.sendTo(connectionId, MessageType.MIGRATION_STATUS, { ...migrationStatus.snapshot() });
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}

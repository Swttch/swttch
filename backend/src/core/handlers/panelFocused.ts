import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';

/**
 * The webview reports which IDE panel (JCEF tab) just gained window focus so the
 * backend can route panel-scoped pushes (editor-context / ide-selection) to only
 * that panel instead of broadcasting to every open Claude panel sharing the same
 * workingDir. Keyed by the stable panelId, so it is session-agnostic. The reporting
 * connection is passed along because a split tab shows one panelId in two views.
 */
export function panelFocusedHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const panelId = message.payload?.panelId as string | undefined;
  if (typeof panelId === 'string' && panelId.length > 0) {
    connections.setLastFocusedPanelId(panelId, connectionId);
  }
}

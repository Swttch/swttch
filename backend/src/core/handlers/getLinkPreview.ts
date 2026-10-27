import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { readLinkPreview } from '../features/linkPreview';

/** GET_LINK_PREVIEW: the title, site and picture of a web page for a card. A page that cannot be read answers what is known of it. */
export async function getLinkPreviewHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const url = message.payload?.url;
  const preview = typeof url === 'string' && url !== '' ? await readLinkPreview(url) : { url: '', host: '' };
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...preview });
}

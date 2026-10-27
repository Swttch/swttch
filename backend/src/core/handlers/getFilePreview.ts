import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { readFilePreview } from '../features/filePreview';

/**
 * Answer what a file card can show of the file: its first lines, the picture
 * itself, or the bytes of a video to take a frame from. Any path that is not a
 * readable file answers `none`, which leaves the card on its icon.
 */
export async function getFilePreviewHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const path = message.payload?.path;
  const metadataOnly = message.payload?.metadataOnly === true;
  // A file Claude sent with SendUserFile: read up to what Claude Desktop uploads, and from the kept copy if the original is gone.
  const sentFile = message.payload?.sentFile === true;
  const preview = typeof path === 'string' && path !== ''
    ? await readFilePreview(path, { metadataOnly, sentFile })
    : { kind: 'none' as const };

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...preview,
  });
}

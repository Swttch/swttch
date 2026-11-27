import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { readFileContentChunk } from '../features/fileContent';
import { resolveOpenFilePath } from '../features/resolveOpenFilePath';

/**
 * Answer one piece of a file the preview pane shows next to the chat (a page, a
 * picture, a PDF or a video). The pane asks again with the next offset until it
 * holds the whole file. A path that is not a readable file of a kind the pane
 * shows is answered with a reason, never an error, so the pane can say why.
 */
export async function getFileContentHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const path = message.payload?.path;
  const offset = message.payload?.offset;
  const workingDir = message.payload?.workingDir;
  // The same file a click opens, so a path in another spelling is shown as well as opened.
  const answer = typeof path === 'string' && path !== ''
    ? await readFileContentChunk(
        resolveOpenFilePath(path, { workingDir: typeof workingDir === 'string' ? workingDir : undefined }).path,
        typeof offset === 'number' ? offset : 0,
      )
    : { ok: false as const, reason: 'unreadable' as const };

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    ...answer,
  });
}

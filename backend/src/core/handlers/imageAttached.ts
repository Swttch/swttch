import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { trackEvent } from '../features/telemetry';

/** Attach paths the webview reports. Mirrors `ImageAttachSource` in the webview. */
const KNOWN_SOURCES = new Set(['button', 'paste', 'drop']);

/**
 * Record that the user attached an image. This handler exists ONLY to make
 * attaching visible to telemetry.
 *
 * Attaching happens entirely inside the webview: the paperclip button reads a
 * hidden file input, paste reads the clipboard, and drop reads `dataTransfer` —
 * all three end up as base64 inside the next SEND_MESSAGE. So the backend used
 * to have no way to tell an attached image from a plain message, and "how many
 * people attach images" was unanswerable.
 *
 * `trackActivity` in ws-server already emits `activity:IMAGE_ATTACHED` for the
 * headcount. This adds a second event carrying WHICH path was used, because
 * `trackActivity` sends no properties and the three paths are otherwise
 * indistinguishable.
 *
 * The webview never sends the file name (it routinely contains paths, project
 * names and screenshot titles); `source` is validated here so a malformed
 * payload cannot inject an arbitrary string into the telemetry properties.
 */
export function imageAttachedHandler(
  _connectionId: string,
  message: IPCMessage,
  _connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const source = message.payload?.source;
  const mimeType = message.payload?.mimeType;
  const size = message.payload?.size;

  trackEvent('image_attached', {
    source: typeof source === 'string' && KNOWN_SOURCES.has(source) ? source : 'unknown',
    mimeType: typeof mimeType === 'string' ? mimeType : 'unknown',
    size: typeof size === 'number' ? size : 0,
  });
}

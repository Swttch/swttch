import { existsSync } from 'fs';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import { resolveOpenFilePath } from '../features/resolveOpenFilePath';
import { servePage } from '../features/pageServer';
import { getSiteInfo } from '../features/favicon';
import type { IPCMessage } from '../types';

/**
 * GET_PAGE_URL: where a page in a file on this machine is served from, so the Browser pane can show it as a
 * web page of its own (see pageServer.ts). ACKed with `{ port, pathname, root }`, or `{ error }`.
 */
export async function getPageUrlHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager): Promise<void> {
  const reply = (body: Record<string, unknown>) => connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...body });
  const { path, workingDir, inject } = (message.payload ?? {}) as { path?: unknown; workingDir?: unknown; inject?: unknown };
  if (typeof path !== 'string' || path === '') return reply({ error: 'no-path' });
  const file = resolveOpenFilePath(path);
  if (!existsSync(file)) return reply({ error: 'not-found' });
  try {
    reply({ ...(await servePage(file, typeof workingDir === 'string' && workingDir !== '' ? resolveOpenFilePath(workingDir) : undefined, typeof inject === 'string' ? inject : '')) });
  } catch (error) {
    console.error('[node-backend]', 'GET_PAGE_URL failed:', error);
    reply({ error: 'serve-failed' });
  }
}

/** GET_FAVICON: the icon (a data URL) and title of a web page, for a Browser pane tab. ACKed with `{ icon, title, blocksFraming }`, the first two possibly null. */
export async function getFaviconHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager): Promise<void> {
  const url = (message.payload as { url?: unknown } | undefined)?.url;
  const info = typeof url === 'string' ? await getSiteInfo(url) : { icon: null, title: null, blocksFraming: false };
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...info });
}

import { rm } from 'fs/promises';
import { resolve, relative, isAbsolute, join } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getProjectSessionsPath } from '../features/getProjectSessionsPath';
import { getClaudeConfigDir } from '../features/claudeConfigDir';
import { MessageType } from '../../shared';

/**
 * Delete a project: the whole folder under ~/.claude/projects that holds its
 * session transcripts. This never touches the working directory itself — it
 * only removes Claude Code's own records of having worked there — which is
 * why a project whose directory is already gone from disk can still be
 * deleted here (#392 item 6).
 */
export async function deleteProjectHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const path = message.payload?.path as string | undefined;

  if (!path) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'Missing path',
    });
    return;
  }

  try {
    const sessionsDir = await getProjectSessionsPath(path);

    // normalizeProjectPath collapses every non-alphanumeric character to '-',
    // so a traversal segment cannot survive encoding in the first place — but
    // this still guards the case where that stops being true, matching the
    // belt-and-suspenders check deleteSessionHandler applies to session files.
    const projectsRoot = resolve(join(getClaudeConfigDir(), 'projects'));
    const relativeSessionsDir = relative(projectsRoot, resolve(sessionsDir));
    if (relativeSessionsDir.startsWith('..') || isAbsolute(relativeSessionsDir)) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: 'Invalid path',
      });
      return;
    }

    // force: true means a project already gone from ~/.claude/projects (or
    // never written there) is not an error — there is nothing left to do.
    await rm(sessionsDir, { recursive: true, force: true });

    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

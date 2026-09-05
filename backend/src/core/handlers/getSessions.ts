import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { getSessionsList } from '../features/getSessionsList';
import { getNestedSessionsList } from '../features/getNestedSessionsList';
import { isWslUncPath } from '../wsl-path';
import { MessageType } from '../../shared';

export async function getSessionsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = message.payload?.workingDir as string | undefined;

  if (!workingDir) {
    connections.sendTo(connectionId, MessageType.ERROR, {
      requestId: message.requestId,
      error: 'workingDir is required',
    });
    return;
  }

  // A Windows-native backend can't reach a WSL project's session files. The IDE
  // hands the project root as a UNC path (`\\wsl.localhost\Ubuntu\home\user\proj`),
  // which (1) encodes differently than the Linux path the in-distro CLI used to
  // name `~/.claude/projects/<encoded>`, and (2) resolves `~/.claude` to the
  // Windows home, not the WSL one — so the lookup always misses and would return
  // an empty list with no explanation. Chat is already blocked on this exact
  // condition with the same guidance (claude-process.ts, WSL_HOST_MISMATCH), so
  // mirror it here: tell the panel to explain the empty list instead of failing
  // silently. In JetBrains mode the backend runs inside the distro (platform
  // 'linux'), so this never trips there. Issue #175.
  if (process.platform === 'win32' && isWslUncPath(workingDir)) {
    const reason =
      'This project is inside WSL. Open the GUI from your WSL shell (run `ccg`) so ' +
      'past conversations load with a Linux working directory instead of the Windows UNC path.';
    console.error('[getSessions]', 'WSL UNC path on win32 — returning host-mismatch notice:', workingDir);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      sessions: [],
      serviceError: { type: MessageType.WSL_HOST_MISMATCH, reason },
    });
    return;
  }

  console.error('[getSessions]', 'resolved workingDir:', workingDir);

  // `sessionDir` is attached on BOTH paths, so the panel never has to ask which
  // request produced a row: every session states the directory it belongs to.
  // Without nesting that is always the requested directory itself.
  const includeNested = message.payload?.includeNested === true;

  // Paging is opt-in. A request without a limit still gets the whole list, so
  // any caller that has not been taught to page keeps working unchanged.
  const offset = typeof message.payload?.offset === 'number' ? message.payload.offset : undefined;
  const limit = typeof message.payload?.limit === 'number' ? message.payload.limit : undefined;
  const options = { offset, limit };

  const page = includeNested
    ? await getNestedSessionsList(workingDir, options)
    : await getSessionsList(workingDir, options);

  console.error(
    '[getSessions]',
    'requested offset:',
    offset,
    'limit:',
    limit,
    '-> returning sessions:',
    page.sessions.length,
    'of',
    page.total,
    'nested:',
    includeNested,
    'hasMore:',
    page.hasMore,
    'nextOffset:',
    page.nextOffset,
  );

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    sessions: page.sessions,
    total: page.total,
    hasMore: page.hasMore,
    nextOffset: page.nextOffset,
  });
}

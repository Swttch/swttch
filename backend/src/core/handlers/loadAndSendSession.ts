import type { ConnectionManager } from '../../ws/connection-manager';
import { loadSessionMessages } from '../features/loadSessionMessages';
import { reconstructWorkflowTasks } from '../features/workflow-tracker';
import { isWorkflowRunning } from '../claude-process';
import { MessageType } from '../../shared';

export interface LoadAndSendSessionOptions {
  // Cursor for paging: return the page of messages before this uuid.
  beforeUuid?: string;
  // Page size. Undefined → backend default page. A large value (NO_PAGINATION_LIMIT)
  // requests the whole active chain when pagination is off.
  limit?: number;
  // True when serving an older page (LOAD_OLDER_MESSAGES): the client prepends
  // the result and workflow reconstruction is skipped.
  isOlderPage?: boolean;
}

/**
 * Load a session's messages (paged), send SESSION_LOADED, and rebuild
 * background-workflow state. Shared by loadSessionHandler and reclaimSessionHandler
 * so both honor the same paging contract (limit/beforeUuid) and cannot drift —
 * a divergence here previously made reclaim ignore the pagination setting.
 */
export async function loadAndSendSession(
  connectionId: string,
  connections: ConnectionManager,
  workingDir: string,
  sessionId: string,
  options: LoadAndSendSessionOptions = {},
): Promise<void> {
  const { beforeUuid, limit, isOlderPage = false } = options;

  const result = await loadSessionMessages(workingDir, sessionId, beforeUuid, limit);
  connections.sendTo(connectionId, MessageType.SESSION_LOADED, {
    sessionId,
    messages: result.messages,
    hasMore: result.hasMore,
    oldestUuid: result.oldestUuid,
    prepend: isOlderPage,
    // Permission mode found within the newest page (null on an older page, or when
    // the newest page carries none — see findLastReportedModeInPage). The webview
    // restores the composer to this on reload instead of the configured default,
    // and treats null as "not confidently known" rather than "unset".
    lastReportedMode: result.lastReportedMode,
  });

  // Rebuild background-workflow state from the transcript so the inline cards
  // and the Background tasks panel populate on reload (the live progress stream
  // is not replayed). Best-effort — never blocks the session load. Only on the
  // initial load — older pages would re-run it per page and re-emit tasks.
  if (isOlderPage) return;

  try {
    // Reconstruct from the whole active chain, not just the returned page: a
    // workflow's Workflow tool_use (and its tool_result) can be older than the
    // latest page, and would otherwise be lost from the cards/Background panel.
    const workflows = await reconstructWorkflowTasks(
      result.activeChain as Array<Record<string, unknown>>,
      (toolUseId) => isWorkflowRunning(sessionId, toolUseId),
    );
    for (const task of workflows) {
      connections.sendTo(
        connectionId,
        MessageType.WORKFLOW_PROGRESS,
        task as unknown as Record<string, unknown>,
      );
    }
  } catch (err) {
    console.error('[node-backend]', 'workflow reconstruction failed:', err);
  }
}

import type { ConnectionManager } from '../../ws/connection-manager';
import { loadSessionMessages } from '../features/loadSessionMessages';
import { getSessionEntry } from '../features/getSessionEntry';
import { reconstructWorkflowTasks } from '../features/workflow-tracker';
import { getLiveWorkflowTask, isWorkflowRunning } from '../claude-process';
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
  // Cursor for paging toward the newest: return the page after this uuid.
  afterUuid?: string;
  // Return the page centred on this uuid (find bar / send index jumping to an
  // entry the webview does not hold).
  aroundUuid?: string;
  // The entry the client already holds on the far side of the page, so the page stops there: in
  // front of it for a newer page, after it for an older one. See loadSessionMessages.
  untilUuid?: string;
  // True when serving a newer page (LOAD_NEWER_MESSAGES): the client appends it
  // after the history it holds, where the gap is.
  isNewerPage?: boolean;
  // True when serving a page around an entry (LOAD_MESSAGES_AROUND): the client
  // puts it where the history was.
  isAroundPage?: boolean;
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
  const {
    beforeUuid, limit, isOlderPage = false,
    afterUuid, aroundUuid, untilUuid, isNewerPage = false, isAroundPage = false,
  } = options;
  // Any page other than the newest one is more of a transcript the webview
  // already holds part of.
  const isPartialPage = isOlderPage || isNewerPage || isAroundPage;

  const result = await loadSessionMessages(workingDir, sessionId, beforeUuid, limit, afterUuid, aroundUuid, untilUuid);

  // The row this session would occupy in the list, sent so the webview's list
  // contains the session it is showing no matter where the session ranks. Only
  // on the initial load: an older page is more of the same conversation and the
  // row has not changed. Null for a session with no row to give (missing,
  // sidechain, unreadable) — the webview then leaves its list alone. See #434.
  const entry = isPartialPage ? null : await getSessionEntry(workingDir, sessionId);

  connections.sendTo(connectionId, MessageType.SESSION_LOADED, {
    sessionId,
    messages: result.messages,
    hasMore: result.hasMore,
    oldestUuid: result.oldestUuid,
    // The cursors of the window's other end, and whether anything lies past it.
    newestUuid: result.newestUuid,
    hasNewer: result.hasNewer,
    // The page runs right up to the entry the request named to stop at.
    reached: result.reached,
    // The cursor the request named is not in the chain: the page is the newest
    // one and replaces what the webview holds. See loadSessionMessages.
    reset: result.reset,
    // The cursor an older page was asked for with, sent back so the webview can tell
    // which side of its gap the page belongs to: before the oldest entry it holds,
    // or before the first of the newest pages it holds.
    beforeUuid: isOlderPage ? beforeUuid : undefined,
    prepend: isOlderPage,
    append: isNewerPage,
    around: isAroundPage,
    // Permission mode found within the newest page (null on an older page, or when
    // the newest page carries none — see findLastReportedModeInPage). The webview
    // restores the composer to this on reload instead of the configured default,
    // and treats null as "not confidently known" rather than "unset".
    lastReportedMode: result.lastReportedMode,
    // The transcript is known to be absent from disk (ENOENT only). This is the
    // webview's sole ground for redirecting a session URL away: the session list
    // it holds is one page, so a session ranked past that page is present in the
    // project yet missing from the list, and a list-based check throws the user
    // out of a session that opens perfectly well. See #433.
    sessionMissing: result.sessionMissing,
    // This session's own list row (see `entry` above). Same shape as a row from
    // GET_SESSIONS, so the webview merges it into the list it already holds.
    session: entry,
    // When the turn the CLI has in flight began, or null. A screen that attaches in
    // the middle of one did not see it start, and says so in its composer only if it
    // is told (#673). Not on an older page: that is more of the same transcript.
    turnStartedAt: isPartialPage ? null : connections.getTurnStartedAt(sessionId),
  });

  // Rebuild background-workflow state from the transcript so the inline cards
  // and the Background tasks panel populate on reload (the live progress stream
  // is not replayed). Best-effort — never blocks the session load. Only on the
  // initial load — older pages would re-run it per page and re-emit tasks.
  if (isPartialPage) return;

  try {
    // Reconstruct from what the whole active chain says of background tasks, not just the
    // returned page: a workflow's Workflow tool_use (and its tool_result) can be older than
    // the latest page, and would otherwise be lost from the cards/Background panel.
    const workflows = await reconstructWorkflowTasks(
      result.workflowChain as Array<Record<string, unknown>>,
      (toolUseId) => isWorkflowRunning(sessionId, toolUseId),
    );
    for (const rebuilt of workflows) {
      // A task still running is sent as the live stream has it: a reload in the middle of a run (a foreground
      // agent waiting on a permission answer, say) must not swap what the stream knew, the agent's id above all,
      // for what the transcript can say before the run ends (#673).
      const task = getLiveWorkflowTask(sessionId, rebuilt.toolUseId) ?? rebuilt;
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

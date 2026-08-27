import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType, ReviewTarget, resolveReviewTarget } from '../../shared';
import { peekPreview, openDiffTabForPermission } from '../features/diffPreview';
import { readMergedSettings } from '../features/settings';

/**
 * Open a review, on whichever surface that review belongs on.
 *
 * Two callers, one message. Either the sender supplies the contents, or it
 * names a pending permission request by `toolUseId` and the contents are read
 * from the preview held backend-side. The second is the file name in the
 * approval prompt: the diff can be closed while its question is still up
 * (Escape with the diff focused does that), and clicking the name brings it
 * back. Sending only the id keeps the file contents off the wire, so what is
 * shown is the text we diffed.
 *
 * The surface is decided here and not by the sender. The webview used to choose
 * it too, from settings it had loaded without a working directory, so a project
 * that asked for the IDE's viewer got the built-in page from the file-name link
 * while the unprompted open had already put the IDE's viewer on screen — two
 * reviews of one edit, side by side (#359). Only this process knows which
 * session a review belongs to, and only that session knows the working
 * directory that makes a project's setting apply.
 */
export async function openDiffHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const toolUseId = message.payload?.toolUseId as string | undefined;
  let filePath = message.payload?.filePath as string | undefined;
  let oldContent = message.payload?.oldContent as string | undefined;
  let newContent = message.payload?.newContent as string | undefined;
  let sessionId = message.payload?.sessionId as string | undefined;
  let controlRequestId = message.payload?.controlRequestId as string | undefined;

  if (filePath === undefined && toolUseId) {
    const preview = peekPreview(toolUseId);
    // Left alone rather than consumed: the question is still open, and the
    // eventual answer needs this entry to know what to write.
    if (!preview) {
      // The request was answered already, so there is nothing left to show.
      // Not an error — the click just lost a race with the decision.
      connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
      return;
    }
    filePath = preview.filePath;
    oldContent = preview.oldContent;
    newContent = preview.newContent;
    sessionId ??= preview.sessionId;
    controlRequestId ??= preview.controlRequestId;
  }

  try {
    const target = await targetForReview(sessionId, connections, bridge);

    /*
     * An overlay is the one surface this process cannot open: the webview draws
     * it over a screen we do not own. Answered rather than acted on, so the
     * sender mounts it — and told the same way for every surface, so the choice
     * still lives in one place.
     */
    if (target === ReviewTarget.BUILT_IN_OVERLAY || target === ReviewTarget.BUILT_IN_WINDOW) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'ok',
        target,
      });
      return;
    }

    if (target === ReviewTarget.BUILT_IN_TAB) {
      if (toolUseId) await openDiffTabForPermission(bridge, toolUseId);
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'ok',
        target,
      });
      return;
    }

    await bridge.openDiff({
      filePath: filePath as string,
      oldContent: oldContent as string,
      newContent: newContent as string,
      toolUseId,
      sessionId,
      controlRequestId,
    });
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      target,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Which surface this review belongs on, from the settings that apply to it.
 *
 * The working directory comes from the review's own session, so a project's
 * setting is honoured for the project the review is in — not for whichever
 * directory a client happened to have loaded.
 */
async function targetForReview(
  sessionId: string | undefined,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<ReviewTarget> {
  const workingDir = sessionId
    ? connections.getSession(sessionId)?.workingDir || undefined
    : undefined;
  const { settings } = await readMergedSettings(workingDir);
  return resolveReviewTarget({
    diffSurface: settings.diffSurface as string | undefined,
    browserDiffPresentation: settings.browserDiffPresentation as string | undefined,
    hostMode: settings.hostMode as string | undefined,
    ideAttached: bridge.isConnected?.() ?? false,
  });
}

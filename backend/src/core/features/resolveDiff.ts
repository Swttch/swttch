/**
 * Answer a pending file-edit permission request from the IDE's diff viewer,
 * with the hunks the user kept (#109).
 *
 * The selection is made in the diff — that is where the change is legible, and
 * where JetBrains already draws per-range controls. Only hunk numbers travel
 * back: the backend still holds the change it diffed, so what gets written is
 * the text that was reviewed rather than something reassembled from a viewer.
 */
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType, buildUserDeclinedContent } from '../../shared';
import { takePreview } from './diffPreview';
import { buildPartialApproval, isEmptySelection } from './partialApproval';
import { sendControlResponseToProcess } from '../claude-process';

export interface ResolveDiffParams {
  toolUseId: string;
  controlRequestId: string;
  sessionId: string;
  /** Hunks kept. Empty means the user rejected the whole change. */
  acceptedHunks: number[];
}

/** Parse a JSON-RPC notification payload, or null when it is not usable. */
export function parseResolveDiffParams(
  params: Record<string, unknown>,
): ResolveDiffParams | null {
  const toolUseId = params.toolUseId;
  const controlRequestId = params.controlRequestId;
  const sessionId = params.sessionId;
  if (typeof toolUseId !== 'string' || !toolUseId) return null;
  if (typeof controlRequestId !== 'string' || !controlRequestId) return null;
  if (typeof sessionId !== 'string' || !sessionId) return null;

  const raw = params.acceptedHunks;
  const acceptedHunks = Array.isArray(raw)
    ? raw.filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
    : [];

  return { toolUseId, controlRequestId, sessionId, acceptedHunks };
}

/**
 * Turn the IDE's answer into the CLI's `control_response`.
 *
 * Keeping every hunk sends the request through untouched, so an Edit stays the
 * Edit Claude wrote. Keeping some rewrites the tool input to exactly that
 * subset. Keeping none is a denial — writing the file back unchanged would
 * report success for an edit that never happened.
 */
export function resolveDiffFromIde(
  connections: ConnectionManager,
  params: ResolveDiffParams,
): void {
  const preview = takePreview(params.toolUseId);

  const respond = (response: Record<string, unknown>) => {
    sendControlResponseToProcess(connections, params.sessionId, {
      subtype: 'success' as const,
      request_id: params.controlRequestId,
      response,
    });
  };

  // Nothing stored means we never previewed this request (or it was already
  // answered). Let it through as an ordinary approval rather than inventing a
  // decision the user did not make.
  if (!preview) {
    respond({ behavior: 'allow', updatedInput: {} });
    notifyResolved(connections, params);
    return;
  }

  if (isEmptySelection(preview, params.acceptedHunks)) {
    respond({ behavior: 'deny', message: buildUserDeclinedContent() });
    console.error('[node-backend]', `Diff resolved for ${params.toolUseId}: kept nothing (denied)`);
    notifyResolved(connections, params);
    return;
  }

  const amended = buildPartialApproval(preview, params.acceptedHunks);
  respond({ behavior: 'allow', updatedInput: amended ? amended.input : {} });
  console.error(
    '[node-backend]',
    `Diff resolved for ${params.toolUseId}: kept ${params.acceptedHunks.length}/${preview.hunks.length} hunks`,
  );

  notifyResolved(connections, params);
}

/**
 * Tell the chat its prompt is settled.
 *
 * Without this the approval panel stays up after the IDE answered, and pressing
 * Yes there sends a second decision for a request the CLI has already moved on
 * from — the user sees their edit apply, then a dead prompt they still have to
 * dismiss.
 */
function notifyResolved(connections: ConnectionManager, params: ResolveDiffParams): void {
  connections.broadcastToSession(params.sessionId, MessageType.PERMISSION_RESOLVED, {
    toolUseId: params.toolUseId,
    controlRequestId: params.controlRequestId,
  });
}

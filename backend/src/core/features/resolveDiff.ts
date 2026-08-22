/**
 * Answer a pending file-edit permission request from the IDE's diff viewer,
 * with the hunks the user kept (#109).
 *
 * The selection is made in the diff — that is where the change is legible, and
 * where JetBrains already draws per-range controls. An untouched review sends
 * back only hunk ranges, and the backend rebuilds from the change it still
 * holds, so what gets written is the text that was reviewed.
 *
 * A reviewer who edits the proposed side sends that text instead (#305). Once
 * they have typed over the proposal, no set of ranges into the original
 * proposal can describe what is now on screen — so the screen wins.
 */
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType, buildUserDeclinedContent } from '../../shared';
import { takePreview } from './diffPreview';
import { buildPartialApproval } from './partialApproval';
import type { AcceptedRange } from './hunks';
import { sendControlResponseToProcess } from '../claude-process';

export interface ResolveDiffParams {
  toolUseId: string;
  controlRequestId: string;
  sessionId: string;
  /**
   * Regions of the proposal the user kept, as the IDE split them. Empty means
   * they rejected the whole change.
   */
  acceptedRanges: AcceptedRange[];
  /**
   * The proposed side as the reviewer left it, when they edited it (#305).
   *
   * Absent means they did not type anything, and the ranges above describe the
   * answer on their own. Present, it IS the answer — it already contains the
   * result of every checkbox they unticked before typing.
   */
  editedContent?: string;
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

  const raw = params.acceptedRanges;
  const acceptedRanges = Array.isArray(raw)
    ? raw.filter(isAcceptedRange)
    : [];

  const edited = params.editedContent;
  const editedContent = typeof edited === 'string' ? edited : undefined;

  return { toolUseId, controlRequestId, sessionId, acceptedRanges, editedContent };
}

/** Whether a wire value is a usable line range; anything else is dropped. */
function isAcceptedRange(value: unknown): value is AcceptedRange {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (['oldStart', 'oldEnd', 'newStart', 'newEnd'] as const).every(
    (k) => typeof r[k] === 'number' && Number.isInteger(r[k]),
  );
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

  // An edited proposal answers on its own: the reviewer's text already reflects
  // whatever they unticked before typing, so "kept no ranges" is not a denial
  // here the way it is for an untouched diff.
  const edited = params.editedContent;
  const keptNothing =
    edited !== undefined ? edited === preview.oldContent : params.acceptedRanges.length === 0;

  if (keptNothing) {
    respond({ behavior: 'deny', message: buildUserDeclinedContent() });
    console.error('[node-backend]', `Diff resolved for ${params.toolUseId}: kept nothing (denied)`);
    notifyResolved(connections, params);
    return;
  }

  const amended = buildPartialApproval(preview, params.acceptedRanges, edited);
  respond({ behavior: 'allow', updatedInput: amended ? amended.input : {} });
  console.error(
    '[node-backend]',
    edited !== undefined
      ? `Diff resolved for ${params.toolUseId}: applied the reviewer's edited text`
      : `Diff resolved for ${params.toolUseId}: kept ${params.acceptedRanges.length} region(s)`,
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

/**
 * Answer a pending file-edit permission request from a review diff, with the
 * hunks the user kept (#109).
 *
 * Shared by both review surfaces — the IDE's native diff and the webview's own
 * — because a review is a review wherever it is drawn, and a second decision
 * path would let the two disagree about what an answer means.
 *
 * The selection is made in the diff, which is where the change is legible. An
 * untouched review sends back only hunk ranges, and the backend rebuilds from
 * the change it still holds, so what gets written is the text that was
 * reviewed.
 *
 * A reviewer who edits the proposed side sends that text instead (#305). Once
 * they have typed over the proposal, no set of ranges into the original
 * proposal can describe what is now on screen — so the screen wins.
 */
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType, buildUserDeclinedContent } from '../../shared';
import { takePreview, closeDiffTabForPermission, type StoredPreview } from './diffPreview';
import type { Bridge } from '../../bridge/bridge-interface';
import { buildPartialApproval, narrowToDifference } from './partialApproval';
import { buildEditedProposalNotice, type EditedProposalChange } from './editedProposalNotice';
import type { AcceptedRange } from './hunks';
import { sendControlResponseToProcess } from '../claude-process';
import { sendAfterTurn } from './afterTurn';

export interface ResolveDiffParams {
  toolUseId: string;
  controlRequestId: string;
  sessionId: string;
  /**
   * Regions of the proposal the user kept, as the review surface split them.
   * Empty means they rejected the whole change.
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

/**
 * Parse an answer payload, or null when it is not usable.
 *
 * Reached from a JSON-RPC notification (the IDE) and from a webview request
 * alike, so it trusts neither and validates the same way for both.
 */
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
 * Turn the reviewer's answer into the CLI's `control_response`.
 *
 * Keeping every hunk sends the request through untouched, so an Edit stays the
 * Edit Claude wrote. Keeping some rewrites the tool input to exactly that
 * subset. Keeping none is a denial — writing the file back unchanged would
 * report success for an edit that never happened.
 */
export function resolveDiffReview(
  connections: ConnectionManager,
  params: ResolveDiffParams,
  bridge?: Bridge,
): void {
  const preview = takePreview(params.toolUseId);

  // The question is settled however this ended, so the window that asked it goes
  // too. Done here rather than in each caller because both of them — the IDE's
  // own diff and our diff page — must close it on every branch below, and one
  // that forgot would strand a tab on an answered request.
  //
  // Only the built-in surface has a tab of ours to close; the IDE's viewer
  // closes itself, and an unknown id is a no-op there anyway.
  if (bridge) void closeDiffTabForPermission(bridge, params.toolUseId);

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
    // Logged because everything downstream — the picking, the edit, the notice
    // to Claude — depends on this being present, and its absence is silent
    // otherwise: the write goes through as proposed and nothing says why.
    console.error(
      '[node-backend]',
      `Diff resolved for ${params.toolUseId}: no stored preview, letting the original call through`,
    );
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

  /*
   * Told whenever what landed is not what was proposed — edited, picked, or
   * both. Silence is the exception, and it has exactly one case: the whole
   * proposal went in untouched, where Claude's own account of it is already
   * true.
   *
   * `amended` is that test, and a precise one: buildPartialApproval returns
   * null when the answer reproduces the proposal exactly, and an input to send
   * in its place otherwise. So it is null on a full accept, and on an edit that
   * was typed and then undone.
   *
   * Reporting only edits was too narrow. A reviewer who denies half a change
   * leaves Claude believing all of it was written, and the next turn is built
   * on a file that does not exist — measured with an edit before this existed:
   * the model kept reporting the value it had proposed (20000) after the
   * reviewer applied 15000, and a denied hunk is the same mistake in a form
   * nothing corrected.
   */
  if (amended !== null) {
    tellClaudeAboutTheEdit(connections, params.sessionId, preview, amended.content);
  }
}

/**
 * Report a corrected proposal to Claude, once the turn that proposed it is over.
 *
 * Held rather than sent (see afterTurn). Answering a permission request happens
 * mid-turn by definition — the CLI is blocked on the control_response — and the
 * CLI clears its pending-message queue as that turn ends, so a notice written
 * to stdin now is enqueued and then discarded. Measured: written at .477,
 * enqueued at .586, removed at .769, while an ordinary user message in the same
 * session went enqueue → dequeue. The model never read it, and went on
 * describing the value it had proposed rather than the one the reviewer applied.
 */
function tellClaudeAboutTheEdit(
  _connections: ConnectionManager,
  sessionId: string,
  preview: StoredPreview,
  applied: string,
): void {
  const notice = buildEditedProposalNotice(describeCorrection(preview.newContent, applied));
  if (!notice) {
    // Nothing to report means the applied text matched the proposal exactly.
    // Logged because "the reminder never arrived" and "there was nothing to
    // say" look identical from the chat, and only one of them is a bug.
    console.error('[node-backend]', `Edit notice for ${sessionId}: nothing to report`);
    return;
  }
  sendAfterTurn(sessionId, notice);
  console.error('[node-backend]', `Edit notice for ${sessionId}: held until the turn ends`);
}

/**
 * What the reviewer changed about the PROPOSAL, narrowed to the lines that
 * actually differ.
 *
 * Measured against `newContent` — what the model proposed — rather than against
 * the file on disk, because that is the correction being reported: the model
 * knows what it asked for, and needs to be told where the result departs from
 * it. Diffing against the file instead would restate the whole edit, most of
 * which the model already wrote itself.
 *
 * That also keeps a Write's notice short. Its amended input carries the entire
 * file, so quoting it verbatim sent 3.7KB to say one number had changed.
 */
function describeCorrection(proposed: string, applied: string): EditedProposalChange | null {
  const pair = narrowToDifference(proposed, applied);
  if (!pair) return null;
  return { oldText: pair.oldText, newText: pair.newText };
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

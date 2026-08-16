import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { sendToolResultToProcess, sendControlResponseToProcess } from '../claude-process';
import { MessageType, buildUserDeclinedContent } from '../../shared';
import { takePreview } from '../features/diffPreview';
import { buildPartialApproval, isEmptySelection } from '../features/partialApproval';

/** WebView -> Backend TOOL_RESPONSE payload */
interface ToolResponsePayload {
  toolUseId: string;
  approved: boolean;
  controlRequestId?: string;
  updatedInput?: Record<string, unknown>;
  reason?: string;
  result?: string;
  /**
   * Hunks the user kept, when they approved only part of a proposed edit
   * (#109). Absent means the whole change, which is the behaviour that
   * predates partial approval.
   */
  acceptedHunks?: number[];
}

export function toolResponseHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): void {
  const client = connections.getClient(connectionId);
  const sessionId = client?.subscribedSessionId;

  if (!sessionId) {
    console.error('[node-backend]', 'TOOL_RESPONSE received but no subscribed session');
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
    return;
  }

  const payload = message.payload as ToolResponsePayload | undefined;
  const toolUseId = payload?.toolUseId ?? '';
  let approved = payload?.approved ?? true;
  const controlRequestId = payload?.controlRequestId;

  // Partial approval (#109): the user kept some hunks of a proposed edit but
  // not all. Rewrite the tool call to describe exactly what they kept and hand
  // it back as `updatedInput` — the CLI honours an amended input, so the write
  // still happens the usual way rather than behind its back.
  //
  // The preview is consumed here whatever the decision was, so a request that
  // was denied does not leave one behind.
  let updatedInput = payload?.updatedInput;
  const preview = toolUseId ? takePreview(toolUseId) : undefined;
  if (approved && preview && payload?.acceptedHunks) {
    if (isEmptySelection(preview, payload.acceptedHunks)) {
      // Keeping nothing is a refusal. Writing the file back unchanged would
      // report success for an edit that never happened, and Claude would carry
      // on believing it landed.
      approved = false;
    } else {
      const amended = buildPartialApproval(preview, payload.acceptedHunks);
      if (amended) {
        updatedInput = amended.input;
        console.error(
          '[node-backend]',
          `Partial approval for ${toolUseId}: kept ${payload.acceptedHunks.length}/${preview.hunks.length} hunks`,
        );
      }
    }
  }

  // The user has answered, so the IDE diff that previewed this edit has served
  // its purpose — close it either way. Unknown ids are a no-op on the IDE side,
  // so there is no need to know whether this request opened one. Fire-and-
  // forget: the CLI is waiting on the response below, not on a closing tab.
  if (toolUseId) {
    bridge.closeDiff({ toolUseId }).catch((err) => {
      console.error('[node-backend]', 'Failed to close IDE diff after decision:', err);
    });
  }

  if (controlRequestId) {
    // control_response 프로토콜 (can_use_tool permission, ExitPlanMode, AskUserQuestion).
    // A denial here is the user's DECISION, not a tool/server failure. This is the
    // LIVE path for every permission prompt: the CLI turns our `deny` message into
    // the resulting tool_result content (is_error:true). We stamp that message with
    // the shared USER_DECLINED_PREFIX marker so the webview can render it as a
    // neutral "Declined" note instead of a red error — and, since the marker lives
    // in the persisted content, the distinction survives a reload.
    const response = {
      subtype: 'success' as const,
      request_id: controlRequestId,
      response: approved
        ? { behavior: 'allow', updatedInput: updatedInput ?? {} }
        : { behavior: 'deny', message: buildUserDeclinedContent(payload?.reason) },
    };
    sendControlResponseToProcess(connections, sessionId, response);
    console.error('[node-backend]', `CONTROL_RESPONSE sent for request ${controlRequestId} (approved: ${approved})`);
  } else {
    // Legacy tool_result path (kept for completeness; permission prompts use the
    // control_response branch above). Same marker rule so a denial reads as a
    // neutral decision rather than a red error, and survives reload.
    const resultContent = approved
      ? (payload?.result || 'Tool execution approved')
      : buildUserDeclinedContent(payload?.reason);

    const toolResult = {
      type: 'tool_result' as const,
      tool_use_id: toolUseId,
      content: resultContent,
      is_error: !approved,
    };
    sendToolResultToProcess(connections, sessionId, toolResult);
    console.error('[node-backend]', `TOOL_RESPONSE sent for tool ${toolUseId} (approved: ${approved})`);
  }

  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
}

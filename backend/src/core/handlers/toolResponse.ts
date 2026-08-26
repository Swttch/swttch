import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { sendToolResultToProcess, sendControlResponseToProcess } from '../claude-process';
import { MessageType, buildUserDeclinedContent } from '../../shared';
import { takePreview, peekPreview } from '../features/diffPreview';
import { holdApprovalIfBaseMoved } from '../features/reviewBase';

/** WebView -> Backend TOOL_RESPONSE payload */
interface ToolResponsePayload {
  toolUseId: string;
  approved: boolean;
  controlRequestId?: string;
  updatedInput?: Record<string, unknown>;
  reason?: string;
  result?: string;
}

export async function toolResponseHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const client = connections.getClient(connectionId);
  const sessionId = client?.subscribedSessionId;

  if (!sessionId) {
    console.error('[node-backend]', 'TOOL_RESPONSE received but no subscribed session');
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
    return;
  }

  const payload = message.payload as ToolResponsePayload | undefined;
  const toolUseId = payload?.toolUseId ?? '';
  const approved = payload?.approved ?? true;
  const controlRequestId = payload?.controlRequestId;

  /*
   * The gate, on this path too (#359).
   *
   * This is the button the reporter actually pressed — the chat prompt's Yes,
   * not the review diff's Confirm — so a check that lived only in the other
   * handler left the reported case wide open. Approving here writes the tool
   * call as proposed, and the proposal was built from the file as it was when
   * the request arrived.
   *
   * Peeked, not taken, so a held approval stays answerable: the preview is
   * consumed below only once an answer is really going out.
   */
  const preview = toolUseId ? peekPreview(toolUseId) : undefined;
  if (approved && preview) {
    const held = await holdApprovalIfBaseMoved({
      connections,
      sessionId,
      toolUseId,
      preview,
      bridge,
      // No selection travels on this path — the chat's Yes means the whole
      // change — so every disk change is treated as touching it.
    });
    if (held) {
      // Nothing sent to the CLI: the request stays open, and the surface has
      // been told to offer a refresh. ACK so the webview stops waiting on us.
      connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId });
      return;
    }
  }

  // The IDE's diff owns hunk selection now, so a plain approval from the chat
  // means the whole change. Still consume any stored preview: the request is
  // answered either way, and a leftover entry would outlive its question.
  if (toolUseId) takePreview(toolUseId);

  // The user has answered, so whatever previewed this edit has served its
  // purpose — close it either way. Both surfaces are told, because which one was
  // opened depends on a setting read when the request arrived, and it may have
  // changed since; unknown ids are a no-op on the IDE side, so telling both is
  // cheaper than remembering. Fire-and-forget: the CLI is waiting on the
  // response below, not on a closing tab.
  if (toolUseId) {
    bridge.closeDiff({ toolUseId }).catch((err) => {
      console.error('[node-backend]', 'Failed to close IDE diff after decision:', err);
    });
    bridge.closeDiffTab({ toolUseId }).catch((err) => {
      console.error('[node-backend]', 'Failed to close diff tab after decision:', err);
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
        ? { behavior: 'allow', updatedInput: payload?.updatedInput ?? {} }
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

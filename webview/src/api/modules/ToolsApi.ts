import { BridgeClient } from '../bridge/BridgeClient';
import { PermissionType, RiskLevel, FileOperation } from '../../dto/common';
import { MessageType } from '@/shared';

interface DiffAvailablePayload {
  toolUseId: string;
  filePath: string;
  operation: string;
  diff: string;
  oldContent?: string;
  newContent?: string;
}

/**
 * The change behind a pending permission request, as the backend holds it.
 *
 * Mirrors the backend's stored preview rather than restating a subset, so the
 * two do not drift; fields this UI does not read yet are still carried.
 */
export interface DiffPreview {
  filePath: string;
  oldContent: string;
  newContent: string;
  toolName: string;
  hunks: unknown[];
  input?: Record<string, unknown>;
  sessionId?: string;
  controlRequestId?: string;
}

/** A region of the proposal a reviewer kept, in 0-based end-exclusive lines. */
export interface AcceptedRange {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

/**
 * Tools API module
 * Handles tool permissions and diff operations
 */
export class ToolsApi {
  constructor(private bridge: BridgeClient) {}

  /**
   * Approve a tool use request
   */
  async approve(
    toolUseId: string,
    controlRequestId?: string,
    updatedInput?: Record<string, unknown>,
  ): Promise<void> {
    await this.bridge.request(MessageType.TOOL_RESPONSE, {
      toolUseId,
      approved: true,
      ...(controlRequestId && { controlRequestId }),
      ...(updatedInput && { updatedInput }),
    });
  }

  /**
   * Deny a tool use request
   */
  async deny(toolUseId: string, controlRequestId?: string, reason?: string): Promise<void> {
    // A denial is the CLI's answer to a question it is blocked on, so nothing
    // here may stop the message being sent. A caller that wired this to a click
    // handler once passed React's MouseEvent as the reason; JSON.stringify threw
    // on it, the message never left, and the turn hung forever with the diff
    // still open. Types allow that (an argument to a `() => void` is legal), so
    // the guard is here, at the last point before the wire.
    const safeReason = typeof reason === 'string' && reason ? reason : undefined;
    await this.bridge.request(MessageType.TOOL_RESPONSE, {
      toolUseId,
      approved: false,
      ...(controlRequestId && { controlRequestId }),
      ...(safeReason && { reason: safeReason }),
    });
  }

  /**
   * Respond to a tool use request with custom result content
   */
  async respond(
    toolUseId: string,
    result: string,
    options?: {
      controlRequestId?: string;
      updatedInput?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.bridge.request(MessageType.TOOL_RESPONSE, {
      toolUseId,
      approved: true,
      result,
      ...(options?.controlRequestId && {
        controlRequestId: options.controlRequestId,
        updatedInput: options.updatedInput,
      }),
    });
  }

  /**
   * Open diff view in IDE
   */
  async openDiff(
    filePath: string,
    oldContent: string,
    newContent: string
  ): Promise<void> {
    await this.bridge.request(MessageType.OPEN_DIFF, {
      filePath,
      oldContent,
      newContent,
    });
  }

  /**
   * Reopen the review diff for a permission request still awaiting an answer.
   *
   * Only the id travels: the contents are held backend-side for that request,
   * so what is shown is the text the backend diffed rather than something
   * reassembled here. A request already answered has no preview left, and the
   * backend treats that as nothing to do.
   */
  async openDiffForRequest(toolUseId: string): Promise<void> {
    await this.bridge.request(MessageType.OPEN_DIFF, { toolUseId });
  }

  /**
   * The change behind a pending permission request, for drawing the review
   * diff here rather than in the IDE.
   *
   * Null once the request has been answered — the fetch lost a race with the
   * decision, which is not an error and leaves nothing to draw.
   */
  async getDiffPreview(toolUseId: string): Promise<DiffPreview | null> {
    const response = await this.bridge.request<{ preview: DiffPreview | null }>(
      MessageType.GET_DIFF_PREVIEW,
      { toolUseId },
    );
    return response?.preview ?? null;
  }

  /**
   * Answer a permission request from the review diff drawn here.
   *
   * The same message the IDE's diff sends, so both surfaces settle a request
   * the same way. [editedContent] is the proposed side as the reviewer left it
   * and, when present, is what gets written (#305); omit it when they did not
   * edit, so an untouched review lets Claude's own call through.
   */
  async resolveDiff(params: {
    toolUseId: string;
    controlRequestId: string;
    sessionId: string;
    acceptedRanges: AcceptedRange[];
    editedContent?: string;
  }): Promise<void> {
    await this.bridge.request(MessageType.RESOLVE_DIFF, { ...params });
  }

  /**
   * Apply a diff (accept file changes)
   */
  async applyDiff(
    toolUseId: string,
    options?: {
      filePath?: string;
      content?: string;
      operation?: FileOperation;
    }
  ): Promise<void> {
    await this.bridge.request(MessageType.APPLY_DIFF, {
      toolUseId,
      ...options,
    });
  }

  /**
   * Reject a diff (decline file changes)
   */
  async rejectDiff(toolUseId: string): Promise<void> {
    await this.bridge.request(MessageType.REJECT_DIFF, { toolUseId });
  }

  // Event subscriptions

  /**
   * Subscribe to diff available events
   */
  onDiffAvailable(
    callback: (diff: DiffAvailablePayload) => void
  ): () => void {
    return this.bridge.subscribe(MessageType.DIFF_AVAILABLE, (message) => {
      callback(message.payload as unknown as DiffAvailablePayload);
    });
  }

  /**
   * Subscribe to tool execution completion
   */
  onToolComplete(
    callback: (data: { toolUseId: string; result?: string; error?: string }) => void
  ): () => void {
    return this.bridge.subscribe(MessageType.TOOL_COMPLETE, (message) => {
      callback({
        toolUseId: message.payload?.toolUseId as string,
        result: message.payload?.result as string | undefined,
        error: message.payload?.error as string | undefined,
      });
    });
  }

  // Utility methods

  /**
   * Get permission type for a tool name
   */
  getPermissionType(toolName: string): PermissionType | null {
    switch (toolName) {
      case 'Write':
      case 'Edit':
        return PermissionType.FileWrite;
      case 'Delete':
        return PermissionType.FileDelete;
      case 'Bash':
        return PermissionType.BashExecute;
      default:
        return null;
    }
  }

  /**
   * Get risk level for a tool name
   */
  getRiskLevel(toolName: string): RiskLevel {
    switch (toolName) {
      case 'Bash':
      case 'Delete':
        return RiskLevel.High;
      case 'Write':
      case 'Edit':
        return RiskLevel.Medium;
      default:
        return RiskLevel.Low;
    }
  }

  /**
   * Check if a tool requires permission
   */
  requiresPermission(toolName: string): boolean {
    return this.getPermissionType(toolName) !== null;
  }
}

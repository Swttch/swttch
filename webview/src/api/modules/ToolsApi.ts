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
    await this.bridge.request(MessageType.TOOL_RESPONSE, {
      toolUseId,
      approved: false,
      ...(controlRequestId && { controlRequestId }),
      ...(reason && { reason }),
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

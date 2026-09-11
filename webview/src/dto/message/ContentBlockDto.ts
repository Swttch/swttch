import { Type } from 'class-transformer';
import type { LoadedMessageDto } from '../../types';
import type { WorkflowUsage } from '../../shared';
import { MessageRole } from '../common';

export enum ContentBlockType {
  Text = 'text',
  ToolUse = 'tool_use',
  ToolResult = 'tool_result',
  Image = 'image',
  Thinking = 'thinking',
}

/**
 * Base class for all content blocks in Claude CLI messages
 */
export abstract class ContentBlockDto {
  type!: ContentBlockType;
}

/**
 * Text content block
 */
export class TextBlockDto extends ContentBlockDto {
  override type = ContentBlockType.Text as const;
  text!: string;
}

/**
 * Tool use content block - represents a tool call from the assistant
 */
export class ToolUseBlockDto extends ContentBlockDto {
  override type = ContentBlockType.ToolUse as const;
  id!: string;
  name!: string;
  input!: Record<string, unknown>;
  /** Runtime-only: merged tool_result message from subsequent user message */
  tool_result?: LoadedMessageDto;
  /** Runtime-only: child messages linked via sourceToolUseID (e.g. skill-expanded prompts) */
  childMessages?: LoadedMessageDto[];
  /** Runtime-only: progress entries from sub-agent (for Task tool only) */
  subAgentMessages?: SubAgentMessage[];
  /**
   * Runtime-only: parsed `<task-notification>` for a dynamic-workflow Workflow
   * tool_use (for the Workflow tool only). Merged in by mergeToolResults from the
   * later user message whose `<tool-use-id>` matches this block's id, so the
   * Workflow renderer can show the final status/summary/result on reload.
   */
  workflowNotification?: WorkflowNotification;
}

/**
 * Parsed `<task-notification>` envelope the CLI emits when a background dynamic
 * workflow finishes. Field names mirror the source tags; `usage` mirrors the
 * `<usage>` sub-block. All optional — the envelope shape can vary by status.
 */
export interface WorkflowNotification {
  taskId?: string;
  toolUseId?: string;
  outputFile?: string;
  status?: string;
  summary?: string;
  result?: string;
  /** The `<usage>` sub-block under the envelope's own tag names. */
  usage?: WorkflowUsage;
  /**
   * Any further tags the envelope carried, under their own names — `note`
   * among them. Reading only a fixed list dropped those silently.
   */
  notification?: Record<string, string>;
}

/**
 * Tool result content block - represents the result of a tool call
 */
export class ToolResultBlockDto extends ContentBlockDto {
  override type = ContentBlockType.ToolResult as const;
  tool_use_id!: string;
  content!: string | AnyContentBlockDto[];
  is_error?: boolean;
}

/**
 * Image source DTO for base64 or URL images
 */
export class ImageSourceDto {
  type!: 'base64' | 'url';
  media_type!: string;
  data!: string;
}

/**
 * Image content block
 */
export class ImageBlockDto extends ContentBlockDto {
  override type = ContentBlockType.Image as const;

  @Type(() => ImageSourceDto)
  source!: ImageSourceDto;
}

/**
 * Thinking content block - represents the model's extended thinking
 */
export class ThinkingBlockDto extends ContentBlockDto {
  override type = ContentBlockType.Thinking as const;
  thinking!: string;
  signature?: string;
  /**
   * Runtime-only: live cumulative thinking-token estimate, fed from the CLI's
   * `{type:"system", subtype:"thinking_tokens"}` stream events. Present only
   * while the block is streaming; not part of the persisted JSONL.
   */
  estimatedTokens?: number;
  /**
   * Runtime-only: wall-clock duration (ms) of the thinking block, measured from
   * its `content_block_start` to `content_block_stop`. Set once the block ends;
   * its presence marks the block as "done thinking".
   */
  durationMillis?: number;
}

/**
 * Sub-agent message extracted from progress entries (for Task tool rendering)
 */
export interface SubAgentMessage {
  /** The content blocks from the sub-agent (tool_use or tool_result) */
  content: AnyContentBlockDto[];
  /** Role: assistant for tool_use, user for tool_result */
  role: MessageRole;
  /** Timestamp for ordering (always present in real data) */
  timestamp: string;
}

export type AnyContentBlockDto =
  | TextBlockDto
  | ToolUseBlockDto
  | ToolResultBlockDto
  | ImageBlockDto
  | ThinkingBlockDto;

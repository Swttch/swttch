/**
 * Type definitions for WebView
 * Re-exports from DTO classes for backwards compatibility
 */

// Re-export all DTO types
export * from '../dto';

// ============================================
// Message DTO definitions (JSONL-aligned)
// ============================================

import type { AnyContentBlockDto } from '@/dto';
import { ContentBlockType, TextBlockDto, ToolUseBlockDto } from '@/dto/message/ContentBlockDto';
import { MessageRole, LoadedMessageType, ToolUseStatus, FileOperation } from '@/dto/common';
import { Transform, Type } from 'class-transformer';
import { transformContentBlocks } from '../mappers/contentBlockTransformer';

/**
 * MessageDto = JSONL `message` sub-object (Claude API message format)
 *
 * Matches the structure of the `message` field inside each JSONL line.
 * `@Transform` on `content` runs only when `plainToInstance()` is called.
 */
export class MessageDto {
  role!: MessageRole;

  @Transform(({ value }) => {
    if (typeof value === 'string' || !value) return value;
    if (Array.isArray(value)) return transformContentBlocks(value);
    return value;
  })
  content!: string | AnyContentBlockDto[];

  model?: string;
  id?: string;
  usage?: Record<string, unknown>;
  stop_reason?: string | null;
}

/**
 * LoadedMessageDto = one JSONL line from Claude CLI session file.
 *
 * This is the canonical message type that flows through the entire system:
 * backend → state → context → renderers.
 *
 * `@Type(() => MessageDto)` triggers nested `plainToInstance` for `message`,
 * which in turn triggers `@Transform` on `MessageDto.content`.
 */
export class LoadedMessageDto {
  type!: LoadedMessageType;
  uuid?: string;
  timestamp?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  isMeta?: boolean;

  @Type(() => MessageDto)
  message?: MessageDto;

  message_id?: string;

  // result-specific
  subtype?: string;
  result?: unknown;
  toolUseResult?: unknown;

  // progress-specific fields (agent_progress entries from JSONL)
  parentToolUseID?: string;
  data?: {
    type: string;
    agentId?: string;
    message: {
      type: string;
      message: {
        role: string;
        content: unknown;
      };
      uuid?: string;
      timestamp?: string;
    };
  };

  // skill-expanded message linkage
  sourceToolUseID?: string;

  // summary-specific (compact marker)
  summary?: string;
  leafUuid?: string;

  // Compact-boundary flags. When a conversation is compacted (auto-compact or
  // `/compact`), the CLI emits the carried-over summary as an ordinary `user`
  // entry carrying these flags — not as a `summary` entry. Preserved verbatim
  // from the CLI so the boundary stays identifiable downstream.
  isCompactSummary?: boolean;
  isVisibleInTranscriptOnly?: boolean;

  // `file-history-snapshot` only: the uuid of the user send this snapshot belongs
  // to. Named as the CLI names it, per the original-data rule. Note it is NOT the
  // entry's own identity — a snapshot entry carries no `uuid` of its own.
  messageId?: string;

  // UI-only: the uuid the CLI recorded for a send the webview is showing from its
  // own copy (issue #356). While a turn streams, `uuid` above is an id this app
  // minted, and no CLI command accepts it; this arrives on SEND_RECORDED when the
  // turn ends. Kept beside `uuid` rather than replacing it so the React key and
  // the section identity do not change under the user mid-session.
  cliUuid?: string;

  // UI-only: whether the CLI wrote a file-history snapshot for this send, so the
  // code can be rewound to it. Arrives with `cliUuid` on SEND_RECORDED; for a
  // send read from the transcript the snapshot entry itself answers this instead.
  canRewind?: boolean;

  // metadata
  slug?: string;
  sessionId?: string;

  // CLI streaming metadata (not in JSONL, present during streaming)
  isSynthetic?: boolean;

  // API error metadata emitted by the CLI for synthetic error messages
  // (e.g. authentication failures). Preserved verbatim from the CLI entry.
  isApiErrorMessage?: boolean;
  apiErrorStatus?: number;
  error?: string;

  // UI-only fields (not in JSONL, set during streaming/local creation)
  isStreaming?: boolean;
  context?: Context[];

  // UI-only: a locally-created model-change notice carries the target model's
  // stable value so the CLI's `/model` echo can be deduped against it across
  // locales (the summary text itself is localized). Not in JSONL.
  modelChangeValue?: string;

  // Set on a `user` entry the CLI injects mid-turn when a peer Claude session
  // (a subagent or teammate, reached via the SendMessage tool) messages this
  // one — the entry's own `message.content` is a plain string wrapping that
  // report in an `<agent-message>` tag plus boilerplate explaining it did not
  // come from the actual user (issue #383). `origin.body` is the same report
  // already unwrapped, so renderers can show it directly instead of
  // re-parsing the tag out of the wrapped text.
  origin?: {
    kind: string;
    from?: string;
    senderTaskId?: string;
    name?: string;
    body?: string;
  };
}

/**
 * True when a message is the CLI's synthetic "authentication failed" error
 * (401 / authentication_failed). Used to surface an inline login CTA, and to
 * distinguish auth failures from other API errors (rate limit, network).
 *
 * A free function (not a `LoadedMessageDto` getter) because messages are created
 * as plain object literals throughout — both loaded (class-transformed) and live
 * streaming messages must work, and plain objects carry no class getters.
 */
export function isAuthErrorMessage(
  m: Pick<LoadedMessageDto, 'isApiErrorMessage' | 'apiErrorStatus' | 'error'>,
): boolean {
  if (!m.isApiErrorMessage) return false;
  return m.apiErrorStatus === 401 || m.error === 'authentication_failed';
}

/**
 * True when a message is the CLI's synthetic usage-limit notice
 * (429 / rate_limit) — "You've hit your session limit · resets 7:20pm".
 *
 * Detected from the CLI's own markers, NOT from the notice wording. The wording
 * varies by plan, organization type and CLI version ("Session limit reached ∙
 * resets 3pm", "Weekly limit reached, now using extra usage", "Limit reached –
 * contact an admin to keep working", …), so text matching both missed real
 * notices and misfired on ordinary answers that merely discussed rate limiting
 * (issue #249). The markers carry no such ambiguity: measured over 66,398
 * assistant entries, every `error: 'rate_limit'` entry was a genuine notice
 * (66/66) and no ordinary answer carried the marker.
 *
 * A free function for the same reason as {@link isAuthErrorMessage}: it must
 * work on plain object literals from the live streaming path, which carry no
 * class getters.
 */
export function isLimitErrorMessage(
  m: Pick<LoadedMessageDto, 'isApiErrorMessage' | 'apiErrorStatus' | 'error'>,
): boolean {
  if (!m.isApiErrorMessage) return false;
  return m.apiErrorStatus === 429 || m.error === 'rate_limit';
}


// ============================================
// Supporting types
// ============================================

export enum ContextType {
  Selection = 'selection',
  File = 'file',
  Explicit = 'explicit',
}

export interface Context {
  type: ContextType;
  path?: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolUseStatus;
  result?: string;
  error?: string;
}

export interface PendingDiff {
  id: string;
  filePath: string;
  diff: string;
  summary: DiffSummary;
  status: DiffStatus;
  toolUseId: string;
  oldContent?: string;
  newContent?: string;
  operation?: 'MODIFY' | 'DELETE';
  oldString?: string;
  newString?: string;
}

export interface DiffSummary {
  additions: number;
  deletions: number;
  operation: FileOperation;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** null when the backend listed this session without counting its entries. */
  messageCount: number | null;
}

export enum SessionState {
  Idle = 'idle',
  Streaming = 'streaming',
  WaitingPermission = 'waiting_permission',
  HasDiff = 'has_diff',
  Error = 'error',
}

export enum DiffStatus {
  Pending = 'pending',
  Applied = 'applied',
  Rejected = 'rejected',
}

// ============================================
// Utility type guards
// ============================================

/**
 * Check if content is a ContentBlock array (new format)
 */
export function isContentBlockArray(content: unknown): content is AnyContentBlockDto[] {
  return Array.isArray(content) && content.length > 0 && typeof content[0] === 'object' && 'type' in content[0];
}

/**
 * Check if content is a simple string (legacy format)
 */
export function isStringContent(content: unknown): content is string {
  return typeof content === 'string';
}

/**
 * Extract text content from Message (handles both LoadedMessageDto structure)
 */
export function getTextContent(message: LoadedMessageDto): string {
  const content = message.message?.content;
  if (content === undefined || content === null) return '';

  if (isStringContent(content)) {
    return content;
  }

  if (isContentBlockArray(content)) {
    return content
      .filter((block): block is TextBlockDto => block.type === ContentBlockType.Text)
      .map((block) => block.text)
      .join('\n');
  }

  return '';
}

/**
 * Extract tool uses from Message content blocks.
 * Returns ToolUse[] with status based on message streaming state.
 */
export function getToolUses(message: LoadedMessageDto): ToolUse[] {
  const content = message.message?.content;
  if (!isContentBlockArray(content)) {
    return [];
  }

  return content
    .filter((block): block is ToolUseBlockDto =>
      block.type === ContentBlockType.ToolUse
    )
    .map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input,
      status: message.isStreaming ? ToolUseStatus.Pending : ToolUseStatus.Completed,
    }));
}

// Settings types
export * from './settings';
export * from './attachment';
export * from './models';
export * from './effort';
export * from './cli-events';

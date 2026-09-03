/**
 * Tracks which files Claude Code edits so the IDE can be told to reload them.
 *
 * Why this exists: the Claude CLI writes files to disk directly (after a
 * permission is granted, or automatically in acceptEdits/bypass modes). The
 * plugin never goes through the IDE to perform the write, so the IDE only
 * learns about the change through its native filesystem watcher. On Windows
 * that watcher is unreliable, leaving open editor tabs showing stale content
 * (issue #72). To work around it we detect completed edit tools in the CLI
 * stream and explicitly ask the IDE to refresh the affected paths.
 *
 * Timing matters: an `assistant` event only announces the *intent* to edit —
 * in ask-before-edit mode the file is not written until the user approves and
 * the matching `tool_result` comes back. So we record edit targets when the
 * tool_use is seen, but only emit a refresh once the corresponding successful
 * `tool_result` arrives (= the write has actually happened on disk).
 */

import { FILE_EDIT_TOOLS } from '../../shared';

/**
 * Tools that mutate a file on disk and therefore require an IDE reload.
 *
 * Built from the shared list rather than spelled out again: the session
 * permission rule reasons about the same set, and a tool present in one copy
 * and missing from the other is invisible until a user hits exactly that tool.
 */
const EDIT_TOOLS = new Set<string>(FILE_EDIT_TOOLS);

export interface EditTarget {
  toolUseId: string;
  filePath: string;
}

function getContentBlocks(event: Record<string, unknown>): Array<Record<string, unknown>> {
  const message = event['message'] as { content?: unknown } | undefined;
  const content = message?.content;
  return Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
}

/**
 * Pulls the editable file targets out of an `assistant` event's tool_use blocks.
 * Non-assistant events, non-editing tools, and tool_use without a path yield nothing.
 */
export function extractEditTargets(event: Record<string, unknown>): EditTarget[] {
  if (event['type'] !== 'assistant') return [];

  const targets: EditTarget[] = [];
  for (const block of getContentBlocks(event)) {
    if (block['type'] !== 'tool_use') continue;
    const name = block['name'];
    if (typeof name !== 'string' || !EDIT_TOOLS.has(name)) continue;

    const input = (block['input'] as Record<string, unknown> | undefined) ?? {};
    // Edit/Write/MultiEdit use `file_path`; NotebookEdit uses `notebook_path`.
    const rawPath = input['file_path'] ?? input['notebook_path'];
    const toolUseId = block['id'];
    if (typeof rawPath === 'string' && rawPath.length > 0 && typeof toolUseId === 'string') {
      targets.push({ toolUseId, filePath: rawPath });
    }
  }
  return targets;
}

/**
 * Returns the tool_use_ids of successful tool_result blocks in a `user` event.
 * A missing `is_error` is treated as success (the CLI omits it on success).
 */
export function extractSucceededToolUseIds(event: Record<string, unknown>): string[] {
  if (event['type'] !== 'user') return [];

  const ids: string[] = [];
  for (const block of getContentBlocks(event)) {
    if (block['type'] !== 'tool_result') continue;
    if (block['is_error'] === true) continue;
    const id = block['tool_use_id'];
    if (typeof id === 'string' && id.length > 0) ids.push(id);
  }
  return ids;
}

/**
 * Stateful bridge between edit announcements and edit completions.
 *
 * Feed every CLI stream event to both [recordEdits] and [collectRefreshPaths];
 * the latter returns the deduplicated file paths that just finished writing and
 * should be refreshed in the IDE.
 */
export class EditedFileTracker {
  /** toolUseId -> filePath for edits announced but not yet completed. */
  private readonly pending = new Map<string, string>();

  /** Record edit intents from an `assistant` event. No-op for other events. */
  recordEdits(event: Record<string, unknown>): void {
    for (const target of extractEditTargets(event)) {
      this.pending.set(target.toolUseId, target.filePath);
    }
  }

  /**
   * Given a `user` event, return the file paths whose edits just succeeded.
   * Consumed entries are removed so a path is never emitted twice. The result
   * is deduplicated (two edits to one file refresh it once).
   */
  collectRefreshPaths(event: Record<string, unknown>): string[] {
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const toolUseId of extractSucceededToolUseIds(event)) {
      const filePath = this.pending.get(toolUseId);
      if (filePath === undefined) continue;
      this.pending.delete(toolUseId);
      if (!seen.has(filePath)) {
        seen.add(filePath);
        paths.push(filePath);
      }
    }
    return paths;
  }
}

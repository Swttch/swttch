// @ts-ignore
import { diffAsText } from 'unidiff';
import type { LoadedMessageDto } from '../../../types';
import {
  DiffLineType,
  fromDiffText,
  fromStructuredPatch,
  type DiffLine,
  type EditToolUseResult,
} from '../message-renderers/ToolRenderers/EditRenderer';
import type { ToolCall } from './buildSegments';

/**
 * The lines a file change put in and took out, as a diff: what an edit replaced (with the lines around it, when the
 * CLI recorded a patch for it), or every line of a file that was created. A file's last line break does not start
 * another line.
 */
export function diffLinesOf(call: ToolCall, limit = Infinity): DiffLine[] {
  const input = call.toolUse.input ?? {};
  if (call.toolUse.name === 'Write') {
    const content = typeof input.content === 'string' ? (input.content as string) : '';
    if (content === '') return [];
    return content
      .replace(/\n$/, '')
      .split('\n')
      .slice(0, limit)
      .map((text, index) => ({ type: DiffLineType.Add, content: text, newNo: index + 1 }));
  }
  const result = (call.toolUse.tool_result as (LoadedMessageDto & { toolUseResult?: unknown }) | undefined)?.toolUseResult as
    | EditToolUseResult
    | undefined;
  if (Array.isArray(result?.structuredPatch) && result.structuredPatch.length > 0) return fromStructuredPatch(result.structuredPatch);
  const oldString = typeof input.old_string === 'string' ? (input.old_string as string) : '';
  const newString = typeof input.new_string === 'string' ? (input.new_string as string) : '';
  if (!oldString && !newString) return [];
  try {
    const text = diffAsText(oldString, newString, { context: 3 }) as string;
    return text ? fromDiffText(text) : [];
  } catch {
    return [];
  }
}

/** How many lines of the diff were put in and how many taken out: the context around them is neither. */
export function changedLineCounts(call: ToolCall): { added: number; removed: number } {
  const lines = diffLinesOf(call);
  return {
    added: lines.filter((line) => line.type === DiffLineType.Add).length,
    removed: lines.filter((line) => line.type === DiffLineType.Delete).length,
  };
}

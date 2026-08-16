/**
 * Turn a file-editing tool call into the content that file would have if the
 * user approved it, so the IDE can show a diff BEFORE anything is written.
 *
 * The CLI hands us the tool's own input verbatim (`old_string`/`new_string` for
 * Edit, `content` for Write, a list of edits for MultiEdit). Applying them here
 * mirrors what the CLI would do on approval — the point is to preview it, not
 * to write it, so nothing in this module touches the disk.
 */

/** Tools whose input describes a file write we can preview. */
export const FILE_EDITING_TOOLS = ['Edit', 'Write', 'MultiEdit'] as const;

export function isFileEditingTool(toolName: string | undefined): boolean {
  return !!toolName && (FILE_EDITING_TOOLS as readonly string[]).includes(toolName);
}

/** The single edit shape shared by Edit and by each entry of MultiEdit. */
interface EditOperation {
  old_string?: unknown;
  new_string?: unknown;
  replace_all?: unknown;
}

/**
 * Apply one Edit operation the way the CLI does: replace the first occurrence,
 * or every occurrence when `replace_all` is set.
 *
 * Returns null when `old_string` is not present in the source — the same
 * condition the CLI itself treats as a failed edit. Callers surface that as
 * "no preview" rather than guessing at a result that would not match reality.
 */
export function applyEditOperation(source: string, edit: EditOperation): string | null {
  const oldString = typeof edit.old_string === 'string' ? edit.old_string : '';
  const newString = typeof edit.new_string === 'string' ? edit.new_string : '';

  // An empty old_string means "insert at the start" for the CLI's Edit tool
  // only when the file is empty; anywhere else it is ambiguous, so decline.
  if (oldString === '') {
    return source === '' ? newString : null;
  }
  if (!source.includes(oldString)) return null;

  if (edit.replace_all === true) {
    return source.split(oldString).join(newString);
  }
  const at = source.indexOf(oldString);
  return source.slice(0, at) + newString + source.slice(at + oldString.length);
}

/**
 * The content [filePath] would hold if this tool call were approved.
 *
 * [originalContent] is null for a file that does not exist yet (Write creating
 * one), which is why it is separate from the empty-file case: an empty existing
 * file and a missing file differ for Edit, though not for Write.
 *
 * Returns null when the call cannot be previewed faithfully — an unknown tool,
 * a malformed input, or an Edit whose `old_string` is absent. A null means
 * "show no diff", never "show an empty diff", because a wrong preview is worse
 * than none when the user is about to approve on the strength of it.
 */
export function computeProposedContent(
  toolName: string,
  input: Record<string, unknown>,
  originalContent: string | null,
): string | null {
  if (toolName === 'Write') {
    return typeof input.content === 'string' ? input.content : null;
  }

  if (toolName === 'Edit') {
    if (originalContent === null) return null;
    return applyEditOperation(originalContent, input as EditOperation);
  }

  if (toolName === 'MultiEdit') {
    if (originalContent === null) return null;
    const edits = input.edits;
    if (!Array.isArray(edits) || edits.length === 0) return null;
    // Each edit sees the result of the previous one, matching the CLI's
    // sequential application — an edit that depends on an earlier one would
    // otherwise look like it failed.
    let content = originalContent;
    for (const edit of edits) {
      if (typeof edit !== 'object' || edit === null) return null;
      const next = applyEditOperation(content, edit as EditOperation);
      if (next === null) return null;
      content = next;
    }
    return content;
  }

  return null;
}

/** The file a file-editing tool call targets, or null when it names none. */
export function extractFilePath(input: Record<string, unknown>): string | null {
  const path = input.file_path ?? input.path;
  return typeof path === 'string' && path.length > 0 ? path : null;
}

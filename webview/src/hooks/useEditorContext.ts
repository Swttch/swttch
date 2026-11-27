import { useEffect, useRef } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { getCaretOffset, setCaretOffset } from '@/utils/domSelection';
import { MessageType } from '@/shared';
import { formatFileMention } from '@/utils/fileMention';

/**
 * Payload pushed by the backend over the `EDITOR_CONTEXT` IPC message.
 * The IDE reports the file the user is looking at, plus the active
 * selection range (null lines when nothing is selected).
 */
export interface EditorContextPayload {
  absolutePath: string;
  relativePath: string;
  startLine: number | null;
  endLine: number | null;
  workingDir: string;
}

export interface UseEditorContextParams {
  value: string;
  onChange: (next: string) => void;
  textareaRef: React.RefObject<HTMLDivElement>;
  currentWorkingDir: string;
  /** Move focus + caret after insertion. Defaults to true. */
  shouldFocus?: boolean;
  /**
   * Called with the inserted path token (no trailing space), e.g.
   * `src/file.ts#L10-L25` or `src/file.ts`, so the composer can highlight it
   * as a chip. Fired once per successful insertion.
   */
  onInsertToken?: (token: string) => void;
}

/** Window during which an identical payload is treated as a duplicate. */
const DEDUP_WINDOW_MS = 500;

/** Strip a single trailing slash so two working-dir spellings compare equal. */
function normalizeDir(dir: string): string {
  return dir.replace(/\/+$/, '');
}

/**
 * Build the text inserted into the composer for an editor-context payload.
 * The token is prefixed with `@` so Claude Code CLI can recognise it as a
 * file reference.
 * With a selection (both lines numeric): `@relativePath#L{start}-L{end}`.
 * Without a selection (either line null): `@relativePath`.
 * The trailing space is added by the caller at insertion time.
 */
export function buildEditorContextText(payload: EditorContextPayload): string {
  const { relativePath, startLine, endLine } = payload;
  if (typeof startLine === 'number' && typeof endLine === 'number') {
    return formatFileMention(`${relativePath}#L${startLine}-L${endLine}`);
  }
  return formatFileMention(relativePath);
}

export interface InsertAtCursorResult {
  nextValue: string;
  nextCaret: number;
}

/**
 * Insert `insertText` into `value` at `cursorPos`, preserving surrounding text.
 * Returns the new value and the caret position immediately after the insertion.
 */
export function insertAtCursor(
  value: string,
  insertText: string,
  cursorPos: number,
): InsertAtCursorResult {
  const pos = Math.max(0, Math.min(cursorPos, value.length));
  const nextValue = value.slice(0, pos) + insertText + value.slice(pos);
  return { nextValue, nextCaret: pos + insertText.length };
}

/** Validate an unknown IPC payload as an EditorContextPayload. */
function parseEditorContextPayload(
  raw: Record<string, unknown> | undefined,
): EditorContextPayload | null {
  if (!raw) return null;
  const { absolutePath, relativePath, startLine, endLine, workingDir } = raw;
  if (typeof relativePath !== 'string' || relativePath.length === 0) return null;
  if (typeof workingDir !== 'string') return null;
  return {
    absolutePath: typeof absolutePath === 'string' ? absolutePath : '',
    relativePath,
    startLine: typeof startLine === 'number' ? startLine : null,
    endLine: typeof endLine === 'number' ? endLine : null,
    workingDir,
  };
}

/**
 * Subscribe to backend `EDITOR_CONTEXT` pushes and insert the reported file
 * path (with optional line range) into the composer at the current caret.
 *
 * - Filters out payloads from a different working directory.
 * - Dedups identical payloads fired within {@link DEDUP_WINDOW_MS}.
 * - Tracks `value` via a ref to avoid stale-closure re-subscriptions.
 */
export function useEditorContext(params: UseEditorContextParams): void {
  const { value, onChange, textareaRef, currentWorkingDir, shouldFocus = true, onInsertToken } = params;
  const { subscribe } = useBridgeContext();

  // Latest values tracked via refs so the effect can subscribe once and still
  // read fresh state inside the handler (mirrors the useMention pattern).
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const currentWorkingDirRef = useRef(currentWorkingDir);
  currentWorkingDirRef.current = currentWorkingDir;
  const shouldFocusRef = useRef(shouldFocus);
  shouldFocusRef.current = shouldFocus;
  const onInsertTokenRef = useRef(onInsertToken);
  onInsertTokenRef.current = onInsertToken;

  // Dedup bookkeeping.
  const lastKeyRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    return subscribe(MessageType.EDITOR_CONTEXT, (message) => {
      const payload = parseEditorContextPayload(message.payload);
      if (!payload) return;

      // Working-dir filter (trailing-slash tolerant).
      if (normalizeDir(payload.workingDir) !== normalizeDir(currentWorkingDirRef.current)) {
        return;
      }

      // Dedup identical payloads within the time window.
      const key = `${payload.relativePath}:${payload.startLine}:${payload.endLine}`;
      const now = Date.now();
      if (lastKeyRef.current === key && now - lastTimeRef.current < DEDUP_WINDOW_MS) {
        return;
      }
      lastKeyRef.current = key;
      lastTimeRef.current = now;

      const token = buildEditorContextText(payload);
      const insertText = token + ' ';
      const el = textareaRef.current;
      const currentValue = valueRef.current;
      const cursorPos = el ? getCaretOffset(el) : currentValue.length;

      const { nextValue, nextCaret } = insertAtCursor(currentValue, insertText, cursorPos);
      onChangeRef.current(nextValue);
      onInsertTokenRef.current?.(token);

      if (shouldFocusRef.current) {
        requestAnimationFrame(() => {
          const target = textareaRef.current;
          if (!target) return;
          target.focus();
          setCaretOffset(target, nextCaret);
        });
      }
    });
  }, [subscribe, textareaRef]);
}

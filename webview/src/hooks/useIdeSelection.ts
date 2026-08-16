import { useEffect, useRef, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/**
 * Payload pushed by the backend over the `IDE_SELECTION` IPC message.
 *
 * The IDE reports the file the user is currently looking at, plus the active
 * selection range and its text. When nothing is selected (the user merely
 * switched to a file) startLine / endLine / selectedText are null — that is the
 * "file only" case.
 *
 * Distinct from EDITOR_CONTEXT (Alt+K), which inserts an @mention into the
 * composer. IDE_SELECTION only updates state for a toggleable context chip and
 * NEVER mutates the input text.
 */
export interface IdeSelectionPayload {
  absolutePath: string;
  relativePath: string;
  startLine: number | null;
  endLine: number | null;
  selectedText: string | null;
  workingDir: string;
  /** Whether the file is matched by the project's .gitignore rules. */
  isGitignored: boolean;
}

export interface UseIdeSelectionParams {
  /** The active session's working directory, used to filter foreign payloads. */
  currentWorkingDir: string;
}

export interface UseIdeSelectionResult {
  /** The latest IDE selection for the current working dir, or null. */
  currentSelection: IdeSelectionPayload | null;
}

/** Strip a single trailing slash so two working-dir spellings compare equal. */
function normalizeDir(dir: string): string {
  return dir.replace(/\/+$/, '');
}

/** Validate an IPC payload as an IdeSelectionPayload (no `unknown` leaks). */
export function parseIdeSelectionPayload(
  raw: Record<string, unknown> | undefined,
): IdeSelectionPayload | null {
  if (!raw) return null;
  const { absolutePath, relativePath, startLine, endLine, selectedText, workingDir, isGitignored } = raw;
  // An empty relativePath is meaningful, not malformed: it is how the IDE says
  // nothing is open, which is what lets the chip empty again after the last tab
  // closes. Null here still means "could not read this payload".
  if (typeof relativePath !== 'string') return null;
  if (typeof workingDir !== 'string') return null;
  return {
    absolutePath: typeof absolutePath === 'string' ? absolutePath : '',
    relativePath,
    startLine: typeof startLine === 'number' ? startLine : null,
    endLine: typeof endLine === 'number' ? endLine : null,
    selectedText: typeof selectedText === 'string' ? selectedText : null,
    workingDir,
    isGitignored: typeof isGitignored === 'boolean' ? isGitignored : false,
  };
}

/**
 * Subscribe to backend `IDE_SELECTION` pushes and expose the latest selection
 * for the current working directory.
 *
 * - Filters out payloads from a different working directory (trailing-slash
 *   tolerant), mirroring useEditorContext's normalizeDir filter.
 * - Tracks the working dir via a ref so the subscription is created once and
 *   still reads fresh state inside the handler.
 * - NEVER inserts text — it only updates state for the context chip.
 */
export function useIdeSelection(params: UseIdeSelectionParams): UseIdeSelectionResult {
  const { currentWorkingDir } = params;
  const { subscribe } = useBridgeContext();

  const [currentSelection, setCurrentSelection] = useState<IdeSelectionPayload | null>(null);

  const currentWorkingDirRef = useRef(currentWorkingDir);
  currentWorkingDirRef.current = currentWorkingDir;

  useEffect(() => {
    return subscribe(MessageType.IDE_SELECTION, (message) => {
      const payload = parseIdeSelectionPayload(message.payload);
      if (!payload) return;

      // Working-dir filter (trailing-slash tolerant).
      if (normalizeDir(payload.workingDir) !== normalizeDir(currentWorkingDirRef.current)) {
        return;
      }

      // No path means the IDE has nothing open — clear the chip rather than
      // leaving it naming a file the user already closed.
      setCurrentSelection(payload.relativePath.length === 0 ? null : payload);
    });
  }, [subscribe]);

  return { currentSelection };
}

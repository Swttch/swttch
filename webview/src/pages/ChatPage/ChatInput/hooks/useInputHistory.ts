import { useState, useCallback, useRef, useEffect } from 'react';
import { useBridge } from '@/hooks/useBridge';
import { MessageType, isQueueOperation } from '@/shared';
import { getTextContent, type LoadedMessageDto } from '@/types';

/**
 * How close to the end of the loaded history the cursor may get before the next
 * page is fetched. Small, because a page is 20: the fetch starts while the user
 * still has entries left to walk through, so the next Up press finds them there.
 */
const PREFETCH_MARGIN = 3;

/**
 * The text of one prompt entry, whichever shape the CLI wrote it in.
 *
 * A prompt typed while a turn was running has no `user` entry to read: the CLI
 * only recorded queue bookkeeping, which carries the text at the top level
 * instead of under `message.content`. Reading just one of the two shapes is what
 * made those prompts skip in the walk.
 */
function promptTextOf(entry: Record<string, unknown>): string {
  if (isQueueOperation(entry)) return typeof entry.content === 'string' ? entry.content : '';
  return getTextContent(entry as unknown as LoadedMessageDto);
}

interface PromptHistoryResponse {
  status: string;
  entries?: Record<string, unknown>[];
  hasMore?: boolean;
  oldestUuid?: string;
  error?: string;
}

interface UseInputHistoryArgs {
  workingDirectory: string | null | undefined;
  sessionId: string | null;
}

interface UseInputHistoryReturn {
  /** Record a prompt the user just sent, so Up finds it without a round trip. */
  pushToHistory: (value: string) => void;
  /** The previous prompt, or null when there is none (the key then falls through). */
  navigateUp: (currentValue: string) => string | null;
  /** The next prompt, or the draft that was being written when navigation began. */
  navigateDown: () => string | null;
  /** Abandon navigation and forget the saved draft. */
  resetHistory: () => void;
  isEmpty: boolean;
  isNavigating: boolean;
}

/**
 * The composer's up/down-arrow prompt history, for the current session only.
 *
 * The prompts come from the backend rather than from the loaded transcript. They
 * have to: a transcript page is 50 *entries*, and entries are overwhelmingly
 * tool_result plumbing, so measured over 119 sessions of this repo only 129 of
 * 3,190 typed prompts (4%) fall inside the newest page — and in the largest
 * session, none of its 193 prompts did. Deriving the history from `messages`, the
 * way this hook used to, therefore produced an empty or near-empty list for any
 * resumed session.
 *
 * Pages arrive newest-first and are appended as the user walks back, so opening a
 * session costs one small request instead of the whole prompt list (which reaches
 * 21MB for a session whose prompts carry pasted screenshots).
 */
export function useInputHistory({
  workingDirectory,
  sessionId,
}: UseInputHistoryArgs): UseInputHistoryReturn {
  const { send } = useBridge();

  // Prompts fetched from the backend, newest first.
  const [fetched, setFetched] = useState<string[]>([]);
  // Prompts sent from this composer since the session was loaded, newest first.
  // Kept apart from `fetched` because the backend only learns about them once the
  // CLI has written them to the transcript; holding them here means Up finds the
  // prompt just sent immediately, with no round trip and no re-fetch.
  const [localSent, setLocalSent] = useState<string[]>([]);

  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [unsavedDraft, setUnsavedDraft] = useState<string>('');

  // Paging state lives in refs: it changes as pages land but must never re-render
  // the composer, and the fetch callback reads the current values directly.
  const cursorRef = useRef<string | undefined>(undefined);
  const hasMoreRef = useRef(false);
  const loadingRef = useRef(false);
  // Guards against a page from a session the user has already left being applied
  // to the session they moved to.
  const loadedSessionRef = useRef<string | null>(null);

  const fetchPage = useCallback(async (targetSessionId: string, beforeUuid?: string) => {
    if (!workingDirectory || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await send<PromptHistoryResponse>(MessageType.LOAD_PROMPT_HISTORY, {
        workingDir: workingDirectory,
        sessionId: targetSessionId,
        beforeUuid,
      });
      if (res.status !== 'ok') return;
      if (loadedSessionRef.current !== targetSessionId) return;

      // The backend sends the entries untouched, in transcript order. Reverse to
      // newest-first (the order Up walks) and take the text here, where display
      // processing belongs.
      const texts = (res.entries ?? [])
        .map(promptTextOf)
        .filter(text => text.trim().length > 0)
        .reverse();

      hasMoreRef.current = !!res.hasMore;
      cursorRef.current = res.oldestUuid;
      setFetched(prev => (beforeUuid ? [...prev, ...texts] : texts));
    } catch {
      // A failed page leaves the history at whatever already loaded. Nothing to
      // report to the user: the arrow key simply stops finding older prompts.
    } finally {
      loadingRef.current = false;
    }
  }, [workingDirectory, send]);

  // The session this hook last reacted to. `undefined` means "not yet mounted",
  // which is distinct from `null` (mounted on a session that does not exist yet).
  const previousSessionRef = useRef<string | null | undefined>(undefined);

  // Load the newest page when the session changes, and drop everything the
  // previous session had.
  useEffect(() => {
    const previous = previousSessionRef.current;
    previousSessionRef.current = sessionId;
    // Kept current in both branches: it is what tells a landing page which
    // session it belongs to, and a session born here still pages later.
    loadedSessionRef.current = sessionId;

    // A null → id change is not a switch to another conversation: it is this
    // composer's own session coming into existence, created by the prompt that
    // was just sent. Everything below would throw that prompt away and then ask
    // the backend for a transcript that either does not have it yet or has it
    // already — a lost entry or a duplicated one. A session born here has no
    // history but what was typed here, so leave it alone.
    if (previous === null && sessionId) return;

    setFetched([]);
    setLocalSent([]);
    setHistoryIndex(-1);
    setUnsavedDraft('');
    cursorRef.current = undefined;
    hasMoreRef.current = false;
    loadingRef.current = false;

    if (!sessionId || !workingDirectory) return;
    void fetchPage(sessionId);
  }, [sessionId, workingDirectory, fetchPage]);

  const pushToHistory = useCallback((value: string) => {
    setLocalSent(prev => [value, ...prev]);
    setHistoryIndex(-1);
    setUnsavedDraft('');
  }, []);

  const resetHistory = useCallback(() => {
    setHistoryIndex(-1);
    setUnsavedDraft('');
  }, []);

  const history = [...localSent, ...fetched];

  const navigateUp = useCallback((currentValue: string): string | null => {
    const combined = [...localSent, ...fetched];
    const newIndex = historyIndex + 1;
    if (newIndex >= combined.length) return null;

    if (historyIndex === -1) setUnsavedDraft(currentValue);
    setHistoryIndex(newIndex);

    // Start the next page while entries are still left to walk, so it is already
    // there by the time the cursor reaches the end.
    if (
      hasMoreRef.current &&
      sessionId &&
      newIndex >= combined.length - PREFETCH_MARGIN
    ) {
      void fetchPage(sessionId, cursorRef.current);
    }

    return combined[newIndex];
  }, [localSent, fetched, historyIndex, sessionId, fetchPage]);

  const navigateDown = useCallback((): string | null => {
    if (historyIndex === -1) return null;

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    if (newIndex === -1) return unsavedDraft;

    const combined = [...localSent, ...fetched];
    return combined[newIndex];
  }, [localSent, fetched, historyIndex, unsavedDraft]);

  return {
    pushToHistory,
    navigateUp,
    navigateDown,
    resetHistory,
    isEmpty: history.length === 0,
    isNavigating: historyIndex !== -1,
  };
}

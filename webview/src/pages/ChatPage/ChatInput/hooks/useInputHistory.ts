import { useState, useCallback, useRef, useEffect } from 'react';
import { useBridge } from '@/hooks/useBridge';
import { MessageType, restoreQueuedEntries } from '@/shared';
import type { LoadedMessageDto } from '@/types';
import { isUserSend } from '@/pages/ChatPage/paging';
import { recalledText } from '@/pages/ChatPage/sendText';
import type { SendIndexEntry } from '@/pages/ChatPage/sendList';

/**
 * How many sends beyond the one shown are kept ready. Small, because a page is 20: the fetch starts while there are
 * still sends left to walk through, so the next press finds them there.
 */
const PREFETCH_MARGIN = 3;

interface PromptHistoryResponse {
  status: string;
  entries?: Record<string, unknown>[];
}

interface UseInputHistoryArgs {
  workingDirectory: string | null | undefined;
  sessionId: string | null;
  /** Every send of the session, oldest first: the list the send index draws (see `buildEntries`). */
  sends: SendIndexEntry[];
}

/** What a step of the walk did. */
export type HistoryStep =
  /** The text to put in the composer: a send's, or the draft's. */
  | { text: string }
  /** The first press out of the draft only says what the next one does. */
  | 'guard'
  /** The send is still being read from the backend; the next press finds it. */
  | 'reading'
  /** There is nowhere to step to, and the key falls through. */
  | null;

interface UseInputHistoryReturn {
  /** One send back. From the draft, the first press arms the guard and the second one goes. */
  navigateUp: (currentValue: string) => HistoryStep;
  /** One send forward, or back to the draft that was being written when the walk began. */
  navigateDown: () => HistoryStep;
  /** Leave the history and forget the saved draft. */
  resetHistory: () => void;
  isNavigating: boolean;
  /**
   * Where the walk stands, counted over the sends alone: the newest is `total`, the oldest 1, and the draft has no
   * number. `total` is the number of ticks of the send index. Null while the composer holds the draft.
   */
  position: { index: number; total: number } | null;
  /** The next Up leaves the draft: the composer says so. */
  isGuarded: boolean;
  /** Anything but that next Up stands the guard down. */
  disarmGuard: () => void;
}

/**
 * The composer's Up and Down history of the current session.
 *
 * It walks the very list the send index draws, so a step of the history and a tick are always the same send (#735).
 * The transcript holds the newest sends; the ones further back are known by name only, and their text is read from
 * the backend a page at a time as the walk gets near them.
 */
export function useInputHistory({ workingDirectory, sessionId, sends }: UseInputHistoryArgs): UseInputHistoryReturn {
  const { send } = useBridge();

  /** The key of the send shown in the composer, or null while the composer holds the draft. */
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [isGuarded, setGuarded] = useState(false);
  const draftRef = useRef('');

  // What has been read from the backend, by send key. In refs: pages land without re-rendering the composer.
  const textsRef = useRef(new Map<string, string>());
  const askedRef = useRef(new Set<string>());
  // Guards against a page of a session the user has left being applied to the one they moved to.
  const sessionRef = useRef<string | null>(sessionId);

  const textFor = useCallback(
    (entry: SendIndexEntry) => (entry.message ? recalledText(entry.message) : textsRef.current.get(entry.key)),
    [],
  );

  const readPage = useCallback(async (beforeUuid: string | undefined) => {
    if (!workingDirectory || !sessionId) return;
    const asked = beforeUuid ?? '';
    if (askedRef.current.has(asked)) return;
    askedRef.current.add(asked);
    try {
      const res = await send<PromptHistoryResponse>(MessageType.LOAD_PROMPT_HISTORY, {
        workingDir: workingDirectory,
        sessionId,
        beforeUuid,
      });
      if (res.status !== 'ok' || sessionRef.current !== sessionId) return;
      // The records arrive as the session file has them, and are read here the way the transcript reads them.
      for (const { entry } of restoreQueuedEntries(res.entries ?? [])) {
        const message = entry as unknown as LoadedMessageDto;
        if (message.uuid && isUserSend(message)) textsRef.current.set(message.uuid, recalledText(message));
      }
    } catch {
      // A failed page leaves the history at what already loaded; the next press asks again.
    } finally {
      askedRef.current.delete(asked);
    }
  }, [workingDirectory, sessionId, send]);

  /** Read what is missing of the sends at `from` and the few before it. */
  const ensure = useCallback((from: number) => {
    for (let i = from; i >= 0 && i > from - PREFETCH_MARGIN; i--) {
      if (textFor(sends[i]) !== undefined) continue;
      // A page ends just before its cursor, so the send after the missing one asks for it and the ones before it.
      void readPage(sends[i + 1]?.key);
      return;
    }
  }, [sends, textFor, readPage]);

  useEffect(() => {
    sessionRef.current = sessionId;
    textsRef.current = new Map();
    askedRef.current = new Set();
    draftRef.current = '';
    setShownKey(null);
    setGuarded(false);
  }, [sessionId]);

  const at = shownKey === null ? -1 : sends.findIndex((entry) => entry.key === shownKey);
  /** Where the walk stands in the list; past its end while the composer holds the draft. */
  const index = at === -1 ? sends.length : at;

  useEffect(() => {
    if (sends.length > 0) ensure(index - 1);
  }, [sends, index, ensure]);

  const resetHistory = useCallback(() => {
    draftRef.current = '';
    setShownKey(null);
    setGuarded(false);
  }, []);

  const disarmGuard = useCallback(() => setGuarded(false), []);

  const navigateUp = useCallback((currentValue: string): HistoryStep => {
    const target = index - 1;
    if (target < 0) return null;
    const fromDraft = index === sends.length;
    if (fromDraft && !isGuarded) {
      setGuarded(true);
      return 'guard';
    }
    const text = textFor(sends[target]);
    if (text === undefined) {
      ensure(target);
      return 'reading';
    }
    if (fromDraft) draftRef.current = currentValue;
    setGuarded(false);
    setShownKey(sends[target].key);
    return { text };
  }, [sends, index, isGuarded, textFor, ensure]);

  const navigateDown = useCallback((): HistoryStep => {
    if (index === sends.length) return null;
    const target = index + 1;
    if (target === sends.length) {
      setShownKey(null);
      return { text: draftRef.current };
    }
    const text = textFor(sends[target]);
    if (text === undefined) {
      ensure(target);
      return 'reading';
    }
    setShownKey(sends[target].key);
    return { text };
  }, [sends, index, textFor, ensure]);

  const isNavigating = index < sends.length;
  const position = isNavigating ? { index: index + 1, total: sends.length } : null;

  return { navigateUp, navigateDown, resetHistory, isNavigating, position, isGuarded, disarmGuard };
}

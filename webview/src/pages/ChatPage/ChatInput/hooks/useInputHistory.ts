import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useBridge } from '@/hooks/useBridge';
import { MessageType, restoreQueuedEntries, type ComposerContent } from '@/shared';
import type { LoadedMessageDto } from '@/types';
import { isUserSend } from '@/pages/ChatPage/paging';
import type { SendIndexEntry } from '@/pages/ChatPage/sendList';
import { sendContent } from '../draft/sendContent';
import type { HistorySlot } from '../draft/useComposerDraft';

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
  /** The send to show, or the draft when `slot` is null. */
  | { slot: HistorySlot | null }
  /** The first press out of the draft only says what the next one does. */
  | 'guard'
  /** The send is still being read from the backend; the next press finds it. */
  | 'reading'
  /** There is nowhere to step to, and the key falls through. */
  | null;

interface UseInputHistoryReturn {
  /** One send back. From the draft, the first press arms the guard and the second one goes. */
  navigateUp: () => HistoryStep;
  /** One send forward, or back to the draft. */
  navigateDown: () => HistoryStep;
  /** Leave the history. */
  resetHistory: () => void;
  /** The send shown, with what it held as sent, or null while the composer holds the draft. */
  slot: HistorySlot | null;
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

  // What has been read from the backend, by send key. In refs: pages land without re-rendering the composer.
  const contentsRef = useRef(new Map<string, ComposerContent>());
  const askedRef = useRef(new Set<string>());
  // Guards against a page of a session the user has left being applied to the one they moved to.
  const sessionRef = useRef<string | null>(sessionId);

  const contentFor = useCallback(
    (entry: SendIndexEntry) => (entry.message ? sendContent(entry.message) : contentsRef.current.get(entry.key)),
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
        if (message.uuid && isUserSend(message)) contentsRef.current.set(message.uuid, sendContent(message));
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
      if (contentFor(sends[i]) !== undefined) continue;
      // A page ends just before its cursor, so the send after the missing one asks for it and the ones before it.
      void readPage(sends[i + 1]?.key);
      return;
    }
  }, [sends, contentFor, readPage]);

  useEffect(() => {
    sessionRef.current = sessionId;
    contentsRef.current = new Map();
    askedRef.current = new Set();
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
    setShownKey(null);
    setGuarded(false);
  }, []);

  const disarmGuard = useCallback(() => setGuarded(false), []);

  /** Show the send at `target`, or say that it is still being read. */
  const stepTo = useCallback((target: number): HistoryStep => {
    const original = contentFor(sends[target]);
    if (original === undefined) {
      ensure(target);
      return 'reading';
    }
    setGuarded(false);
    setShownKey(sends[target].key);
    return { slot: { key: sends[target].key, original } };
  }, [sends, contentFor, ensure]);

  const navigateUp = useCallback((): HistoryStep => {
    const target = index - 1;
    if (target < 0) return null;
    if (index === sends.length && !isGuarded) {
      setGuarded(true);
      return 'guard';
    }
    return stepTo(target);
  }, [sends, index, isGuarded, stepTo]);

  const navigateDown = useCallback((): HistoryStep => {
    if (index === sends.length) return null;
    const target = index + 1;
    if (target === sends.length) {
      setShownKey(null);
      return { slot: null };
    }
    return stepTo(target);
  }, [sends, index, stepTo]);

  const shown = index < sends.length ? sends[index] : null;
  const original = shown ? contentFor(shown) : undefined;
  const slot = useMemo(
    () => (shown && original ? { key: shown.key, original } : null),
    // The send as it was sent does not change while it is shown; its text names it well enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown?.key, original?.text],
  );
  const position = shown ? { index: index + 1, total: sends.length } : null;

  return { navigateUp, navigateDown, resetHistory, slot, position, isGuarded, disarmGuard };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Side questions (`/btw`) and the window they are read in.
 *
 * A side question is answered by the CLI with a single `control_response`
 * (`subtype: side_question`) and never becomes part of the main conversation —
 * that is the whole point of the command. Appending the answer to the chat
 * made it look like a turn of the main agent and wedged it between that
 * agent's replies, so it lives here instead and is shown in its own window
 * above the chat, the way a background agent's transcript is.
 *
 * Exchanges are kept per session, in memory only. The CLI does not write side
 * questions to the session transcript either, so there is nothing to reload
 * them from — matching the terminal, where a `/btw` answer is gone once
 * dismissed.
 */

/** Dispatched on `window` to open or close the side-question window. */
export const TOGGLE_SIDE_QUESTION_EVENT = 'toggle-side-question';

/** `control_request` subtype that `/btw` is carried by. */
export const SIDE_QUESTION_SUBTYPE = 'side_question';

export enum SideQuestionStatus {
  /** Sent, waiting for the CLI's answer. */
  Pending = 'pending',
  Answered = 'answered',
  /**
   * No answer will come: the CLI answered with an error (its text is the
   * answer), or the question never reached it or the CLI ended before
   * answering (no answer text).
   */
  Failed = 'failed',
}

export interface SideQuestionExchange {
  /** The control_request id the answer will come back under. */
  requestId: string;
  sessionId: string;
  question: string;
  answer: string | null;
  status: SideQuestionStatus;
  /** The send was acknowledged: a CLI process has the question on its stdin. */
  delivered: boolean;
  askedAt: number;
  /** When the question stopped waiting (answered or failed); null while it still waits. */
  settledAt: number | null;
}

/** Where the window is: gone, on screen, or parked as a floating button in the corner. */
export enum SideQuestionWindowMode {
  Closed = 'closed',
  Open = 'open',
  Minimized = 'minimized',
}

interface SideQuestionContextValue {
  /** Exchanges for the session on screen, oldest first. */
  exchanges: SideQuestionExchange[];
  mode: SideQuestionWindowMode;
  /** The window is fully on screen (not closed, not parked). */
  isOpen: boolean;
  /** The window is parked as a floating button in the corner. */
  isMinimized: boolean;
  /** An answer settled while the window was parked, so the button can say so. */
  hasUnseen: boolean;
  /** Show the window, bringing it back if it was parked. */
  open: () => void;
  close: () => void;
  /** Park the window as a floating button in the corner. */
  minimize: () => void;
  /** Closed → open, open → closed, parked → open. */
  toggle: () => void;
  /** Record a question that has just been sent. */
  addQuestion: (entry: { requestId: string; sessionId: string; question: string }) => void;
  /** Settle a question with what the CLI said, or fail it. A settled question keeps its first outcome. */
  settleQuestion: (requestId: string, outcome: { status: SideQuestionStatus; answer?: string }) => void;
  /** Mark a question as received by the CLI process it was sent to. */
  markDelivered: (requestId: string) => void;
  /** Fail every question of a session still waiting for an answer — its CLI has ended. */
  failPending: (sessionId: string) => void;
  /** Fail the waiting questions an earlier CLI received — a new one has replaced it. */
  failDelivered: (sessionId: string) => void;
  /** Forget the side questions of the session on screen. */
  clear: () => void;
}

const SideQuestionContext = createContext<SideQuestionContextValue | null>(null);

interface SideQuestionProviderProps {
  /** The session on screen; exchanges of other sessions are kept but not shown. */
  currentSessionId: string | null;
  children: ReactNode;
}

export function SideQuestionProvider({ currentSessionId, children }: SideQuestionProviderProps) {
  const [all, setAll] = useState<SideQuestionExchange[]>([]);
  const [mode, setMode] = useState(SideQuestionWindowMode.Closed);
  // When the window was last parked; an answer settled after it is "unseen".
  const [minimizedAt, setMinimizedAt] = useState<number | null>(null);

  const open = useCallback(() => setMode(SideQuestionWindowMode.Open), []);
  const close = useCallback(() => setMode(SideQuestionWindowMode.Closed), []);
  const minimize = useCallback(() => {
    setMinimizedAt(Date.now());
    setMode(SideQuestionWindowMode.Minimized);
  }, []);
  const toggle = useCallback(
    () => setMode((m) => (m === SideQuestionWindowMode.Open ? SideQuestionWindowMode.Closed : SideQuestionWindowMode.Open)),
    [],
  );

  const addQuestion = useCallback(
    (entry: { requestId: string; sessionId: string; question: string }) => {
      setAll((prev) => [
        ...prev,
        {
          ...entry,
          answer: null,
          status: SideQuestionStatus.Pending,
          delivered: false,
          askedAt: Date.now(),
          settledAt: null,
        },
      ]);
    },
    [],
  );

  // Only a pending question is settled: the answer and the send's
  // acknowledgement travel on different channels and can land in either order,
  // and whichever comes second must not undo the first.
  const settleQuestion = useCallback(
    (requestId: string, outcome: { status: SideQuestionStatus; answer?: string }) => {
      setAll((prev) =>
        prev.map((e) =>
          e.requestId === requestId && e.status === SideQuestionStatus.Pending
            ? { ...e, status: outcome.status, answer: outcome.answer ?? e.answer, settledAt: Date.now() }
            : e,
        ),
      );
    },
    [],
  );

  const markDelivered = useCallback((requestId: string) => {
    setAll((prev) => prev.map((e) => (e.requestId === requestId ? { ...e, delivered: true } : e)));
  }, []);

  const failPending = useCallback((sessionId: string) => {
    setAll((prev) =>
      prev.map((e) =>
        e.sessionId === sessionId && e.status === SideQuestionStatus.Pending
          ? { ...e, status: SideQuestionStatus.Failed, settledAt: Date.now() }
          : e,
      ),
    );
  }, []);

  // A question not yet delivered is on its way to the new process, which will
  // answer it; only the ones the replaced process held are lost.
  const failDelivered = useCallback((sessionId: string) => {
    setAll((prev) =>
      prev.map((e) =>
        e.sessionId === sessionId && e.status === SideQuestionStatus.Pending && e.delivered
          ? { ...e, status: SideQuestionStatus.Failed, settledAt: Date.now() }
          : e,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    setAll((prev) => prev.filter((e) => e.sessionId !== currentSessionId));
  }, [currentSessionId]);

  // The keyboard shortcut and the command palette reach the window through
  // this event, so neither has to sit under this provider.
  useEffect(() => {
    const handle = () => toggle();
    window.addEventListener(TOGGLE_SIDE_QUESTION_EVENT, handle);
    return () => window.removeEventListener(TOGGLE_SIDE_QUESTION_EVENT, handle);
  }, [toggle]);

  const exchanges = useMemo(
    () => all.filter((e) => e.sessionId === currentSessionId),
    [all, currentSessionId],
  );

  const isMinimized = mode === SideQuestionWindowMode.Minimized;
  const hasUnseen =
    isMinimized && minimizedAt !== null && exchanges.some((e) => e.settledAt !== null && e.settledAt >= minimizedAt);

  const value = useMemo<SideQuestionContextValue>(
    () => ({
      exchanges,
      mode,
      isOpen: mode === SideQuestionWindowMode.Open,
      isMinimized,
      hasUnseen,
      open,
      close,
      minimize,
      toggle,
      addQuestion,
      settleQuestion,
      markDelivered,
      failPending,
      failDelivered,
      clear,
    }),
    [exchanges, mode, isMinimized, hasUnseen, open, close, minimize, toggle, addQuestion, settleQuestion, markDelivered, failPending, failDelivered, clear],
  );

  return <SideQuestionContext.Provider value={value}>{children}</SideQuestionContext.Provider>;
}

export function useSideQuestions(): SideQuestionContextValue {
  const ctx = useContext(SideQuestionContext);
  if (!ctx) throw new Error('useSideQuestions must be used within SideQuestionProvider');
  return ctx;
}

/** Same as {@link useSideQuestions}, but null outside the provider (tests, isolated renders). */
export function useOptionalSideQuestions(): SideQuestionContextValue | null {
  return useContext(SideQuestionContext);
}

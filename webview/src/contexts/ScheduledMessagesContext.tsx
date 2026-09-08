import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useBridgeContext } from './BridgeContext';
import { useSessionContext } from './SessionContext';
import { MessageType, type ScheduledMessage } from '@/shared';

interface ScheduledMessagesValue {
  /** The current session's reservations (all kinds), newest-relevant first. */
  reservations: ScheduledMessage[];
  /** True until the current session has an authoritative reservation list. */
  isLoading: boolean;
  /** Cancel a reservation by id. */
  cancel: (id: string) => void;
  // Panel UI state (mirrors WorkflowStateContext's Background tasks panel).
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  /** The reservation currently being edited (drives the edit popover), or null. */
  editing: ScheduledMessage | null;
  startEdit: (reservation: ScheduledMessage) => void;
  stopEdit: () => void;
}

const ScheduledMessagesContext = createContext<ScheduledMessagesValue | null>(null);

/**
 * Holds the current session's scheduled-message reservations plus the state for
 * the reservations panel (open/closed) and the edit flow. Sibling to
 * WorkflowStateContext: the backend already owns reservations (SCHEDULE /
 * CANCEL / UPDATE / GET_SCHEDULED_MESSAGES), so this context just requests the
 * list on session change and keeps it live via SCHEDULED_MESSAGE_UPDATED. Resets
 * on session change like the workflow panel.
 */
export function ScheduledMessagesProvider({ children }: { children: ReactNode }) {
  const { send, subscribe, isConnected } = useBridgeContext();
  const { currentSessionId } = useSessionContext();

  const [snapshot, setSnapshot] = useState<{ sessionId: string | null; reservations: ScheduledMessage[] }>({
    sessionId: null, reservations: [],
  });
  const isLoading = !!currentSessionId && (snapshot.sessionId !== currentSessionId || !isConnected);
  const reservations = useMemo(() => snapshot.sessionId === currentSessionId ? snapshot.reservations : [],
    [snapshot, currentSessionId]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);

  // Reset when the session changes (SSOT is the URL). The list is re-requested
  // by the effect below for the new session.
  useEffect(() => {
    setPanelOpen(false);
    setEditing(null);
  }, [currentSessionId]);

  // Request the current session's reservations, and keep them live via the
  // backend's SCHEDULED_MESSAGE_UPDATED broadcast (filtered to this session).
  useEffect(() => {
    if (!isConnected || !currentSessionId) return;

    let active = true;
    let receivedUpdate = false;
    const unsub = subscribe(MessageType.SCHEDULED_MESSAGE_UPDATED, (message) => {
      const p = message.payload as
        | { sessionId?: string; schedules?: ScheduledMessage[] }
        | undefined;
      if (!active || !p || p.sessionId !== currentSessionId) return;
      receivedUpdate = true;
      setSnapshot({ sessionId: currentSessionId, reservations: Array.isArray(p.schedules) ? p.schedules : [] });
    });

    void send(MessageType.GET_SCHEDULED_MESSAGES, { sessionId: currentSessionId })
      .then((res: { schedules?: ScheduledMessage[] }) => {
        // A previous session's reply and a snapshot older than a live update
        // must never replace the current reservation list.
        if (!active || receivedUpdate) return;
        setSnapshot({ sessionId: currentSessionId, reservations: Array.isArray(res?.schedules) ? res.schedules : [] });
      })
      .catch(() => {
        // Unknown is not empty. A subsequent broadcast can complete loading.
      });
    return () => { active = false; unsub(); };
  }, [isConnected, currentSessionId, send, subscribe]);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const startEdit = useCallback((reservation: ScheduledMessage) => setEditing(reservation), []);
  const stopEdit = useCallback(() => setEditing(null), []);

  const cancel = useCallback(
    (id: string) => {
      if (!currentSessionId) return;
      // The UPDATED broadcast refreshes the list; no optimistic mutation needed.
      void send(MessageType.CANCEL_SCHEDULED_MESSAGE, { sessionId: currentSessionId, id }).catch(
        () => {
          /* best-effort */
        },
      );
    },
    [currentSessionId, send],
  );

  const value = useMemo<ScheduledMessagesValue>(
    () => ({
      reservations,
      isLoading,
      cancel,
      panelOpen,
      openPanel,
      closePanel,
      editing,
      startEdit,
      stopEdit,
    }),
    [reservations, isLoading, cancel, panelOpen, openPanel, closePanel, editing, startEdit, stopEdit],
  );

  return (
    <ScheduledMessagesContext.Provider value={value}>
      {children}
    </ScheduledMessagesContext.Provider>
  );
}

export function useScheduledMessages(): ScheduledMessagesValue {
  const ctx = useContext(ScheduledMessagesContext);
  if (!ctx) throw new Error('useScheduledMessages must be used within a ScheduledMessagesProvider');
  return ctx;
}

import { useCallback, useEffect, useRef } from 'react';
import { MessageType } from '@/shared';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';

/**
 * Delivers due scheduled messages the SAME way a person sends one.
 *
 * The backend engine never writes to the CLI's stdin for a reservation; at
 * `sendAt` it picks one tab and pushes DELIVER_SCHEDULED_MESSAGE to it. This
 * hook is that tab's receiver: it runs the normal composer submit path
 * (`sendMessage`, identical to pressing send — optimistic render, SEND_MESSAGE,
 * broadcast) and, once sent, ACKs with SCHEDULED_MESSAGE_DELIVERED so the engine
 * drops the reservation. No ACK (tab died mid-delivery) → the engine keeps the
 * reservation and redelivers on the next attach (at-least-once).
 *
 * When the push carries `needsSessionSwitch`, the target session isn't the one
 * this tab is showing, so we navigate to it first and send once it becomes the
 * current session — mirroring a user switching tabs to that conversation before
 * typing.
 *
 * Mount ONCE where the chat contexts are available (ChatPage). It is always on,
 * independent of any limit banner, since a delivery can arrive at any time.
 */
export function useScheduledDelivery(): void {
  const { send, subscribe } = useBridgeContext();
  const { currentSessionId, inputMode, navigateToSession } = useSessionContext();
  const { sendMessage } = useChatStreamContext();

  // A delivery awaiting a session switch: once currentSessionId matches, send.
  const pendingRef = useRef<{ id: string; sessionId: string; message: string } | null>(null);
  // Read live values inside the async wait without re-subscribing.
  const inputModeRef = useRef(inputMode);
  inputModeRef.current = inputMode;
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  const sendRef = useRef(send);
  sendRef.current = send;

  const deliver = useCallback((id: string, sessionId: string, message: string) => {
    sendMessageRef.current(message, inputModeRef.current);
    // Fire-and-forget ACK: on loss the engine simply redelivers.
    void sendRef.current(MessageType.SCHEDULED_MESSAGE_DELIVERED, { id, sessionId });
  }, []);

  // Subscribe to delivery pushes. Only this tab receives them (the backend
  // targets one connection), so there's no cross-tab de-dup to do here.
  useEffect(() => {
    const unsub = subscribe(MessageType.DELIVER_SCHEDULED_MESSAGE, (msg) => {
      const p = msg.payload as
        | { id?: string; sessionId?: string; message?: string; needsSessionSwitch?: boolean }
        | undefined;
      if (!p?.id || !p.sessionId || typeof p.message !== 'string') return;

      if (p.needsSessionSwitch && p.sessionId !== currentSessionId) {
        // Navigate first; the effect below fires the send once the switch lands.
        pendingRef.current = { id: p.id, sessionId: p.sessionId, message: p.message };
        navigateToSession(p.sessionId);
        return;
      }
      deliver(p.id, p.sessionId, p.message);
    });
    return unsub;
  }, [subscribe, currentSessionId, navigateToSession, deliver]);

  // Complete a switch-then-send once the navigation has made the target session
  // current. Guarded so it fires exactly once per pending delivery.
  useEffect(() => {
    const pending = pendingRef.current;
    if (pending && pending.sessionId === currentSessionId) {
      pendingRef.current = null;
      deliver(pending.id, pending.sessionId, pending.message);
    }
  }, [currentSessionId, deliver]);
}

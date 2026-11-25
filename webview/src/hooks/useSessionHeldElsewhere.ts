import { useEffect, useState } from 'react';
import { MessageType } from '@/shared';
import { useBridge } from './useBridge';

/**
 * Whether the CLI of this session runs under another backend: one that belongs to another IDE project window, or to a
 * Swttch opened in a browser. This backend only watches such a session, so its chat cannot take what is typed.
 *
 * Read from the list of sessions the backend says another one holds (what it knows from the CLI registry): the
 * list as it is now, and again every time it changes. A session that falls out of the list (its holder let go of it)
 * stops counting at once, in every tab that was showing the bar.
 */
export function useSessionHeldElsewhere(sessionId: string | null | undefined): boolean {
  const { send, subscribe } = useBridge();
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // What it is now (a screen that attached midway never saw the announcement), and every change after.
    Promise.resolve(send(MessageType.GET_SESSION_ACTIVITY, {}))
      .then((res: { status?: string; heldElsewhere?: string[] } | undefined) => {
        if (!cancelled && res?.status === 'ok') setHeld(new Set(res.heldElsewhere ?? []));
      })
      .catch(() => undefined);
    const unsubscribe = subscribe(MessageType.SESSION_ACTIVITY_CHANGED, (message) => {
      setHeld(new Set((message.payload?.heldElsewhere as string[] | undefined) ?? []));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [send, subscribe]);

  return !!sessionId && held.has(sessionId);
}

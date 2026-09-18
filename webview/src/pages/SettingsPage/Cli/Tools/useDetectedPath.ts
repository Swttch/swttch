import { useState, useEffect } from 'react';
import { useBridge } from '@/hooks/useBridge';
import type { MessageType } from '@/shared';

/**
 * What the backend would use if the field beside it is left empty.
 *
 * Shown under the field rather than placed in it: putting the detected path in
 * the input would turn a value we found into a value the user appears to have
 * chosen, and it would stop following the machine the moment anything moved.
 *
 * A failed lookup reads as "nothing detected" rather than as an error. The
 * field still works, and a message about a lookup the user never asked for
 * would be noise on a screen they came to for something else.
 */
export function useDetectedPath(request: MessageType): string | null {
  const { send } = useBridge();
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => {
    send(request, {})
      .then((res) => setDetected((res?.path as string | null) ?? null))
      .catch(() => setDetected(null));
  }, [send, request]);

  return detected;
}

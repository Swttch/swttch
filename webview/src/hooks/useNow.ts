import { useEffect, useState } from 'react';

/**
 * Re-render every second while `active` so a live duration display keeps
 * ticking. Shared by the Background tasks panel's cards and
 * AgentTranscriptModal's header (issue #347 follow-up) so both read the same
 * running-duration clock.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

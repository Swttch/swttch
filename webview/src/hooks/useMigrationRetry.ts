import { useCallback, useEffect, useRef, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/**
 * A window that is active again is not asked to run the migrations again more often
 * than this. A failed run can be slow or fail the same way, so the gap is longer
 * than the one for unread folders.
 */
const RETRY_MIGRATIONS_MIN_GAP_MS = 15_000;

export interface MigrationRetry {
  /** Run the migrations again now. The "Try again" button calls this. */
  retry: () => Promise<void>;
  /** A run started by [retry] or by the window coming back is still going. */
  retrying: boolean;
}

/**
 * Runs the data migrations again after a run failed.
 *
 * There is no event that says a failure's cause is gone (a file another program held,
 * a disk that was full), so there are two ways in: the user presses "Try again", and
 * coming back to this window tries once by itself, since that is when someone who just
 * freed the disk or closed the other program is looking. The outcome reaches the
 * window through the migration status: the notice goes away when the run worked.
 *
 * [failed] says whether a run is failed; nothing is listened to otherwise.
 */
export function useMigrationRetry(failed: boolean): MigrationRetry {
  const { send, isConnected } = useBridgeContext();
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);
  const lastTryAt = useRef(0);

  const retry = useCallback(async () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    lastTryAt.current = Date.now();
    setRetrying(true);
    try {
      await send(MessageType.RETRY_MIGRATIONS, {});
    } catch {
      // A request that could not be answered leaves the failure showing, and the user can press again.
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  }, [send]);

  useEffect(() => {
    if (!isConnected || !failed) return;
    const comeBack = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastTryAt.current < RETRY_MIGRATIONS_MIN_GAP_MS) return;
      void retry();
    };
    window.addEventListener('focus', comeBack);
    document.addEventListener('visibilitychange', comeBack);
    return () => {
      window.removeEventListener('focus', comeBack);
      document.removeEventListener('visibilitychange', comeBack);
    };
  }, [isConnected, failed, retry]);

  return { retry, retrying };
}

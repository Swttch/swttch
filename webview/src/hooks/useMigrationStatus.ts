import { useEffect, useRef, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/**
 * The state of the data migrations the backend runs when it starts.
 *
 * `idle` is nearly always the answer: a run that is quick is never announced. A run
 * that is still going after a second is `running`, a run that stopped is `failed`
 * (and the library and the project list are held back with it), and a finished run
 * that could not read some old files is `done` with the folders it could not read.
 * While folders are unread the window asks the backend to read them again whenever it
 * becomes active, and the state returns to `idle` once they are read.
 */
export interface MigrationStatus {
  status: 'idle' | 'running' | 'failed' | 'done';
  /** The migration that failed, for `failed`. */
  failedMigration: string | null;
  /** Directories whose old files could not be read for lack of permission, for `done`. */
  unreadable: string[];
}

/** A window that is active again is not asked to read the folders more often than this. */
const RETRY_UNREAD_FOLDERS_MIN_GAP_MS = 5_000;

const IDLE: MigrationStatus = { status: 'idle', failedMigration: null, unreadable: [] };

function parse(payload: Record<string, unknown> | undefined): MigrationStatus {
  const status = payload?.status;
  if (status !== 'running' && status !== 'failed' && status !== 'done') return IDLE;
  return {
    status,
    failedMigration: typeof payload?.failedMigration === 'string' ? payload.failedMigration : null,
    unreadable: Array.isArray(payload?.unreadable)
      ? payload.unreadable.filter((folder): folder is string => typeof folder === 'string')
      : [],
  };
}

/**
 * Follows the migration status: asks for it once the connection is up (a window that
 * opens after a run began was not there for the push) and keeps following the pushes.
 */
export function useMigrationStatus(): MigrationStatus {
  const { subscribe, send, isConnected } = useBridgeContext();
  const [state, setState] = useState<MigrationStatus>(IDLE);

  useEffect(() => {
    if (!isConnected) return;
    const unsubscribe = subscribe(MessageType.MIGRATION_STATUS, (message) => {
      setState(parse(message.payload as Record<string, unknown> | undefined));
    });
    void send(MessageType.GET_MIGRATION_STATUS, {});
    return unsubscribe;
  }, [isConnected, subscribe, send]);

  // The user may have just allowed access to the folders in the system settings,
  // and coming back to this window is the moment that shows it. Nothing is asked of
  // them: the backend reads the folders again and the notice goes away by itself.
  const lastRetryAt = useRef(0);
  const hasUnread = state.status === 'done' && state.unreadable.length > 0;
  useEffect(() => {
    if (!isConnected || !hasUnread) return;
    const retry = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastRetryAt.current < RETRY_UNREAD_FOLDERS_MIN_GAP_MS) return;
      lastRetryAt.current = now;
      void send(MessageType.RETRY_UNREAD_FOLDERS, {});
    };
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [isConnected, hasUnread, send]);

  return state;
}

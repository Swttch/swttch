/**
 * Show a session's generated title (`ai-title`) the moment the CLI records it,
 * whenever that is.
 *
 * The CLI answers a `generate_session_title` request only after its own model
 * call ends, and a model it does not know (a gateway's) can keep that call
 * running past any limit we would set. The title is written to the transcript
 * all the same, and the screens never heard of it: they were told only through
 * the answer, which by then had been given up on (#638).
 *
 * So the answer is not what announces a title. The transcript is. This watches
 * the one file a session is recorded in and, when an `ai-title` is in it, asks
 * `getSessionEntry` (which names a session through resolveSessionTitle) what the
 * session is called and tells every screen. Nothing here guesses when the title
 * will appear or waits for a deadline.
 */
import { watch, existsSync, type FSWatcher } from 'fs';
import { join } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import { scanTail } from './extractSessionInfo';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import { getSessionEntry } from './getSessionEntry';

/** A burst of writes (the CLI appends several lines at once) is read once. */
const DEBOUNCE_MS = 200;

/** How often to look for a transcript that does not exist yet. */
const APPEAR_POLL_MS = 400;

/**
 * How long to look for a transcript that does not exist yet. A session's file
 * appears a few seconds after its first prompt; a session that never gets one
 * has no title to show.
 */
const APPEAR_TIMEOUT_MS = 120_000;

interface Watched {
  fsWatcher?: FSWatcher;
  timer?: ReturnType<typeof setTimeout>;
  stopped: boolean;
}

/** Per session, until its generated title has been announced. */
const watched = new Map<string, Watched>();

/** Stop watching [sessionId]'s transcript, if it is being watched. */
export function stopWatchingSessionTitle(sessionId: string): void {
  const entry = watched.get(sessionId);
  if (!entry) return;
  entry.stopped = true;
  entry.fsWatcher?.close();
  if (entry.timer) clearTimeout(entry.timer);
  watched.delete(sessionId);
}

/** Stop every watch. Used on shutdown and between tests. */
export function stopAllSessionTitleWatchers(): void {
  for (const sessionId of [...watched.keys()]) stopWatchingSessionTitle(sessionId);
}

/**
 * Tell every screen what [sessionId] is called, if its transcript holds a
 * generated title. Returns whether it did.
 */
export async function announceGeneratedTitle(
  connections: ConnectionManager,
  sessionId: string,
  workingDir: string,
): Promise<boolean> {
  const sessionsPath = await getProjectSessionsPath(workingDir);
  const { aiTitle } = await scanTail(join(sessionsPath, `${sessionId}.jsonl`));
  if (!aiTitle || aiTitle.trim() === '') return false;

  const entry = await getSessionEntry(workingDir, sessionId);
  if (!entry) return false;

  // `generated` is this app's own flag, not the CLI's: it tells the screen that the
  // title just arrived by itself, which is when it is drawn letter by letter. A name
  // the user typed, or chose with `/rename`, arrives without it.
  connections.broadcastToAll(MessageType.SESSIONS_UPDATED, {
    action: 'rename',
    session: {
      sessionId,
      title: entry.title,
      ...(entry.title === aiTitle ? { generated: true } : {}),
    },
  });
  stopWatchingSessionTitle(sessionId);
  return true;
}

/**
 * Watch [sessionId]'s transcript until a generated title is announced.
 * [onAnnounced] runs once when that happens. Asking again for a session that is
 * already watched changes nothing.
 */
export function watchSessionTitle(
  connections: ConnectionManager,
  sessionId: string,
  workingDir: string,
  onAnnounced: () => void,
): void {
  if (watched.has(sessionId)) return;
  const entry: Watched = { stopped: false };
  watched.set(sessionId, entry);

  const check = async (): Promise<void> => {
    try {
      if (entry.stopped) return;
      if (await announceGeneratedTitle(connections, sessionId, workingDir)) onAnnounced();
    } catch (err) {
      console.error('[node-backend]', `session title check failed for ${sessionId}:`, err);
    }
  };

  const attach = (file: string): void => {
    if (entry.stopped) return;
    try {
      entry.fsWatcher = watch(file, () => {
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => void check(), DEBOUNCE_MS);
        entry.timer.unref?.();
      });
      entry.fsWatcher.on('error', (err) => {
        console.error('[node-backend]', `session title watch failed for ${sessionId}:`, err);
        stopWatchingSessionTitle(sessionId);
      });
    } catch (err) {
      console.error('[node-backend]', `could not watch the transcript of ${sessionId}:`, err);
      stopWatchingSessionTitle(sessionId);
      return;
    }
    // The title may be in the file already, written before this watch began.
    void check();
  };

  const startedAt = Date.now();
  const waitForFile = (file: string): void => {
    if (entry.stopped) return;
    if (existsSync(file)) {
      attach(file);
      return;
    }
    if (Date.now() - startedAt >= APPEAR_TIMEOUT_MS) {
      stopWatchingSessionTitle(sessionId);
      return;
    }
    entry.timer = setTimeout(() => waitForFile(file), APPEAR_POLL_MS);
    entry.timer.unref?.();
  };

  getProjectSessionsPath(workingDir)
    .then((sessionsPath) => waitForFile(join(sessionsPath, `${sessionId}.jsonl`)))
    .catch((err) => {
      console.error('[node-backend]', `could not locate the transcript of ${sessionId}:`, err);
      stopWatchingSessionTitle(sessionId);
    });
}

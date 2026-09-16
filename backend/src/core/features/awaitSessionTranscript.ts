import { existsSync } from 'fs';
import { join } from 'path';
import { getProjectSessionsPath } from './getProjectSessionsPath';

/**
 * Wait for one session's transcript to appear on disk, then call back.
 *
 * The session list is built by reading the transcripts in a project's folder,
 * so a session that has no file yet cannot be listed no matter who asks. The
 * file is not written when the session starts: measured from a chat tab, the
 * session went `running` at epoch 910.582 and its `.jsonl` appeared at 915.032,
 * 4.45 seconds later. Announcing the session before then makes every listener
 * re-read a folder that still does not contain it.
 *
 * Watching ONE path rather than the folder is what keeps concurrent starts
 * apart. The backend spawns the CLI with `--session-id <sessionId>`
 * (claude-process.ts) and the list derives each id from its file name
 * (getSessionsList.ts), so `<project folder>/<sessionId>.jsonl` names exactly
 * one session. Ten sessions starting at once are ten independent waits with ten
 * different paths; none of them can be satisfied by another's file.
 */

/** How often the path is checked. */
const POLL_MS = 400;

/**
 * How long to keep checking before giving up.
 *
 * Giving up is not a failure state. The turn-end announcement that has always
 * been there still fires (claude-process.ts, on `result`), so the only thing
 * lost by stopping is the head start — which is what this is for, not what the
 * lists depend on.
 */
const TIMEOUT_MS = 120_000;

interface Wait {
  timer: NodeJS.Timeout;
  /** Cleared so a second call for the same session cannot start a second timer. */
  sessionId: string;
}

const waits = new Map<string, Wait>();

/**
 * Whether a wait is currently running for [sessionId]. Exposed for tests and
 * for callers that want to avoid queueing a second one.
 */
export function isAwaitingTranscript(sessionId: string): boolean {
  return waits.has(sessionId);
}

/** Stop waiting for [sessionId], if a wait is running. */
export function cancelTranscriptWait(sessionId: string): void {
  const wait = waits.get(sessionId);
  if (!wait) return;
  clearInterval(wait.timer);
  waits.delete(sessionId);
}

/** Stop every wait. Used on shutdown and between tests. */
export function cancelAllTranscriptWaits(): void {
  for (const wait of waits.values()) clearInterval(wait.timer);
  waits.clear();
}

/**
 * Call [onAppear] once [sessionId]'s transcript exists under [workingDir].
 *
 * Fires immediately when the file is already there, which is the ordinary case
 * for a session resumed with `--resume`: it ran before, so its transcript
 * predates this call.
 *
 * Idempotent per session — a second call while one is pending is ignored rather
 * than starting a second timer for the same path.
 */
export async function awaitSessionTranscript(
  sessionId: string,
  workingDir: string,
  onAppear: () => void,
): Promise<void> {
  if (waits.has(sessionId)) return;

  const dir = await getProjectSessionsPath(workingDir);
  const path = join(dir, `${sessionId}.jsonl`);

  if (existsSync(path)) {
    onAppear();
    return;
  }

  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (existsSync(path)) {
      cancelTranscriptWait(sessionId);
      onAppear();
      return;
    }
    if (Date.now() - startedAt >= TIMEOUT_MS) {
      console.error(
        '[node-backend]',
        `Gave up waiting for transcript of session ${sessionId} after ${TIMEOUT_MS}ms`,
      );
      cancelTranscriptWait(sessionId);
    }
  }, POLL_MS);
  // Never hold the process open for a file that may never arrive.
  timer.unref?.();

  waits.set(sessionId, { timer, sessionId });
}

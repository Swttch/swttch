import { join } from 'path';
import { stat } from 'fs/promises';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import { lastResponseAt } from './lastResponseAt';
import { lastReadAt } from './sessionReadLedger';

/**
 * Following sessions this backend does not run.
 *
 * A session can be worked on by a program this backend knows nothing about: a session the session-management
 * MCP woke with a message (it runs `claude -p --resume` by itself), one that runs in the Claude desktop app, one
 * a terminal has open. What such a program does reaches a screen only as new lines of the session's transcript,
 * and nothing tells the screen they came.
 *
 * Two kinds of session are looked at for each screen:
 *  - the one the screen shows: when its transcript grows the screen is told and reads it again, so it follows the
 *    session while it works instead of staying on what it read when it opened;
 *  - the ones its transcript points at (a card for a session Claude started): only what they are doing is kept.
 *
 * For both, the session counts as running for a short while after each growth; when that ends it is unread if its
 * last response came after the person last looked at it (see sessionReadLedger). A session this backend runs
 * itself is left alone: its own program streams everything, and the unread state it keeps is its own.
 */

/** How often the files are looked at. A transcript grows in bursts; this is what a person calls "at once". */
const DEFAULT_POLL_MS = 800;

/** A burst of writes is one piece of news. */
const DEFAULT_DEBOUNCE_MS = 250;

/** How long after its transcript last grew a session still counts as running. A turn writes at least this often. */
const DEFAULT_RUNNING_GRACE_MS = 6_000;

interface Tracked {
  sessionId: string;
  file: string;
  size: number;
  /** The screen shows this session: its growth is told to the screen, which reads it again. */
  shown: boolean;
  debounce?: ReturnType<typeof setTimeout>;
  runningUntil?: ReturnType<typeof setTimeout>;
}

interface ScreenFollowing {
  tracked: Map<string, Tracked>;
  poll?: ReturnType<typeof setInterval>;
  /** The folder the ids of the last `watchSessions` call were looked for in. */
  workingDir: string;
}

const screens = new Map<string, ScreenFollowing>();

export interface FollowTimings {
  pollMs?: number;
  debounceMs?: number;
  runningGraceMs?: number;
}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch {
    return 0; // not there yet: its first lines are then the first news
  }
}

/** Whether the session is unread: its last response came after the person last looked at it. */
export async function isUnread(sessionId: string, file: string): Promise<boolean> {
  return (await lastResponseAt(file)) > lastReadAt(sessionId);
}

function release(entry: Tracked, connections?: ConnectionManager): void {
  if (entry.debounce) clearTimeout(entry.debounce);
  if (entry.runningUntil) {
    clearTimeout(entry.runningUntil);
    connections?.setExternalRunning(entry.sessionId, false);
  }
}

function stopScreen(connectionId: string, connections?: ConnectionManager): void {
  const screen = screens.get(connectionId);
  if (!screen) return;
  screens.delete(connectionId);
  if (screen.poll) clearInterval(screen.poll);
  for (const entry of screen.tracked.values()) release(entry, connections);
}

/** The unread state of a session that stopped growing: kept for every screen, so that they all show the same. */
async function settle(entry: Tracked, connections: ConnectionManager): Promise<void> {
  if (connections.getProcess(entry.sessionId)) return;
  connections.setExternalDone(entry.sessionId, await isUnread(entry.sessionId, entry.file));
}

function onGrowth(
  connectionId: string,
  entry: Tracked,
  connections: ConnectionManager,
  debounceMs: number,
  graceMs: number,
): void {
  // A session this backend runs is streamed by its own program.
  if (connections.getProcess(entry.sessionId)) return;

  connections.setExternalDone(entry.sessionId, false);
  connections.setExternalRunning(entry.sessionId, true);
  if (entry.runningUntil) clearTimeout(entry.runningUntil);
  entry.runningUntil = setTimeout(() => {
    entry.runningUntil = undefined;
    connections.setExternalRunning(entry.sessionId, false);
    void settle(entry, connections);
  }, graceMs);
  entry.runningUntil.unref?.();

  if (entry.shown) {
    if (entry.debounce) clearTimeout(entry.debounce);
    entry.debounce = setTimeout(() => {
      entry.debounce = undefined;
      connections.sendTo(connectionId, MessageType.SESSION_EXTERNALLY_CHANGED, { sessionId: entry.sessionId });
    }, debounceMs);
    entry.debounce.unref?.();
  }
}

function startPolling(connectionId: string, screen: ScreenFollowing, connections: ConnectionManager, timings: FollowTimings): void {
  if (screen.poll) return;
  const pollMs = timings.pollMs ?? DEFAULT_POLL_MS;
  const debounceMs = timings.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const graceMs = timings.runningGraceMs ?? DEFAULT_RUNNING_GRACE_MS;
  let looking = false;
  screen.poll = setInterval(() => {
    if (looking) return; // a slow disk must not pile reads up
    looking = true;
    void Promise.all(
      [...screen.tracked.values()].map(async (entry) => {
        const size = await sizeOf(entry.file);
        if (screens.get(connectionId) !== screen || screen.tracked.get(entry.sessionId) !== entry) return;
        const before = entry.size;
        entry.size = size;
        if (size > before) onGrowth(connectionId, entry, connections, debounceMs, graceMs);
      }),
    ).finally(() => {
      looking = false;
    });
  }, pollMs);
  // Looking at a file must never be what keeps this process alive.
  screen.poll.unref?.();
}

async function track(
  connectionId: string,
  sessionId: string,
  workingDir: string,
  shown: boolean,
  connections: ConnectionManager,
  timings: FollowTimings,
): Promise<void> {
  let file: string;
  try {
    file = join(await getProjectSessionsPath(workingDir), `${sessionId}.jsonl`);
  } catch {
    return; // no folder to look in: nothing to follow
  }
  let screen = screens.get(connectionId);
  if (!screen) {
    screen = { tracked: new Map(), workingDir };
    screens.set(connectionId, screen);
  }
  const held = screen.tracked.get(sessionId);
  if (held) {
    held.shown = held.shown || shown;
    return;
  }
  const entry: Tracked = { sessionId, file, size: await sizeOf(file), shown };
  // The screen moved on (or let go of this session) while the file was being looked at.
  if (screens.get(connectionId) !== screen || screen.tracked.has(sessionId)) return;
  screen.tracked.set(sessionId, entry);
  startPolling(connectionId, screen, connections, timings);
  // What is already there: a session that answered while nobody looked is unread from the start.
  void settle(entry, connections);
}

/**
 * Start telling one connection when the transcript of `sessionId` grows, for as long as it shows that session.
 * Idempotent for the same session; a different session replaces the one shown before (the ones its cards point
 * at stay).
 */
export async function followSessionTranscript(
  connectionId: string,
  sessionId: string,
  workingDir: string,
  connections: ConnectionManager,
  timings: FollowTimings = {},
): Promise<void> {
  const screen = screens.get(connectionId);
  for (const entry of screen?.tracked.values() ?? []) {
    if (entry.shown && entry.sessionId !== sessionId) entry.shown = false;
  }
  await track(connectionId, sessionId, workingDir, true, connections, timings);
}

/**
 * Keep what the sessions a screen's transcript points at are doing (running, unread) up to date. Replaces the list
 * of the call before: a session the screen no longer points at, and does not show, is let go of.
 */
export async function watchSessions(
  connectionId: string,
  sessions: ReadonlyArray<{ sessionId: string; workingDir: string }>,
  connections: ConnectionManager,
  timings: FollowTimings = {},
): Promise<void> {
  const wanted = new Set(sessions.map((session) => session.sessionId));
  const screen = screens.get(connectionId);
  if (screen) {
    for (const [id, entry] of [...screen.tracked]) {
      if (entry.shown || wanted.has(id)) continue;
      release(entry, connections);
      screen.tracked.delete(id);
    }
  }
  await Promise.all(sessions.map(({ sessionId, workingDir }) => track(connectionId, sessionId, workingDir, false, connections, timings)));
}

/** Stop following for a screen: it closed. */
export function stopFollowingSessionTranscript(connectionId: string, connections?: ConnectionManager): void {
  stopScreen(connectionId, connections);
}

/** Forget every follow. For tests. */
export function resetSessionTranscriptFollowers(): void {
  for (const connectionId of [...screens.keys()]) stopScreen(connectionId);
}

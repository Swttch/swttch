import { join } from 'path';
import { stat } from 'fs/promises';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType, SessionActivity } from '../../shared';
import { askHolderActivity, isHeldByAnotherBackend } from '../forward-to-holder';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import { findSessionTranscript } from './findSessionTranscript';
import { userInputUnanswered } from './userInputUnanswered';
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

/** How often the project folders are searched for a transcript that is not where the screen's folder says. */
const LOOKUP_EVERY_MS = 3_000;

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
  /** When the file was last looked for in the other project folders (it was not where the screen's folder said). */
  lastLookup?: number;
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
  connections?.setHeldElsewhere(entry.sessionId, false);
}

/** The session does not work any more, as far as the backend that runs it says: it settles now, not after the grace. */
function stopRunning(entry: Tracked, connections: ConnectionManager): void {
  if (!entry.runningUntil) return;
  clearTimeout(entry.runningUntil);
  entry.runningUntil = undefined;
  connections.setExternalRunning(entry.sessionId, false);
  void settle(entry, connections);
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

/** The session counts as running for [graceMs] more; when that ends it settles (unread or not). */
function markRunning(entry: Tracked, connections: ConnectionManager, graceMs: number): void {
  connections.setExternalDone(entry.sessionId, false);
  connections.setExternalRunning(entry.sessionId, true);
  if (entry.runningUntil) clearTimeout(entry.runningUntil);
  entry.runningUntil = setTimeout(() => {
    entry.runningUntil = undefined;
    connections.setExternalRunning(entry.sessionId, false);
    void settle(entry, connections);
  }, graceMs);
  entry.runningUntil.unref?.();
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

  markRunning(entry, connections, graceMs);

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
        let size = await sizeOf(entry.file);
        // The file is not there: a session another session started for another project's folder is not in the folder
        // the screen knows. Looked for in every folder, not on every poll.
        if (size === 0 && Date.now() - (entry.lastLookup ?? 0) > LOOKUP_EVERY_MS) {
          entry.lastLookup = Date.now();
          const found = await findSessionTranscript(entry.sessionId, screen.workingDir);
          if (found && found !== entry.file) {
            entry.file = found;
            size = await sizeOf(found);
          }
        }
        if (screens.get(connectionId) !== screen || screen.tracked.get(entry.sessionId) !== entry) return;
        const before = entry.size;
        entry.size = size;
        if (size > before) onGrowth(connectionId, entry, connections, debounceMs, graceMs);
        // The transcript says nothing while a long tool call runs (a turn can be silent for minutes), so for the
        // session the screen shows, the backend that runs the CLI is asked whether the session is at work.
        if (entry.shown && !connections.getProcess(entry.sessionId)) {
          const holder = await askHolderActivity(entry.sessionId);
          if (screens.get(connectionId) !== screen || screen.tracked.get(entry.sessionId) !== entry) return;
          // Another backend runs it, whether or not it answered: this tab only watches the session, and the way on
          // (taking it over) must be there also for a holder that cannot be asked.
          connections.setHeldElsewhere(entry.sessionId, isHeldByAnotherBackend(entry.sessionId));
          if (holder) {
            const working =
              (holder.turnStartedAt !== undefined && holder.turnStartedAt !== null) ||
              holder.activity === SessionActivity.Running ||
              holder.activity === SessionActivity.Awaiting;
            if (working) markRunning(entry, connections, graceMs);
            else if (holder.turnStartedAt === null) {
              // It knows its own turns and says none is in flight. A message it was handed at the end of a turn starts
              // the next one at once, though that turn's first output comes seconds later: input the transcript shows
              // unanswered is a turn that is about to show itself, not work that is over.
              const pending = await userInputUnanswered(entry.file);
              if (screens.get(connectionId) !== screen || screen.tracked.get(entry.sessionId) !== entry) return;
              if (pending) markRunning(entry, connections, graceMs);
              else stopRunning(entry, connections);
            }
          }
        }
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
    // Where the session really is: the screen's folder, or else wherever a session started for another project is.
    file = (await findSessionTranscript(sessionId, workingDir)) ?? join(await getProjectSessionsPath(workingDir), `${sessionId}.jsonl`);
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

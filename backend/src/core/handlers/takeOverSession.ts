import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { ensureClaudeProcess, markSessionAsSpawned } from '../claude-process';
import { askHolderActivity, callHolder } from '../forward-to-holder';
import { findLiveCliForSession, killRegisteredCli } from '../cli-registry';
import { MessageType, SessionActivity } from '../../shared';

/** How long the holding backend gets to stop its CLI before the take-over gives up. */
const RELEASE_TIMEOUT_MS = 20_000;
/** How often `afterTurn` asks the holding backend whether its turn has ended. */
const AFTER_TURN_POLL_MS = 1_000;

/** Take-overs waiting for a turn to end, by session: the person can cancel the wait. */
const waiting = new Map<string, AbortController>();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The backend that holds the session's CLI, when it is another one than this. */
function otherHolder(sessionId: string) {
  const held = findLiveCliForSession(sessionId);
  if (!held?.ownerAlive || held.entry.owner.pid === process.pid) return null;
  return held.entry;
}

/**
 * What the holder is doing, in the words the confirmation uses. A turn the holder knows to be in flight counts as running
 * whatever the screens said; a holder too old to answer is read as running too (the careful reading).
 */
function holderActivity(answer: { activity?: string; turnStartedAt?: number | null } | undefined): string {
  if (!answer) return SessionActivity.Running;
  if (answer.activity === SessionActivity.Awaiting) return SessionActivity.Awaiting;
  if (typeof answer.turnStartedAt === 'number' || answer.activity === SessionActivity.Running) return SessionActivity.Running;
  return answer.activity ?? SessionActivity.Idle;
}

/**
 * GET_SESSION_HOLDER — who holds this session's CLI, when it is not this backend, and what it is doing.
 *
 * The take-over bar words its confirmation from this: a holder that is running a turn or waiting for an answer is
 * taken over differently from one that is idle, and the working folder and process id say which backend it is.
 */
export async function getSessionHolderHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const sessionId = (message.payload as { sessionId?: string } | undefined)?.sessionId;
  const entry = sessionId ? otherHolder(sessionId) : null;
  if (!sessionId || !entry) {
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok', holder: null });
    return;
  }
  const activity = await askHolderActivity(sessionId);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    holder: {
      activity: holderActivity(activity),
      workingDir: entry.workingDir,
      ownerPid: entry.owner.pid,
      reachable: entry.control !== undefined,
    },
  });
}

/**
 * TAKE_OVER_SESSION — run this session's CLI here, taking it from the backend that holds it.
 *
 * The holder stops its CLI the way a deliberate restart does (its screens are told the stream ended, no failure is
 * reported), and this backend starts its own at once, with the session resumed. Starting it here rather than at the
 * next message is what makes the tab that asked the new holder with no moment in between in which another tab could
 * start one.
 *
 * mode `now`: interrupt a turn in flight first. `afterTurn`: wait for it to end (cancel with CANCEL_TAKE_OVER_SESSION).
 * A holder that waits for an answer is not waited for: its turn ends only when someone answers there.
 * A holder that cannot be asked (too old, or hung) is stopped through the registry, which its screens show as a failure of the CLI.
 * The new CLI runs under the permission mode the holder's CLI ran under; the tab's own pick is only the fallback.
 */
export async function takeOverSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
): Promise<void> {
  const payload = message.payload as { sessionId?: string; mode?: string; workingDir?: string; inputMode?: string; model?: string } | undefined;
  const sessionId = payload?.sessionId;
  const reply = (extra: Record<string, unknown>) => {
    if (extra.status !== 'ok') console.error('[node-backend]', `Taking session ${sessionId} over ended: ${JSON.stringify(extra)}`);
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, ...extra });
  };
  if (!sessionId || (payload?.mode !== 'now' && payload?.mode !== 'afterTurn')) {
    reply({ status: 'error', error: 'sessionId and mode are required' });
    return;
  }

  const controller = new AbortController();
  waiting.set(sessionId, controller);
  try {
    const entry = otherHolder(sessionId);
    console.error('[node-backend]', `Taking session ${sessionId} over (${payload.mode}) from ${entry ? `backend PID ${entry.owner.pid}` : 'no other backend'}`);
    // The permission mode the holder's CLI runs under goes on: asked before the holder lets go, and the one thing this
    // backend must not fall back on its own default for (a session that asks before edits would start to run edits unasked).
    const holderBefore = entry ? await askHolderActivity(sessionId) : undefined;
    if (entry) {
      if (payload.mode === 'afterTurn') {
        for (;;) {
          if (controller.signal.aborted) {
            reply({ status: 'cancelled' });
            return;
          }
          const activity = await askHolderActivity(sessionId);
          if (activity?.activity === SessionActivity.Awaiting) {
            reply({ status: 'error', error: 'awaiting' });
            return;
          }
          if (!activity || (activity.turnStartedAt === null && activity.activity !== SessionActivity.Running)) break;
          await sleep(AFTER_TURN_POLL_MS);
        }
      }
      const released = await callHolder(sessionId, { action: 'release', interrupt: payload.mode === 'now' }, RELEASE_TIMEOUT_MS);
      if (released.result === 'held_but_unreachable') {
        // The holder cannot be asked (an older backend that wrote no address, or one that hangs or refuses): all there is
        // to do is stop its CLI from here, which the person has just asked for.
        await killRegisteredCli(entry);
      }
    }

    console.error('[node-backend]', `Session ${sessionId} is free of its holder; starting its CLI here`);
    // `||`, not `??`: a session this backend only watches can carry an empty folder, which must not win over the holder's.
    const workingDir = payload.workingDir || connections.getSession(sessionId)?.workingDir || entry?.workingDir;
    if (!workingDir) {
      reply({ status: 'error', error: 'workingDir is required' });
      return;
    }
    console.error('[node-backend]', `Starting the CLI of session ${sessionId} in ${workingDir}`);
    connections.subscribe(connectionId, sessionId, workingDir);
    // The session exists already: resume it rather than ask the CLI to create it.
    markSessionAsSpawned(sessionId);
    await ensureClaudeProcess(connections, connectionId, workingDir, sessionId, holderBefore?.inputMode ?? payload.inputMode, bridge, payload.model);
    if (!connections.getProcess(sessionId)) {
      reply({ status: 'error', error: 'cliNotStarted' });
      return;
    }
    connections.setHeldElsewhere(sessionId, false);
    console.error('[node-backend]', `Took session ${sessionId} over`);
    reply({ status: 'ok' });
  } catch (err) {
    console.error('[node-backend]', `Taking session ${sessionId} over failed:`, err);
    reply({ status: 'error', error: err instanceof Error ? err.message : String(err) });
  } finally {
    if (waiting.get(sessionId) === controller) waiting.delete(sessionId);
  }
}

/** CANCEL_TAKE_OVER_SESSION — stop waiting for the holder's turn to end. */
export function cancelTakeOverSessionHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const sessionId = (message.payload as { sessionId?: string } | undefined)?.sessionId;
  if (sessionId) waiting.get(sessionId)?.abort();
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
}

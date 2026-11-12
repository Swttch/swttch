import type { ConnectionManager } from '../../ws/connection-manager';
import { restartClaudeSessionProcess } from '../claude-process';
import { getQueuedMessages } from './messageQueue';
import { peekWorkflowTracker } from './workflow-tracker';

/**
 * How long every screen attached to a session has to stay hidden before its CLI may be stopped.
 * "Hidden" means not showing (another editor tab in front, a collapsed tool window), which is
 * not the same as a window that has merely lost keyboard focus.
 */
export const IDLE_HIDDEN_MS = 60_000;

/** How long the CLI has to have been quiet since its last turn ended before it may be stopped. */
export const IDLE_QUIET_MS = 60_000;

/**
 * Stop the CLI of every session nobody is looking at and nothing is waiting on.
 *
 * A session stays attached to its screens for as long as the screen exists, and a CLI per
 * attached screen is a process per open chat tab, which is what piles up on a host that many
 * people share (a Remote Development machine above all). A session is let go of when ALL hold:
 * every screen attached to it has been hidden for [IDLE_HIDDEN_MS]; its last turn ended and the
 * CLI has been silent for [IDLE_QUIET_MS]; it is not waiting for a person to answer (an open
 * permission, plan or question card); no message is queued for it; and no background work of its
 * own is running.
 *
 * Stopping is the same deliberate stop that precedes a settings change: no error and no
 * STREAM_END reaches the screens, and the next message respawns the CLI with `--resume`, so the
 * transcript is the same one. What the respawn needs (model, permission mode) travels on that
 * message, the effort the user picked belongs to the session and is passed again, and a card
 * still waiting for an answer is exactly the case this rule never stops.
 *
 * Returns the ids it stopped.
 */
export async function stopIdleSessions(
  connections: ConnectionManager,
  now: number = Date.now(),
): Promise<string[]> {
  const stopped: string[] = [];
  for (const sessionId of connections.idleSessionIds(IDLE_HIDDEN_MS, IDLE_QUIET_MS, now)) {
    if (getQueuedMessages(sessionId).length > 0) continue;
    if (peekWorkflowTracker()?.hasRunning(sessionId)) continue;
    const proc = connections.getSession(sessionId)?.process;
    if (!proc) continue;
    console.error(
      '[node-backend]',
      `Session ${sessionId} is hidden and idle; stopping its CLI until the next message`,
    );
    try {
      await restartClaudeSessionProcess(connections, sessionId, proc);
      stopped.push(sessionId);
    } catch (err) {
      console.error('[node-backend]', `Failed to stop idle CLI of ${sessionId}: ${String(err)}`);
    }
  }
  return stopped;
}

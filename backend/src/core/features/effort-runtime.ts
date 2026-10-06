/**
 * Tell a LIVE Claude CLI to run at a new effort level.
 *
 * Why this exists. A CLI is told its effort level once, when it starts (the
 * `--effort` flag, from the level the slider stored). A level picked afterwards
 * reaches nothing that is already running: measured on CLI 2.1.291, a process
 * spawned at `low` kept answering at `low` after the settings file said `high` and
 * then `xhigh`, turn after turn. Only `max` used to reach a running session, and
 * only because picking it restarted the CLI.
 *
 * Two ways reach a running CLI without restarting it, both measured:
 *
 * 1. `control_request{subtype:"apply_flag_settings"}` merges the given keys into
 *    the session-scoped flag layer. It leaves nothing in the transcript, takes
 *    `max` (which the settings file cannot hold) and `ultracode`, and `null`
 *    drops the override again. This is the fast path.
 * 2. The official `/effort <level>` slash command. It is what a terminal user
 *    types, and it works in a stream-json session too. It does leave two entries
 *    in the transcript (the command, and "Set effort level to ... (this session
 *    only)"), which is why it is the fallback and not the first choice.
 *
 * `apply_flag_settings` is not documented, so using it is a DELIBERATE EXCEPTION
 * to the "no dependence on unofficial support" principle in CLAUDE.md. The
 * exception, why it was granted and the conditions that withdraw it are recorded
 * in `docs/principle-exceptions/474-effort-apply-flag-settings.md`. Read that
 * before widening what this module relies on.
 *
 * It stays an optimisation rather than a dependency because every failure falls
 * through: no answer, an error answer or an unknown subtype goes to `/effort`, and
 * a change that reaches the CLI neither way is recorded so the next message
 * restarts it and the new CLI starts with `--effort` set to the stored level.
 * Slower, never wrong.
 */
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType, SessionActivity } from '../../shared';
import {
  EFFORT_LEVEL_UNKNOWN,
  resolveEffortFlag,
  sendControlRequestToProcess,
  sendMessageToProcess,
} from '../claude-process';
import {
  cancelControlResponse,
  nextControlRequestId,
  waitForControlResponse,
} from '../control-response-waiter';
import { sendAfterTurn } from './afterTurn';
import { cliTakesEffortFlag } from './cli-flag-support';

/**
 * How long to wait for the running CLI to answer. Short on purpose, for the
 * reason `mcp_status` is: the process is already up and the reply is local, so a
 * slow answer means the CLI is wedged, and waiting longer only delays the
 * fallback that would have worked.
 */
const APPLY_EFFORT_TIMEOUT_MS = 8_000;

/** What a CLI that predates the request answers with (measured on 2.1.45). */
const UNSUPPORTED_REQUEST = /unsupported control request subtype/i;

export interface EffortChange {
  /**
   * The level to run at, or null to drop the override so the CLI falls back to
   * what its settings files say. Absent leaves the level as it is.
   */
  effortLevel?: string | null;
  /** Ultracode on or off. Absent leaves it as it is. */
  ultracode?: boolean;
}

/**
 * How a change reached the session:
 * - `control_request`: the running CLI accepted it silently.
 * - `slash_command`: it went as the official `/effort` command, which shows in the chat.
 * - `not_running`: no CLI is running for the session, so there is nothing to tell. The
 *   level the user picked is stored, and the first spawn passes it as `--effort`.
 * - `undelivered`: a CLI is running and could not be told. The session is marked so the
 *   next message restarts it.
 */
export type EffortDelivery = 'control_request' | 'slash_command' | 'not_running' | 'undelivered';

/** The slash commands that make the same change as [change]. Official, and what a terminal user types. */
export function effortSlashCommands(change: EffortChange): string[] {
  const commands: string[] = [];
  if (change.effortLevel !== undefined) commands.push(`/effort ${change.effortLevel ?? 'auto'}`);
  if (change.ultracode !== undefined) commands.push(`/effort ultracode ${change.ultracode ? 'on' : 'off'}`);
  return commands;
}

/** Whether the session's CLI is partway through a turn. */
function turnIsInFlight(connections: ConnectionManager, sessionId: string): boolean {
  const activity = connections.getSession(sessionId)?.activity;
  return activity === SessionActivity.Running || activity === SessionActivity.Awaiting;
}

/**
 * Send [commands] to the CLI as ordinary user messages.
 *
 * A message written while a turn is running is dropped by the CLI when the turn
 * ends (see afterTurn), so during a turn they are held until `result`. Otherwise
 * they go straight away and are echoed to the chat, since the CLI does not echo user
 * messages back on stdout.
 */
function sendAsCommands(connections: ConnectionManager, sessionId: string, commands: string[]): boolean {
  const inFlight = turnIsInFlight(connections, sessionId);
  for (const content of commands) {
    if (inFlight) {
      sendAfterTurn(sessionId, content);
      continue;
    }
    if (!sendMessageToProcess(connections, sessionId, content)) return false;
    connections.broadcastToSession(sessionId, MessageType.USER_MESSAGE_BROADCAST, { content, sessionId });
  }
  return true;
}

/**
 * Record what the live CLI now runs at, in the terms the restart check compares: the
 * `--effort` flag a fresh spawn would pass for the same settings. That keeps a change
 * that reached the CLI from being undone by a restart the next message would otherwise
 * ask for.
 */
function recordDelivered(connections: ConnectionManager, sessionId: string, change: EffortChange): void {
  if (change.effortLevel === undefined) return;
  connections.setEffortLevel(sessionId, resolveEffortFlag({ effortLevel: change.effortLevel }) ?? null);
}

/**
 * Tell [sessionId]'s running CLI about [change]. Never throws: a failure is a
 * delivery the caller reports, not an error the user needs to see.
 */
export async function applyEffortToLiveCli(
  connections: ConnectionManager,
  sessionId: string,
  change: EffortChange,
): Promise<EffortDelivery> {
  if (!connections.getSession(sessionId)?.process?.stdin?.writable) return 'not_running';
  // A CLI that predates `--effort` has no effort levels to change (its model list says so, so the
  // slider is not drawn), and the level the session is recorded under would never match a spawn.
  if (!(await cliTakesEffortFlag())) return 'not_running';

  const settings: Record<string, unknown> = {};
  if (change.effortLevel !== undefined) settings.effortLevel = change.effortLevel;
  if (change.ultracode !== undefined) settings.ultracode = change.ultracode;
  if (Object.keys(settings).length === 0) return 'not_running';

  const requestId = nextControlRequestId('apply_flag_settings');
  const waiting = waitForControlResponse<unknown>(requestId, APPLY_EFFORT_TIMEOUT_MS);
  const written = sendControlRequestToProcess(connections, sessionId, requestId, {
    subtype: 'apply_flag_settings',
    settings,
  });
  if (!written) {
    cancelControlResponse(requestId);
    // Settle the abandoned waiter here so it neither lingers nor surfaces as an unhandled rejection.
    await waiting.catch(() => undefined);
    return 'not_running';
  }

  try {
    await waiting;
    recordDelivered(connections, sessionId, change);
    return 'control_request';
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // A CLI that does not know the request (2.1.38 through 2.1.49 answer `Unsupported control request
    // subtype`) has no `/effort` either: it replies `Unknown skill: effort`, which would land in the
    // chat as a stray message while the level stayed as it was. Straight to the restart instead.
    if (UNSUPPORTED_REQUEST.test(reason)) {
      console.error('[node-backend]', `apply_flag_settings is unknown to this CLI, restarting it for the new level: ${reason}`);
      connections.setEffortLevel(sessionId, EFFORT_LEVEL_UNKNOWN);
      return 'undelivered';
    }
    console.error('[node-backend]', `apply_flag_settings unavailable, falling back to /effort: ${reason}`);
  }

  if (sendAsCommands(connections, sessionId, effortSlashCommands(change))) {
    recordDelivered(connections, sessionId, change);
    return 'slash_command';
  }

  // Could not tell it either way. Marked so the next message restarts the CLI, and the
  // restart starts the new CLI with `--effort` set to the level, which is already stored.
  connections.setEffortLevel(sessionId, EFFORT_LEVEL_UNKNOWN);
  return 'undelivered';
}

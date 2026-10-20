import { Claude } from '../claude';
import type { ConnectionManager } from '../../ws/connection-manager';
import { sendControlRequestToProcess } from '../claude-process';
import {
  cancelControlResponse,
  nextControlRequestId,
  waitForControlResponse,
} from '../control-response-waiter';
import { sendAsCommands } from './effort-runtime';

/**
 * Renaming a session is the CLI's own rename, so the name lands in the
 * transcript as the `custom-title` entry every other client (the terminal, the
 * Claude Code extensions for VS Code and Cursor, the desktop app) reads. It is
 * never kept in a file of ours, which only this app could see. See issue #562.
 *
 * Two ways to ask the CLI, the quiet one first:
 *
 * 1. `control_request{subtype:"rename_session", source:"host"}` is how an IDE
 *    tells the CLI that the user renamed the session in the host's own UI. The
 *    CLI records the name and nothing else: no line is added to the
 *    conversation. It is not documented, so it is a DELIBERATE EXCEPTION to the
 *    core principle against undocumented protocols (see
 *    docs/principle-exceptions/562-generate-session-title.md).
 * 2. The official `/rename <name>` command, which is what a terminal user types.
 *    It records the same name, but as a command the user ran, so the
 *    conversation gains three lines: the command and the CLI's answer. It is the
 *    fallback for a CLI that does not know the request.
 *
 * Either way a CLI already running the session is the one told, never a second
 * one beside it: a running CLI keeps rewriting the name it holds at the end of
 * the transcript, so a rename written by anyone else could be written back over.
 * With none running, a CLI is started for the one request.
 */

/** The CLI caps a session name at 200 characters and turns control characters into spaces. */
const MAX_NAME_LENGTH = 200;

/** A running CLI answers locally, so a slow answer means it is wedged and the fallback should not wait for it. */
const LIVE_REQUEST_TIMEOUT_MS = 8_000;

/** A CLI started for the one request has to boot first. */
const RESUMED_TIMEOUT_MS = 30_000;

/** How long a CLI that has answered is given to exit on its own once its stdin is closed. */
const EXIT_GRACE_MS = 5_000;

/** How the CLI begins its answer to `/rename`; the answer is English whatever the UI language. */
const RENAMED_REPLY_PREFIX = 'Session renamed to:';

export type RenameDelivery =
  /** Asked of the CLI already running the session, with no line added to the conversation. */
  | 'request_to_live_cli'
  /** Asked of a CLI started for this one request, with no line added to the conversation. */
  | 'request_to_resumed_cli'
  /** The official `/rename`, sent to the CLI already running the session. It shows in the chat. */
  | 'command_to_live_cli'
  /** The official `/rename`, run by a CLI started for it. It leaves lines in the transcript. */
  | 'command_to_resumed_cli';

/**
 * The name as the CLI will keep it: one line, no longer than the CLI allows.
 * Done here so the title we show at once is the one the CLI then reports.
 */
export function normalizeSessionName(title: string): string {
  return Array.from(title.replace(/\s+/g, ' ').trim()).slice(0, MAX_NAME_LENGTH).join('').trim();
}

/** The slash command a terminal user types to give the session [title] as its name. */
export function renameCommand(title: string): string {
  return `/rename ${normalizeSessionName(title)}`;
}

/**
 * Give [sessionId] the name [title].
 *
 * @throws when neither way reached the CLI, or the CLI did not confirm the rename.
 */
export async function renameSessionThroughCli(
  connections: ConnectionManager,
  sessionId: string,
  title: string,
  workingDir: string,
): Promise<RenameDelivery> {
  const name = normalizeSessionName(title);
  const live = Boolean(connections.getSession(sessionId)?.process?.stdin?.writable);

  const attempts: Array<() => Promise<RenameDelivery>> = live
    ? [() => requestRenameFromLiveCli(connections, sessionId, name)]
    : [
        () => requestRenameFromResumedCli(sessionId, name, workingDir, true),
        // A CLI older than `--restricted` (2.1.150 measured) exits before it answers, yet
        // it answers `rename_session` itself, so the request is tried once more without
        // the flag. Only then is the fallback reached, which such a CLI cannot do: its
        // `/rename` replies "isn't available in this environment" and renames nothing.
        () => requestRenameFromResumedCli(sessionId, name, workingDir, false),
      ];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      console.error(
        '[node-backend]',
        `rename_session unavailable, trying the next way: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (live && sendAsCommands(connections, sessionId, [renameCommand(name)])) return 'command_to_live_cli';
  await runRenameCommandInResumedCli(sessionId, renameCommand(name), workingDir);
  return 'command_to_resumed_cli';
}

function renameRequest(sessionId: string, name: string): Record<string, unknown> {
  return { subtype: 'rename_session', title: name, source: 'host', session_id: sessionId };
}

async function requestRenameFromLiveCli(
  connections: ConnectionManager,
  sessionId: string,
  name: string,
): Promise<RenameDelivery> {
  const requestId = nextControlRequestId('rename_session');
  const waiting = waitForControlResponse<unknown>(requestId, LIVE_REQUEST_TIMEOUT_MS);
  const written = sendControlRequestToProcess(connections, sessionId, requestId, renameRequest(sessionId, name));
  if (!written) {
    cancelControlResponse(requestId);
    // Settle the abandoned waiter here, so it neither lingers nor surfaces as an unhandled rejection.
    await waiting.catch(() => undefined);
    throw new Error('the running CLI could not be written to');
  }
  await waiting;
  return 'request_to_live_cli';
}

/**
 * Start a CLI for the one request: `claude -p --resume <id>` in stream-json mode,
 * which continues the same session rather than creating one. The request goes in
 * as the first line; once the CLI has answered, closing its stdin ends it. It
 * makes no model call.
 */
async function requestRenameFromResumedCli(
  sessionId: string,
  name: string,
  workingDir: string,
  restricted: boolean,
): Promise<RenameDelivery> {
  const proc = await Claude.spawnAuthed(
    [
      '-p',
      '--resume',
      sessionId,
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      // Nothing here needs the user's hooks, tools or settings files, so the CLI is
      // started without them: measured on 2.1.304, it answers in 0.8s against 1.3s and
      // runs none of the user's SessionStart hooks.
      ...(restricted ? ['--restricted'] : []),
    ],
    workingDir,
    {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { TERM: 'dumb', CI: 'true', CLAUDECODE: undefined },
    },
  );
  const requestId = nextControlRequestId('rename_session');

  await new Promise<void>((resolve, reject) => {
    let buffered = '';
    let stderr = '';
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const finish = (fn: () => void): void => {
      settle(fn);
      // The answer is in; closing stdin is what lets the CLI exit. The grace timer is
      // for one that does not, so it cannot linger.
      proc.stdin?.end();
      const killer = setTimeout(() => Claude.killTree(proc), EXIT_GRACE_MS);
      proc.once('close', () => clearTimeout(killer));
    };

    const timer = setTimeout(() => {
      settle(() => reject(new Error('claude rename_session timed out')));
      Claude.killTree(proc);
    }, RESUMED_TIMEOUT_MS);

    proc.stdout?.on('data', (chunk: Buffer) => {
      buffered += chunk.toString();
      let newline = buffered.indexOf('\n');
      while (newline !== -1) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf('\n');
        if (!line) continue;
        let event: { type?: string; response?: { subtype?: string; request_id?: string; error?: string } };
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type !== 'control_response' || event.response?.request_id !== requestId) continue;
        if (event.response.subtype === 'success') finish(resolve);
        else finish(() => reject(new Error(event.response?.error ?? 'rename_session was refused')));
      }
    });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (err) => settle(() => reject(err)));
    proc.on('close', (code) => settle(() => {
      reject(new Error(stderr.trim() || `claude exited with code ${code} before answering rename_session`));
    }));

    // A CLI that dies before reading the request closes the pipe on us; the
    // close handler already reports why it stopped.
    proc.stdin?.on('error', () => undefined);
    proc.stdin?.write(`${JSON.stringify({ type: 'control_request', request_id: requestId, request: renameRequest(sessionId, name) })}\n`);
  });

  return 'request_to_resumed_cli';
}

/**
 * The official `/rename`, in a CLI started for it: `claude -p --resume <id>`
 * reading the command from stdin, so the name needs no quoting on any platform.
 */
async function runRenameCommandInResumedCli(sessionId: string, command: string, workingDir: string): Promise<void> {
  const proc = await Claude.spawnAuthed(['-p', '--resume', sessionId, '--output-format', 'text'], workingDir, {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { TERM: 'dumb', CI: 'true', CLAUDECODE: undefined },
  });

  return new Promise<void>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => settle(() => {
      Claude.killTree(proc);
      reject(new Error('claude /rename timed out'));
    }), RESUMED_TIMEOUT_MS);

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (err) => settle(() => reject(err)));
    proc.on('close', (code) => settle(() => {
      if (code === 0 && stdout.trim().startsWith(RENAMED_REPLY_PREFIX)) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `claude /rename exited with code ${code}`));
    }));

    // A CLI that dies before reading the command closes the pipe on us; the
    // close handler already reports why it stopped.
    proc.stdin?.on('error', () => undefined);
    proc.stdin?.end(`${command}\n`);
  });
}

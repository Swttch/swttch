import { execFile, spawn } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * The Claude Code `fileSuggestion` setting lets a user override how the `@`
 * file-path index is built (settings.json):
 *
 *   "fileSuggestion": { "type": "command", "command": "<shell command>" }
 *
 * The command receives `{"query":"<text>"}` as JSON on stdin and prints
 * newline-separated project-relative file paths to stdout. This mirrors the
 * official CLI contract so a setting that works in `claude` also works here
 * (CLI parity). See https://code.claude.com/docs/en/settings.
 */
export interface FileSuggestionConfig {
  type: 'command';
  command: string;
}

/** Official CLI caps fileSuggestion output at 15 results. */
export const FILE_SUGGESTION_RESULT_CAP = 15;

/** How long to wait for a fileSuggestion command before giving up (ms). */
const COMMAND_TIMEOUT_MS = 5000;

/**
 * Extract a usable fileSuggestion command config from merged Claude settings,
 * or null when it is absent/malformed (caller then falls back to the built-in
 * file index).
 */
export function parseFileSuggestion(settings: Record<string, unknown>): FileSuggestionConfig | null {
  const raw = settings.fileSuggestion;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cfg = raw as Record<string, unknown>;
  if (cfg.type !== 'command') return null;
  if (typeof cfg.command !== 'string' || cfg.command.trim() === '') return null;
  return { type: 'command', command: cfg.command };
}

/**
 * Pick the shell used to run a fileSuggestion command. The command is a
 * free-form shell string (pipes, globs, quoting), so it must be handed to a
 * shell rather than spawned as argv — matching the CLI, which runs it under
 * bash (git bash on Windows) regardless of the user's default terminal.
 * Returns null when no suitable shell is found (Windows without git bash) so
 * the caller can fall back to the built-in index.
 */
async function resolveSuggestionShell(): Promise<{ shell: string; args: string[] } | null> {
  if (process.platform === 'win32') {
    const bash = await findGitBashOnWindows();
    return bash ? { shell: bash, args: ['-c'] } : null;
  }
  const shell = existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
  return { shell, args: ['-c'] };
}

/**
 * Locate git bash on Windows by deriving it from the resolved `git` executable
 * (standard Git for Windows layout: `<root>\cmd\git.exe` → `<root>\bin\bash.exe`).
 */
async function findGitBashOnWindows(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('where', ['git']);
    const gitExe = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!gitExe) return null;
    const gitRoot = path.dirname(path.dirname(gitExe));
    const candidates = [
      path.join(gitRoot, 'bin', 'bash.exe'),
      path.join(gitRoot, 'usr', 'bin', 'bash.exe'),
    ];
    return candidates.find((c) => existsSync(c)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Run a fileSuggestion command for `query` in `workingDir` and return the
 * project-relative file paths it prints, capped at `limit`. Rejects when no
 * shell is available, the command errors, or it exceeds the timeout.
 */
export async function runFileSuggestionCommand(
  command: string,
  query: string,
  workingDir: string,
  limit: number,
): Promise<string[]> {
  const shell = await resolveSuggestionShell();
  if (!shell) {
    throw new Error('No shell available to run fileSuggestion command');
  }

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(shell.shell, [...shell.args, command], {
      cwd: workingDir,
      // Give the command the same env the CLI hands its hooks, including the
      // project root, on top of the inherited environment.
      env: { ...process.env, CLAUDE_PROJECT_DIR: workingDir },
      timeout: COMMAND_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });

    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`fileSuggestion command exited with code ${code}: ${err.trim()}`));
    });

    child.stdin.on('error', () => {
      // A command that never reads stdin (and exits) makes the pipe EPIPE;
      // swallow it — the close handler decides success/failure.
    });
    child.stdin.write(JSON.stringify({ query }));
    child.stdin.end();
  });

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, limit);
}

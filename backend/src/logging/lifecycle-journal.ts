/**
 * A separate, tiny log of nothing but "a backend started" and "a backend stopped, because X".
 *
 * `server.log` cannot answer that question in practice. Every CLI event and every webview
 * message lands there too, so a day of ordinary use buries the handful of lifecycle lines
 * under megabytes of chat payload, and the payload quotes log lines back verbatim (a chat
 * about a crash contains the crash's own log text), which defeats grep. Rotation then
 * carries the interesting window away long before anyone goes looking. Working out why a
 * backend died on this machine took a Python pass over 41 files, and the answer had already
 * expired.
 *
 * So lifecycle events get their own file. Lines are short, one per event, and the file is
 * append-only, which keeps months of history in the space one chat exchange takes.
 *
 * Writes are synchronous on purpose. The most valuable line is the last one before the
 * process exits, and a buffered stream is exactly what loses it.
 */

import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DEFAULT_LOG_DIR = join(homedir(), '.claude-code-gui', 'logs');
const JOURNAL_FILENAME = 'lifecycle.log';

/** Values rendered as `key=value` after the event name. `undefined` entries are dropped. */
export type JournalFields = Record<string, string | number | boolean | undefined>;

export interface LifecycleJournal {
  record(event: string, fields?: JournalFields): void;
  /** Absolute path of the file being written, for pointing a reader at it. */
  path(): string;
}

/**
 * Render one journal line. Exported for tests: the format is the contract a human greps,
 * so it is asserted rather than assumed.
 */
export function formatJournalLine(timestamp: string, event: string, fields: JournalFields = {}): string {
  const parts = [timestamp, event];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    parts.push(`${key}=${formatValue(value)}`);
  }
  return parts.join(' ') + '\n';
}

/**
 * Keep every line one line and every field one token: a value carrying a space or a newline
 * would otherwise split into what reads as extra fields.
 */
function formatValue(value: string | number | boolean): string {
  const text = String(value);
  return /[\s=]/.test(text) ? JSON.stringify(text) : text;
}

export interface JournalDeps {
  logDir: string;
  now: () => Date;
  append: (path: string, line: string) => void;
  ensureDir: (path: string) => void;
}

const defaultDeps: JournalDeps = {
  logDir: DEFAULT_LOG_DIR,
  now: () => new Date(),
  append: (path, line) => appendFileSync(path, line, 'utf8'),
  ensureDir: (path) => mkdirSync(path, { recursive: true }),
};

/**
 * Open the journal. Failing to write to it must never take the backend down with it, so
 * every write swallows its error: a missing diagnostic is worth less than a running server.
 */
export function createLifecycleJournal(deps: Partial<JournalDeps> = {}): LifecycleJournal {
  const resolved: JournalDeps = { ...defaultDeps, ...deps };
  const filePath = join(resolved.logDir, JOURNAL_FILENAME);

  try {
    resolved.ensureDir(resolved.logDir);
  } catch {
    // Directory creation failing is reported by the first append instead.
  }

  return {
    record(event: string, fields: JournalFields = {}): void {
      try {
        resolved.append(filePath, formatJournalLine(resolved.now().toISOString(), event, fields));
      } catch {
        // Diagnostics must not be able to kill the process they diagnose.
      }
    },
    path(): string {
      return filePath;
    },
  };
}

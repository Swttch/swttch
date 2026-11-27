import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { ccgHomeDir } from '../../config/ccg-home';

/**
 * When the person last looked at each session, kept in a file of ours so that "read" survives a refresh, another
 * tab and a restart of this backend.
 *
 * A session whose last response came after the person last looked at it is unread. Nothing is unread from before
 * this record began: it keeps the moment it was first made (`baseline`), and a session never looked at since counts
 * as looked at on that day, so that a conversation full of old cards does not light up all at once.
 */
interface Ledger {
  baseline: number;
  read: Record<string, number>;
}

let cache: { path: string; ledger: Ledger } | null = null;

function ledgerPath(): string {
  return join(ccgHomeDir(), 'session-read.json');
}

function persist(path: string, ledger: Ledger): void {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporary, JSON.stringify(ledger));
    renameSync(temporary, path);
  } catch {
    // Not written: the answer is still right until this process ends.
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Nothing more to do: the next write by this process reuses the name.
    }
  }
}

function load(): Ledger {
  const path = ledgerPath();
  if (cache?.path === path) return cache.ledger;
  let ledger: Ledger | null = null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Ledger>;
    if (typeof parsed.baseline === 'number' && parsed.read && typeof parsed.read === 'object') {
      ledger = { baseline: parsed.baseline, read: parsed.read as Record<string, number> };
    }
  } catch {
    // No file yet, or one that cannot be read: a new record begins now.
  }
  if (!ledger) {
    ledger = { baseline: Date.now(), read: {} };
    persist(path, ledger);
  }
  cache = { path, ledger };
  return ledger;
}

/** The moment the person last looked at the session, or the day this record began when they never did. */
export function lastReadAt(sessionId: string): number {
  const ledger = load();
  return Math.max(ledger.read[sessionId] ?? 0, ledger.baseline);
}

/** The person looks at the session now. */
export function recordSessionRead(sessionId: string, at: number = Date.now()): void {
  const ledger = load();
  ledger.read[sessionId] = Math.max(ledger.read[sessionId] ?? 0, at);
  persist(cache?.path ?? ledgerPath(), ledger);
}

/** Forget what is held in memory, so the next read goes to the file. For tests. */
export function resetSessionReadLedger(): void {
  cache = null;
}

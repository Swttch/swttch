import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { createLifecycleJournal, formatJournalLine } from '../lifecycle-journal';

describe('formatJournalLine', () => {
  it('puts the timestamp and event first, then the fields', () => {
    expect(formatJournalLine('2026-09-02T04:00:00.000Z', 'start', { pid: 7, port: 9999 })).toBe(
      '2026-09-02T04:00:00.000Z start pid=7 port=9999\n',
    );
  });

  it('drops undefined fields rather than writing the word undefined', () => {
    expect(formatJournalLine('T', 'start', { pid: 7, webviewDir: undefined })).toBe('T start pid=7\n');
  });

  it('quotes a value containing whitespace so it stays one field', () => {
    // A path with a space would otherwise read as two fields to whoever greps this.
    expect(formatJournalLine('T', 'start', { dir: '/a b/c' })).toBe('T start dir="/a b/c"\n');
  });

  it('keeps every event on exactly one line', () => {
    const line = formatJournalLine('T', 'shutdown', { reason: 'a\nb' });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.slice(0, -1).includes('\n')).toBe(false);
  });

  it('renders booleans and numbers without quoting them', () => {
    expect(formatJournalLine('T', 'shutdown', { hostAttached: false, wsClients: 0 })).toBe(
      'T shutdown hostAttached=false wsClients=0\n',
    );
  });
});

describe('createLifecycleJournal', () => {
  function harness() {
    const written: Array<{ path: string; line: string }> = [];
    const journal = createLifecycleJournal({
      logDir: '/logs',
      now: () => new Date('2026-09-02T04:00:00.000Z'),
      append: (path, line) => written.push({ path, line }),
      ensureDir: () => undefined,
    });
    return { journal, written };
  }

  it('appends one line per event to lifecycle.log in the log dir', () => {
    const { journal, written } = harness();

    journal.record('start', { pid: 7 });

    // path.join uses the platform separator, so this must match production's
    // join('/logs', 'lifecycle.log') rather than a hardcoded posix path.
    expect(written).toEqual([
      { path: join('/logs', 'lifecycle.log'), line: '2026-09-02T04:00:00.000Z start pid=7\n' },
    ]);
  });

  it('reports the path it writes to', () => {
    const { journal } = harness();
    expect(journal.path()).toBe(join('/logs', 'lifecycle.log'));
  });

  it('swallows a write failure instead of taking the process down', () => {
    // The journal exists to explain a crash. It must never be able to cause one.
    const journal = createLifecycleJournal({
      logDir: '/logs',
      append: () => {
        throw new Error('disk full');
      },
      ensureDir: () => undefined,
    });

    expect(() => journal.record('shutdown', { reason: 'SIGTERM' })).not.toThrow();
  });

  it('still returns a usable journal when the log dir cannot be created', () => {
    const append = vi.fn();
    const journal = createLifecycleJournal({
      logDir: '/logs',
      append,
      ensureDir: () => {
        throw new Error('read-only');
      },
    });

    expect(() => journal.record('start')).not.toThrow();
    expect(append).toHaveBeenCalledTimes(1);
  });
});

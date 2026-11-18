import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { lastReadAt, recordSessionRead, resetSessionReadLedger } from '../sessionReadLedger';

/**
 * When the person last looked at each session, kept in a file so that it holds across a refresh, another tab and a
 * restart. Nothing is unread from before the record began.
 */
describe('sessionReadLedger', () => {
  let home = '';
  let before: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ccg-read-'));
    before = process.env.CCG_HOME;
    process.env.CCG_HOME = home;
    resetSessionReadLedger();
  });

  afterEach(() => {
    if (before === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = before;
    resetSessionReadLedger();
    rmSync(home, { recursive: true, force: true });
  });

  it('counts a session never looked at as looked at on the day the record began', () => {
    const began = Date.now();
    const at = lastReadAt('never-looked');

    expect(at).toBeGreaterThanOrEqual(began - 5);
    expect(at).toBeLessThanOrEqual(Date.now() + 5);
  });

  it('keeps the moment a session was looked at, and does not take it back', () => {
    recordSessionRead('child', Date.now() + 10_000);
    recordSessionRead('child', Date.now() + 5_000);

    expect(lastReadAt('child')).toBeGreaterThanOrEqual(Date.now() + 9_000);
  });

  it('holds across a restart: the next process reads the same file', () => {
    recordSessionRead('child', Date.now() + 10_000);
    const first = lastReadAt('child');
    expect(JSON.parse(readFileSync(join(home, 'session-read.json'), 'utf8')).read.child).toBeDefined();

    resetSessionReadLedger();

    expect(lastReadAt('child')).toBe(first);
  });

  it('keeps the day the record began, not the day it was read again', () => {
    const first = lastReadAt('x');
    resetSessionReadLedger();

    expect(lastReadAt('x')).toBe(first);
  });
});

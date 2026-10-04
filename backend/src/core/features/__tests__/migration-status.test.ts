import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MigrationFailedError } from '../../entities/migration/MigrationGate';
import { MigrationRunResult } from '../../entities/migration/MigrationRunner';
import { MigrationStatus, MigrationStatusPayload } from '../migration-status';

describe('MigrationStatus', () => {
  let status: MigrationStatus;
  let sent: MigrationStatusPayload[];

  beforeEach(() => {
    vi.useFakeTimers();
    status = new MigrationStatus();
    sent = [];
    status.attach((payload) => sent.push(payload));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const finishedOk = (unreadable: string[] = []) => new MigrationRunResult(['m'], null, unreadable, 10);
  const finishedBad = () =>
    new MigrationRunResult([], new MigrationFailedError('20260101000000_first', 'boom'), [], 10);

  it('starts idle', () => {
    expect(status.snapshot().status).toBe('idle');
  });

  describe('a run that is quick', () => {
    it('shows nothing, which is nearly every start', () => {
      status.started(['m']);
      vi.advanceTimersByTime(MigrationStatus.SHOW_AFTER_MS - 1);
      status.finished(finishedOk());

      vi.advanceTimersByTime(10_000);

      expect(sent).toEqual([]);
      expect(status.snapshot().status).toBe('idle');
    });
  });

  describe('a run that takes long', () => {
    it('is announced as running once it has gone on for the threshold, with what is due', () => {
      status.started(['a', 'b']);

      vi.advanceTimersByTime(MigrationStatus.SHOW_AFTER_MS);

      expect(sent).toEqual([new MigrationStatusPayload('running', ['a', 'b'])]);
      expect(status.snapshot().status).toBe('running');
    });

    it('is cleared when it ends, so the banner goes away', () => {
      status.started(['a']);
      vi.advanceTimersByTime(MigrationStatus.SHOW_AFTER_MS);

      status.finished(finishedOk());

      expect(sent.at(-1)?.status).toBe('idle');
      expect(status.snapshot().status).toBe('idle');
    });

    it('is announced only once', () => {
      status.started(['a']);

      vi.advanceTimersByTime(MigrationStatus.SHOW_AFTER_MS * 10);

      expect(sent.filter((payload) => payload.status === 'running')).toHaveLength(1);
    });
  });

  describe('folders that stay unread', () => {
    it('are shown after a run, and the notice goes away by itself once they are read', () => {
      status.started(['m']);
      status.finished(finishedOk(['/a', '/b']));
      expect(status.snapshot()).toEqual(new MigrationStatusPayload('done', [], null, null, ['/a', '/b']));

      status.unreadFolders(['/b']);
      expect(status.snapshot().unreadable).toEqual(['/b']);

      status.unreadFolders([]);
      expect(status.snapshot().status).toBe('idle');
    });

    it('are shown at a later start that no migration was due at, which is how a restart shows them again', () => {
      status.unreadFolders(['/a']);

      expect(status.snapshot()).toEqual(new MigrationStatusPayload('done', [], null, null, ['/a']));
    });

    it('are not announced twice when nothing changed', () => {
      status.unreadFolders(['/a']);
      status.unreadFolders(['/a']);

      expect(sent).toHaveLength(1);
    });

    it('are added to, not replaced, by a run that finds more', () => {
      status.unreadFolders(['/a']);
      status.started(['m']);
      status.finished(finishedOk(['/b']));

      expect(status.snapshot().unreadable).toEqual(['/a', '/b']);
    });

    it('survive a run that went on long enough to be announced', () => {
      status.unreadFolders(['/a']);
      status.started(['m']);
      vi.advanceTimersByTime(MigrationStatus.SHOW_AFTER_MS);
      status.finished(finishedOk());

      expect(status.snapshot()).toEqual(new MigrationStatusPayload('done', [], null, null, ['/a']));
    });

    it('do not cover over a failure', () => {
      status.started(['m']);
      status.finished(finishedBad());

      status.unreadFolders([]);

      expect(status.snapshot().status).toBe('failed');
    });
  });

  describe('a failure', () => {
    it('is shown at once with the migration and the reason, however quick the run was', () => {
      status.started(['20260101000000_first']);

      status.finished(finishedBad());

      expect(sent).toEqual([new MigrationStatusPayload('failed', [], '20260101000000_first', 'boom')]);
    });

    it('is cleared by a later run that works, even a quick one, so the notice does not outlive the failure', () => {
      status.started(['m']);
      status.finished(finishedBad());

      status.started(['m']);
      status.finished(finishedOk());

      expect(status.snapshot().status).toBe('idle');
      expect(sent.at(-1)?.status).toBe('idle');
    });

    it('stays when the later run fails again', () => {
      status.started(['m']);
      status.finished(finishedBad());

      status.started(['m']);
      status.finished(finishedBad());

      expect(status.snapshot().status).toBe('failed');
    });

    it('replaces the running announcement when the run fails after a long time', () => {
      status.started(['a']);
      vi.advanceTimersByTime(MigrationStatus.SHOW_AFTER_MS);

      status.finished(finishedBad());

      expect(sent.map((payload) => payload.status)).toEqual(['running', 'failed']);
    });

    it('is what a window that opens later is told', () => {
      status.started(['a']);
      status.finished(finishedBad());

      expect(status.snapshot()).toMatchObject({ status: 'failed', failedMigration: '20260101000000_first' });
    });
  });

  describe('folders that could not be read', () => {
    it('are shown after a finished run, however quick it was', () => {
      status.started(['a']);

      status.finished(finishedOk(['/Users/me/Documents/app']));

      expect(sent).toEqual([new MigrationStatusPayload('done', [], null, null, ['/Users/me/Documents/app'])]);
    });

    it('are what a window that opens later is told', () => {
      status.started(['a']);
      status.finished(finishedOk(['/x']));

      expect(status.snapshot()).toMatchObject({ status: 'done', unreadable: ['/x'] });
    });
  });

  describe('with nobody to tell', () => {
    it('keeps the state and does not throw', () => {
      const alone = new MigrationStatus();
      alone.started(['a']);

      expect(() => alone.finished(finishedBad())).not.toThrow();
      expect(alone.snapshot().status).toBe('failed');
    });
  });
});

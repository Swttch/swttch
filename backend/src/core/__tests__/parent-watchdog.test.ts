import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isParentDead, startParentWatchdog, type ParentWatchdogDeps } from '../parent-watchdog';

function errnoError(code: string): NodeJS.ErrnoException {
  const err = new Error(code) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe('isParentDead', () => {
  it('reports alive while ppid is unchanged and the probe succeeds', () => {
    expect(isParentDead(100, { getPpid: () => 100, probe: () => undefined })).toBe(false);
  });

  it('reports dead when the ppid changed (POSIX reparent to init/subreaper)', () => {
    expect(isParentDead(100, { getPpid: () => 1, probe: () => undefined })).toBe(true);
  });

  it('reports dead when the probe throws ESRCH (win32 frozen ppid)', () => {
    const probe = vi.fn(() => {
      throw errnoError('ESRCH');
    });
    expect(isParentDead(100, { getPpid: () => 100, probe })).toBe(true);
  });

  it('reports alive when the probe throws EPERM (process exists, not signalable)', () => {
    const probe = vi.fn(() => {
      throw errnoError('EPERM');
    });
    expect(isParentDead(100, { getPpid: () => 100, probe })).toBe(false);
  });
});

describe('startParentWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function deps(overrides: Partial<ParentWatchdogDeps>): ParentWatchdogDeps {
    return {
      getPpid: () => 100,
      probe: () => undefined,
      intervalMs: 10_000,
      ...overrides,
    };
  }

  it('does not fire while the parent lives', () => {
    const onDeath = vi.fn();
    startParentWatchdog(onDeath, deps({}));
    vi.advanceTimersByTime(60_000);
    expect(onDeath).not.toHaveBeenCalled();
  });

  it('fires once when the ppid changes, then disarms', () => {
    const onDeath = vi.fn();
    let ppid = 100;
    startParentWatchdog(onDeath, deps({ getPpid: () => ppid }));

    vi.advanceTimersByTime(10_000);
    expect(onDeath).not.toHaveBeenCalled();

    ppid = 1; // parent died, reparented
    vi.advanceTimersByTime(10_000);
    expect(onDeath).toHaveBeenCalledTimes(1);

    // Disarmed: no further firings even though the parent stays dead.
    vi.advanceTimersByTime(60_000);
    expect(onDeath).toHaveBeenCalledTimes(1);
  });

  it('fires when the probe starts throwing ESRCH with an unchanged ppid', () => {
    const onDeath = vi.fn();
    let parentGone = false;
    startParentWatchdog(
      onDeath,
      deps({
        probe: () => {
          if (parentGone) throw errnoError('ESRCH');
        },
      }),
    );

    vi.advanceTimersByTime(10_000);
    expect(onDeath).not.toHaveBeenCalled();

    parentGone = true;
    vi.advanceTimersByTime(10_000);
    expect(onDeath).toHaveBeenCalledTimes(1);
  });

  it('never fires after stop()', () => {
    const onDeath = vi.fn();
    let ppid = 100;
    const stop = startParentWatchdog(onDeath, deps({ getPpid: () => ppid }));

    stop();
    ppid = 1;
    vi.advanceTimersByTime(60_000);
    expect(onDeath).not.toHaveBeenCalled();
  });

  it('captures the initial ppid at arm time, not at poll time', () => {
    const onDeath = vi.fn();
    // ppid already 1 when armed (e.g. spawned by a short-lived wrapper):
    // stable value = alive from the watchdog's point of view.
    startParentWatchdog(onDeath, deps({ getPpid: () => 1 }));
    vi.advanceTimersByTime(30_000);
    expect(onDeath).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isParentDead,
  isPidAlive,
  resolveWatchedPid,
  startParentWatchdog,
  type ParentWatchdogDeps,
} from '../parent-watchdog';

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

  // ── CCG_HOST_PID: seeing past a version-manager shim (issue #308) ────────

  it('watches the host pid handed over in CCG_HOST_PID, not our own parent', () => {
    // `IDE -> volta shim -> node`, and this watchdog runs in node. The IDE is gone but the
    // shim (our ppid) is alive, so watching the ppid would report a healthy parent forever.
    const onDeath = vi.fn();
    const HOST = 4242;
    const SHIM = 100;
    let hostAlive = true;

    startParentWatchdog(
      onDeath,
      deps({
        getWatchedPid: () => HOST,
        getPpid: () => SHIM, // the shim never dies and never reparents
        probe: (pid: number) => {
          if (pid === HOST && !hostAlive) throw errnoError('ESRCH');
        },
      }),
    );

    vi.advanceTimersByTime(30_000);
    expect(onDeath).not.toHaveBeenCalled();

    hostAlive = false;
    vi.advanceTimersByTime(10_000);
    expect(onDeath).toHaveBeenCalledTimes(1);
  });

  // ── An open host connection outranks the pid probe ───────────────────────

  it('refuses a death verdict while the host still holds its control connection', () => {
    // Reading a pid is an inference; an open socket is the host observably running. When
    // the two disagree the observation wins, so an unforeseen false positive costs a log
    // line instead of the user's backend.
    const onDeath = vi.fn();
    const rejected = vi.fn();
    // Observable when armed, so the arm-time guard passes and polling really runs; the
    // pid only starts probing as gone afterwards, which is the disagreement under test.
    let hostAlive = true;

    startParentWatchdog(
      onDeath,
      deps({
        getWatchedPid: () => 4242,
        getPpid: () => 100,
        probe: (pid: number) => {
          if (pid === 4242 && !hostAlive) throw errnoError('ESRCH');
        },
        isHostAttached: () => true,
        onVerdictRejected: rejected,
      }),
    );

    hostAlive = false;
    vi.advanceTimersByTime(60_000);
    expect(onDeath).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledWith(4242);
  });

  it('acts on the verdict once the host connection has gone too', () => {
    // The guard defers the verdict, it does not cancel it: a host that is really gone
    // must still be noticed on a later poll.
    const onDeath = vi.fn();
    let attached = true;
    let hostAlive = true;

    startParentWatchdog(
      onDeath,
      deps({
        getWatchedPid: () => 4242,
        getPpid: () => 100,
        probe: (pid: number) => {
          if (pid === 4242 && !hostAlive) throw errnoError('ESRCH');
        },
        isHostAttached: () => attached,
      }),
    );

    hostAlive = false;
    vi.advanceTimersByTime(30_000);
    expect(onDeath).not.toHaveBeenCalled();

    attached = false;
    vi.advanceTimersByTime(10_000);
    expect(onDeath).toHaveBeenCalledTimes(1);
  });

  it('leaves the verdict alone when nothing can report a host connection', () => {
    // Standalone hosts have no control socket, so the pid verdict stands on its own.
    const onDeath = vi.fn();
    let hostAlive = true;

    startParentWatchdog(
      onDeath,
      deps({
        getWatchedPid: () => 4242,
        getPpid: () => 100,
        probe: (pid: number) => {
          if (pid === 4242 && !hostAlive) throw errnoError('ESRCH');
        },
      }),
    );

    hostAlive = false;
    vi.advanceTimersByTime(10_000);
    expect(onDeath).toHaveBeenCalledTimes(1);
  });

  // ── Unobservable pid: WSL2 puts the host in another namespace (issue #384) ──

  it('never fires for a host pid that is unobservable from the start', () => {
    // WSL2: the IDE is a Windows process, this backend runs inside the distro, so
    // probing the Windows pid from Linux raises ESRCH every time. Before the fix the
    // first poll read that as death and killed a healthy backend ten seconds after
    // every connect.
    const onDeath = vi.fn();
    startParentWatchdog(
      onDeath,
      deps({
        getWatchedPid: () => 14056, // a Windows pid, meaningless inside the distro
        getPpid: () => 100,
        probe: () => {
          throw errnoError('ESRCH');
        },
      }),
    );

    vi.advanceTimersByTime(10 * 60_000);
    expect(onDeath).not.toHaveBeenCalled();
  });

  it('still arms when the host pid is observable at arm time (Windows native)', () => {
    // The same code path on Windows native, where host and backend do share a pid
    // namespace: arming must be unaffected, including the shim case from #360.
    const onDeath = vi.fn();
    const HOST = 4242;
    let hostAlive = true;

    startParentWatchdog(
      onDeath,
      deps({
        getWatchedPid: () => HOST,
        getPpid: () => 100,
        probe: (pid: number) => {
          if (pid === HOST && !hostAlive) throw errnoError('ESRCH');
        },
      }),
    );

    hostAlive = false;
    vi.advanceTimersByTime(10_000);
    expect(onDeath).toHaveBeenCalledTimes(1);
  });

  it('arms when the arm-time probe fails with EPERM rather than ESRCH', () => {
    // EPERM means the process exists but is not ours to signal — observable, so the
    // poller must arm normally.
    const onDeath = vi.fn();
    startParentWatchdog(
      onDeath,
      deps({
        getWatchedPid: () => 4242,
        getPpid: () => 100,
        probe: () => {
          throw errnoError('EPERM');
        },
      }),
    );

    vi.advanceTimersByTime(30_000);
    expect(onDeath).not.toHaveBeenCalled(); // EPERM is alive, so no death either
  });

  it('does not mistake a live host for dead just because our own ppid changed', () => {
    // The shim exiting reparents us, but the host is what decides the backend's fate.
    const onDeath = vi.fn();
    let ppid = 100;
    startParentWatchdog(
      onDeath,
      deps({ getWatchedPid: () => 4242, getPpid: () => ppid, probe: () => undefined }),
    );

    ppid = 1;
    vi.advanceTimersByTime(60_000);
    expect(onDeath).not.toHaveBeenCalled();
  });
});

describe('resolveWatchedPid', () => {
  it('prefers CCG_HOST_PID over the process ppid', () => {
    expect(resolveWatchedPid({ CCG_HOST_PID: '4242' }, () => 100)).toBe(4242);
  });

  it('falls back to the ppid when CCG_HOST_PID is absent', () => {
    expect(resolveWatchedPid({}, () => 100)).toBe(100);
  });

  it.each(['', 'not-a-pid', '0', '-5'])('falls back to the ppid for %o', (value) => {
    expect(resolveWatchedPid({ CCG_HOST_PID: value }, () => 100)).toBe(100);
  });
});

describe('isPidAlive', () => {
  it('is false only for ESRCH', () => {
    expect(isPidAlive(1, () => undefined)).toBe(true);
    expect(isPidAlive(1, () => { throw errnoError('EPERM'); })).toBe(true);
    expect(isPidAlive(1, () => { throw errnoError('ESRCH'); })).toBe(false);
  });
});

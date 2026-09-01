import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startHostLivenessWatchdog, type HostLivenessDeps } from '../host-liveness';

describe('startHostLivenessWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function deps(overrides: Partial<HostLivenessDeps> = {}): HostLivenessDeps {
    return {
      graceMs: 15_000,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle),
      ...overrides,
    };
  }

  it('stays silent for a standalone run that never sees a host', () => {
    // The `ccg` launcher and browser clients never open /rpc. Zero hosts is their
    // normal state for the whole process lifetime, not a death.
    const onHostGone = vi.fn();
    const watchdog = startHostLivenessWatchdog(onHostGone, deps());

    watchdog.report(0);
    vi.advanceTimersByTime(10 * 60_000);

    expect(onHostGone).not.toHaveBeenCalled();
  });

  it('does not fire while a host stays connected', () => {
    const onHostGone = vi.fn();
    const watchdog = startHostLivenessWatchdog(onHostGone, deps());

    watchdog.report(1);
    vi.advanceTimersByTime(10 * 60_000);

    expect(onHostGone).not.toHaveBeenCalled();
  });

  it('fires once the last host has been away for the grace window', () => {
    const onHostGone = vi.fn();
    const watchdog = startHostLivenessWatchdog(onHostGone, deps());

    watchdog.report(1);
    watchdog.report(0);

    vi.advanceTimersByTime(14_999);
    expect(onHostGone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onHostGone).toHaveBeenCalledTimes(1);
  });

  it('treats a reconnect inside the grace window as the host never having left', () => {
    // A restarting IDE closes its socket and comes back on a new one. Killing the
    // backend in between would make an IDE restart look like an IDE death.
    const onHostGone = vi.fn();
    const watchdog = startHostLivenessWatchdog(onHostGone, deps());

    watchdog.report(1);
    watchdog.report(0);
    vi.advanceTimersByTime(14_000);

    watchdog.report(1);
    vi.advanceTimersByTime(10 * 60_000);

    expect(onHostGone).not.toHaveBeenCalled();
  });

  it('keeps the original deadline when the count is re-reported as zero', () => {
    // Several IDE sockets can close in a row. The countdown belongs to the moment the
    // last host left, so a second zero must not push the deadline back.
    const onHostGone = vi.fn();
    const watchdog = startHostLivenessWatchdog(onHostGone, deps());

    watchdog.report(1);
    watchdog.report(0);
    vi.advanceTimersByTime(10_000);
    watchdog.report(0);
    vi.advanceTimersByTime(5_000);

    expect(onHostGone).toHaveBeenCalledTimes(1);
  });

  it('does not fire while one of several hosts is still attached', () => {
    const onHostGone = vi.fn();
    const watchdog = startHostLivenessWatchdog(onHostGone, deps());

    watchdog.report(2);
    watchdog.report(1);
    vi.advanceTimersByTime(10 * 60_000);

    expect(onHostGone).not.toHaveBeenCalled();
  });

  it('fires at most once', () => {
    const onHostGone = vi.fn();
    const watchdog = startHostLivenessWatchdog(onHostGone, deps());

    watchdog.report(1);
    watchdog.report(0);
    vi.advanceTimersByTime(15_000);
    expect(onHostGone).toHaveBeenCalledTimes(1);

    watchdog.report(1);
    watchdog.report(0);
    vi.advanceTimersByTime(10 * 60_000);
    expect(onHostGone).toHaveBeenCalledTimes(1);
  });

  it('never fires after stop()', () => {
    const onHostGone = vi.fn();
    const watchdog = startHostLivenessWatchdog(onHostGone, deps());

    watchdog.report(1);
    watchdog.report(0);
    watchdog.stop();
    vi.advanceTimersByTime(10 * 60_000);

    expect(onHostGone).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  ConnectionHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MAX_MISSES,
  SUSPEND_GRACE_FACTOR,
  type HeartbeatSocket,
} from '../connection-heartbeat';

/*
 * The heartbeat exists to turn a client that vanished without closing its socket
 * into the `close` event every piece of teardown hangs off (issue #479). These
 * cases are written around the asymmetry that shaped it: noticing late costs one
 * orphaned CLI process, while calling a live client dead costs the user the
 * session they are working in. So "terminates eventually" is one case, and
 * everything that must NOT be terminated is the rest of the file.
 */

const OPEN = 1;

interface FakeSocket extends HeartbeatSocket {
  emit(event: 'pong' | 'message'): void;
  pings: number;
  terminated: number;
}

function createFakeSocket(readyState = OPEN): FakeSocket {
  const listeners = new Map<string, Array<() => void>>();
  const socket: FakeSocket = {
    readyState,
    pings: 0,
    terminated: 0,
    ping() {
      socket.pings++;
    },
    terminate() {
      socket.terminated++;
    },
    on(event, listener) {
      const existing = listeners.get(event) ?? [];
      existing.push(listener);
      listeners.set(event, existing);
      return socket;
    },
    emit(event) {
      for (const listener of listeners.get(event) ?? []) listener();
    },
  };
  return socket;
}

/** A heartbeat wired to a clock the test moves by hand. */
function createHeartbeat(overrides: { intervalMs?: number; maxMisses?: number } = {}) {
  let now = 1_000_000;
  const intervalMs = overrides.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const ticks: number[] = [];
  const heartbeat = new ConnectionHeartbeat({
    intervalMs,
    maxMisses: overrides.maxMisses,
    now: () => now,
    onTick: () => ticks.push(now),
  });
  return {
    heartbeat,
    ticks,
    /** Advance the clock by one interval and run the round that falls due. */
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        now += intervalMs;
        heartbeat.tick();
      }
    },
    /** Advance the clock without running a round — a frozen machine. */
    freeze(ms: number) {
      now += ms;
    },
  };
}

describe('ConnectionHeartbeat — asking', () => {
  it('pings every tracked socket once per round', () => {
    const { heartbeat, tick } = createHeartbeat();
    const socket = createFakeSocket();
    heartbeat.track(socket);

    tick(3);

    expect(socket.pings).toBe(3);
    expect(socket.terminated).toBe(0);
  });

  it('does not ping a socket that is no longer open, but still counts its silence', () => {
    const { heartbeat, tick } = createHeartbeat({ maxMisses: 2 });
    const closing = createFakeSocket(2 /* CLOSING */);
    heartbeat.track(closing);

    tick(3);

    expect(closing.pings).toBe(0);
    expect(closing.terminated).toBe(1);
  });

  it('runs its tick callback on every round', () => {
    const { ticks, heartbeat, tick } = createHeartbeat();
    heartbeat.track(createFakeSocket());

    tick(2);

    expect(ticks).toHaveLength(2);
  });
});

describe('ConnectionHeartbeat — a client that is gone', () => {
  it('terminates a socket that never answers, after maxMisses rounds', () => {
    const { heartbeat, tick } = createHeartbeat();
    const socket = createFakeSocket();
    heartbeat.track(socket);

    // Every round up to the threshold only asks again — the socket must survive
    // all of them, because this is the window a slow client answers in.
    tick(HEARTBEAT_MAX_MISSES);
    expect(socket.terminated).toBe(0);
    expect(socket.pings).toBe(HEARTBEAT_MAX_MISSES);

    tick();
    expect(socket.terminated).toBe(1);
  });

  it('stops tracking a socket once it has been terminated', () => {
    const { heartbeat, tick } = createHeartbeat({ maxMisses: 1 });
    const socket = createFakeSocket();
    heartbeat.track(socket);

    tick(2);
    expect(socket.terminated).toBe(1);

    tick(5);
    expect(socket.terminated).toBe(1);
    expect(heartbeat.trackedCount).toBe(0);
  });

  it('terminates only the silent socket, leaving its talkative neighbour alone', () => {
    const { heartbeat, tick } = createHeartbeat({ maxMisses: 1 });
    const silent = createFakeSocket();
    const answering = createFakeSocket();
    heartbeat.track(silent);
    heartbeat.track(answering);

    tick();
    answering.emit('pong');
    tick();

    expect(silent.terminated).toBe(1);
    expect(answering.terminated).toBe(0);
  });
});

describe('ConnectionHeartbeat — a client that is alive', () => {
  it('never terminates a socket that answers its pings', () => {
    const { heartbeat, tick } = createHeartbeat();
    const socket = createFakeSocket();
    heartbeat.track(socket);

    for (let round = 0; round < HEARTBEAT_MAX_MISSES * 5; round++) {
      tick();
      socket.emit('pong');
    }

    expect(socket.terminated).toBe(0);
  });

  it('takes an application message as proof of life, for hops that eat control frames', () => {
    const { heartbeat, tick } = createHeartbeat();
    const socket = createFakeSocket();
    heartbeat.track(socket);

    // Never a pong — only ordinary traffic, as a client behind a proxy that
    // drops control frames would look.
    for (let round = 0; round < HEARTBEAT_MAX_MISSES * 5; round++) {
      tick();
      socket.emit('message');
    }

    expect(socket.terminated).toBe(0);
  });

  it('survives a long freeze of this machine, however many rounds it swallowed', () => {
    const { heartbeat, tick, freeze } = createHeartbeat();
    const socket = createFakeSocket();
    heartbeat.track(socket);

    tick(HEARTBEAT_MAX_MISSES);
    expect(socket.terminated).toBe(0);

    // The lid closes for an hour. The next tick is the one node runs on wake,
    // and the client never had a chance to answer during the freeze.
    freeze(60 * 60 * 1000);
    heartbeat.tick();
    expect(socket.terminated).toBe(0);

    // And the rounds after the wake start from zero rather than from the count
    // the freeze left behind.
    tick(HEARTBEAT_MAX_MISSES);
    expect(socket.terminated).toBe(0);

    tick();
    expect(socket.terminated).toBe(1);
  });

  it('still counts a round that is merely late, not frozen', () => {
    const { heartbeat, tick, freeze } = createHeartbeat({ maxMisses: 1 });
    const socket = createFakeSocket();
    heartbeat.track(socket);

    tick();
    // A busy event loop delays the round, but not past the suspend threshold.
    freeze(HEARTBEAT_INTERVAL_MS * SUSPEND_GRACE_FACTOR - 1);
    heartbeat.tick();

    expect(socket.terminated).toBe(1);
  });

  it('leaves an untracked socket alone forever', () => {
    const { heartbeat, tick } = createHeartbeat({ maxMisses: 1 });
    const socket = createFakeSocket();
    heartbeat.track(socket);
    heartbeat.untrack(socket);

    tick(10);

    expect(socket.pings).toBe(0);
    expect(socket.terminated).toBe(0);
  });
});

describe('ConnectionHeartbeat — timer wiring', () => {
  it('arms one interval on start and disarms it on stop', () => {
    vi.useFakeTimers();
    try {
      const socket = createFakeSocket();
      const heartbeat = new ConnectionHeartbeat({ intervalMs: 1_000, maxMisses: 1 });
      heartbeat.track(socket);
      heartbeat.start();
      heartbeat.start(); // idempotent — a second arm must not double the rounds

      vi.advanceTimersByTime(1_000);
      expect(socket.pings).toBe(1);

      heartbeat.stop();
      vi.advanceTimersByTime(10_000);
      expect(socket.pings).toBe(1);
      expect(socket.terminated).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordTurnEnd, resetTurnEnds, turnEndCount, waitForTurnEnd } from '../turnEnds';

// A program that started a session through this backend asks when its first turn ends. A turn can end between
// two of its requests, so the count of ended turns is what it names next, not only a wake-up of whoever is waiting.
describe('turnEnds', () => {
  beforeEach(() => {
    resetTurnEnds();
    vi.useRealTimers();
  });

  it('counts the turns of each session apart', () => {
    recordTurnEnd('a');
    recordTurnEnd('a');
    recordTurnEnd('b');
    expect([turnEndCount('a'), turnEndCount('b'), turnEndCount('c')]).toEqual([2, 1, 0]);
  });

  it('answers at once when more turns have ended than the asker has seen (an end between two requests is not missed)', async () => {
    recordTurnEnd('a');
    expect(await waitForTurnEnd('a', 0, 10_000)).toEqual({ ended: true, turnEnds: 1 });
  });

  it('waits for the next end when none has come since the count the asker names', async () => {
    recordTurnEnd('a');
    const waiting = waitForTurnEnd('a', 1, 10_000);
    recordTurnEnd('a');
    expect(await waiting).toEqual({ ended: true, turnEnds: 2 });
  });

  it('does not take the end of another session for its own', async () => {
    vi.useFakeTimers();
    const waiting = waitForTurnEnd('a', 0, 1000);
    recordTurnEnd('b');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await waiting).toEqual({ ended: false, turnEnds: 0 });
  });

  it('gives up after the wait time and says no turn ended, with the count to name next', async () => {
    vi.useFakeTimers();
    recordTurnEnd('a');
    const waiting = waitForTurnEnd('a', 1, 500);
    await vi.advanceTimersByTimeAsync(500);
    expect(await waiting).toEqual({ ended: false, turnEnds: 1 });
  });

  it('wakes every program waiting for the same session', async () => {
    const first = waitForTurnEnd('a', 0, 10_000);
    const second = waitForTurnEnd('a', 0, 10_000);
    recordTurnEnd('a');
    expect(await Promise.all([first, second])).toEqual([
      { ended: true, turnEnds: 1 },
      { ended: true, turnEnds: 1 },
    ]);
  });
});

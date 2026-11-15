import { describe, expect, it, vi } from 'vitest';
import { coalesceReads } from '../coalesceReads';

/** A read that finishes when the test says so. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Several screens ask for the same list at the same moment, and every ask used
 * to be a full read. The reads of one list are now kept to the one running and
 * at most one more behind it.
 *
 * The one more is what keeps an answer from being old: a request that arrives
 * while a read is running is answered by a read that STARTS after it arrived, so
 * it can never be handed what a read that began earlier saw.
 */
describe('coalesceReads', () => {
  it('runs a single request as one read', async () => {
    const read = vi.fn().mockResolvedValue('list');

    await expect(coalesceReads('a', read)).resolves.toBe('list');

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('answers every request that arrives while a read runs with ONE read that starts after them', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const a = coalesceReads('a', read);
    const b = coalesceReads('a', read);
    const c = coalesceReads('a', read);
    const d = coalesceReads('a', read);

    // Only the first read is running; the rest wait for the one behind it.
    expect(read).toHaveBeenCalledTimes(1);

    first.resolve('old');
    await expect(a).resolves.toBe('old');
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2);

    second.resolve('new');
    await expect(Promise.all([b, c, d])).resolves.toEqual(['new', 'new', 'new']);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('never hands a request what a read that began before it saw', async () => {
    let value = 'before';
    const first = deferred<void>();
    const read = vi.fn(async () => {
      const seen = value;
      if (read.mock.calls.length === 1) await first.promise;
      return seen;
    });

    const early = coalesceReads('a', read);
    value = 'after'; // changes while the first read is still running
    const late = coalesceReads('a', read);
    first.resolve();

    await expect(early).resolves.toBe('before');
    await expect(late).resolves.toBe('after');
  });

  it('starts a read of its own when none is running', async () => {
    const read = vi.fn().mockResolvedValueOnce('one').mockResolvedValueOnce('two');

    await expect(coalesceReads('a', read)).resolves.toBe('one');
    await expect(coalesceReads('a', read)).resolves.toBe('two');

    expect(read).toHaveBeenCalledTimes(2);
  });

  it('queues no more than one read behind the running one, even while that one runs', async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const read = vi.fn();
    gates.forEach((gate) => read.mockReturnValueOnce(gate.promise));

    const a = coalesceReads('a', read);
    const b = coalesceReads('a', read);
    gates[0].resolve('1');
    await a;
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2); // b's read is running now

    const c = coalesceReads('a', read);
    const d = coalesceReads('a', read);
    expect(read).toHaveBeenCalledTimes(2);

    gates[1].resolve('2');
    await expect(b).resolves.toBe('2');
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(3);

    gates[2].resolve('3');
    await expect(Promise.all([c, d])).resolves.toEqual(['3', '3']);
  });

  it('keeps the reads of different lists apart', async () => {
    const gate = deferred<string>();
    const readA = vi.fn().mockReturnValue(gate.promise);
    const readB = vi.fn().mockResolvedValue('b');

    const a = coalesceReads('a', readA);
    const b = coalesceReads('b', readB);

    await expect(b).resolves.toBe('b');
    expect(readA).toHaveBeenCalledTimes(1);
    expect(readB).toHaveBeenCalledTimes(1);
    gate.resolve('a');
    await expect(a).resolves.toBe('a');
  });

  it('hands a failure to the requests that waited for that read, and the next request reads again', async () => {
    const first = deferred<string>();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce('fine');

    const a = coalesceReads('a', read);
    const b = coalesceReads('a', read);
    first.resolve('ok');

    await expect(a).resolves.toBe('ok');
    await expect(b).rejects.toThrow('disk');
    await expect(coalesceReads('a', read)).resolves.toBe('fine');
  });

  /**
   * A read that began before a request arrived is still right for it if nothing that the read could have
   * missed was said since it began. What a read can miss is what the backend announces, so the backend gives a
   * number that rises with each announcement, and a request joins the running read while the number is as it was
   * when that read began.
   */
  describe('when it is told what changes the answer', () => {
    it('lets a request that comes while a read runs share that read when nothing changed since it began', async () => {
      const gate = deferred<string>();
      const read = vi.fn().mockReturnValueOnce(gate.promise);
      const version = () => 7;

      const a = coalesceReads('a', read, version);
      const b = coalesceReads('a', read, version);
      const c = coalesceReads('a', read, version);
      gate.resolve('only');

      await expect(Promise.all([a, b, c])).resolves.toEqual(['only', 'only', 'only']);
      expect(read).toHaveBeenCalledTimes(1);
    });

    it('gives a request the read after it when something changed since the running read began', async () => {
      const first = deferred<string>();
      const second = deferred<string>();
      const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      let changes = 0;

      const a = coalesceReads('a', read, () => changes);
      changes++; // said while the read runs
      const b = coalesceReads('a', read, () => changes);
      first.resolve('old');
      await a;
      await Promise.resolve();
      second.resolve('new');

      await expect(b).resolves.toBe('new');
      expect(read).toHaveBeenCalledTimes(2);
    });

    it('counts from when the read behind began, for the requests that come after it', async () => {
      const gates = [deferred<string>(), deferred<string>()];
      const read = vi.fn().mockReturnValueOnce(gates[0].promise).mockReturnValueOnce(gates[1].promise);
      let changes = 0;

      const a = coalesceReads('a', read, () => changes);
      changes++;
      const b = coalesceReads('a', read, () => changes); // waits for the read behind
      gates[0].resolve('1');
      await a;
      await Promise.resolve();
      expect(read).toHaveBeenCalledTimes(2);

      // The read behind began after the change, so nothing was said since it began.
      const c = coalesceReads('a', read, () => changes);
      gates[1].resolve('2');

      await expect(Promise.all([b, c])).resolves.toEqual(['2', '2']);
      expect(read).toHaveBeenCalledTimes(2);
    });

    it('starts a read of its own when none is running, whatever the number is', async () => {
      const read = vi.fn().mockResolvedValueOnce('one').mockResolvedValueOnce('two');

      await expect(coalesceReads('a', read, () => 1)).resolves.toBe('one');
      await expect(coalesceReads('a', read, () => 1)).resolves.toBe('two');
    });
  });
});

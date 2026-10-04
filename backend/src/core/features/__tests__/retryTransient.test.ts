import { describe, it, expect } from 'vitest';
import { retryTransient } from '../atomic-json';

const failing = (code: string) => Object.assign(new Error(code), { code });

/** An operation that fails with [code] this many times, then answers. */
function flaky(code: string, failures: number) {
  let calls = 0;
  return {
    run: async () => {
      calls += 1;
      if (calls <= failures) throw failing(code);
      return 'done';
    },
    calls: () => calls,
  };
}

describe('retryTransient', () => {
  it.each(['EPERM', 'EACCES', 'EBUSY'])('tries again after %s, which is how Windows refuses a file that is open for a moment', async (code) => {
    const op = flaky(code, 2);

    await expect(retryTransient(op.run)).resolves.toBe('done');
    expect(op.calls()).toBe(3);
  });

  it('answers at once when nothing fails', async () => {
    const op = flaky('EPERM', 0);

    await expect(retryTransient(op.run)).resolves.toBe('done');
    expect(op.calls()).toBe(1);
  });

  it('gives up with the last failure after a few tries', async () => {
    const op = flaky('EBUSY', 100);

    await expect(retryTransient(op.run)).rejects.toMatchObject({ code: 'EBUSY' });
    expect(op.calls()).toBe(4); // the first try and three more
  });

  // These failures are answers: it is not there, or someone else made it first.
  it.each(['ENOENT', 'EEXIST', 'EISDIR'])('does not try again after %s', async (code) => {
    const op = flaky(code, 100);

    await expect(retryTransient(op.run)).rejects.toMatchObject({ code });
    expect(op.calls()).toBe(1);
  });

  it('does not try again after a failure that has no code', async () => {
    let calls = 0;

    await expect(
      retryTransient(async () => {
        calls += 1;
        throw new Error('plain');
      }),
    ).rejects.toThrow('plain');
    expect(calls).toBe(1);
  });
});

import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import {
  attachMcpContainerReclaim,
  drainMcpContainerReclaims,
  reclaimContainers,
  reclaimLiveMcpContainers,
  whenMcpContainersReclaimed,
} from '../mcp-container-reclaimer';

vi.mock('../features/mcp-config-files', () => ({
  collectMcpServerConfigs: vi.fn(async () => [{ command: 'docker', args: ['run', 'img/one', 'serve'] }]),
}));

// A fake daemon that answers nothing until told to, so a call that waits for the one before it
// shows up as a call that was never made.
const daemon = vi.hoisted(() => {
  const calls: Array<{ args: string[]; answer: (error: Error | null, stdout?: string) => void }> = [];
  return { calls };
});

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: vi.fn(
    (
      _file: string,
      args: string[],
      _options: unknown,
      done: (error: Error | null, result?: { stdout: string; stderr: string }) => void,
    ) => {
      daemon.calls.push({
        args,
        answer: (error, stdout = '') => done(error, { stdout, stderr: '' }),
      });
    },
  ),
}));

const tick = () => new Promise((resolve) => setImmediate(resolve));
const pending = (verb: string) => daemon.calls.filter((call) => call.args[0] === verb);
const snapshot = {
  servers: [
    { image: 'img/one', command: 'serve' },
    { image: 'img/two', command: 'serve' },
  ],
  existing: new Set<string>(),
  takenAt: 0,
};

afterEach(() => {
  daemon.calls.length = 0;
});

// A backend that is shutting down cannot afford to wait for a CLI to leave before it starts.
it('reclaims for a CLI that has not left yet when asked to, and drain waits for it', async () => {
  const proc = Object.assign(new EventEmitter(), {
    pid: 999_998,
    exitCode: null,
    signalCode: null,
  }) as unknown as ChildProcess & EventEmitter;
  attachMcpContainerReclaim(proc);
  await tick();
  pending('ps')[0].answer(null, '');
  await tick();
  daemon.calls.length = 0;

  reclaimLiveMcpContainers();
  await tick();
  expect(pending('ps')).toHaveLength(1);

  let drained = false;
  void drainMcpContainerReclaims().then(() => {
    drained = true;
  });
  pending('ps')[0].answer(null, 'aaa\n');
  await tick();
  pending('inspect')[0].answer(null, 'img/one\tserve\n');
  await tick();
  expect(drained).toBe(false);
  pending('rm')[0].answer(null);
  await tick();
  expect(drained).toBe(true);

  // Once it has left, there is nothing live to ask about.
  proc.emit('close', 0);
  await tick();
  pending('ps').at(-1)?.answer(null, '');
  await tick();
  daemon.calls.length = 0;
  reclaimLiveMcpContainers();
  await tick();
  expect(daemon.calls).toEqual([]);
});

// Two reclaims of one CLI would remove the same container twice, and the second would report
// failure, and settle, while the first was still removing it.
it('holds the reclaim of a close until the one started ahead of it is over', async () => {
  const proc = Object.assign(new EventEmitter(), {
    pid: 999_997,
    exitCode: null,
    signalCode: null,
  }) as unknown as ChildProcess & EventEmitter;
  attachMcpContainerReclaim(proc);
  await tick();
  pending('ps')[0].answer(null, '');
  await tick();
  daemon.calls.length = 0;

  reclaimLiveMcpContainers();
  await tick();
  pending('ps')[0].answer(null, 'aaa\n');
  await tick();
  pending('inspect')[0].answer(null, 'img/one\tserve\n');
  await tick();

  proc.emit('close', 0);
  let settled = false;
  void whenMcpContainersReclaimed(proc).then(() => {
    settled = true;
  });
  await tick();
  expect(pending('ps')).toHaveLength(1);
  expect(settled).toBe(false);

  pending('rm')[0].answer(null);
  await tick();
  expect(pending('ps')).toHaveLength(2);
  pending('ps')[1].answer(null, '');
  await tick();
  expect(settled).toBe(true);
  expect(pending('rm')).toHaveLength(1);
});

// Shutdown gives the whole reclaim a second or so before whoever started the backend kills it, so
// no docker call may wait for one that is unrelated to it.
it('asks the daemon about every image and container at once, and removes them at once', async () => {
  const reclaimed = reclaimContainers(snapshot);
  await tick();
  expect(pending('ps')).toHaveLength(2);

  pending('ps')[0].answer(null, 'aaa\nbbb\n');
  pending('ps')[1].answer(null, 'ccc\n');
  await tick();
  expect(pending('inspect')).toHaveLength(3);

  for (const call of pending('inspect')) {
    const image = call.args[1] === 'ccc' ? 'img/two' : 'img/one';
    call.answer(null, `${image}\tserve\n`);
  }
  await tick();
  expect(pending('rm').map((call) => call.args[2])).toEqual(['aaa', 'bbb', 'ccc']);

  // One that cannot be removed does not hold back or hide the others.
  const [first, second, third] = pending('rm');
  third.answer(null);
  second.answer(new Error('daemon said no'));
  first.answer(null);
  await expect(reclaimed).resolves.toEqual(['aaa', 'ccc']);
});

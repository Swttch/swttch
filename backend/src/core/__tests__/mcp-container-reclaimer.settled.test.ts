import { expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { attachMcpContainerReclaim, whenMcpContainersReclaimed } from '../mcp-container-reclaimer';

// The config read is the first step of the snapshot a reclaim waits for, so holding it open
// holds the reclaim open without a Docker daemon.
const configs = vi.hoisted(() => ({ finish: () => {} }));

vi.mock('../features/mcp-config-files', () => ({
  collectMcpServerConfigs: vi.fn(
    () =>
      new Promise<unknown[]>((resolve) => {
        configs.finish = () => resolve([]);
      }),
  ),
}));

const tick = () => new Promise((resolve) => setImmediate(resolve));

it('settles only once the reclaim started by the close is over', async () => {
  const proc = Object.assign(new EventEmitter(), {
    pid: 999_999,
    exitCode: 0,
    signalCode: null,
  }) as unknown as ChildProcess & EventEmitter;
  attachMcpContainerReclaim(proc);
  proc.emit('close', 0);

  let settled = false;
  void whenMcpContainersReclaimed(proc).then(() => {
    settled = true;
  });
  await tick();
  expect(settled).toBe(false);

  configs.finish();
  await tick();
  expect(settled).toBe(true);
});

it('settles at once for a process no reclaim was attached to', async () => {
  const proc = new EventEmitter() as unknown as ChildProcess;
  await expect(whenMcpContainersReclaimed(proc)).resolves.toBeUndefined();
});

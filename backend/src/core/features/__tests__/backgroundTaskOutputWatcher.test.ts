import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, appendFile, rm } from 'fs/promises';
import { realpathSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import type { ConnectionManager } from '../../../ws/connection-manager';

describe('backgroundTaskOutputWatcher', () => {
  let tmpDir: string;
  let originalTmpdir: string | undefined;

  beforeEach(async () => {
    originalTmpdir = process.env.CLAUDE_CODE_TMPDIR;
    // loadBackgroundTaskOutput (which the watcher delegates the actual read
    // to) validates outputFile against getTmpBase() — point that at our
    // scratch dir so a real file under it is accepted.
    tmpDir = realpathSync(await mkdtemp(join(os.tmpdir(), 'wtest-')));
    process.env.CLAUDE_CODE_TMPDIR = tmpDir;
    vi.resetModules();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    if (originalTmpdir === undefined) delete process.env.CLAUDE_CODE_TMPDIR;
    else process.env.CLAUDE_CODE_TMPDIR = originalTmpdir;
    vi.restoreAllMocks();
  });

  function makeConnections() {
    const sent: Array<{ connectionId: string; type: string; payload: Record<string, unknown> }> = [];
    const connections = {
      sendTo: (connectionId: string, type: string, payload: Record<string, unknown> = {}) => {
        sent.push({ connectionId, type, payload });
      },
    } as unknown as ConnectionManager;
    return { connections, sent };
  }

  it('pushes the current content immediately on watch, then again after the file changes', async () => {
    const { watchBackgroundTaskOutput, unwatchBackgroundTaskOutput } = await import('../backgroundTaskOutputWatcher');
    const { connections, sent } = makeConnections();
    const file = join(tmpDir, 'task.output');
    await writeFile(file, 'count: 1\n');

    watchBackgroundTaskOutput('conn-1', file, connections);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ connectionId: 'conn-1', type: 'BACKGROUND_TASK_OUTPUT_CHANGED', payload: { outputFile: file, text: 'count: 1\n' } });

    await appendFile(file, 'count: 2\n');
    await new Promise((resolve) => setTimeout(resolve, 400)); // past the 200ms debounce

    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(sent[sent.length - 1].payload.text).toBe('count: 1\ncount: 2\n');

    unwatchBackgroundTaskOutput('conn-1', file);
  });

  it('debounces rapid successive writes into one push', async () => {
    const { watchBackgroundTaskOutput, unwatchBackgroundTaskOutput } = await import('../backgroundTaskOutputWatcher');
    const { connections, sent } = makeConnections();
    const file = join(tmpDir, 'rapid.output');
    await writeFile(file, '');

    watchBackgroundTaskOutput('conn-1', file, connections);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterInitial = sent.length;

    for (let i = 0; i < 5; i++) {
      await appendFile(file, `line ${i}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));

    // 5 rapid writes inside the 200ms debounce window collapse to one push,
    // not five — this is the whole point of debouncing a file watcher.
    expect(sent.length - afterInitial).toBe(1);
    expect(sent[sent.length - 1].payload.text).toBe('line 0\nline 1\nline 2\nline 3\nline 4\n');

    unwatchBackgroundTaskOutput('conn-1', file);
  });

  it('does not push after unwatch', async () => {
    const { watchBackgroundTaskOutput, unwatchBackgroundTaskOutput } = await import('../backgroundTaskOutputWatcher');
    const { connections, sent } = makeConnections();
    const file = join(tmpDir, 'stop.output');
    await writeFile(file, 'a\n');

    watchBackgroundTaskOutput('conn-1', file, connections);
    await new Promise((resolve) => setTimeout(resolve, 50));
    unwatchBackgroundTaskOutput('conn-1', file);

    const countAfterUnwatch = sent.length;
    await appendFile(file, 'b\n');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(sent.length).toBe(countAfterUnwatch);
  });

  it('re-watching the same connection+file is a no-op (no duplicate pushes per change)', async () => {
    const { watchBackgroundTaskOutput, unwatchBackgroundTaskOutput } = await import('../backgroundTaskOutputWatcher');
    const { connections, sent } = makeConnections();
    const file = join(tmpDir, 'dup.output');
    await writeFile(file, '');

    watchBackgroundTaskOutput('conn-1', file, connections);
    watchBackgroundTaskOutput('conn-1', file, connections); // second call, same key
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterInitial = sent.length;

    await appendFile(file, 'x\n');
    await new Promise((resolve) => setTimeout(resolve, 400));

    // A duplicate watcher would have doubled every push from here on.
    expect(sent.length - afterInitial).toBe(1);

    unwatchBackgroundTaskOutput('conn-1', file);
  });

  it('unwatchAllForConnection stops every watcher for that connection but leaves others watching', async () => {
    const { watchBackgroundTaskOutput, unwatchAllForConnection, unwatchBackgroundTaskOutput } = await import(
      '../backgroundTaskOutputWatcher'
    );
    const { connections: connA, sent: sentA } = makeConnections();
    const { connections: connB, sent: sentB } = makeConnections();
    const fileA = join(tmpDir, 'a.output');
    const fileB = join(tmpDir, 'b.output');
    await writeFile(fileA, '');
    await writeFile(fileB, '');

    watchBackgroundTaskOutput('conn-a', fileA, connA);
    watchBackgroundTaskOutput('conn-b', fileB, connB);
    await new Promise((resolve) => setTimeout(resolve, 50));

    unwatchAllForConnection('conn-a');

    const countAAfter = sentA.length;
    const countBAfter = sentB.length;
    await appendFile(fileA, 'x\n');
    await appendFile(fileB, 'y\n');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(sentA.length).toBe(countAAfter); // conn-a's watcher is gone
    expect(sentB.length).toBeGreaterThan(countBAfter); // conn-b's watcher is untouched

    unwatchBackgroundTaskOutput('conn-b', fileB);
  });

  it('does not throw when watching a file that does not exist yet', async () => {
    const { watchBackgroundTaskOutput } = await import('../backgroundTaskOutputWatcher');
    const { connections } = makeConnections();
    const file = join(tmpDir, 'not-created-yet.output');

    expect(() => watchBackgroundTaskOutput('conn-1', file, connections)).not.toThrow();
  });
});

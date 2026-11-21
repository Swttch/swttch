import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { realpathSync } from 'fs';
import * as os from 'os';

/**
 * A backgrounded agent's output file lives in the runtime directory under the tmp root, which is cleared. Its record
 * is also kept beside its session for good, so a lookup that names the session still finds an agent that is long gone
 * from the tmp root.
 */
describe('findBackgroundTaskOutputPath: the record kept beside the session', () => {
  let root: string;

  beforeEach(async () => {
    root = realpathSync(await mkdtemp(join(os.tmpdir(), 'fsr-test-')));
    // Both roots are made to be empty of any runtime directory, so only the session's own record can answer.
    vi.stubEnv('CLAUDE_CODE_TMPDIR', join(root, 'tmp'));
    vi.stubEnv('CLAUDE_CONFIG_DIR', join(root, 'config'));
    vi.resetModules();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  async function writeRecord(sessionId: string, agentId: string): Promise<string> {
    const dir = join(root, 'config', 'projects', '-work-proj', sessionId, 'subagents');
    await mkdir(dir, { recursive: true });
    const file = join(dir, `agent-${agentId}.jsonl`);
    await writeFile(file, '{"type":"user"}\n');
    return file;
  }

  it('finds an agent that the runtime directory no longer holds, by its session', async () => {
    const file = await writeRecord('sess1', 'abc123');
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');

    const result = await findBackgroundTaskOutputPath({ taskId: 'abc123', workingDir: '/work/proj', sessionId: 'sess1' });

    expect(result).toEqual({ path: file });
  });

  it('finds nothing when the session is not named', async () => {
    await writeRecord('sess1', 'abc123');
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');

    expect(await findBackgroundTaskOutputPath({ taskId: 'abc123', workingDir: '/work/proj' })).toEqual({ path: null });
  });

  it('finds nothing for another session or another agent', async () => {
    await writeRecord('sess1', 'abc123');
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');

    expect(await findBackgroundTaskOutputPath({ taskId: 'abc123', workingDir: '/work/proj', sessionId: 'sess2' })).toEqual({ path: null });
    expect(await findBackgroundTaskOutputPath({ taskId: 'zzz', workingDir: '/work/proj', sessionId: 'sess1' })).toEqual({ path: null });
  });

  it('refuses ids that could walk out of the session folder', async () => {
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');

    expect(await findBackgroundTaskOutputPath({ taskId: 'abc', workingDir: '/work/proj', sessionId: '../x' })).toEqual({ path: null });
  });
});

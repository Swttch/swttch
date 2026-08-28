import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { realpathSync } from 'fs';
import * as os from 'os';

/** Replace a process property that has no setter, and hand back the undo. */
function override(key: 'platform' | 'getuid', value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(process, key);
  Object.defineProperty(process, key, { value, configurable: true });
  return () => {
    // `getuid` is absent on Windows, so there is nothing to put back there.
    if (original) Object.defineProperty(process, key, original);
    else Reflect.deleteProperty(process, key);
  };
}

describe('findBackgroundTaskOutputPath', () => {
  let tmpDir: string;
  let restore: Array<() => void> = [];

  beforeEach(async () => {
    // Use realpathSync to resolve symlinks (macOS /var -> /private/var)
    tmpDir = realpathSync(await mkdtemp(join(os.tmpdir(), 'fbto-test-')));
    // The uid-keyed layout below is what the CLI writes on macOS/Linux only, and
    // the lookup answers null outright on win32. Running as that platform is
    // what puts the POSIX behaviour under test everywhere — otherwise a Windows
    // run agrees with every "returns null" case for the wrong reason and never
    // exercises a single lookup.
    restore = [override('platform', 'darwin'), override('getuid', () => 1000)];
    vi.resetModules();
  });

  afterEach(async () => {
    for (const undo of restore.reverse()) undo();
    restore = [];
    await rm(tmpDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function createOutputFile(
    runtimeUuid: string,
    taskId: string,
    projectKey: string,
  ): Promise<string> {
    const claudeDir = `claude-${process.getuid?.() ?? 0}`;
    const tasksDir = join(tmpDir, claudeDir, projectKey, runtimeUuid, 'tasks');
    await mkdir(tasksDir, { recursive: true });
    const filePath = join(tasksDir, `${taskId}.output`);
    await writeFile(filePath, 'output content');
    return filePath;
  }

  it('returns null when taskId is empty', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({ taskId: '', workingDir: '/foo/bar' });
    expect(result).toEqual({ path: null });
  });

  it('returns null when workingDir is empty', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({ taskId: 'task-123', workingDir: '' });
    expect(result).toEqual({ path: null });
  });

  it('returns null for taskId with path traversal characters (..)', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({ taskId: '../etc/passwd', workingDir: '/foo/bar' });
    expect(result).toEqual({ path: null });
  });

  it('returns null for taskId with slash characters', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({ taskId: 'task/bad', workingDir: '/foo/bar' });
    expect(result).toEqual({ path: null });
  });

  it('returns null for relative workingDir', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({ taskId: 'task-123', workingDir: 'relative/path' });
    expect(result).toEqual({ path: null });
  });

  it('returns null when no matching file exists', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({
      taskId: 'nonexistent-task',
      workingDir: '/Users/test/project',
    });
    expect(result).toEqual({ path: null });
  });

  it('returns path when single match exists', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const projectKey = '-Users-test-project';
    const taskId = 'task-abc123';
    const expected = await createOutputFile('runtime-uuid-001', taskId, projectKey);

    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({
      taskId,
      workingDir: '/Users/test/project',
    });
    expect(result).toEqual({ path: expected });
  });

  it('returns most recent file when multiple matches exist', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const projectKey = '-Users-test-project';
    const taskId = 'task-multi';

    const older = await createOutputFile('runtime-uuid-old', taskId, projectKey);
    // Write slightly different content to older to force mtime difference
    await writeFile(older, 'old content');

    // Small delay to ensure mtime differs
    await new Promise((resolve) => setTimeout(resolve, 10));

    const newer = await createOutputFile('runtime-uuid-new', taskId, projectKey);

    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({
      taskId,
      workingDir: '/Users/test/project',
    });
    expect(result.path).toBe(newer);
  });

  it('sanitizes workingDir with special characters correctly', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    // replace(/[^a-zA-Z0-9_-]/g, '-')
    // '/Users/my project/test@work' -> '-Users-my-project-test-work'
    const workingDir = '/Users/my project/test@work';
    const projectKey = '-Users-my-project-test-work';
    const taskId = 'task-sanitize';
    const expected = await createOutputFile('runtime-uuid-sanitize', taskId, projectKey);

    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({ taskId, workingDir });
    expect(result).toEqual({ path: expected });
  });

  it('sanitizes Korean characters in workingDir', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    // Korean chars are non-ASCII, replaced by '-'
    const workingDir = '/Users/홍길동/project';
    const sanitized = workingDir.replace(/[^a-zA-Z0-9_-]/g, '-');
    const taskId = 'task-korean';
    const expected = await createOutputFile('runtime-korean', taskId, sanitized);

    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({ taskId, workingDir });
    expect(result).toEqual({ path: expected });
  });

  it('returns null when process.getuid is not available (uid null)', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    // Simulate environment without getuid (e.g., Windows-like)
    restore.push(override('getuid', undefined));

    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({
      taskId: 'task-123',
      workingDir: '/Users/test/project',
    });
    expect(result).toEqual({ path: null });
  });

  it('returns null on win32 even when a matching file is sitting there', async () => {
    // The uid-keyed directory has no Windows counterpart, so the lookup declines
    // rather than guessing. Asserted with the file present, so this stays a
    // statement about the platform and not about an empty directory.
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const taskId = 'task-win32';
    await createOutputFile('runtime-uuid-win32', taskId, '-Users-test-project');
    restore.push(override('platform', 'win32'));

    const { findBackgroundTaskOutputPath } = await import('../findBackgroundTaskOutputPath');
    const result = await findBackgroundTaskOutputPath({
      taskId,
      workingDir: '/Users/test/project',
    });
    expect(result).toEqual({ path: null });
  });
});

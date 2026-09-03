import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'fs/promises';
import { join } from 'path';
import { realpathSync } from 'fs';
import * as os from 'os';

describe('loadBackgroundTaskOutput', () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Use realpathSync to resolve symlinks (macOS /var -> /private/var), matching
    // findBackgroundTaskOutputPath.test.ts's setup for the same tmp-root contract.
    tmpDir = realpathSync(await mkdtemp(join(os.tmpdir(), 'lbto-test-')));
    vi.resetModules();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reads the output file content when it is under the tmp root', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const outputFile = join(tmpDir, 'tasks', 'b1.output');
    await mkdir(join(tmpDir, 'tasks'), { recursive: true });
    await writeFile(outputFile, 'count: 1\ncount: 2\n[exited with code 0]\n');

    const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
    const result = await loadBackgroundTaskOutput({ outputFile });

    expect(result).toEqual({ text: 'count: 1\ncount: 2\n[exited with code 0]\n', truncated: false });
  });

  it('returns empty when the file does not exist yet (task just started)', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
    const result = await loadBackgroundTaskOutput({ outputFile: join(tmpDir, 'tasks', 'missing.output') });
    expect(result).toEqual({ text: '', truncated: false });
  });

  it('returns empty for an empty outputFile', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
    const result = await loadBackgroundTaskOutput({ outputFile: '' });
    expect(result).toEqual({ text: '', truncated: false });
  });

  it('rejects an outputFile outside the tmp root (path traversal)', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const outside = await mkdtemp(join(os.tmpdir(), 'lbto-outside-'));
    const outsideFile = join(outside, 'secret.output');
    await writeFile(outsideFile, 'top secret');
    try {
      const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
      const result = await loadBackgroundTaskOutput({ outputFile: outsideFile });
      expect(result).toEqual({ text: '', truncated: false });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('follows a symlink whose target resolves under the Claude config dir\'s projects root (a backgrounded Agent/Task\'s advertised output path, issue #383)', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const configDir = realpathSync(await mkdtemp(join(os.tmpdir(), 'lbto-config-')));
    vi.stubEnv('CLAUDE_CONFIG_DIR', configDir);
    try {
      const realTranscriptDir = join(configDir, 'projects', '-private-tmp-demo', 'sess1', 'subagents');
      await mkdir(realTranscriptDir, { recursive: true });
      const realTranscript = join(realTranscriptDir, 'agent-a1.jsonl');
      await writeFile(realTranscript, '{"type":"user","uuid":"u1"}\n');

      const outputFile = join(tmpDir, 'tasks', 'a1.output');
      await mkdir(join(tmpDir, 'tasks'), { recursive: true });
      await symlink(realTranscript, outputFile);

      const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
      const result = await loadBackgroundTaskOutput({ outputFile });

      expect(result).toEqual({ text: '{"type":"user","uuid":"u1"}\n', truncated: false });
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('truncates and flags truncated when the log exceeds the cap, keeping the tail', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const outputFile = join(tmpDir, 'tasks', 'big.output');
    await mkdir(join(tmpDir, 'tasks'), { recursive: true });
    const big = 'x'.repeat(200_000) + 'TAIL_MARKER';
    await writeFile(outputFile, big);

    const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
    const result = await loadBackgroundTaskOutput({ outputFile });

    expect(result.truncated).toBe(true);
    expect(result.text.endsWith('TAIL_MARKER')).toBe(true);
    expect(result.text.length).toBe(200_000);
  });
});

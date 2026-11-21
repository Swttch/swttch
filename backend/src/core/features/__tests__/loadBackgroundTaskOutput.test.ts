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

  it('follows a symlink whose target resolves under the Claude config dir\'s projects root (a backgrounded Agent/Task\'s advertised output path, issue #383)', async (ctx) => {
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
      try {
        await symlink(realTranscript, outputFile);
      } catch (error) {
        // Windows lets only an elevated process, or one with Developer Mode on, create a
        // symlink. Without that right there is no link to follow, so there is nothing to test.
        if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
          ctx.skip();
        }
        throw error;
      }

      const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
      const result = await loadBackgroundTaskOutput({ outputFile });

      expect(result).toEqual({ text: '{"type":"user","uuid":"u1"}\n', truncated: false, startIndex: 0 });
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

  // A subagent's record carries hook context and requests that can be several times the size of the conversation.
  // It used to be cut by size from the front, which cut the conversation (the calls and replies) and kept the bulk.
  describe('an agent record (JSONL)', () => {
    const line = (entry: object) => JSON.stringify(entry);
    const bulk = (n: number) => Array.from({ length: n }, (_, i) => line({ type: 'attachment', uuid: `att-${i}`, pad: 'x'.repeat(2000) }));

    async function write(lines: string[]) {
      vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
      const outputFile = join(tmpDir, 'tasks', 'agent.output');
      await mkdir(join(tmpDir, 'tasks'), { recursive: true });
      await writeFile(outputFile, lines.join('\n') + '\n');
      return outputFile;
    }

    it('sends the whole record, however large, when it holds no more than one page of conversation', async () => {
      const prompt = line({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'the prompt' } });
      const reply = line({ type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [] } });
      const outputFile = await write([prompt, ...bulk(400), reply]); // about 800 KB

      const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
      const result = await loadBackgroundTaskOutput({ outputFile });

      expect(result.truncated).toBe(false);
      expect(result.startIndex).toBe(0);
      const kept = result.text.split('\n').filter(Boolean);
      expect(kept[0]).toBe(prompt);
      expect(kept).toHaveLength(402);
    });

    it('sends the last page of conversation with everything between its entries, and says where it starts', async () => {
      const convo = Array.from({ length: 100 }, (_, i) =>
        line({ type: i % 2 === 0 ? 'user' : 'assistant', uuid: `c-${i}` }),
      );
      const outputFile = await write(convo);

      const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
      const result = await loadBackgroundTaskOutput({ outputFile });

      const kept = result.text.split('\n').filter(Boolean).map((l) => JSON.parse(l).uuid);
      expect(result.truncated).toBe(true);
      expect(result.startIndex).toBe(60);
      expect(kept).toHaveLength(40);
      expect(kept[0]).toBe('c-60');
      expect(kept[kept.length - 1]).toBe('c-99');
    });

    it('reaches a page further back for each page asked for, and the whole record at last', async () => {
      const convo = Array.from({ length: 100 }, (_, i) =>
        line({ type: i % 2 === 0 ? 'user' : 'assistant', uuid: `c-${i}` }),
      );
      const outputFile = await write(convo);

      const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
      const two = await loadBackgroundTaskOutput({ outputFile, pages: 2 });
      expect(two.startIndex).toBe(20);
      expect(two.truncated).toBe(true);
      const three = await loadBackgroundTaskOutput({ outputFile, pages: 3 });
      expect(three.startIndex).toBe(0);
      expect(three.truncated).toBe(false);
      expect(three.text.split('\n').filter(Boolean)).toHaveLength(100);
    });
  });

  it('does not put the first line in front of a plain text log that is cut', async () => {
    vi.stubEnv('CLAUDE_CODE_TMPDIR', tmpDir);
    const outputFile = join(tmpDir, 'tasks', 'log.output');
    await mkdir(join(tmpDir, 'tasks'), { recursive: true });
    await writeFile(outputFile, 'FIRST_LINE\n' + 'x'.repeat(200_000) + 'TAIL_MARKER');

    const { loadBackgroundTaskOutput } = await import('../loadBackgroundTaskOutput');
    const result = await loadBackgroundTaskOutput({ outputFile });

    expect(result.text.includes('FIRST_LINE')).toBe(false);
  });
});

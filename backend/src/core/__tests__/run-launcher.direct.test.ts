import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../augmented-path', () => ({ augmentedEnv: () => ({ ...process.env }) }));
import { runLauncher } from '../run-launcher';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('direct launcher executes real argv without a shell', () => {
  it.each(['darwin', 'linux', 'win32'] as const)('preserves hostile-looking arguments through the %s branch', async platform => {
    const root = await mkdtemp(join(tmpdir(), 'launcher argv '));
    try {
      const script = join(root, '한글 & percent%.mjs');
      await writeFile(script, 'console.log(JSON.stringify({args:process.argv.slice(2), value:process.env.CCG_ARGV_PROBE, cwd:process.cwd()}))');
      vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
      vi.stubEnv('SHELL', '/not-a-real-shell');
      vi.stubEnv('ComSpec', '/not-a-real-cmd');
      const args = ['space here', '한글', '&echo', '%PATH%', '!VAR!', '^caret', '$HOME', '`echo`', '(x)', 'quote"x'];
      const result = await runLauncher(process.execPath, [script, ...args], {
        timeout: 3000, maxBuffer: 4096, direct: true, cwd: root, env: { CCG_ARGV_PROBE: 'isolated' },
      });
      expect(result.ok).toBe(true);
      const data = JSON.parse(result.output) as { args: string[]; value: string; cwd: string };
      expect(data.args).toEqual(args);
      expect(data.value).toBe('isolated');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

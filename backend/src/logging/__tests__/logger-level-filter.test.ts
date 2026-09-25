import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '../logger';
import { LOG_LEVEL_ENV } from '../log-level';

/**
 * The claim this whole change rests on: a DEBUG line does not reach the log file.
 *
 * Issue #477 measured 9,146 B/s going to disk while the plugin was idle, because
 * every console call was written regardless of level. Moving the per-token lines
 * to DEBUG is only worth anything if DEBUG is genuinely dropped — and dropped by
 * the backend, which is the one place that decides what lands on disk.
 */

let dir: string;
let originalConsole: Record<string, (...args: unknown[]) => void>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ccg-logger-level-test-'));
  originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
});

afterEach(() => {
  // interceptConsole() replaces the globals and offers no way back, so restore
  // them here — leaving them patched would leak into every later test file.
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;

  rmSync(dir, { recursive: true, force: true });
  delete process.env[LOG_LEVEL_ENV];
});

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 60));
}

function writtenLog(): string {
  const path = join(dir, `server-${process.pid}.log`);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

describe('Logger — the level floor decides what reaches disk', () => {
  it('drops a DEBUG line from the console', async () => {
    const logger = new Logger(dir);
    await logger.init();
    logger.interceptConsole();

    console.debug('[node-backend]', 'per-token-noise');
    console.log('[node-backend]', 'ordinary-progress');

    await settle();
    await logger.close();

    const contents = writtenLog();
    expect(contents).not.toContain('per-token-noise');
    expect(contents).toContain('ordinary-progress');
  });

  it('writes the DEBUG line once CCG_LOG_LEVEL asks for it', async () => {
    process.env[LOG_LEVEL_ENV] = 'debug';

    const logger = new Logger(dir);
    await logger.init();
    logger.interceptConsole();

    console.debug('[node-backend]', 'per-token-noise');

    await settle();
    await logger.close();

    expect(writtenLog()).toContain('per-token-noise');
  });

  it('drops a DEBUG line forwarded by the webview', async () => {
    const logger = new Logger(dir);
    await logger.init();

    logger.handleWebViewLogs([
      { level: 'debug', source: 'webview', sessionId: null, message: 'bridge-chatter', timestamp: Date.now() },
      { level: 'error', source: 'webview', sessionId: null, message: 'a-real-failure', timestamp: Date.now() },
    ] as never);

    await settle();
    await logger.close();

    const contents = writtenLog();
    expect(contents).not.toContain('bridge-chatter');
    expect(contents).toContain('a-real-failure');
  });

  it('still records warnings and errors, which are the reason logs exist', async () => {
    const logger = new Logger(dir);
    await logger.init();
    logger.interceptConsole();

    console.warn('[node-backend]', 'a-warning');
    console.error('[node-backend]', 'a-failure');

    await settle();
    await logger.close();

    const contents = writtenLog();
    expect(contents).toContain('a-warning');
    expect(contents).toContain('a-failure');
  });
});

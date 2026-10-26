import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `swttch-ext` is run like `ccb`: as a child, with the answer read from its output. These tests lay
 * out a kit the way a global install does and stand a fake command in for the process.
 */

/** What the fake `swttch-ext --capabilities` prints. */
let advertised: string[] = [];
/** What the fake `swttch-ext api ...` prints, and the exit it ends with. */
let apiAnswer: { stdout: string; fail: boolean } = { stdout: '', fail: false };
/** The arguments of the last `api` call. */
let lastApiArgs: string[] = [];
let globalRoot = '';
/** Whether the installed package has a swttch-ext entry. */
let withExt = true;

vi.mock('../command', () => ({
  ShellKind: { LoginInteractive: 'login-interactive', Direct: 'direct' },
  Command: class {
    constructor(
      private readonly command: string,
      private readonly args: string[] = [],
    ) {}
    which() {
      return Promise.resolve('/global/bin/ccb');
    }
    exec() {
      if (this.args.includes('--capabilities')) {
        return Promise.resolve({ stdout: JSON.stringify({ capabilities: advertised }), stderr: '' });
      }
      if (this.args.includes('api')) {
        lastApiArgs = this.args.slice(this.args.indexOf('api'));
        if (apiAnswer.fail) return Promise.reject(Object.assign(new Error('exit 1'), { stdout: apiAnswer.stdout }));
        return Promise.resolve({ stdout: apiAnswer.stdout, stderr: '' });
      }
      return Promise.resolve({ stdout: globalRoot, stderr: '' });
    }
  },
}));

vi.mock('../claude', () => ({
  Claude: { applyConfigDir: vi.fn().mockResolvedValue(undefined), authStripEnv: vi.fn().mockResolvedValue({}) },
}));

const { getExtCapabilities, runExtApi, resetExtendKitCache } = await import('../extend-kit');

const realAppData = process.env.APPDATA;
const realExecPath = process.execPath;

beforeEach(async () => {
  resetExtendKitCache();
  advertised = [];
  apiAnswer = { stdout: '', fail: false };
  lastApiArgs = [];
  withExt = true;
  globalRoot = await mkdtemp(join(tmpdir(), 'ccg-kit-ext-'));
  process.env.APPDATA = join(globalRoot, 'no-appdata');
  Object.defineProperty(process, 'execPath', { value: join(globalRoot, 'no-node', 'node'), configurable: true });
});

afterEach(async () => {
  if (realAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = realAppData;
  Object.defineProperty(process, 'execPath', { value: realExecPath, configurable: true });
  await rm(globalRoot, { recursive: true, force: true });
});

async function layOutKit(bin: Record<string, string>) {
  const packageDir = join(globalRoot, '@swttch', 'extend-kit');
  await mkdir(join(packageDir, 'bin'), { recursive: true });
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ version: '0.8.0', bin }));
  for (const file of Object.values(bin)) await writeFile(join(packageDir, file), '');
}

describe('getExtCapabilities', () => {
  it('lists what a kit with swttch-ext advertises', async () => {
    await layOutKit({ ccb: 'bin/ccb.js', 'swttch-ext': 'bin/ext.js' });
    advertised = ['api.frame.list', 'api.frame.retitle'];
    expect(await getExtCapabilities()).toEqual({ installed: true, capabilities: advertised, version: '0.8.0' });
  });

  it('learns of a kit updated from a terminal after a while, without a restart', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await layOutKit({ ccb: 'bin/ccb.js', 'swttch-ext': 'bin/ext.js' });
      advertised = ['api.frame.list'];
      expect((await getExtCapabilities()).capabilities).toEqual(['api.frame.list']);

      // The kit is updated: the command now has one more call. Within the minute the old list stands.
      advertised = ['api.frame.list', 'api.frame.duplicate'];
      expect((await getExtCapabilities()).capabilities).toEqual(['api.frame.list']);

      vi.setSystemTime(Date.now() + 31_000);
      expect((await getExtCapabilities()).capabilities).toEqual(['api.frame.list', 'api.frame.duplicate']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says not installed for a kit from before the command, without failing', async () => {
    await layOutKit({ ccb: 'bin/ccb.js' });
    expect(await getExtCapabilities()).toEqual({ installed: false, capabilities: [], version: '0.8.0' });
  });
});

describe('runExtApi', () => {
  it('passes the parameters as separate arguments, adds --yes only when asked, and returns the kit\'s answer', async () => {
    await layOutKit({ ccb: 'bin/ccb.js', 'swttch-ext': 'bin/ext.js' });
    advertised = ['api.frame.retitle', 'api.frame.delete'];
    apiAnswer = { stdout: '{"ok":true,"data":{"title":"New"}}', fail: false };

    const renamed = await runExtApi('frame', 'retitle', { slug: 'abc', title: 'a b; rm -rf /' });
    expect(renamed).toEqual({ ok: true, data: { title: 'New' } });
    expect(lastApiArgs).toEqual(['api', 'frame', 'retitle', '--slug', 'abc', '--title', 'a b; rm -rf /']);

    await runExtApi('frame', 'delete', { slug: 'abc' }, { yes: true });
    expect(lastApiArgs).toEqual(['api', 'frame', 'delete', '--slug', 'abc', '--yes']);
  });

  it('reads the answer of a call the server refused, which exits non-zero and still prints JSON', async () => {
    await layOutKit({ ccb: 'bin/ccb.js', 'swttch-ext': 'bin/ext.js' });
    advertised = ['api.frame.pin'];
    apiAnswer = { stdout: '{"ok":false,"error":{"code":"not_found","message":"gone","status":404}}', fail: true };
    expect(await runExtApi('frame', 'pin', { slug: 'x' })).toEqual({ ok: false, error: { code: 'not_found', message: 'gone', status: 404 } });
  });

  it('says the kit is missing, or too old for that call, before running anything', async () => {
    await layOutKit({ ccb: 'bin/ccb.js' });
    const missing = await runExtApi('frame', 'pin', { slug: 'x' });
    expect(missing).toMatchObject({ ok: false, error: { code: 'extend_kit_missing' } });

    resetExtendKitCache();
    await layOutKit({ ccb: 'bin/ccb.js', 'swttch-ext': 'bin/ext.js' });
    advertised = ['api.frame.list'];
    const tooOld = await runExtApi('frame', 'pin', { slug: 'x' });
    expect(tooOld).toMatchObject({ ok: false, error: { code: 'extend_kit_too_old' } });
    expect(lastApiArgs).toEqual([]);
  });

  it('says so when the output is not an answer', async () => {
    await layOutKit({ ccb: 'bin/ccb.js', 'swttch-ext': 'bin/ext.js' });
    advertised = ['api.frame.pin'];
    apiAnswer = { stdout: 'welcome to zsh', fail: false };
    expect(await runExtApi('frame', 'pin', { slug: 'x' })).toMatchObject({ ok: false, error: { code: 'extend_kit_unreadable' } });
  });
});

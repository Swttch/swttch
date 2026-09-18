import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A kit that streams dictation is not automatically a kit that reads Claude's settings files.
 *
 * 0.7.0 advertises `stt.stream` and reads no settings file. This backend stopped copying that
 * `env` block into the child once a kit could read it — so on 0.7.0 a proxy or a
 * CLAUDE_CODE_OAUTH_TOKEN written only into settings.json now reaches nobody, and the symptom
 * is a 401 or a timeout with nothing pointing at the cause. Both call sites therefore ask for
 * `settings.env` by name rather than trusting a version number or the other capability.
 */

/** What the fake `ccb --capabilities` prints. */
let advertised: string[] = [];
/** Whether the fake CLI can be found at all. */
let ccbPath: string | null = '/global/bin/ccb';
/** A real directory laid out like a global node_modules, since the entry is stat'd. */
let globalRoot = '';
/** How many times the fake CLI was asked what it supports. */
let capabilityProbes = 0;

vi.mock('../command', () => ({
  ShellKind: { LoginInteractive: 'login-interactive', Direct: 'direct' },
  Command: class {
    constructor(
      private readonly command: string,
      private readonly args: string[] = [],
    ) {}
    which() {
      return Promise.resolve(ccbPath);
    }
    exec() {
      if (this.args.includes('--capabilities')) {
        capabilityProbes += 1;
        return Promise.resolve({ stdout: JSON.stringify({ capabilities: advertised }), stderr: '' });
      }
      // Root discovery: answer the one place the fixture lays the package out.
      return Promise.resolve({ stdout: globalRoot, stderr: '' });
    }
  },
}));

// Every ccb spawn is handed the same env the chat spawn gets, so the strip is part of the
// call path now even for a capability probe.
vi.mock('../claude', () => ({
  Claude: {
    applyConfigDir: vi.fn().mockResolvedValue(undefined),
    authStripEnv: vi.fn().mockResolvedValue({}),
  },
}));

const { hasSettingsEnvCapability, resetExtendKitCache } = await import('../extend-kit');

beforeEach(async () => {
  resetExtendKitCache();
  ccbPath = '/global/bin/ccb';
  capabilityProbes = 0;
  globalRoot = await mkdtemp(join(tmpdir(), 'ccg-kit-caps-'));
  const packageDir = join(globalRoot, '@swttch', 'extend-kit');
  await mkdir(join(packageDir, 'bin'), { recursive: true });
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ version: '0.7.3', bin: { ccb: 'bin/ccb.js' } }));
  await writeFile(join(packageDir, 'bin', 'ccb.js'), '');
});

afterEach(async () => {
  await rm(globalRoot, { recursive: true, force: true });
});

describe('hasSettingsEnvCapability', () => {
  it('says yes when the kit advertises it', async () => {
    advertised = ['oauth.usage.account-file', 'stt.stream', 'settings.env'];

    expect(await hasSettingsEnvCapability('/project/a')).toBe(true);
  });

  it('says no for a kit that streams dictation but reads no settings file', async () => {
    // This is 0.7.0 exactly. Trusting `stt.stream` here would let it through.
    advertised = ['oauth.usage.account-file', 'stt.stream'];

    expect(await hasSettingsEnvCapability('/project/a')).toBe(false);
  });

  it('says no when the kit is not installed, rather than failing the caller', async () => {
    ccbPath = null;

    // The usage panel turns a "no" into "update ccb". A throw here would instead surface as
    // an unexplained failure of the whole panel.
    expect(await hasSettingsEnvCapability('/project/a')).toBe(false);
  });
});

describe('asking what the kit supports', () => {
  it('spawns the probe once and reuses the answer', async () => {
    advertised = ['oauth.usage.account-file', 'stt.stream', 'settings.env'];

    await hasSettingsEnvCapability('/project/a');
    await hasSettingsEnvCapability('/project/a');
    await hasSettingsEnvCapability('/project/b');

    // Asking costs a process spawn, measured at about 120ms, and the usage panel asks on
    // every refresh. The answer cannot change under a running install.
    expect(capabilityProbes).toBe(1);
  });

  it('asks again after the install is refreshed', async () => {
    advertised = ['stt.stream'];
    expect(await hasSettingsEnvCapability()).toBe(false);

    // Installing or updating the kit goes through this reset, and it is the one thing that
    // can change the answer.
    resetExtendKitCache();
    advertised = ['stt.stream', 'settings.env'];

    expect(await hasSettingsEnvCapability()).toBe(true);
    expect(capabilityProbes).toBe(2);
  });
});

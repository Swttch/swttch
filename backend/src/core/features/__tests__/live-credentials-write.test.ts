import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// On macOS these functions write to the real Keychain. Nothing here may reach it, whatever the platform stub does.
vi.mock('child_process', () => ({
  execFile: vi.fn(() => {
    throw new Error('the Keychain must not be reached from a test');
  }),
}));

import { writeLiveCredentials, writeLiveOauthAccount } from '../live-credentials';

describe('writing the live credential files', () => {
  const realPlatform = process.platform;
  const savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
  let configDir = '';

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'ccg-live-cred-'));
    process.env.CLAUDE_CONFIG_DIR = configDir;
    // The file store is the Linux and Windows one.
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: realPlatform });
    if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
    rmSync(configDir, { recursive: true, force: true });
  });

  // A save that waits between creating its temp file and renaming it can be ended in that gap by the backend's
  // own shutdown, and would leave a copy of the login token behind.
  it('has the credential file in place and no temp file the moment the call is made', async () => {
    const saved = writeLiveCredentials('{"claudeAiOauth":{}}');

    expect(readdirSync(configDir)).toEqual(['.credentials.json']);
    await saved;
    const path = join(configDir, '.credentials.json');
    expect(readFileSync(path, 'utf-8')).toBe('{"claudeAiOauth":{}}');
    if (realPlatform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('leaves only .claude.json after saving the account it belongs to', async () => {
    await writeLiveOauthAccount({ emailAddress: 'a@x.com' });

    expect(readdirSync(configDir)).toEqual(['.claude.json']);
    expect(JSON.parse(readFileSync(join(configDir, '.claude.json'), 'utf-8'))).toEqual({
      oauthAccount: { emailAddress: 'a@x.com' },
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  watch: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

import { readFile } from 'fs/promises';
import { join } from 'path';
import { getStrippableAuthEnvKeys } from '../claude-settings';

const mockReadFile = vi.mocked(readFile);

// The reader builds every settings path with join(), so the fixture keys have
// to carry the host separator — spelled as POSIX literals they match nothing on
// Windows, and each file reads as absent.
const HOME_SETTINGS = join('/mock-home', '.claude', 'settings.json');
const HOME_SETTINGS_LOCAL = join('/mock-home', '.claude', 'settings.local.json');
const PROJECT_DIR = '/mock-project';
const PROJECT_SETTINGS = join(PROJECT_DIR, '.claude', 'settings.json');
const PROJECT_SETTINGS_LOCAL = join(PROJECT_DIR, '.claude', 'settings.local.json');

function mockSettingsByPath(map: Record<string, unknown>): void {
  mockReadFile.mockImplementation((p: unknown) => {
    const path = String(p);
    if (path in map) {
      return Promise.resolve(JSON.stringify(map[path]) as never);
    }
    return Promise.reject(new Error(`ENOENT: ${path}`));
  });
}

describe('getStrippableAuthEnvKeys()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strips the OAuth token keys — but NOT ANTHROPIC_API_KEY — when no settings specify any', async () => {
    mockSettingsByPath({
      [HOME_SETTINGS]: { env: {} },
      [HOME_SETTINGS_LOCAL]: {},
    });
    const keys = await getStrippableAuthEnvKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
      ]),
    );
    expect(keys).toHaveLength(2);
  });

  it('strips only the OAuth token keys when settings files do not exist at all', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const keys = await getStrippableAuthEnvKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
      ]),
    );
    expect(keys).toHaveLength(2);
  });

  // Regression for marketplace review #140950: a user who authenticates by exporting
  // ANTHROPIC_API_KEY (shell env / Windows `setx`) without pinning it in settings.json must
  // NOT have it stripped — the CLI reads that env var directly, and stripping it left the
  // plugin "Not logged in" / unable to prompt. The API key never expires, so it is never a
  // strip target regardless of settings.
  it('never strips ANTHROPIC_API_KEY even when it is not pinned in any settings file', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const keys = await getStrippableAuthEnvKeys();
    expect(keys).not.toContain('ANTHROPIC_API_KEY');
  });

  it('excludes an OAuth token key when user explicitly sets it in global settings.json env', async () => {
    mockSettingsByPath({
      [HOME_SETTINGS]: { env: { CLAUDE_CODE_OAUTH_TOKEN: 'token-user-pinned' } },
      [HOME_SETTINGS_LOCAL]: {},
    });
    const keys = await getStrippableAuthEnvKeys();
    expect(keys).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(keys).toContain('CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR');
  });

  it('excludes an OAuth token key when user explicitly sets it in settings.local.json env', async () => {
    mockSettingsByPath({
      [HOME_SETTINGS]: {},
      [HOME_SETTINGS_LOCAL]: { env: { CLAUDE_CODE_OAUTH_TOKEN: 'token-from-local' } },
    });
    const keys = await getStrippableAuthEnvKeys();
    expect(keys).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(keys).toContain('CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR');
  });

  it('excludes an OAuth token key when user explicitly sets it in project settings.json env', async () => {
    mockSettingsByPath({
      [HOME_SETTINGS]: {},
      [HOME_SETTINGS_LOCAL]: {},
      [PROJECT_SETTINGS]: { env: { CLAUDE_CODE_OAUTH_TOKEN: 'project-token' } },
      [PROJECT_SETTINGS_LOCAL]: {},
    });
    const keys = await getStrippableAuthEnvKeys(PROJECT_DIR);
    expect(keys).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(keys).toContain('CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR');
  });

  it('excludes an OAuth token key when user explicitly sets it in project settings.local.json env', async () => {
    mockSettingsByPath({
      [HOME_SETTINGS]: {},
      [HOME_SETTINGS_LOCAL]: {},
      [PROJECT_SETTINGS]: {},
      [PROJECT_SETTINGS_LOCAL]: { env: { CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR: '7' } },
    });
    const keys = await getStrippableAuthEnvKeys(PROJECT_DIR);
    expect(keys).not.toContain('CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR');
    expect(keys).toContain('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('treats env as empty when settings.env is not an object (malformed)', async () => {
    mockSettingsByPath({
      [HOME_SETTINGS]: { env: 'not-an-object' },
      [HOME_SETTINGS_LOCAL]: {},
    });
    const keys = await getStrippableAuthEnvKeys();
    expect(keys).toHaveLength(2);
  });

  it('honors precedence: a project-explicit OAuth key overrides, leaving only the unspecified one', async () => {
    // CLAUDE_CODE_OAUTH_TOKEN explicit only in global; nothing pins FILE_DESCRIPTOR anywhere.
    mockSettingsByPath({
      [HOME_SETTINGS]: { env: { CLAUDE_CODE_OAUTH_TOKEN: 'g' } },
      [HOME_SETTINGS_LOCAL]: {},
      [PROJECT_SETTINGS]: {},
      [PROJECT_SETTINGS_LOCAL]: {},
    });
    const keys = await getStrippableAuthEnvKeys(PROJECT_DIR);
    expect(keys).toEqual(['CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR']);
  });
});

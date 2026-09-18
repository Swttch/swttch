import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The effective environment for a project: what the process holds, with Claude's settings
 * `env` block laid over the top.
 *
 * This replaces a projection that wrote the same values into `process.env` through an
 * allow-list of eight proxy variable names. The allow-list is what the first two assertions
 * below exist to keep gone: it dropped a proxy set only in settings.json (#181), and after
 * four names were added it dropped the same proxy written in lower case (#432).
 *
 * The value-shape assertions are not invented. Each states what `claude` 2.1.261 was measured
 * to do with the same settings file, so drifting away from `claude` fails here rather than in
 * someone's corporate network.
 */

const readMergedClaudeSettings = vi.hoisted(() => vi.fn());

vi.mock('../claude-settings', async (importOriginal) => ({
  // Spread the real module: a bare factory replaces every other export with undefined, and
  // this module is imported by much of the backend.
  ...(await importOriginal<typeof import('../claude-settings')>()),
  readMergedClaudeSettings,
}));

const { readSettingsEnv, resolveEnv } = await import('../settings-env');

/** State a settings `env` block for the next call. */
function settingsEnv(env: Record<string, unknown>): void {
  readMergedClaudeSettings.mockResolvedValue({ settings: { env }, overrides: [] });
}

beforeEach(() => {
  readMergedClaudeSettings.mockReset();
  settingsEnv({});
});

describe('readSettingsEnv', () => {
  it('returns every name in the block, including ones no allow-list would have listed', async () => {
    settingsEnv({
      HTTPS_PROXY: 'http://proxy.corp:8080',
      https_proxy: 'http://lower.corp:8080',
      CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-from-settings',
      SOMETHING_WE_HAVE_NEVER_HEARD_OF: 'still here',
    });

    const env = await readSettingsEnv('/project/a');

    expect(env.HTTPS_PROXY).toBe('http://proxy.corp:8080');
    expect(env.https_proxy).toBe('http://lower.corp:8080');
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat01-from-settings');
    expect(env.SOMETHING_WE_HAVE_NEVER_HEARD_OF).toBe('still here');
  });

  it('reads the settings of the working directory it was given', async () => {
    await readSettingsEnv('/project/a');

    expect(readMergedClaudeSettings).toHaveBeenCalledWith('/project/a');
  });

  it('stringifies numbers and booleans, as claude does', async () => {
    settingsEnv({ A_NUMBER: 1234, A_BOOL: true });

    const env = await readSettingsEnv('/project/a');

    expect(env.A_NUMBER).toBe('1234');
    expect(env.A_BOOL).toBe('true');
  });

  it('keeps an empty string as a value rather than treating it as a removal', async () => {
    settingsEnv({ AN_EMPTY: '' });

    const env = await readSettingsEnv('/project/a');

    expect(env.AN_EMPTY).toBe('');
    expect('AN_EMPTY' in env).toBe(true);
  });

  it('leaves ${NAME} verbatim, because claude does not expand it either', async () => {
    settingsEnv({ A_BRACE: 'pre-${HOME}-post', A_FALLBACK: '${UNSET:-fb}' });

    const env = await readSettingsEnv('/project/a');

    expect(env.A_BRACE).toBe('pre-${HOME}-post');
    expect(env.A_FALLBACK).toBe('${UNSET:-fb}');
  });

  it('drops values that cannot be an environment value at all', async () => {
    settingsEnv({ AN_OBJECT: { nested: true }, AN_ARRAY: [1, 2], A_NULL: null, KEPT: 'yes' });

    const env = await readSettingsEnv('/project/a');

    expect(env.AN_OBJECT).toBeUndefined();
    expect(env.AN_ARRAY).toBeUndefined();
    expect(env.A_NULL).toBeUndefined();
    expect(env.KEPT).toBe('yes');
  });

  it('never takes CLAUDE_CONFIG_DIR from the block', async () => {
    settingsEnv({ CLAUDE_CONFIG_DIR: '/somewhere/else', OTHER: 'kept' });

    const env = await readSettingsEnv('/project/a');

    // That variable decides where the settings files are, so reading it back out of one is
    // circular. It is settled from the plugin's own settings instead.
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(env.OTHER).toBe('kept');
  });

  it('answers with nothing when the block is absent or not an object', async () => {
    readMergedClaudeSettings.mockResolvedValue({ settings: {}, overrides: [] });
    expect(await readSettingsEnv('/project/a')).toEqual({});

    readMergedClaudeSettings.mockResolvedValue({ settings: { env: ['nope'] }, overrides: [] });
    expect(await readSettingsEnv('/project/a')).toEqual({});
  });
});

describe('resolveEnv', () => {
  it('lets the settings value win over the inherited one', async () => {
    settingsEnv({ HTTPS_PROXY: 'http://from-settings:8080' });

    const env = await resolveEnv('/project/a', { HTTPS_PROXY: 'http://from-shell:3128' });

    // Measured against claude: with the same name exported in the shell and written into
    // settings.json, the value its child received was the settings one.
    expect(env.HTTPS_PROXY).toBe('http://from-settings:8080');
  });

  it('keeps an inherited variable the settings files say nothing about', async () => {
    settingsEnv({ HTTPS_PROXY: 'http://from-settings:8080' });

    const env = await resolveEnv('/project/a', {
      HTTPS_PROXY: 'http://from-shell:3128',
      HTTP_PROXY: 'http://from-shell-http:3128',
    });

    // Setting HTTPS_PROXY says nothing about HTTP_PROXY. Each name is its own answer.
    expect(env.HTTP_PROXY).toBe('http://from-shell-http:3128');
  });

  it('does not touch the process environment', async () => {
    settingsEnv({ CCG_RESOLVE_ENV_PROBE: 'from-settings' });

    await resolveEnv('/project/a');

    // The whole reason this returns a value instead of writing one: process.env is a single
    // slot for the backend, and a project-scoped value written there outlives the project.
    expect(process.env.CCG_RESOLVE_ENV_PROBE).toBeUndefined();
  });

  /**
   * Windows matches environment variable names case-insensitively: `HTTPS_PROXY` and
   * `https_proxy` are one variable there. Layering a settings value written in one spelling
   * beside an inherited value written in the other leaves both present, and a reader that
   * checks the upper-case form first reports the value the user replaced.
   *
   * The predecessor of this module learned the same lesson as a real defect: interleaving
   * writes and deletes across both spellings left Windows users with no proxy at all while
   * macOS and Linux were fine. Verified then on a Windows 11 machine.
   */
  describe('on Windows, where the two spellings are one variable', () => {
    it('drops the inherited spelling the settings block replaces', async () => {
      settingsEnv({ https_proxy: 'http://from-settings:8080' });

      const env = await resolveEnv('/project/a', { HTTPS_PROXY: 'http://from-shell:3128' }, 'win32');

      expect(env.HTTPS_PROXY).toBeUndefined();
      expect(env.https_proxy).toBe('http://from-settings:8080');
    });

    it('still keeps an inherited variable the block does not mention', async () => {
      settingsEnv({ https_proxy: 'http://from-settings:8080' });

      const env = await resolveEnv('/project/a', {
        HTTPS_PROXY: 'http://from-shell:3128',
        HTTP_PROXY: 'http://from-shell-http:3128',
      }, 'win32');

      expect(env.HTTP_PROXY).toBe('http://from-shell-http:3128');
    });
  });

  describe('everywhere else, where they are two variables', () => {
    it('keeps both, because the user who wrote one did not write the other', async () => {
      settingsEnv({ https_proxy: 'http://from-settings:8080' });

      const env = await resolveEnv('/project/a', { HTTPS_PROXY: 'http://from-shell:3128' }, 'linux');

      expect(env.HTTPS_PROXY).toBe('http://from-shell:3128');
      expect(env.https_proxy).toBe('http://from-settings:8080');
    });
  });
});

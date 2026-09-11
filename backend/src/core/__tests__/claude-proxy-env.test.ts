import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The proxy configured in settings.json reaches `ccb` through process.env, which
 * Claude.applyConfigDir projects when a context loads (#181).
 *
 * What is tested here is the projection, not the reading — reading the `env`
 * block is claude-settings' job and is covered in its own suite. The risk this
 * file exists for is the one projection introduces: process.env is a single
 * shared slot, so a proxy belonging to one project must not outlive the switch
 * to a project that configures none.
 */

const PROXY_KEYS = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
] as const;

const getProxyEnvFromSettings = vi.hoisted(() => vi.fn());

vi.mock('../features/settings', () => ({
  readSettingsFile: vi.fn().mockResolvedValue({ cliPath: null }),
  readMergedSettings: vi.fn().mockResolvedValue({ settings: { cliPath: null }, overrides: [] }),
  resolveClaudeConfigDirOverride: vi.fn().mockResolvedValue(null),
}));

vi.mock('../features/claude-settings', () => ({
  PROXY_ENV_KEYS: PROXY_KEYS,
  getProxyEnvFromSettings,
  getStrippableAuthEnvKeys: vi.fn().mockResolvedValue([]),
}));

// Claude captures the inherited proxy env once, at class load. Seeding it here —
// before the import — is what lets the "restore what the shell exported" case be
// tested at all. HTTPS_PROXY and HTTP_PROXY are inherited; ALL_PROXY deliberately
// is not, so the suite can also observe a key being cleared outright.
const INHERITED: Record<string, string> = {
  HTTPS_PROXY: 'http://from-shell:3128',
  HTTP_PROXY: 'http://from-shell-http:3128',
};
for (const key of PROXY_KEYS) delete process.env[key];
Object.assign(process.env, INHERITED);

const { Claude, projectProxyEnv } = await import('../claude');

/** Put process.env back to what the class believes it inherited. */
afterEach(() => {
  for (const key of PROXY_KEYS) delete process.env[key];
  Object.assign(process.env, INHERITED);
  getProxyEnvFromSettings.mockReset();
});

describe('Claude.applyConfigDir — proxy projection', () => {
  it('projects a proxy from settings onto process.env', async () => {
    getProxyEnvFromSettings.mockResolvedValue({ HTTPS_PROXY: 'http://proxy.corp:8080' });

    await Claude.applyConfigDir('/project/a');

    expect(process.env.HTTPS_PROXY).toBe('http://proxy.corp:8080');
  });

  it('reads settings for the working directory it was given', async () => {
    getProxyEnvFromSettings.mockResolvedValue({});

    await Claude.applyConfigDir('/project/a');

    expect(getProxyEnvFromSettings).toHaveBeenCalledWith('/project/a');
  });

  // The whole point of projecting at load time instead of per call site: a
  // project-scoped value must not leak across the backend. Without this, opening
  // one project behind a proxy would route every later project's usage query
  // through a proxy it never asked for. ALL_PROXY is used because nothing
  // inherited it, so "cleared" here means gone rather than restored.
  it('clears a settings-only proxy when switching to a project that configures none', async () => {
    getProxyEnvFromSettings.mockResolvedValue({ ALL_PROXY: 'socks5://proxy.corp:1080' });
    await Claude.applyConfigDir('/project/with-proxy');
    expect(process.env.ALL_PROXY).toBe('socks5://proxy.corp:1080');

    getProxyEnvFromSettings.mockResolvedValue({});
    await Claude.applyConfigDir('/project/without-proxy');

    expect(process.env.ALL_PROXY).toBeUndefined();
  });

  // Clearing must not overshoot: a proxy exported in the user's shell is not ours
  // to delete just because settings.json is silent about it.
  it('restores the shell-inherited proxy when settings configure none', async () => {
    getProxyEnvFromSettings.mockResolvedValue({ HTTPS_PROXY: 'http://from-settings:8080' });
    await Claude.applyConfigDir('/project/with-proxy');
    expect(process.env.HTTPS_PROXY).toBe('http://from-settings:8080');

    getProxyEnvFromSettings.mockResolvedValue({});
    await Claude.applyConfigDir('/project/without-proxy');

    expect(process.env.HTTPS_PROXY).toBe('http://from-shell:3128');
  });

  // Each variable is resolved on its own. Setting HTTPS_PROXY in settings.json
  // says nothing about HTTP_PROXY, so the inherited one survives.
  it('resolves each proxy variable independently', async () => {
    getProxyEnvFromSettings.mockResolvedValue({ HTTPS_PROXY: 'http://from-settings:8080' });

    await Claude.applyConfigDir('/project/a');

    expect(process.env.HTTPS_PROXY).toBe('http://from-settings:8080');
    expect(process.env.HTTP_PROXY).toBe('http://from-shell-http:3128');
  });

  it('projects NO_PROXY and the lowercase spellings too', async () => {
    getProxyEnvFromSettings.mockResolvedValue({
      NO_PROXY: 'internal.corp',
      https_proxy: 'http://lower:8080',
    });

    await Claude.applyConfigDir('/project/a');

    expect(process.env.NO_PROXY).toBe('internal.corp');
    expect(process.env.https_proxy).toBe('http://lower:8080');
  });

  it('leaves a key unset when neither settings nor the shell provide it', async () => {
    getProxyEnvFromSettings.mockResolvedValue({});

    await Claude.applyConfigDir('/project/a');

    expect(process.env.ALL_PROXY).toBeUndefined();
    expect(process.env.NO_PROXY).toBeUndefined();
  });
});

/**
 * Windows matches environment variable names case-insensitively: `HTTPS_PROXY`
 * and `https_proxy` are one variable, so deleting one spelling removes the other's
 * value. Node reproduces that, which means a projection loop that interleaves
 * writes and deletes wipes the proxy it just set — measured on a Windows 11
 * machine, where the usage panel ended up with no proxy at all while macOS was
 * fine.
 *
 * The env below models that behaviour so the regression is caught on any host.
 */
function windowsLikeEnv(initial: Record<string, string> = {}): NodeJS.ProcessEnv {
  const store = new Map<string, string>();
  for (const [key, value] of Object.entries(initial)) store.set(key.toLowerCase(), value);
  return new Proxy({} as NodeJS.ProcessEnv, {
    get: (_t, prop) => (typeof prop === 'string' ? store.get(prop.toLowerCase()) : undefined),
    set: (_t, prop, value) => {
      if (typeof prop === 'string') store.set(prop.toLowerCase(), String(value));
      return true;
    },
    deleteProperty: (_t, prop) => {
      if (typeof prop === 'string') store.delete(prop.toLowerCase());
      return true;
    },
    has: (_t, prop) => typeof prop === 'string' && store.has(prop.toLowerCase()),
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, value: undefined }),
  });
}

describe('projectProxyEnv — case-insensitive environments (Windows)', () => {
  // The regression. Before clearing was separated from writing, the uppercase
  // value written first was deleted again when the lowercase spelling of the
  // same variable came up as "not configured".
  it('keeps an uppercase proxy that the lowercase spelling would otherwise clear', () => {
    const env = windowsLikeEnv();

    projectProxyEnv({ HTTPS_PROXY: 'http://proxy.corp:8080' }, {}, env);

    expect(env.HTTPS_PROXY).toBe('http://proxy.corp:8080');
    expect(env.https_proxy).toBe('http://proxy.corp:8080');
  });

  it('keeps a lowercase proxy just the same', () => {
    const env = windowsLikeEnv();

    projectProxyEnv({ https_proxy: 'http://proxy.corp:8080' }, {}, env);

    expect(env.HTTPS_PROXY).toBe('http://proxy.corp:8080');
  });

  it('still clears a proxy that no longer applies', () => {
    const env = windowsLikeEnv({ HTTPS_PROXY: 'http://stale:8080' });

    projectProxyEnv({}, {}, env);

    expect(env.HTTPS_PROXY).toBeUndefined();
  });

  it('still restores the inherited proxy', () => {
    const env = windowsLikeEnv({ HTTPS_PROXY: 'http://from-settings:8080' });

    projectProxyEnv({}, { HTTPS_PROXY: 'http://from-shell:3128' }, env);

    expect(env.HTTPS_PROXY).toBe('http://from-shell:3128');
  });

  it('resolves each variable independently here too', () => {
    const env = windowsLikeEnv();

    projectProxyEnv({ HTTPS_PROXY: 'http://settings:8080' }, { HTTP_PROXY: 'http://shell:3128' }, env);

    expect(env.HTTPS_PROXY).toBe('http://settings:8080');
    expect(env.HTTP_PROXY).toBe('http://shell:3128');
  });
});

describe('projectProxyEnv — case-sensitive environments (macOS, Linux, WSL)', () => {
  it('keeps the two spellings apart', () => {
    const env: NodeJS.ProcessEnv = {};

    projectProxyEnv({ HTTPS_PROXY: 'http://upper:8080' }, {}, env);

    expect(env.HTTPS_PROXY).toBe('http://upper:8080');
    expect(env.https_proxy).toBeUndefined();
  });

  it('clears and restores the same way', () => {
    const env: NodeJS.ProcessEnv = { HTTPS_PROXY: 'http://stale:8080', ALL_PROXY: 'socks5://stale:1080' };

    projectProxyEnv({}, { HTTPS_PROXY: 'http://from-shell:3128' }, env);

    expect(env.HTTPS_PROXY).toBe('http://from-shell:3128');
    expect(env.ALL_PROXY).toBeUndefined();
  });
});

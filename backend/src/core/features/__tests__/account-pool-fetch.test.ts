import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fetchAccountUsage } from '../account-pool-usage';
const mock = vi.hoisted(() => ({ exec: vi.fn(), which: vi.fn() }));
vi.mock('../../command', () => ({ Command: class {
  constructor(readonly bin: string, readonly args: string[] = [], readonly options: { timeout?: number } = {}) {}
  which() { return mock.which(); }
  exec() { return mock.exec(this.bin, this.args, this.options); }
} }));
// fetchAccountUsage settles the Claude data directory before spawning, so the child reads
// credentials from the same profile chat does. That is real filesystem work and not what this
// file is about; stubbing it keeps the fake-timer test from waiting on it.
vi.mock('../../claude', () => ({
  Claude: {
    applyConfigDir: vi.fn().mockResolvedValue(undefined),
    // The spawns are handed the chat spawn's strip, so this account query authenticates the
    // same way the chat does. Empty here: what the strip contains has its own suite.
    authStripEnv: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../account-store', () => ({
  readRegistry: async () => ({ current: 'personal', accounts: { personal: {}, company: {} } }),
  accountSnapshotPath: (id: string) => `/saved accounts/${id}.json`,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.which.mockResolvedValue('/external bin/ccb');
  mock.exec.mockImplementation(async (_bin: string, args: string[]) => ({ stdout: JSON.stringify(
    args.includes('--capabilities') ? { capabilities: ['oauth.usage.account-file'] }
      : { five_hour: { utilization: 100, resets_at: null, extra_provider_field: 'preserved' } }), stderr: '' }));
});
afterEach(() => vi.useRealTimers());
it('passes only the selected snapshot path as one argv item and preserves raw response', async () => {
  expect(await fetchAccountUsage('company')).toEqual({ five_hour: { utilization: 100, resets_at: null, extra_provider_field: 'preserved' } });
  expect(mock.exec).toHaveBeenLastCalledWith('/external bin/ccb', ['oauth', 'usage', '--json', '--account-file=/saved accounts/company.json'], { timeout: 15000, cwd: undefined, env: {} });
});
it('refuses old CLI versions instead of accepting a wrong-account response', async () => {
  mock.exec.mockResolvedValue({ stdout: 'Usage: ccb <command>', stderr: '' });
  await expect(fetchAccountUsage('company')).rejects.toThrow('Update ccb');
  expect(mock.exec).toHaveBeenCalledTimes(1);
});
it.each(['token_expired', 'API error 401', 'API error 429', 'ETIMEDOUT'])('propagates %s so recovery decides for itself what it means', async error => {
  mock.exec.mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes('--capabilities')) return { stdout: '{"capabilities":["oauth.usage.account-file"]}', stderr: '' };
    throw new Error(error);
  });
  await expect(fetchAccountUsage('company')).rejects.toThrow(error);
});
it('waits for the actual delayed response', async () => {
  vi.useFakeTimers();
  mock.exec.mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes('--capabilities')) return { stdout: '{"capabilities":["oauth.usage.account-file"]}', stderr: '' };
    await new Promise(resolve => setTimeout(resolve, 3000));
    return { stdout: '{"five_hour":{"utilization":100,"resets_at":null}}', stderr: '' };
  });
  const done = vi.fn();
  const pending = fetchAccountUsage('company').then(done);
  await vi.advanceTimersByTimeAsync(2999);
  expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(done).toHaveBeenCalledOnce();
});
it('fails without invoking ccb if the account was removed', async () => {
  await expect(fetchAccountUsage('deleted')).rejects.toThrow('no longer exists');
  expect(mock.exec).not.toHaveBeenCalled();
});

// Sessions that hit their limit together each ask about every pool member, so the
// same account is asked about several times at once. Spawning a child per asker is
// what makes those queries rate-limit and time out — and a query that times out is
// read as "nothing certain to switch to".
function pendingUsage(): (result: { stdout: string; stderr: string } | Error) => void {
  let settle: (result: { stdout: string; stderr: string } | Error) => void = () => {};
  const answer = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    settle = result => (result instanceof Error ? reject(result) : resolve(result));
  });
  mock.exec.mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes('--capabilities')) return { stdout: '{"capabilities":["oauth.usage.account-file"]}', stderr: '' };
    return answer;
  });
  return settle;
}
const oauthCalls = (): unknown[] =>
  mock.exec.mock.calls.filter(call => (call[1] as string[]).includes('oauth'));

it('asks once while several callers are waiting on the same account', async () => {
  const settle = pendingUsage();
  const first = fetchAccountUsage('company');
  const second = fetchAccountUsage('company');
  const third = fetchAccountUsage('company');
  settle({ stdout: '{"five_hour":{"utilization":100,"resets_at":null}}', stderr: '' });
  expect(await first).toEqual(await second);
  expect(await second).toEqual(await third);
  expect(oauthCalls()).toHaveLength(1);
});
it('asks separately for different accounts', async () => {
  const settle = pendingUsage();
  const company = fetchAccountUsage('company');
  const personal = fetchAccountUsage('personal');
  settle({ stdout: '{"five_hour":{"utilization":100,"resets_at":null}}', stderr: '' });
  await Promise.all([company, personal]);
  expect(oauthCalls()).toHaveLength(2);
});
it('does not answer a later limit from the earlier reading', async () => {
  await fetchAccountUsage('company');
  await fetchAccountUsage('company');
  expect(oauthCalls()).toHaveLength(2);
});
it('shares a failure with everyone waiting on it, and asks again next time', async () => {
  const settle = pendingUsage();
  const first = fetchAccountUsage('company');
  const second = fetchAccountUsage('company');
  settle(new Error('API error 429'));
  await expect(first).rejects.toThrow('429');
  await expect(second).rejects.toThrow('429');
  expect(oauthCalls()).toHaveLength(1);
  // The failed entry is gone, so the next limit asks again rather than inheriting it.
  mock.exec.mockResolvedValue({ stdout: '{"capabilities":["oauth.usage.account-file"],"five_hour":{"utilization":1,"resets_at":null}}', stderr: '' });
  await expect(fetchAccountUsage('company')).resolves.toMatchObject({ five_hour: { utilization: 1 } });
  expect(oauthCalls()).toHaveLength(2);
});

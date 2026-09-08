import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fetchAccountUsage } from '../account-pool-usage';
const mock = vi.hoisted(() => ({ exec: vi.fn(), which: vi.fn() }));
vi.mock('../../command', () => ({ Command: class {
  constructor(readonly bin: string, readonly args: string[] = [], readonly options: { timeout?: number } = {}) {}
  which() { return mock.which(); }
  exec() { return mock.exec(this.bin, this.args, this.options); }
} }));
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
  expect(mock.exec).toHaveBeenLastCalledWith('/external bin/ccb', ['oauth', 'usage', '--json', '--account-file=/saved accounts/company.json'], { timeout: 15000 });
});
it('refuses old CLI versions instead of accepting a wrong-account response', async () => {
  mock.exec.mockResolvedValue({ stdout: 'Usage: ccb <command>', stderr: '' });
  await expect(fetchAccountUsage('company')).rejects.toThrow('Update ccb');
  expect(mock.exec).toHaveBeenCalledTimes(1);
});
it.each(['token_expired', 'API error 401', 'API error 429', 'ETIMEDOUT'])('propagates %s so recovery can fall back without switching', async error => {
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

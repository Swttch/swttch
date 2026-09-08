import { describe, expect, it, vi } from 'vitest';
import { AccountPoolStrategy, type StoredAccount } from '../../../shared';
import type { AccountsRegistry } from '../account-store';
import type { CcbUsageResponse } from '../../handlers/getUsage';
import { accountResetsAt, selectAccountPoolAccount } from '../account-pool-usage';

const early = '2026-09-08T01:00:00.000Z';
const late = '2026-09-08T04:30:00.000Z';
const weekly = '2026-09-11T01:00:00.000Z';
function usage(utilization: number, resets_at = early): CcbUsageResponse {
  return { five_hour: { utilization, resets_at }, seven_day: null, seven_day_opus: null,
    seven_day_sonnet: null, seven_day_oauth_apps: null, seven_day_cowork: null,
    iguana_necktie: null, extra_usage: null };
}
function registry(ids = ['personal', 'company', 'third']): AccountsRegistry {
  const accounts = Object.fromEntries(ids.map(id => [id, { id, emailAddress: id + '@example.com', displayName: null, organizationName: null, subscriptionType: 'max', authMethod: 'claudeai', createdAt: 0, updatedAt: 0, usageCached: null, usageCachedAt: 0 } satisfies StoredAccount]));
  return { current: ids[0], accounts, accountOrder: ids, accountPools: [{ id: 'pool', name: 'Pool',
    provider: 'claude', enabled: true, strategy: AccountPoolStrategy.ORDERED,
    accountIds: ids, createdAt: 0, updatedAt: 0 }] };
}

describe('account pool usage selection without credential changes', () => {
  it('skips an exhausted company account despite its available cached usage', async () => {
    const fetch = vi.fn(async (id: string) => usage(id === 'third' ? 36 : 100));
    expect(await selectAccountPoolAccount(registry(), 'opus', fetch)).toEqual({ accountId: 'third', resetsAt: null });
    expect(fetch.mock.calls.map(([id]) => id)).toEqual(['company', 'third', 'personal']);
  });
  it('selects the company account with the earliest reset when all are exhausted', async () => {
    const fetch = vi.fn(async (id: string) => usage(100, id === 'company' ? early : late));
    expect(await selectAccountPoolAccount(registry(), 'opus', fetch)).toEqual({ accountId: 'company', resetsAt: early });
  });
  it('uses the latest blocking window per account before comparing accounts', async () => {
    const fetch = vi.fn(async (id: string) => ({ ...usage(100, id === 'company' ? early : late),
      seven_day: id === 'company' ? { utilization: 100, resets_at: weekly } : null }));
    expect(await selectAccountPoolAccount(registry(['personal', 'company']), 'opus', fetch))
      .toEqual({ accountId: 'personal', resetsAt: late });
  });
  it('does not switch if the current account has the earliest reset', async () => {
    expect(await selectAccountPoolAccount(registry(['personal', 'company']), 'opus',
      async id => usage(100, id === 'personal' ? early : late)))
      .toEqual({ accountId: 'personal', resetsAt: early });
  });
  it('does not classify a lookup failure as exhaustion', async () => {
    expect(await selectAccountPoolAccount(registry(), 'opus', async id => {
      if (id === 'company') throw new Error('401');
      return usage(100);
    })).toBeNull();
  });
  it('can still select a verified available account after another lookup fails', async () => {
    expect(await selectAccountPoolAccount(registry(), 'opus', async id => {
      if (id === 'company') throw new Error('network');
      return usage(id === 'third' ? 1 : 100);
    })).toEqual({ accountId: 'third', resetsAt: null });
  });
  it('does not retry the just-limited current account based on a lagging reading', async () => {
    expect(await selectAccountPoolAccount(registry(['personal', 'company']), 'opus',
      async id => usage(id === 'personal' ? 36 : 100))).toBeNull();
  });
  it('does not fetch for disabled pools', async () => {
    const r = registry(); r.accountPools[0].enabled = false;
    const fetch = vi.fn();
    expect(await selectAccountPoolAccount(r, 'opus', fetch)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('checks only applicable model quotas and treats 1 as one percent', () => {
    const u = { ...usage(1), seven_day_sonnet: { utilization: 100, resets_at: late } };
    expect(accountResetsAt(u, 'claude-opus-4-6')).toBe('');
    expect(accountResetsAt(u, 'sonnet')).toBe(late);
    expect(accountResetsAt(u)).toBe(late);
  });
  it('never infers availability from missing data or a reset clock alone', () => {
    expect(accountResetsAt({ ...usage(0), five_hour: null })).toBeNull();
    expect(accountResetsAt({ ...usage(100), five_hour: { utilization: 100, resets_at: null } })).toBeNull();
    expect(accountResetsAt(usage(100, '2020-01-01T00:00:00.000Z'))).toBe('2020-01-01T00:00:00.000Z');
  });
});

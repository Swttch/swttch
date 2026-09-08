import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const state = vi.hoisted(() => ({ directory: '' }));
vi.mock('node:os', async importOriginal => ({ ...await importOriginal<typeof import('node:os')>(), homedir: () => state.directory }));
import { accountPoolRecoveryRevision, claimAccountPoolContinuation, clearAccountPoolRecovery, readAccountPoolRecovery, writeAccountPoolRecovery } from '../account-pool-recovery-store';
beforeEach(async () => { state.directory = await mkdtemp(join(tmpdir(), 'ccg-pool-test-')); });
afterEach(async () => { await rm(state.directory, { recursive: true, force: true }); });
it('persists the recovery and allows one reminder across tabs/reloads', async () => {
  await writeAccountPoolRecovery('session', { sourceMessageUuid: 'limit-a', accountId: 'company', resetsAt: null, awaitingLimit: true });
  expect(await Promise.all([claimAccountPoolContinuation('session'), claimAccountPoolContinuation('session')])).toEqual([true, false]);
  expect(await readAccountPoolRecovery('session')).toMatchObject({ accountId: 'company', continuationSent: true });
  expect(await claimAccountPoolContinuation('session')).toBe(false);
  await clearAccountPoolRecovery('session');
  expect(await readAccountPoolRecovery('session')).toBeNull();
});
it('hashes session IDs instead of treating them as paths', async () => {
  await writeAccountPoolRecovery('../../elsewhere', { sourceMessageUuid: 'limit', accountId: 'company', resetsAt: null, awaitingLimit: false });
  const names = await readdir(join(state.directory, '.claude-code-gui', 'account-pool-recovery'));
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^[a-f0-9]{64}\.json$/);
});

it('does not resurrect a preparation after a new user turn cleared it', async () => {
  const revision = accountPoolRecoveryRevision('session');
  await clearAccountPoolRecovery('session');
  expect(await writeAccountPoolRecovery('session', { sourceMessageUuid: 'old-limit', accountId: 'company',
    resetsAt: null, awaitingLimit: true }, revision)).toBe(false);
  expect(await readAccountPoolRecovery('session')).toBeNull();
});

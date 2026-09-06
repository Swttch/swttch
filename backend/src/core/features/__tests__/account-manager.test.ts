import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock every collaborator so the manager's orchestration logic is tested in
// isolation: the live credential slot, the snapshot store, and `claude auth status`.
vi.mock('../live-credentials', () => ({
  readLiveCredentials: vi.fn(),
  writeLiveCredentials: vi.fn(),
  readLiveOauthAccount: vi.fn(),
  writeLiveOauthAccount: vi.fn(),
  validateCredentialBlob: vi.fn(),
}));
vi.mock('../account-store', () => ({
  readRegistry: vi.fn(),
  writeSnapshot: vi.fn(),
  readSnapshot: vi.fn(),
  upsertAccount: vi.fn(),
  setCurrentAccount: vi.fn(),
  deleteAccountFiles: vi.fn(),
  writeAccountPools: vi.fn(),
  newAccountId: vi.fn(() => 'acc-new'),
}));
vi.mock('../../claude', () => ({ Claude: { execAuthed: vi.fn() } }));

import {
  readLiveCredentials,
  writeLiveCredentials,
  readLiveOauthAccount,
  writeLiveOauthAccount,
} from '../live-credentials';
import {
  readRegistry,
  writeSnapshot,
  readSnapshot,
  upsertAccount,
  setCurrentAccount,
  deleteAccountFiles,
  writeAccountPools,
} from '../account-store';
import { Claude } from '../../claude';
import {
  deleteAccount,
  listAccounts,
  saveCurrentAccount,
  switchToAccount,
  updateAccountPools,
} from '../account-manager';
import { AccountPoolStrategy, type AccountPool, type StoredAccount } from '../../../shared';

const mockReadLive = vi.mocked(readLiveCredentials);
const mockWriteLive = vi.mocked(writeLiveCredentials);
const mockReadOauth = vi.mocked(readLiveOauthAccount);
const mockWriteOauth = vi.mocked(writeLiveOauthAccount);
const mockReadRegistry = vi.mocked(readRegistry);
const mockWriteSnapshot = vi.mocked(writeSnapshot);
const mockReadSnapshot = vi.mocked(readSnapshot);
const mockUpsert = vi.mocked(upsertAccount);
const mockSetCurrent = vi.mocked(setCurrentAccount);
const mockDeleteFiles = vi.mocked(deleteAccountFiles);
const mockWritePools = vi.mocked(writeAccountPools);
const mockExec = vi.mocked(Claude.execAuthed);

function authStatus(obj: Record<string, unknown>): void {
  mockExec.mockResolvedValue({ stdout: JSON.stringify(obj), stderr: '' });
}
function acc(id: string, email: string, extra: Partial<StoredAccount> = {}): StoredAccount {
  return {
    id, emailAddress: email, displayName: null, organizationName: null,
    subscriptionType: 'team', authMethod: 'claudeai', createdAt: 1, updatedAt: 2,
    usageCached: null, usageCachedAt: 0, ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReadRegistry.mockResolvedValue({ current: null, accounts: {}, accountPools: [], accountOrder: [] });
  mockReadOauth.mockResolvedValue(null);
});

describe('saveCurrentAccount', () => {
  it('throws when no live credentials are present', async () => {
    mockReadLive.mockResolvedValue('');
    await expect(saveCurrentAccount()).rejects.toThrow(/No logged-in Claude account/);
  });

  it('captures a new account with metadata from auth status', async () => {
    mockReadLive.mockResolvedValue('{"claudeAiOauth":{}}');
    authStatus({ email: 'a@x.com', subscriptionType: 'max', authMethod: 'claudeai', orgName: 'Org' });

    const result = await saveCurrentAccount();

    expect(result.id).toBe('acc-new');
    expect(result.emailAddress).toBe('a@x.com');
    expect(result.subscriptionType).toBe('max');
    expect(result.organizationName).toBe('Org');
    expect(mockWriteSnapshot).toHaveBeenCalledWith('acc-new', {
      credentials: '{"claudeAiOauth":{}}',
      oauthAccount: null,
    });
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockSetCurrent).toHaveBeenCalledWith('acc-new');
  });

  it('reuses the id and createdAt of an existing account with the same email', async () => {
    mockReadLive.mockResolvedValue('{"claudeAiOauth":{}}');
    authStatus({ email: 'a@x.com', subscriptionType: 'team' });
    mockReadRegistry.mockResolvedValue({
      current: 'acc-old',
      accounts: { 'acc-old': acc('acc-old', 'a@x.com', { createdAt: 111 }) },
      accountPools: [],
      accountOrder: [],
    });

    const result = await saveCurrentAccount();

    expect(result.id).toBe('acc-old');
    expect(result.createdAt).toBe(111);
    expect(mockWriteSnapshot).toHaveBeenCalledWith('acc-old', expect.anything());
  });
});

describe('switchToAccount', () => {
  it('throws for an unknown account id', async () => {
    mockReadRegistry.mockResolvedValue({ current: null, accounts: {}, accountPools: [], accountOrder: [] });
    await expect(switchToAccount('acc-x')).rejects.toThrow(/Unknown account/);
  });

  it('throws when the saved snapshot is missing', async () => {
    mockReadRegistry.mockResolvedValue({ current: null, accounts: { 'acc-x': acc('acc-x', 'b@x.com') }, accountPools: [], accountOrder: [] });
    mockReadSnapshot.mockResolvedValue(null);
    await expect(switchToAccount('acc-x')).rejects.toThrow(/credentials are unavailable/);
  });

  it('swaps the live credentials + oauthAccount and updates the current hint', async () => {
    mockReadRegistry.mockResolvedValue({ current: null, accounts: { 'acc-x': acc('acc-x', 'b@x.com') }, accountPools: [], accountOrder: [] });
    mockReadSnapshot.mockResolvedValue({ credentials: '{"claudeAiOauth":{"t":1}}', oauthAccount: { emailAddress: 'b@x.com' } });
    mockReadLive.mockResolvedValue('{"claudeAiOauth":{"old":1}}');

    await switchToAccount('acc-x');

    expect(mockWriteLive).toHaveBeenCalledWith('{"claudeAiOauth":{"t":1}}');
    expect(mockWriteOauth).toHaveBeenCalledWith({ emailAddress: 'b@x.com' });
    expect(mockSetCurrent).toHaveBeenCalledWith('acc-x');
  });

  it('rolls the live credentials back when applying the new account fails', async () => {
    mockReadRegistry.mockResolvedValue({ current: null, accounts: { 'acc-x': acc('acc-x', 'b@x.com') }, accountPools: [], accountOrder: [] });
    mockReadSnapshot.mockResolvedValue({ credentials: '{"claudeAiOauth":{"t":1}}', oauthAccount: { emailAddress: 'b@x.com' } });
    mockReadLive.mockResolvedValue('{"claudeAiOauth":{"old":1}}');
    mockReadOauth.mockResolvedValue({ emailAddress: 'old@x.com' });
    // First writeLiveCredentials (apply) throws; rollback write must follow.
    mockWriteLive.mockRejectedValueOnce(new Error('keychain locked'));

    await expect(switchToAccount('acc-x')).rejects.toThrow(/Failed to switch account/);

    // Rollback restored the previous blob and oauthAccount.
    expect(mockWriteLive).toHaveBeenLastCalledWith('{"claudeAiOauth":{"old":1}}');
    expect(mockWriteOauth).toHaveBeenLastCalledWith({ emailAddress: 'old@x.com' });
    expect(mockSetCurrent).not.toHaveBeenCalled();
  });
});

describe('listAccounts', () => {
  it('marks the account whose email matches the live CLI email as active', async () => {
    mockReadRegistry.mockResolvedValue({
      current: 'acc-1',
      accounts: { 'acc-1': acc('acc-1', 'a@x.com', { createdAt: 5, updatedAt: 10 }), 'acc-2': acc('acc-2', 'b@x.com', { createdAt: 15, updatedAt: 20 }) },
      accountPools: [],
      accountOrder: [],
    });
    authStatus({ email: 'b@x.com' });

    const result = await listAccounts();

    expect(result.activeEmail).toBe('b@x.com');
    // Sorted by createdAt asc → acc-1 first (registered earlier).
    expect(result.accounts[0].id).toBe('acc-1');
    expect(result.accounts.find((a) => a.id === 'acc-2')?.active).toBe(true);
    expect(result.accounts.find((a) => a.id === 'acc-1')?.active).toBe(false);
  });
});

describe('deleteAccount', () => {
  it('delegates to the store', async () => {
    await deleteAccount('acc-1');
    expect(mockDeleteFiles).toHaveBeenCalledWith('acc-1');
  });
});

describe('updateAccountPools', () => {
  it('persists account pools and returns the normalized registry pools', async () => {
    const accountPools: AccountPool[] = [{
      id: 'pool-1',
      name: 'Pool',
      provider: 'claude',
      enabled: true,
      strategy: AccountPoolStrategy.ORDERED,
      accountIds: ['acc-1', 'acc-2'],
      createdAt: 1,
      updatedAt: 1,
    }];
    mockReadRegistry.mockResolvedValueOnce({ current: null, accounts: {}, accountPools, accountOrder: [] });

    await expect(updateAccountPools(accountPools)).resolves.toEqual(accountPools);
    expect(mockWritePools).toHaveBeenCalledWith(accountPools);
  });
});

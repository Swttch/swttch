import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat, readFile } from 'fs/promises';
import { chmodSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Real fs throughout — only writeFileSync and chmodSync are wrapped, so the permission
// the store asks for can be read back on a filesystem that does not keep it.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync), chmodSync: vi.fn(actual.chmodSync) };
});

// account-store derives its base dir from os.homedir(). Point it at a throwaway
// temp dir so the tests touch real files without hitting the user's home.
let tempHome: string;
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => tempHome };
});

import {
  readRegistry,
  writeRegistry,
  upsertAccount,
  setCurrentAccount,
  writeSnapshot,
  writeAccountOrder,
  readSnapshot,
  deleteAccountFiles,
  hasSnapshot,
  newAccountId,
  newAccountPoolId,
  listSnapshotIds,
  type AccountsRegistry,
} from '../account-store';
import { AccountPoolStrategy, type AccountPool, type StoredAccount } from '../../../shared';

function meta(id: string, email: string): StoredAccount {
  return {
    id,
    emailAddress: email,
    displayName: null,
    organizationName: null,
    subscriptionType: 'team',
    authMethod: 'claudeai',
    createdAt: 1,
    updatedAt: 2,
    usageCached: null,
    usageCachedAt: 0,
  };
}

function pool(id: string, accountIds: string[]): AccountPool {
  return {
    id,
    name: id,
    provider: 'claude',
    enabled: true,
    strategy: AccountPoolStrategy.ORDERED,
    accountIds,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('account-store', () => {
  const savedCcgHome = process.env.CCG_HOME;
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'acc-store-'));
    delete process.env.CCG_HOME;
  });
  afterEach(async () => {
    if (savedCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = savedCcgHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  it('keeps the registry under CCG_HOME when it is set, not under the home directory', async () => {
    const ccgHome = join(tempHome, 'custom-ccg-home');
    process.env.CCG_HOME = ccgHome;

    const id = newAccountId();
    await upsertAccount(meta(id, 'a@x.com'));
    await writeSnapshot(id, { credentials: '{"claudeAiOauth":{}}', oauthAccount: { emailAddress: 'a@x.com' } });

    expect((await stat(join(ccgHome, 'accounts.json'))).isFile()).toBe(true);
    expect((await stat(join(ccgHome, 'accounts', `${id}.json`))).isFile()).toBe(true);
    await expect(stat(join(tempHome, '.claude-code-gui'))).rejects.toThrow();
  });

  it('returns an empty registry when nothing is saved', async () => {
    expect(await readRegistry()).toEqual({ current: null, accounts: {}, accountPools: [], accountOrder: [] });
  });

  it('round-trips the registry and the current hint', async () => {
    const id = newAccountId();
    await upsertAccount(meta(id, 'a@x.com'));
    await setCurrentAccount(id);

    const reg = await readRegistry();
    expect(reg.current).toBe(id);
    expect(reg.accounts[id].emailAddress).toBe('a@x.com');
  });

  it('round-trips a credential snapshot and writes it 0600', async () => {
    const id = newAccountId();
    await writeSnapshot(id, { credentials: '{"claudeAiOauth":{}}', oauthAccount: { emailAddress: 'a@x.com' } });

    const snap = await readSnapshot(id);
    expect(snap?.credentials).toBe('{"claudeAiOauth":{}}');
    expect(snap?.oauthAccount).toEqual({ emailAddress: 'a@x.com' });
    expect(hasSnapshot(id)).toBe(true);

    // Owner-only is asked for on every platform: the file is created with the
    // mode and the mode is reapplied to the destination after the rename.
    const snapshotPath = join(tempHome, '.claude-code-gui', 'accounts', `${id}.json`);
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ mode: 0o600 }),
    );
    expect(vi.mocked(chmodSync)).toHaveBeenCalledWith(snapshotPath, 0o600);

    // Only a POSIX filesystem stores the bits; NTFS drops them and reports 0666,
    // which is why the request above — not the result — is the portable check.
    if (process.platform !== 'win32') {
      const mode = (await stat(snapshotPath)).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it('deleteAccountFiles removes both the registry entry and the snapshot, clearing current', async () => {
    const id = newAccountId();
    await upsertAccount(meta(id, 'a@x.com'));
    await setCurrentAccount(id);
    await writeSnapshot(id, { credentials: 'x', oauthAccount: null });

    await deleteAccountFiles(id);

    const reg = await readRegistry();
    expect(reg.accounts[id]).toBeUndefined();
    expect(reg.current).toBeNull();
    expect(reg.accountPools).toEqual([]);
    expect(hasSnapshot(id)).toBe(false);
    expect(await readSnapshot(id)).toBeNull();
  });

  it('round-trips account pools and prunes deleted accounts from them', async () => {
    const id1 = newAccountId();
    const id2 = newAccountId();
    const id3 = newAccountId();
    await upsertAccount(meta(id1, 'a@x.com'));
    await upsertAccount(meta(id2, 'b@x.com'));
    await upsertAccount(meta(id3, 'c@x.com'));
    await writeRegistry({
      current: null,
      accounts: {
        [id1]: meta(id1, 'a@x.com'),
        [id2]: meta(id2, 'b@x.com'),
        [id3]: meta(id3, 'c@x.com'),
      },
      accountPools: [pool(newAccountPoolId(), [id1, id2, id3])],
      accountOrder: [id1, id2, id3],
    });

    await deleteAccountFiles(id2);

    const reg = await readRegistry();
    expect(reg.accountPools).toHaveLength(1);
    expect(reg.accountPools[0].accountIds).toEqual([id1, id3]);
  });

  it('lists only valid snapshot ids present on disk', async () => {
    const id1 = newAccountId();
    const id2 = newAccountId();
    await writeSnapshot(id1, { credentials: 'x', oauthAccount: null });
    await writeSnapshot(id2, { credentials: 'y', oauthAccount: null });
    const ids = await listSnapshotIds();
    expect(ids.sort()).toEqual([id1, id2].sort());
  });

  it('rejects filesystem-unsafe account ids (path traversal / colon)', async () => {
    await expect(readSnapshot('../evil')).rejects.toThrow(/Invalid account id/);
    await expect(writeSnapshot('acc:colon', { credentials: 'x', oauthAccount: null })).rejects.toThrow(
      /Invalid account id/,
    );
    expect(hasSnapshot('../evil')).toBe(false);
  });

  // The order the user drags accounts into has nowhere else to live: the list is
  // otherwise sorted by registration time, so without this the arrangement would
  // be gone on the next read and the drag would have promised something it did
  // not keep.
  describe('writeAccountOrder', () => {
    it('stores the arrangement and reads it back', async () => {
      const [id1, id2] = [newAccountId(), newAccountId()];
      await upsertAccount(meta(id1, 'a@x.com'));
      await upsertAccount(meta(id2, 'b@x.com'));

      await writeAccountOrder([id2, id1]);

      expect((await readRegistry()).accountOrder).toEqual([id2, id1]);
    });

    it('drops ids that are not saved accounts, and duplicates', async () => {
      const id = newAccountId();
      await upsertAccount(meta(id, 'a@x.com'));

      await writeAccountOrder([id, 'acc-does-not-exist', id]);

      expect((await readRegistry()).accountOrder).toEqual([id]);
    });

    it('forgets a deleted account so its id cannot linger in the order', async () => {
      const [id1, id2] = [newAccountId(), newAccountId()];
      await upsertAccount(meta(id1, 'a@x.com'));
      await upsertAccount(meta(id2, 'b@x.com'));
      await writeAccountOrder([id2, id1]);

      await deleteAccountFiles(id2);

      expect((await readRegistry()).accountOrder).toEqual([id1]);
    });
  });

  // The backend ends itself from the event loop (a signal handler, the idle timer, a restart request). A save
  // that waits between creating its temp file and renaming it can be ended in that gap and leave the file behind.
  describe('a save the event loop cannot interrupt', () => {
    const storeDir = () => join(tempHome, '.claude-code-gui');

    it('has the registry in place and no temp file the moment the call is made', async () => {
      const saved = writeRegistry({ current: null, accounts: {}, accountPools: [], accountOrder: [] });

      expect(readdirSync(storeDir())).toEqual(['accounts.json']);
      await saved;
    });

    it('has a credential snapshot in place and no temp file the moment the call is made', async () => {
      const id = newAccountId();
      const saved = writeSnapshot(id, { credentials: 'x', oauthAccount: null });

      expect(readdirSync(join(storeDir(), 'accounts'))).toEqual([`${id}.json`]);
      await saved;
    });

    it('removes its temp file when the snapshot cannot be put in place', async () => {
      const id = newAccountId();
      // A folder where the file belongs makes the rename fail.
      mkdirSync(join(storeDir(), 'accounts', `${id}.json`), { recursive: true });

      await expect(writeSnapshot(id, { credentials: 'x', oauthAccount: null })).rejects.toThrow();

      expect(readdirSync(join(storeDir(), 'accounts'))).toEqual([`${id}.json`]);
    });
  });

  it('newAccountId produces colon-free, filesystem-safe ids', () => {
    const id = newAccountId();
    expect(id.startsWith('acc-')).toBe(true);
    expect(id).not.toContain(':');
  });

  it('survives a corrupt registry file by falling back to empty', async () => {
    // Write a valid entry, then clobber the file with junk.
    const id = newAccountId();
    await upsertAccount(meta(id, 'a@x.com'));
    const registryFile = join(tempHome, '.claude-code-gui', 'accounts.json');
    await writeRegistry({ current: null, accounts: {} } as AccountsRegistry);
    await (await import('fs/promises')).writeFile(registryFile, '{not json', 'utf-8');
    expect(await readRegistry()).toEqual({ current: null, accounts: {}, accountPools: [], accountOrder: [] });
    // sanity: the snapshot path helper still reads a previously good file
    expect(await readFile(registryFile, 'utf-8')).toContain('{not json');
  });
});

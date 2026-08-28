import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat, readFile, writeFile, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Real fs throughout — only writeFile and chmod are wrapped, so the permission
// the store asks for can be read back on a filesystem that does not keep it.
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile), chmod: vi.fn(actual.chmod) };
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
  readSnapshot,
  deleteAccountFiles,
  hasSnapshot,
  newAccountId,
  listSnapshotIds,
  type AccountsRegistry,
} from '../account-store';
import type { StoredAccount } from '../../../shared';

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

describe('account-store', () => {
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'acc-store-'));
  });
  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  it('returns an empty registry when nothing is saved', async () => {
    expect(await readRegistry()).toEqual({ current: null, accounts: {} });
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
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ mode: 0o600 }),
    );
    expect(vi.mocked(chmod)).toHaveBeenCalledWith(snapshotPath, 0o600);

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
    expect(hasSnapshot(id)).toBe(false);
    expect(await readSnapshot(id)).toBeNull();
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
    expect(await readRegistry()).toEqual({ current: null, accounts: {} });
    // sanity: the snapshot path helper still reads a previously good file
    expect(await readFile(registryFile, 'utf-8')).toContain('{not json');
  });
});

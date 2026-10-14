import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// A deleted WSL distribution does not answer "no such file". Windows answers with
// `ECONNRESET` on a read and `UNKNOWN` on a stat (measured with Node 24 on Windows 11),
// so the folder is made to answer the same way here.
const GONE = 'ccg-gone-distro';
const refuse = (code: string) => Object.assign(new Error(`${code}: gone`), { code });

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    readFile: ((path: Parameters<typeof actual.readFile>[0], ...rest: unknown[]) =>
      String(path).includes(GONE)
        ? Promise.reject(refuse('ECONNRESET'))
        : (actual.readFile as (...args: unknown[]) => Promise<unknown>)(path, ...rest)) as typeof actual.readFile,
    stat: ((path: Parameters<typeof actual.stat>[0], ...rest: unknown[]) =>
      String(path).includes(GONE)
        ? Promise.reject(refuse('UNKNOWN'))
        : (actual.stat as (...args: unknown[]) => Promise<unknown>)(path, ...rest)) as typeof actual.stat,
  };
});

import { MigrationContext } from '../../entities/migration/Migration';
import { ProjectCollection } from '../../entities/project/Project.collection';
import ImportLegacyPrompts from '../20261004120200_import-legacy-prompts';

describe('importing the old prompt files from a project whose folder is gone', () => {
  let ccgHome: string;
  let userHome: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.CCG_HOME;
    ccgHome = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-entities-')));
    userHome = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-userhome-')));
    process.env.CCG_HOME = ccgHome;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = previousHome;
    for (const dir of [ccgHome, userHome]) rmSync(dir, { recursive: true, force: true });
  });

  const goneFolder = join(tmpdir(), GONE, 'home', 'marc');
  const run = () => new ImportLegacyPrompts().up(new MigrationContext(userHome));

  it('does not report the folder as one the user could allow access to', async () => {
    await new ProjectCollection().idOf(goneFolder);

    const report = await run();

    expect(report.unreadable).toEqual([]);
  });

  it('lets go of the folder when the unread folders are read again', async () => {
    await new ProjectCollection().idOf(goneFolder);

    const stillUnreadable = await new ImportLegacyPrompts().retry(new MigrationContext(userHome), [goneFolder]);

    expect(stillUnreadable).toEqual([]);
  });
});

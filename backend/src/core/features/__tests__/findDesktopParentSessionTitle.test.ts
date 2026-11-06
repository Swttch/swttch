import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { findDesktopParentSessionTitle, findDesktopSession, findDesktopSessionTitle } from '../findDesktopParentSessionTitle';

let root: string;
let organization: string;

async function writeSession(name: string, body: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(organization, `${name}.json`), JSON.stringify(body));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-sessions-'));
  organization = path.join(root, 'account-1', 'organization-1');
  await fs.mkdir(organization, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('findDesktopParentSessionTitle', () => {
  it('reads the starter\'s own title, not the title the child file carries for itself', async () => {
    await writeSession('local_child', {
      sessionId: 'local_child',
      cliSessionId: 'cli-1',
      title: 'child title',
      spawnedFrom: { sessionId: 'local_parent', title: 'child title' },
    });
    await writeSession('local_parent', { sessionId: 'local_parent', cliSessionId: 'cli-0', title: 'parent title' });
    await writeSession('local_other', { sessionId: 'local_other', cliSessionId: 'cli-2', title: 'unrelated' });

    expect(await findDesktopParentSessionTitle('cli-1', root)).toBe('parent title');
  });

  it('finds nothing for a session Desktop did not start', async () => {
    await writeSession('local_solo', { sessionId: 'local_solo', cliSessionId: 'cli-1', title: 'solo' });
    expect(await findDesktopParentSessionTitle('cli-1', root)).toBeUndefined();
  });

  it('finds nothing when the starter has no file or no title', async () => {
    await writeSession('local_child', { cliSessionId: 'cli-1', spawnedFrom: { sessionId: 'local_gone' } });
    expect(await findDesktopParentSessionTitle('cli-1', root)).toBeUndefined();

    await writeSession('local_gone', { sessionId: 'local_gone', title: '   ' });
    expect(await findDesktopParentSessionTitle('cli-1', root)).toBeUndefined();
  });

  it('finds nothing when Desktop\'s folder is not there, or a file is not JSON', async () => {
    expect(await findDesktopParentSessionTitle('cli-1', path.join(root, 'missing'))).toBeUndefined();
    await fs.writeFile(path.join(organization, 'local_broken.json'), 'cli-1 {not json');
    expect(await findDesktopParentSessionTitle('cli-1', root)).toBeUndefined();
  });

  it('does not follow a starter id that is a path', async () => {
    await writeSession('local_child', { cliSessionId: 'cli-1', spawnedFrom: { sessionId: '../local_parent' } });
    await writeSession('local_parent', { title: 'parent title' });
    expect(await findDesktopParentSessionTitle('cli-1', root)).toBeUndefined();
  });
});

describe('findDesktopSessionTitle', () => {
  it('reads the title from the session\'s own file', async () => {
    await writeSession('local_abc', { sessionId: 'local_abc', title: 'Release manager' });
    expect(await findDesktopSessionTitle('local_abc', root)).toBe('Release manager');
  });

  it('finds nothing for an unknown session, an empty title, or an id that is not a plain Desktop id', async () => {
    await writeSession('local_blank', { title: ' ' });
    await writeSession('other', { title: 'not a session file name' });
    expect(await findDesktopSessionTitle('local_missing', root)).toBeUndefined();
    expect(await findDesktopSessionTitle('local_blank', root)).toBeUndefined();
    expect(await findDesktopSessionTitle('other', root)).toBeUndefined();
    expect(await findDesktopSessionTitle('../local_abc', root)).toBeUndefined();
  });
});

describe('findDesktopSession', () => {
  it('reads the title, the CLI session it runs and its folder', async () => {
    await writeSession('local_abc', {
      sessionId: 'local_abc',
      title: 'Mockup session',
      cliSessionId: 'cli-9',
      cwd: '/Users/me/project',
      isArchived: true,
      lastActivityAt: 1793912956893,
      extra: 'ignored',
    });
    expect(await findDesktopSession('local_abc', root)).toEqual({
      title: 'Mockup session',
      cliSessionId: 'cli-9',
      cwd: '/Users/me/project',
      isArchived: true,
      lastActivityAt: 1793912956893,
    });
  });

  it('leaves out what the file does not have, and finds nothing without a file', async () => {
    await writeSession('local_bare', { sessionId: 'local_bare', title: '  ', cwd: 5 });
    expect(await findDesktopSession('local_bare', root)).toEqual({});
    expect(await findDesktopSession('local_missing', root)).toBeUndefined();
  });
});

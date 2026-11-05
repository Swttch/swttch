import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { findDesktopParentSessionTitle } from '../findDesktopParentSessionTitle';

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

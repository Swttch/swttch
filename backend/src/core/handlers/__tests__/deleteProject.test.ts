import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// The handler settles the Claude data directory to the global one before it deletes, so the
// folder it removes is under the same projects root the project list was built from. Here the
// fixture supplies that directory through CLAUDE_CONFIG_DIR directly, and a real resolution
// would overwrite it with the developer's own — what applyConfigDir resolves to is pinned in
// claude-config-dir-per-run.test.ts instead.
vi.mock('../../claude', () => ({
  Claude: { applyConfigDir: vi.fn().mockResolvedValue(undefined) },
}));

import { deleteProjectHandler } from '../deleteProject';
import { ProjectCollection } from '../../entities/project/Project.collection';
import { syncProjectsList } from '../../features/syncProjectsList';
import { MessageType } from '../../../shared';
import type { IPCMessage } from '../../types';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';

/**
 * Deleting a project removes ~/.claude/projects/<encoded>, never the working
 * directory itself — the deletion the picker offers is of Claude Code's own
 * records, so it works the same whether the working directory still exists or
 * was already removed (#392 item 6).
 */
describe('deleteProjectHandler', () => {
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  const originalCcgHome = process.env.CCG_HOME;
  let configDir: string;
  let ccgHome: string;
  let projectsDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'ccg-delete-project-'));
    ccgHome = mkdtempSync(join(tmpdir(), 'ccg-delete-project-home-'));
    projectsDir = join(configDir, 'projects');
    mkdirSync(projectsDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = configDir;
    process.env.CCG_HOME = ccgHome;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(configDir, { recursive: true, force: true });
    rmSync(ccgHome, { recursive: true, force: true });
  });

  function sessionsFolderFor(workingDir: string): string {
    // Mirrors normalizeProjectPath: every non-alphanumeric character becomes '-'.
    return join(projectsDir, workingDir.replace(/[^a-zA-Z0-9]/g, '-'));
  }

  function makeConnections() {
    const sendTo = vi.fn();
    return { sendTo, connections: { sendTo } as unknown as ConnectionManager };
  }

  async function callHandler(payload: Record<string, unknown>) {
    const { sendTo, connections } = makeConnections();
    const message = { requestId: 'req-1', payload } as unknown as IPCMessage;
    await deleteProjectHandler('conn-1', message, connections, {} as Bridge);
    return sendTo;
  }

  it('removes the sessions folder for the given working directory', async () => {
    const workingDir = '/Users/me/app';
    const folder = sessionsFolderFor(workingDir);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'a.jsonl'), '{"cwd":"/Users/me/app"}');

    const sendTo = await callHandler({ path: workingDir });

    expect(existsSync(folder)).toBe(false);
    expect(sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({ requestId: 'req-1', status: 'ok' }),
    );
  });

  // The working directory itself is never touched — only Claude Code's own
  // record of it — so a directory that vanished from disk is still deletable.
  it('succeeds for a project whose working directory no longer exists on disk', async () => {
    const workingDir = '/Users/me/gone-from-disk';
    const folder = sessionsFolderFor(workingDir);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'a.jsonl'), '{}');

    const sendTo = await callHandler({ path: workingDir });

    expect(existsSync(folder)).toBe(false);
    expect(sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({ status: 'ok' }),
    );
  });

  it('leaves every other project folder alone', async () => {
    const targetFolder = sessionsFolderFor('/Users/me/target');
    const otherFolder = sessionsFolderFor('/Users/me/other');
    mkdirSync(targetFolder, { recursive: true });
    mkdirSync(otherFolder, { recursive: true });

    await callHandler({ path: '/Users/me/target' });

    expect(existsSync(targetFolder)).toBe(false);
    expect(existsSync(otherFolder)).toBe(true);
  });

  it('succeeds when the folder was already gone (nothing to delete)', async () => {
    const sendTo = await callHandler({ path: '/Users/me/never-had-sessions' });

    expect(sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({ status: 'ok' }),
    );
  });

  // The picker's list is the program's own table, so removing the CLI's records
  // does not make the project leave it. The row stays (prompts point at it) and is
  // only taken off the list.
  it('takes the project off the list but keeps its row', async () => {
    // The real path, as the CLI records it: the table settles on that spelling.
    const workingDir = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-delete-project-dir-')));
    try {
      const folder = sessionsFolderFor(workingDir);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'a.jsonl'), JSON.stringify({ cwd: workingDir }));
      expect((await syncProjectsList(true)).map((entry) => entry.path)).toEqual([workingDir]);
      const id = (await new ProjectCollection().findByPath(workingDir))?.id;

      await callHandler({ path: workingDir });

      expect(await syncProjectsList(true)).toEqual([]);
      expect((await new ProjectCollection().findByPath(workingDir))?.id).toBe(id);
    } finally {
      rmSync(workingDir, { recursive: true, force: true });
    }
  });

  it('reports an error and deletes nothing when path is missing', async () => {
    const targetFolder = sessionsFolderFor('/Users/me/untouched');
    mkdirSync(targetFolder, { recursive: true });

    const sendTo = await callHandler({});

    expect(sendTo).toHaveBeenCalledWith(
      'conn-1',
      MessageType.ACK,
      expect.objectContaining({ status: 'error' }),
    );
    expect(existsSync(targetFolder)).toBe(true);
  });
});

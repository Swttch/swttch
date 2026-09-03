import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { deleteProjectHandler } from '../deleteProject';
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
  let configDir: string;
  let projectsDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'ccg-delete-project-'));
    projectsDir = join(configDir, 'projects');
    mkdirSync(projectsDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    rmSync(configDir, { recursive: true, force: true });
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

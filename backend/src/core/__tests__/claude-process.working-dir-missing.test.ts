import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import { MessageType } from '../../shared';
import { ensureClaudeProcess } from '../claude-process';
import { Claude } from '../claude';

// A project whose folder was deleted stays in the project list. The CLI cannot
// start there, and Node words that as `spawn claude ENOENT`, which reads as "claude
// is not installed". The user must be told that the folder is what is missing.

let parent: string;

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), 'ccg-missing-dir-'));
});

afterEach(() => {
  rmSync(parent, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it('names the missing folder instead of trying to start the CLI in it', async () => {
  const connections = new ConnectionManager(true);
  const broadcast = vi.spyOn(connections, 'broadcastToSession').mockImplementation(() => {});
  const spawn = vi.spyOn(Claude, 'spawnAuthed');
  const missing = join(parent, 'ccg-demo');

  await ensureClaudeProcess(connections, 'tab', missing, 'session', undefined, {} as Bridge);

  expect(spawn).not.toHaveBeenCalled();
  expect(broadcast).toHaveBeenCalledWith('session', MessageType.SERVICE_ERROR, {
    type: MessageType.WORKING_DIR_MISSING,
    reason: `The working directory ${missing} no longer exists.`,
    error: `The working directory ${missing} no longer exists.`,
    workingDir: missing,
  });
  expect(broadcast).toHaveBeenCalledWith('session', MessageType.STREAM_END);
});

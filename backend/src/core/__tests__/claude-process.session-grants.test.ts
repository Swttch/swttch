import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import type { ChildProcess } from 'child_process';
import { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import { ensureClaudeProcess, sendControlResponseToProcess } from '../claude-process';
import { clearSessionGrants } from '../features/sessionGrants';
import { Claude } from '../claude';
import { MessageType, buildClaudeFolderPermissionUpdate, buildSessionPermissionUpdate } from '../../shared';

vi.mock('../cli-auto-update', () => ({ triggerCliAutoUpdate: vi.fn() }));

// #761: what the user allowed for the session has to reach the next CLI process of that session.

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ccg-grants-'));
  vi.stubEnv('CCG_HOME', home);
  clearSessionGrants();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(home, { recursive: true, force: true });
});

function fakeCli() {
  const stdin = new PassThrough();
  const written: Array<Record<string, any>> = [];
  stdin.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) if (line.trim()) written.push(JSON.parse(line));
  });
  return Object.assign(new EventEmitter(), {
    stdin,
    written,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    pid: undefined,
    exitCode: null,
    signalCode: null,
  });
}

function spawnInTurn(...clis: ReturnType<typeof fakeCli>[]) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return vi.spyOn(Claude, 'spawnAuthed').mockImplementation(async () => {
    const cli = clis.shift()!;
    setImmediate(() => cli.emit('spawn'));
    return cli as unknown as ChildProcess;
  });
}

const bridge = { refreshFiles: vi.fn(async () => {}), openUrl: vi.fn(async () => {}), openDiff: vi.fn(async () => {}) } as unknown as Bridge;
const start = (connections: ConnectionManager, sessionId: string) =>
  ensureClaudeProcess(connections, 'tab', home, sessionId, undefined, bridge);

const allow = (updatedPermissions: unknown) => ({
  subtype: 'success',
  request_id: 'r1',
  response: { behavior: 'allow', updatedInput: {}, updatedPermissions },
});

const settingsArg = (args: string[]) => (args.includes('--settings') ? args[args.indexOf('--settings') + 1] : null);

describe('a session grant and the next CLI process', () => {
  it('starts the next process with the grants in a settings file, and removes the file when it exits', async () => {
    const first = fakeCli();
    const second = fakeCli();
    const spawn = spawnInTurn(first, second);
    const connections = new ConnectionManager(true);

    await start(connections, 'sess-grant');
    expect(settingsArg(spawn.mock.calls[0][0])).toBeNull();

    sendControlResponseToProcess(connections, 'sess-grant', allow(buildSessionPermissionUpdate('Bash')));
    connections.setProcess('sess-grant', null);
    await start(connections, 'sess-grant');

    const file = join(home, 'permissions', 'sess-grant.json');
    expect(settingsArg(spawn.mock.calls[1][0])).toBe(file);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ permissions: { allow: ['Bash'] } });

    // The older process closing late must not take the file from under the newer one.
    first.emit('close', 0);
    expect(existsSync(file)).toBe(true);
    second.emit('close', 0);
    expect(existsSync(file)).toBe(false);
  });

  it('adds no flag where the user’s own command already names a settings file', async () => {
    const spawn = spawnInTurn(fakeCli(), fakeCli());
    vi.spyOn(Claude, 'command', 'get').mockReturnValue('claude --settings /mine.json');
    const connections = new ConnectionManager(true);

    await start(connections, 'sess-own');
    sendControlResponseToProcess(connections, 'sess-own', allow(buildSessionPermissionUpdate('Bash')));
    connections.setProcess('sess-own', null);
    await start(connections, 'sess-own');

    expect(settingsArg(spawn.mock.calls[1][0])).toBeNull();
  });

  describe('a .claude folder grant, which no flag brings back', () => {
    const request = (file_path: string) =>
      JSON.stringify({
        type: 'control_request',
        request_id: 'ask-2',
        request: { subtype: 'can_use_tool', tool_name: 'Write', tool_use_id: 'tool-2', input: { file_path, content: 'x' } },
      }) + '\n';

    async function restarted() {
      const first = fakeCli();
      const second = fakeCli();
      spawnInTurn(first, second);
      const connections = new ConnectionManager(true);
      await start(connections, 'sess-folder');
      sendControlResponseToProcess(connections, 'sess-folder', allow(buildClaudeFolderPermissionUpdate('project')));
      connections.setProcess('sess-folder', null);
      await start(connections, 'sess-folder');
      const broadcast = vi.spyOn(connections, 'broadcastToSession');
      return { connections, cli: second, broadcast };
    }

    it('answers the new process with the same grant, and tells the screens it is settled before they hear the question', async () => {
      const { connections, cli, broadcast } = await restarted();
      const file = join(home, '.claude', 'a.md');

      cli.stdout.emit('data', Buffer.from(request(file)));

      expect(cli.written).toEqual([
        {
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: 'ask-2',
            response: { behavior: 'allow', updatedInput: { file_path: file, content: 'x' }, updatedPermissions: buildClaudeFolderPermissionUpdate('project') },
          },
        },
      ]);
      // The notice that it is settled comes first, so no screen puts up a card or rings for it (#761); the CLI's own
      // event still follows, as it arrived.
      expect(broadcast.mock.calls.map((call) => call[1])).toEqual([MessageType.PERMISSION_RESOLVED, MessageType.CLI_EVENT]);
      expect(broadcast.mock.calls[0][2]).toEqual({ toolUseId: 'tool-2', controlRequestId: 'ask-2' });
      expect(broadcast.mock.calls[1][2]).toEqual(JSON.parse(request(file)));
      expect(connections.getSession('sess-folder')?.openRequests.size).toBe(0);
      expect(bridge.openDiff).not.toHaveBeenCalled();
    });

    it('leaves a request outside that folder to the user', async () => {
      const { connections, cli } = await restarted();

      cli.stdout.emit('data', Buffer.from(request(join(home, 'src', 'a.md'))));

      expect(cli.written).toEqual([]);
      expect(connections.getSession('sess-folder')?.openRequests.size).toBe(1);
    });
  });
});

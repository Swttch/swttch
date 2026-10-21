import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import type { ChildProcess } from 'child_process';

vi.mock('../../claude', () => ({
  Claude: {
    // loadCliConfig now goes through spawnAuthed (auth-env strip centralized in Claude).
    // killTree is mocked too so the 15s safety-timeout callback — which can fire after a
    // fast test has torn down — doesn't throw "Claude.killTree is not a function".
    spawnAuthed: vi.fn(),
    killTree: vi.fn(),
  },
}));

import { Claude } from '../../claude';
import { loadCliConfig, parseCliConfigResponse, configProbeSettingsArg, _resetCliConfigCache } from '../loadCliConfig';

function makeFakeProc(stdoutPayload: string): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess;
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({ write(_c, _e, cb) { cb(); } });
  (proc as unknown as { stdout: Readable }).stdout = stdout;
  (proc as unknown as { stderr: Readable }).stderr = stderr;
  (proc as unknown as { stdin: Writable }).stdin = stdin;
  (proc as unknown as { pid: number }).pid = 1234;
  (proc as unknown as { kill: () => void }).kill = () => {};
  setImmediate(() => {
    proc.emit('spawn');
    stdout.push(stdoutPayload);
  });
  return proc;
}

function controlResponse(commandName: string): string {
  return JSON.stringify({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: 'config_init',
      response: {
        commands: [{ name: commandName, description: '', argumentHint: '' }],
        agents: [],
        output_style: 'default',
        available_output_styles: [],
        models: [],
        account: { email: '', subscriptionType: '' },
        pid: 1,
      },
    },
  }) + '\n';
}

describe('loadCliConfig', () => {
  beforeEach(() => {
    _resetCliConfigCache();
    vi.mocked(Claude.spawnAuthed).mockReset();
  });

  describe('cache', () => {
    it('caches per workingDir — different projects get different configs', async () => {
      vi.mocked(Claude.spawnAuthed).mockImplementation(async (_args, workingDir) => {
        const cmdName = workingDir === '/project/a' ? 'skill-a' : 'skill-b';
        return makeFakeProc(controlResponse(cmdName));
      });

      const configA = await loadCliConfig('/project/a');
      const configB = await loadCliConfig('/project/b');

      expect(configA?.response.response.commands[0].name).toBe('skill-a');
      expect(configB?.response.response.commands[0].name).toBe('skill-b');
    });

    it('returns the cached config for the same workingDir without respawning', async () => {
      vi.mocked(Claude.spawnAuthed).mockImplementation(async () => makeFakeProc(controlResponse('skill-a')));

      await loadCliConfig('/project/a');
      await loadCliConfig('/project/a');

      expect(vi.mocked(Claude.spawnAuthed)).toHaveBeenCalledTimes(1);
    });

    it('refresh:true bypasses the cache and re-spawns', async () => {
      vi.mocked(Claude.spawnAuthed).mockImplementationOnce(async () => makeFakeProc(controlResponse('first')));
      const first = await loadCliConfig('/project/a');

      vi.mocked(Claude.spawnAuthed).mockImplementationOnce(async () => makeFakeProc(controlResponse('second')));
      const second = await loadCliConfig('/project/a', { refresh: true });

      expect(first?.response.response.commands[0].name).toBe('first');
      expect(second?.response.response.commands[0].name).toBe('second');
      expect(vi.mocked(Claude.spawnAuthed)).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshes that overlap (#571)', () => {
    it('shares one probe between simultaneous refreshes of the same project', async () => {
      vi.mocked(Claude.spawnAuthed).mockImplementation(async () => makeFakeProc(controlResponse('skill-a')));

      const results = await Promise.all(
        Array.from({ length: 8 }, () => loadCliConfig('/project/a', { refresh: true })),
      );

      expect(vi.mocked(Claude.spawnAuthed)).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(8);
      for (const config of results) {
        expect(config?.response.response.commands[0].name).toBe('skill-a');
      }
    });

    it('keeps projects apart: simultaneous refreshes of two projects start one probe each', async () => {
      vi.mocked(Claude.spawnAuthed).mockImplementation(async (_args, workingDir) =>
        makeFakeProc(controlResponse(workingDir === '/project/a' ? 'skill-a' : 'skill-b')),
      );

      const [a1, b1, a2, b2] = await Promise.all([
        loadCliConfig('/project/a', { refresh: true }),
        loadCliConfig('/project/b', { refresh: true }),
        loadCliConfig('/project/a', { refresh: true }),
        loadCliConfig('/project/b', { refresh: true }),
      ]);

      expect(vi.mocked(Claude.spawnAuthed)).toHaveBeenCalledTimes(2);
      expect(a1?.response.response.commands[0].name).toBe('skill-a');
      expect(a2?.response.response.commands[0].name).toBe('skill-a');
      expect(b1?.response.response.commands[0].name).toBe('skill-b');
      expect(b2?.response.response.commands[0].name).toBe('skill-b');
    });

    it('starts a new probe for a refresh that arrives after the previous one finished, so added skills show up (#176)', async () => {
      vi.mocked(Claude.spawnAuthed).mockImplementationOnce(async () => makeFakeProc(controlResponse('before')));
      await Promise.all([
        loadCliConfig('/project/a', { refresh: true }),
        loadCliConfig('/project/a', { refresh: true }),
      ]);

      vi.mocked(Claude.spawnAuthed).mockImplementationOnce(async () => makeFakeProc(controlResponse('after')));
      const later = await loadCliConfig('/project/a', { refresh: true });

      expect(vi.mocked(Claude.spawnAuthed)).toHaveBeenCalledTimes(2);
      expect(later?.response.response.commands[0].name).toBe('after');
    });

    it('settles every waiting caller when the shared probe cannot start, and the next call starts fresh', async () => {
      vi.mocked(Claude.spawnAuthed).mockImplementationOnce(async () => {
        throw new Error('spawn failed');
      });

      const settled = await Promise.allSettled([
        loadCliConfig('/project/a', { refresh: true }),
        loadCliConfig('/project/a', { refresh: true }),
        loadCliConfig('/project/a', { refresh: true }),
      ]);

      expect(settled.every((s) => s.status === 'rejected')).toBe(true);
      expect(vi.mocked(Claude.spawnAuthed)).toHaveBeenCalledTimes(1);

      vi.mocked(Claude.spawnAuthed).mockImplementationOnce(async () => makeFakeProc(controlResponse('recovered')));
      const next = await loadCliConfig('/project/a', { refresh: true });

      expect(next?.response.response.commands[0].name).toBe('recovered');
      expect(vi.mocked(Claude.spawnAuthed)).toHaveBeenCalledTimes(2);
    });
  });

  describe('probe arguments', () => {
    it('starts the probe with hooks switched off, so SessionStart output is never emitted (#571)', async () => {
      vi.mocked(Claude.spawnAuthed).mockImplementation(async () => makeFakeProc(controlResponse('skill-a')));

      await loadCliConfig('/project/a');

      const args = vi.mocked(Claude.spawnAuthed).mock.calls[0][0];
      const at = args.indexOf('--settings');
      expect(at).toBeGreaterThanOrEqual(0);
      expect(JSON.parse(args[at + 1])).toEqual({ disableAllHooks: true });
    });

    it('escapes the quotes of the settings JSON on Windows, where cmd.exe strips unescaped ones', () => {
      expect(configProbeSettingsArg('win32')).toBe('{\\"disableAllHooks\\":true}');
      expect(configProbeSettingsArg('darwin')).toBe('{"disableAllHooks":true}');
      expect(configProbeSettingsArg('linux')).toBe('{"disableAllHooks":true}');
    });
  });

  describe('parseCliConfigResponse', () => {
    it('should return control_response as-is', () => {
      const controlResponse = {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: 'init_1',
          response: {
            commands: [
              { name: 'compact', description: 'Compact conversation history', argumentHint: '' },
              { name: 'debug', description: 'Enable debug logging', argumentHint: '[issue]' },
            ],
            agents: [],
            output_style: 'default',
            available_output_styles: ['default'],
            models: [],
            account: { email: 'test@test.com', subscriptionType: 'Pro' },
            pid: 12345,
          },
        },
      };
      const stdout = JSON.stringify(controlResponse) + '\n';
      const result = parseCliConfigResponse(stdout);
      expect(result).toEqual(controlResponse);
    });

    it('should find control_response among other events', () => {
      const lines = [
        '{"type":"system","subtype":"hook_started","hook_id":"abc"}',
        '{"type":"control_response","response":{"subtype":"success","request_id":"config_init","response":{"commands":[{"name":"debug","description":"Enable debug logging","argumentHint":"[issue]"}],"agents":[],"output_style":"default","available_output_styles":[],"models":[],"account":{"email":"a@b.com","subscriptionType":"Free"},"pid":1}}}',
      ];
      const stdout = lines.join('\n') + '\n';
      const result = parseCliConfigResponse(stdout);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('control_response');
      expect(result!.response.response.commands).toHaveLength(1);
      expect(result!.response.response.commands[0].name).toBe('debug');
    });

    it('should return null when no control_response is found', () => {
      const stdout = '{"type":"system","subtype":"hook_started","hook_id":"abc"}\n';
      const result = parseCliConfigResponse(stdout);
      expect(result).toBeNull();
    });

    it('should handle empty stdout', () => {
      const result = parseCliConfigResponse('');
      expect(result).toBeNull();
    });

    it('should skip malformed JSON lines gracefully', () => {
      const controlResponse = {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: 'init_1',
          response: {
            commands: [{ name: 'foo', description: '', argumentHint: '' }],
            agents: [],
            output_style: 'default',
            available_output_styles: [],
            models: [],
            account: { email: '', subscriptionType: '' },
            pid: 0,
          },
        },
      };
      const lines = [
        'not valid json',
        JSON.stringify(controlResponse),
      ];
      const stdout = lines.join('\n') + '\n';
      const result = parseCliConfigResponse(stdout);
      expect(result).toEqual(controlResponse);
    });
  });
});

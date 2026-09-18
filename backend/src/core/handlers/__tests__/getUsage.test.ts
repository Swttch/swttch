import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The usage store writes snapshots and cool-downs under the user-data directory, and a
 * suite that let it use the real one would read the developer's own cached usage —
 * passing or failing on state no fixture set up. CCG_HOME is the documented override,
 * so each run gets a directory of its own.
 */
const CCG_HOME = mkdtempSync(join(tmpdir(), 'ccg-usage-test-'));
process.env.CCG_HOME = CCG_HOME;

// The usage path refuses a kit too old to read Claude's settings files, since this backend
// stopped copying that env block into the child. Answering "yes" here keeps these tests about
// what they are about; the refusal itself is covered where it lives.
vi.mock('../../extend-kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../extend-kit')>()),
  hasSettingsEnvCapability: vi.fn().mockResolvedValue(true),
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';
import { getUsageHandler, resetUsageCache, ingestRateLimitWindows } from '../getUsage';

const mockExecFile = vi.mocked(execFile);
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

function createMockConnections() {
  return {
    sendTo: vi.fn(),
    broadcastToAll: vi.fn(),
  } as unknown as ConnectionManager;
}

const mockBridge = {} as Bridge;

const SAMPLE_USAGE = {
  five_hour: { utilization: 49, resets_at: '2026-03-30T11:00:00Z' },
  seven_day: { utilization: 8, resets_at: '2026-04-05T03:00:00Z' },
  seven_day_oauth_apps: null,
  seven_day_opus: null,
  seven_day_sonnet: { utilization: 3, resets_at: '2026-04-06T04:00:00Z' },
  seven_day_cowork: null,
  iguana_necktie: null,
  extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null },
};

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

function setupExecFileSuccess(data: unknown) {
  mockExecFile.mockImplementation(((_cmd: string, _args: readonly string[] | null | undefined, _opts: unknown, callback: ExecFileCallback) => {
    callback(null, JSON.stringify(data), '');
  }) as unknown as typeof execFile);
}

function setupExecFileError(err: Error) {
  mockExecFile.mockImplementation(((_cmd: string, _args: readonly string[] | null | undefined, _opts: unknown, callback: ExecFileCallback) => {
    callback(err, '', '');
  }) as unknown as typeof execFile);
}

function setupExecFileStdout(stdout: string) {
  mockExecFile.mockImplementation(((_cmd: string, _args: readonly string[] | null | undefined, _opts: unknown, callback: ExecFileCallback) => {
    callback(null, stdout, '');
  }) as unknown as typeof execFile);
}

describe('getUsageHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Wipe the isolated store between cases, so a snapshot written by one case cannot
    // be served as a fallback in the next and hide the failure under test.
    rmSync(join(CCG_HOME, 'usage'), { recursive: true, force: true });
    resetUsageCache();
  });

  it('should return usage data on successful ccb execution', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
    setupExecFileSuccess(SAMPLE_USAGE);

    await getUsageHandler('conn-1', message, connections, mockBridge);

    const expectedShellArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'ccb', 'oauth', 'usage', '--json']
      : ['-l', '-i', '-c', 'ccb oauth usage --json'];
    expect(mockExecFile).toHaveBeenCalledWith(
      expect.any(String),
      expectedShellArgs,
      expect.objectContaining({ timeout: 15000 }),
      expect.any(Function),
    );
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'ok',
      usage: SAMPLE_USAGE,
    }));
  });

  it('should not include error_kind on successful response', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
    setupExecFileSuccess(SAMPLE_USAGE);

    await getUsageHandler('conn-1', message, connections, mockBridge);

    const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = call[2];
    expect(payload.error_kind).toBeUndefined();
  });

  it('should return cached data on second call within TTL', async () => {
    const connections = createMockConnections();
    const message1: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
    const message2: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-2' };
    setupExecFileSuccess(SAMPLE_USAGE);

    await getUsageHandler('conn-1', message1, connections, mockBridge);
    await getUsageHandler('conn-1', message2, connections, mockBridge);

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-2',
      status: 'ok',
      usage: SAMPLE_USAGE,
    }));
  });

  describe('error classification', () => {
    it('should classify "ccb: command not found" as ccb_missing', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      setupExecFileError(new Error('ccb: command not found'));

      await getUsageHandler('conn-1', message, connections, mockBridge);

      expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
        requestId: 'req-1',
        status: 'error',
        error_kind: 'ccb_missing',
        error: 'The ccb CLI is not installed',
      }));
    });

    // exit code 127 = the shell could not find the command. This is the standard,
    // locale-independent signal for "ccb is not installed". The shell's "command not
    // found" text is localized (e.g. Russian "команда не найдена") and cannot be matched
    // by an English regex, but the exit code is always 127. (issue #114)
    it('should classify exit code 127 as ccb_missing regardless of shell locale', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      const err = Object.assign(
        new Error('Command failed: /bin/bash -l -i -c ccb oauth usage --json\nbash: no job control in this shell\nbash: ccb: команда не найдена'),
        { code: 127 },
      );
      setupExecFileError(err);

      await getUsageHandler('conn-1', message, connections, mockBridge);

      expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
        requestId: 'req-1',
        status: 'error',
        error_kind: 'ccb_missing',
        error: 'The ccb CLI is not installed',
      }));
    });

    // ENOENT means the SHELL binary itself is missing, not ccb. execFile spawns the
    // shell (not ccb directly), so a missing ccb surfaces as exit 127, never ENOENT.
    // A broken-shell environment must not be mislabeled as "ccb not installed". (issue #114)
    it('should NOT classify ENOENT (missing shell binary) as ccb_missing', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      const enoentErr = Object.assign(new Error('spawn /bin/bash ENOENT'), { code: 'ENOENT' });
      setupExecFileError(enoentErr);

      await getUsageHandler('conn-1', message, connections, mockBridge);

      const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[2].error_kind).not.toBe('ccb_missing');
    });

    it('should classify npm "could not determine executable" as ccb_missing', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      setupExecFileError(new Error(
        'Command failed: npx ccb oauth usage --json\nnpm error could not determine executable to run\nnpm error A complete log of this run can be found in: /tmp/npm.log',
      ));

      await getUsageHandler('conn-1', message, connections, mockBridge);

      expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
        requestId: 'req-1',
        status: 'error',
        error_kind: 'ccb_missing',
        error: 'The ccb CLI is not installed',
      }));
    });

    it('should classify "npm: command not found" as npm_missing', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      setupExecFileError(new Error('npm: command not found'));

      await getUsageHandler('conn-1', message, connections, mockBridge);

      expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
        requestId: 'req-1',
        status: 'error',
        error_kind: 'npm_missing',
      }));
    });

    /**
     * The classification contract with ccb.
     *
     * ccb always prints a `code` — even a failure that is not a CcbError comes out
     * as `unknown_error` — so the code is what these read. The previous rule was
     * "any JSON ccb printed means auth", which is how a refused proxy came to tell
     * people their login had expired.
     */
    describe('classifying by the code ccb reported', () => {
      /** The shape ccb actually writes to stderr, via CcbError.toJSON(). */
      function ccbFailure(code: string, message: string, hint?: string) {
        return new Error(
          'Command failed: /bin/zsh -l -i -c ccb oauth usage --json\n'
          + JSON.stringify({ error: { code, message, ...(hint && { hint }) } }, null, 2),
        );
      }

      it('classifies an expired token as auth', async () => {
        const connections = createMockConnections();
        const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
        setupExecFileError(ccbFailure('token_expired', 'API error 401: Unauthorized'));

        await getUsageHandler('conn-1', message, connections, mockBridge);

        expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
          error_kind: 'auth',
          error: 'API error 401: Unauthorized',
        }));
      });

      // The defect this whole change exists for. ccb said network_error and put an
      // ECONNREFUSED in the message, and the user was told to log in again.
      it('classifies an unreachable proxy as network, not auth', async () => {
        const connections = createMockConnections();
        const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
        setupExecFileError(ccbFailure(
          'network_error',
          'Could not reach api.anthropic.com: connect ECONNREFUSED 127.0.0.1:9',
          'This connection went through the proxy from HTTP_PROXY/HTTPS_PROXY/ALL_PROXY.',
        ));

        await getUsageHandler('conn-1', message, connections, mockBridge);

        const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
        expect(call?.[2].error_kind).toBe('network');
        expect(call?.[2].error).toContain('ECONNREFUSED');
        expect(call?.[2].error).toContain('proxy');
      });

      // Filed under its own kind rather than `network`. The account is fine either
      // way, but "network error" sends someone to check an internet connection that
      // is working, while the thing that refused them is named in their own settings.
      it('classifies a proxy that refused the tunnel as a proxy failure', async () => {
        const connections = createMockConnections();
        const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
        setupExecFileError(ccbFailure(
          'proxy_rejected',
          'The proxy refused to open a tunnel to api.anthropic.com (403 Forbidden)',
          'This is the proxy at http://127.0.0.1:8080 answering, not the Anthropic API.',
        ));

        await getUsageHandler('conn-1', message, connections, mockBridge);

        const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
        expect(call?.[2].error_kind).toBe('proxy');
        expect(call?.[2].error).toContain('http://127.0.0.1:8080');
      });

      // A 403 from the API is not an account problem, and calling it one sent the
      // reporter on Swttch/swttch#432 looking in the wrong place.
      it('does not call a 403 from the API an auth failure', async () => {
        const connections = createMockConnections();
        const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
        setupExecFileError(ccbFailure(
          'forbidden',
          'API error 403: Forbidden',
          'The request went straight to the API, with no proxy configured for this process.',
        ));

        await getUsageHandler('conn-1', message, connections, mockBridge);

        const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
        expect(call?.[2].error_kind).not.toBe('auth');
        expect(call?.[2].error).toContain('no proxy configured');
      });

      it('passes a rate limit through with the wait it was given', async () => {
        const connections = createMockConnections();
        const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
        setupExecFileError(ccbFailure(
          'rate_limited',
          'API error 429: Too Many Requests',
          'Too many requests. The API asked us to wait 42s.',
        ));

        await getUsageHandler('conn-1', message, connections, mockBridge);

        const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
        expect(call?.[2].error_kind).not.toBe('auth');
        expect(call?.[2].error).toContain('42s');
      });

      /**
       * The shape the real pipeline produces, captured from an end-to-end run.
       *
       * execFile folds stderr into the error message, and the caller may hold the
       * same stderr separately, so ccb's payload can appear twice in the text
       * being classified. A reader that takes everything between the first brace
       * and the last one spans both copies and parses neither — which is exactly
       * what shipped past a suite whose fixtures printed the payload once, and
       * left the user staring at "Command failed: /bin/zsh -l -i -c ccb ...".
       */
      it('classifies correctly when ccb output appears twice in the error text', async () => {
        const connections = createMockConnections();
        const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
        const payload = JSON.stringify({
          error: {
            code: 'proxy_rejected',
            message: 'The proxy refused to open a tunnel to api.anthropic.com (403 Forbidden)',
            hint: 'This is the proxy at http://127.0.0.1:8803 answering, not the Anthropic API.',
            details: { proxyUrl: 'http://127.0.0.1:8803', proxyConnectStatus: 403, reachedDestination: false },
          },
        }, null, 2);
        setupExecFileError(Object.assign(
          new Error(`Command failed: /bin/zsh -l -i -c ccb oauth usage --json\n${payload}\n`),
          { stderr: `${payload}\n` },
        ));

        await getUsageHandler('conn-1', message, connections, mockBridge);

        const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
        expect(call?.[2].error_kind).toBe('proxy');
        expect(call?.[2].error).toContain('The proxy refused to open a tunnel');
        expect(call?.[2].error).not.toContain('Command failed');
        expect(call?.[2].error).not.toContain('/bin/zsh');
      });

      it('reports a code it does not recognize as unknown, keeping the message', async () => {
        const connections = createMockConnections();
        const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
        setupExecFileError(ccbFailure('some_future_code', 'Something new went wrong'));

        await getUsageHandler('conn-1', message, connections, mockBridge);

        expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
          error_kind: 'unknown',
          error: 'Something new went wrong',
        }));
      });
    });

    /**
     * What the user saw when the child was killed at the spawn budget: the login
     * shell's complaint about a line-editor option it could not set, and nothing
     * about a timeout or a proxy.
     */
    it('replaces the shell noise of a killed child with something a person can act on', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      setupExecFileError(Object.assign(
        new Error('Command failed: /bin/zsh -l -i -c ccb oauth usage --json\n'
          + "(eval):1: can't change option: zle\n(eval):1: can't change option: zle"),
        { killed: true, signal: 'SIGTERM' },
      ));

      await getUsageHandler('conn-1', message, connections, mockBridge);

      const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[2].error_kind).toBe('network');
      expect(call?.[2].error).not.toContain('zle');
      expect(call?.[2].error).not.toContain('/bin/zsh');
      expect(call?.[2].error).toContain('proxy');
    });

    it('names the proxy in a timeout when one is visible to this process', async () => {
      // Turns "check whether you have a proxy" into "this proxy did not answer".
      const previous = process.env.HTTPS_PROXY;
      process.env.HTTPS_PROXY = 'http://proxy.corp:3128';
      try {
        const connections = createMockConnections();
        const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
        setupExecFileError(Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' }));

        await getUsageHandler('conn-1', message, connections, mockBridge);

        const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
        expect(call?.[2].error_kind).toBe('proxy');
        expect(call?.[2].error).toContain('http://proxy.corp:3128');
        expect(call?.[2].error).toContain('HTTPS_PROXY');
      } finally {
        if (previous === undefined) delete process.env.HTTPS_PROXY;
        else process.env.HTTPS_PROXY = previous;
      }
    });

    it('keeps the conditional wording when no proxy is visible here', async () => {
      // Absence proves nothing: ccb runs through a login shell that sources the user's
      // startup files, so a proxy exported in .zshrc reaches ccb and never reaches us.
      const previous = process.env.HTTPS_PROXY;
      delete process.env.HTTPS_PROXY;
      try {
        const connections = createMockConnections();
        const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
        setupExecFileError(Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' }));

        await getUsageHandler('conn-1', message, connections, mockBridge);

        const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
        expect(call?.[2].error_kind).toBe('network');
        expect(call?.[2].error).toContain('If this machine reaches Anthropic through a proxy');
      } finally {
        if (previous !== undefined) process.env.HTTPS_PROXY = previous;
      }
    });

    it('strips shell noise from an error it cannot otherwise explain', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      setupExecFileError(new Error("(eval):1: can't change option: zle\nsomething weird happened"));

      await getUsageHandler('conn-1', message, connections, mockBridge);

      const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[2].error_kind).toBe('unknown');
      expect(call?.[2].error).toBe('something weird happened');
    });

    it('should classify ENOTFOUND as network error', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      setupExecFileError(new Error('getaddrinfo ENOTFOUND api.anthropic.com'));

      await getUsageHandler('conn-1', message, connections, mockBridge);

      expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
        requestId: 'req-1',
        status: 'error',
        error_kind: 'network',
      }));
    });

    it('should classify unknown errors as unknown', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      setupExecFileError(new Error('something weird happened'));

      await getUsageHandler('conn-1', message, connections, mockBridge);

      expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
        requestId: 'req-1',
        status: 'error',
        error_kind: 'unknown',
        error: 'something weird happened',
      }));
    });
  });

  it('should return error when ccb returns empty stdout', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
    setupExecFileStdout('');

    await getUsageHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'error',
      error_kind: expect.any(String),
    }));
  });

  it('should return error when ccb returns invalid JSON', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
    setupExecFileStdout('not valid json {{{');

    await getUsageHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'error',
      error_kind: expect.any(String),
    }));
  });

  // Issue #62: Linux .bashrc often emits printf "\e[?2004l" (disable bracketed paste).
  // Under `bash -l -i -c`, this escape sequence is written to stdout before the JSON,
  // and trim() cannot strip the ESC control char, so JSON.parse fails.
  it('should parse JSON despite a leading bracketed-paste escape sequence (issue #62)', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
    setupExecFileStdout(`\x1b[?2004l${JSON.stringify(SAMPLE_USAGE)}`);

    await getUsageHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'ok',
      usage: SAMPLE_USAGE,
    }));
  });

  it('should parse JSON despite surrounding shell noise on stdout', async () => {
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
    setupExecFileStdout(`\x1b[?2004l\n${JSON.stringify(SAMPLE_USAGE)}\n\x1b[?2004h`);

    await getUsageHandler('conn-1', message, connections, mockBridge);

    expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
      requestId: 'req-1',
      status: 'ok',
      usage: SAMPLE_USAGE,
    }));
  });

  describe('force refresh', () => {
    it('force=true bypasses successful cache', async () => {
      const connections = createMockConnections();
      const message1: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      const message2: IPCMessage = { type: MessageType.GET_USAGE, payload: { force: true }, timestamp: 0, requestId: 'req-2' };
      setupExecFileSuccess(SAMPLE_USAGE);

      await getUsageHandler('conn-1', message1, connections, mockBridge);
      expect(mockExecFile).toHaveBeenCalledTimes(1);

      await getUsageHandler('conn-1', message2, connections, mockBridge);
      expect(mockExecFile).toHaveBeenCalledTimes(2);

      expect(connections.sendTo).toHaveBeenLastCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
        requestId: 'req-2',
        status: 'ok',
        usage: SAMPLE_USAGE,
      }));
    });

    it('force=true bypasses error cache and returns fresh success', async () => {
      const connections = createMockConnections();
      const message1: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      const message2: IPCMessage = { type: MessageType.GET_USAGE, payload: { force: true }, timestamp: 0, requestId: 'req-2' };

      setupExecFileError(new Error('ccb: command not found'));
      await getUsageHandler('conn-1', message1, connections, mockBridge);
      expect(connections.sendTo).toHaveBeenCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
        status: 'error',
        error_kind: 'ccb_missing',
      }));

      setupExecFileSuccess(SAMPLE_USAGE);
      await getUsageHandler('conn-1', message2, connections, mockBridge);
      expect(mockExecFile).toHaveBeenCalledTimes(2);
      expect(connections.sendTo).toHaveBeenLastCalledWith('conn-1', MessageType.ACK, expect.objectContaining({
        requestId: 'req-2',
        status: 'ok',
        usage: SAMPLE_USAGE,
      }));
    });

    // Note: force=true bypasses inflight test omitted — requires deferred callback mocking
    // which adds complexity not warranted for this case. The implementation resets
    // inflightPromise = null before running a force execution.
  });

  /**
   * The CLI reports the windows on its own while a turn runs. Taking them is the
   * cheapest protection in the file: a request never made is a request that cannot be
   * rate limited, and the bars move as the user works instead of waiting for a poll.
   */
  describe('absorbing the CLI\'s own usage events', () => {
    it('answers from the stream without spawning ccb', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      const resetsAt = Math.floor((Date.now() + 3 * 60 * 60 * 1000) / 1000);
      await ingestRateLimitWindows({
        five_hour: { utilization: 0.2, resetsAt },
        seven_day: { utilization: 0.42, resetsAt },
      });
      setupExecFileSuccess(SAMPLE_USAGE);

      await getUsageHandler('conn-1', message, connections, mockBridge);

      expect(mockExecFile).not.toHaveBeenCalled();
      const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[2].status).toBe('ok');
      // The stream reports a fraction; the panel and the rest of this file speak percent.
      expect(call?.[2].usage.five_hour).toMatchObject({ utilization: 20 });
      expect(call?.[2].usage.seven_day).toMatchObject({ utilization: 42 });
    });

    // An event is an update, not a full statement of what is known. A window it leaves
    // out must keep the value the last read established rather than being blanked.
    it('leaves a window the event did not mention alone', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      const resetsAt = Math.floor((Date.now() + 3 * 60 * 60 * 1000) / 1000);
      await ingestRateLimitWindows({ five_hour: { utilization: 0.1, resetsAt }, seven_day: { utilization: 0.5, resetsAt } });
      await ingestRateLimitWindows({ five_hour: { utilization: 0.3, resetsAt } });

      await getUsageHandler('conn-1', message, connections, mockBridge);

      const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[2].usage.five_hour).toMatchObject({ utilization: 30 });
      expect(call?.[2].usage.seven_day).toMatchObject({ utilization: 50 });
    });

    it('ignores an event that carries no windows', async () => {
      await ingestRateLimitWindows(undefined);
      await ingestRateLimitWindows({});

      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      setupExecFileSuccess(SAMPLE_USAGE);
      await getUsageHandler('conn-1', message, connections, mockBridge);

      // Nothing was stored, so the handler still has to ask.
      expect(mockExecFile).toHaveBeenCalled();
    });
  });

  /**
   * Being rate limited is the one failure with an answer, and the answer is to stop
   * asking: another request inside the window renews the penalty rather than resolving it.
   */
  describe('rate limiting', () => {
    function rateLimited() {
      return new Error(
        'Command failed: /bin/zsh -l -i -c ccb oauth usage --json\n'
        + JSON.stringify({
          error: {
            code: 'rate_limited',
            message: 'API error 429: Too Many Requests',
            hint: 'Too many requests. The API asked us to wait 42s.',
            details: { status: 429, retryAfterSec: 42 },
          },
        }, null, 2),
      );
    }

    it('classifies a 429 as its own kind rather than as an auth problem', async () => {
      const connections = createMockConnections();
      const message: IPCMessage = { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' };
      setupExecFileError(rateLimited());

      await getUsageHandler('conn-1', message, connections, mockBridge);

      const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[2].error_kind).toBe('rate_limited');
    });

    it('stops asking for the rest of the cool-down', async () => {
      const connections = createMockConnections();
      setupExecFileError(rateLimited());
      await getUsageHandler('conn-1', { type: MessageType.GET_USAGE, payload: {}, timestamp: 0, requestId: 'req-1' }, connections, mockBridge);
      expect(mockExecFile).toHaveBeenCalledTimes(1);

      // Even an explicit refresh, which is allowed to punch through the snapshot, must
      // not punch through this: the hammering is what the cool-down exists to prevent.
      await getUsageHandler('conn-1', { type: MessageType.GET_USAGE, payload: { force: true }, timestamp: 0, requestId: 'req-2' }, connections, mockBridge);

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[2].error).toMatch(/refresh in about/i);
    });

    it('keeps showing the last known bars while the cool-down runs', async () => {
      const connections = createMockConnections();
      const resetsAt = Math.floor((Date.now() + 3 * 60 * 60 * 1000) / 1000);
      await ingestRateLimitWindows({ five_hour: { utilization: 0.55, resetsAt } });

      setupExecFileError(rateLimited());
      await getUsageHandler('conn-1', { type: MessageType.GET_USAGE, payload: { force: true }, timestamp: 0, requestId: 'req-1' }, connections, mockBridge);

      const call = (connections.sendTo as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[2].status).toBe('ok');
      expect(call?.[2].usage.five_hour).toMatchObject({ utilization: 55 });
    });
  });
});

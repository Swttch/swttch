import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * A session's name is the CLI's own rename. The quiet way is the `rename_session` request,
 * which records the name and adds nothing to the conversation; the official `/rename`
 * command is the fallback and does add lines. A CLI already running the session is the one
 * told (it would otherwise write its old name back over any other writer's); with none
 * running, a CLI is resumed for the one request.
 */

const spawnAuthed = vi.fn();
const killTree = vi.fn();
const sendAsCommands = vi.fn<(...args: unknown[]) => boolean>();
const sendControlRequestToProcess = vi.fn<(...args: unknown[]) => boolean>();
const waitForControlResponse = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const cancelControlResponse = vi.fn();

vi.mock('../../claude', () => ({
  Claude: {
    spawnAuthed: (...args: unknown[]) => spawnAuthed(...args),
    killTree: (...args: unknown[]) => killTree(...args),
  },
}));
vi.mock('../effort-runtime', () => ({
  sendAsCommands: (...args: unknown[]) => sendAsCommands(...args),
}));
vi.mock('../../claude-process', () => ({
  sendControlRequestToProcess: (...args: unknown[]) => sendControlRequestToProcess(...args),
}));
vi.mock('../../control-response-waiter', () => ({
  waitForControlResponse: (...args: unknown[]) => waitForControlResponse(...args),
  cancelControlResponse: (...args: unknown[]) => cancelControlResponse(...args),
  nextControlRequestId: (label: string) => `${label}-1`,
}));

import { normalizeSessionName, renameCommand, renameSessionThroughCli } from '../cli-rename';
import type { ConnectionManager } from '../../../ws/connection-manager';

class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });
}

function connectionsRunning(sessionId: string | null): ConnectionManager {
  return {
    getSession: (id: string) => (id === sessionId ? { process: { stdin: { writable: true } } } : undefined),
  } as unknown as ConnectionManager;
}

const request = (name: string) => ({
  subtype: 'rename_session',
  title: name,
  source: 'host',
  session_id: 's1',
});

function answer(proc: FakeProc, response: Record<string, unknown>): void {
  proc.stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'control_response', response })}\n`));
}

function finishCommand(proc: FakeProc, code: number, stdout = '', stderr = ''): void {
  if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
  if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
  proc.emit('close', code);
}

beforeEach(() => {
  vi.clearAllMocks();
  sendAsCommands.mockReturnValue(true);
  sendControlRequestToProcess.mockReturnValue(true);
  waitForControlResponse.mockResolvedValue({});
});

describe('normalizeSessionName', () => {
  it('makes one line of it, the way the CLI keeps a name', () => {
    expect(normalizeSessionName('  two\nlines\t here  ')).toBe('two lines here');
  });

  it('cuts it at 200 characters, counting characters rather than UTF-16 units', () => {
    const name = normalizeSessionName('가'.repeat(250));
    expect(Array.from(name)).toHaveLength(200);
  });
});

describe('renameCommand', () => {
  it('is the slash command a terminal user types', () => {
    expect(renameCommand('  My name ')).toBe('/rename My name');
  });
});

describe('renameSessionThroughCli with a CLI running the session', () => {
  it('asks it with rename_session, which adds nothing to the conversation, and starts no other CLI', async () => {
    const delivery = await renameSessionThroughCli(connectionsRunning('s1'), 's1', ' New name ', '/proj');

    expect(delivery).toBe('request_to_live_cli');
    expect(sendControlRequestToProcess).toHaveBeenCalledWith(
      expect.anything(),
      's1',
      'rename_session-1',
      request('New name'),
    );
    expect(sendAsCommands).not.toHaveBeenCalled();
    expect(spawnAuthed).not.toHaveBeenCalled();
  });

  it('falls back to the official /rename when the CLI does not answer the request', async () => {
    waitForControlResponse.mockRejectedValue(new Error('Unsupported control request subtype: rename_session'));

    const delivery = await renameSessionThroughCli(connectionsRunning('s1'), 's1', 'New name', '/proj');

    expect(delivery).toBe('command_to_live_cli');
    expect(sendAsCommands).toHaveBeenCalledWith(expect.anything(), 's1', ['/rename New name']);
    expect(spawnAuthed).not.toHaveBeenCalled();
  });

  it('falls back when the request could not be written, and settles the waiter it abandoned', async () => {
    sendControlRequestToProcess.mockReturnValue(false);
    waitForControlResponse.mockRejectedValue(new Error('cancelled'));

    const delivery = await renameSessionThroughCli(connectionsRunning('s1'), 's1', 'New name', '/proj');

    expect(cancelControlResponse).toHaveBeenCalledWith('rename_session-1');
    expect(delivery).toBe('command_to_live_cli');
  });
});

describe('renameSessionThroughCli with no CLI running the session', () => {
  it('resumes the same session in stream-json mode and sends the request as its first line', async () => {
    const proc = new FakeProc();
    spawnAuthed.mockResolvedValue(proc);

    const pending = renameSessionThroughCli(connectionsRunning(null), 's1', 'New "quoted" & name', '/proj');
    await vi.waitFor(() => expect(proc.stdin.write).toHaveBeenCalled());
    answer(proc, { subtype: 'success', request_id: 'rename_session-1' });

    await expect(pending).resolves.toBe('request_to_resumed_cli');
    expect(spawnAuthed).toHaveBeenCalledWith(
      ['-p', '--resume', 's1', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--restricted'],
      '/proj',
      expect.objectContaining({ cwd: '/proj' }),
    );
    const sent = JSON.parse(String(proc.stdin.write.mock.calls[0][0]));
    expect(sent).toEqual({
      type: 'control_request',
      request_id: 'rename_session-1',
      request: request('New "quoted" & name'),
    });
    // The answer is in, so the CLI is let go.
    expect(proc.stdin.end).toHaveBeenCalled();
    expect(sendAsCommands).not.toHaveBeenCalled();
    expect(spawnAuthed).toHaveBeenCalledTimes(1);
  });

  it('reads the answer however the output is cut into chunks, and ignores other lines', async () => {
    const proc = new FakeProc();
    spawnAuthed.mockResolvedValue(proc);

    const pending = renameSessionThroughCli(connectionsRunning(null), 's1', 'Name', '/proj');
    await vi.waitFor(() => expect(proc.stdin.write).toHaveBeenCalled());
    proc.stdout.emit('data', Buffer.from('{"type":"system","subtype":"init"}\nnot json\n'));
    proc.stdout.emit(
      'data',
      Buffer.from(`${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'other' } })}\n{"type":"control_resp`),
    );
    proc.stdout.emit(
      'data',
      Buffer.from('onse","response":{"subtype":"success","request_id":"rename_session-1"}}\n'),
    );

    await expect(pending).resolves.toBe('request_to_resumed_cli');
  });

  it('tries the request once more without --restricted for a CLI that does not know the flag', async () => {
    // Measured on 2.1.150: `--restricted` is an unknown option, so the CLI exits before it answers,
    // yet it answers rename_session itself. Its own /rename replies "isn't available in this
    // environment", so going straight to the fallback would leave the session unrenamed.
    const restricted = new FakeProc();
    const plain = new FakeProc();
    spawnAuthed.mockResolvedValueOnce(restricted).mockResolvedValueOnce(plain);

    const pending = renameSessionThroughCli(connectionsRunning(null), 's1', 'Name', '/proj');
    await vi.waitFor(() => expect(restricted.stdin.write).toHaveBeenCalled());
    restricted.stderr.emit('data', Buffer.from("error: unknown option '--restricted'"));
    restricted.emit('close', 1);
    await vi.waitFor(() => expect(plain.stdin.write).toHaveBeenCalled());
    answer(plain, { subtype: 'success', request_id: 'rename_session-1' });

    await expect(pending).resolves.toBe('request_to_resumed_cli');
    expect(spawnAuthed).toHaveBeenCalledTimes(2);
    expect(spawnAuthed.mock.calls[0][0]).toContain('--restricted');
    expect(spawnAuthed.mock.calls[1][0]).not.toContain('--restricted');
    expect(sendAsCommands).not.toHaveBeenCalled();
  });

  describe('when the request is refused both ways', () => {
    /** Starts a rename with no CLI running and lets both request attempts fail; returns the CLI for /rename. */
    async function failBothRequests() {
      const first = new FakeProc();
      const second = new FakeProc();
      const commanded = new FakeProc();
      spawnAuthed.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(commanded);

      const pending = renameSessionThroughCli(connectionsRunning(null), 's1', 'New name', '/proj');
      pending.catch(() => undefined);
      await vi.waitFor(() => expect(first.stdin.write).toHaveBeenCalled());
      answer(first, { subtype: 'error', request_id: 'rename_session-1', error: 'Unsupported control request subtype' });
      await vi.waitFor(() => expect(second.stdin.write).toHaveBeenCalled());
      second.emit('close', 1);
      await vi.waitFor(() => expect(commanded.stdin.end).toHaveBeenCalled());
      return { pending, commanded };
    }

    it('falls back to the official /rename, run by a CLI started for it', async () => {
      const { pending, commanded } = await failBothRequests();
      finishCommand(commanded, 0, 'Session renamed to: New name\n');

      await expect(pending).resolves.toBe('command_to_resumed_cli');
      expect(spawnAuthed).toHaveBeenLastCalledWith(
        ['-p', '--resume', 's1', '--output-format', 'text'],
        '/proj',
        expect.objectContaining({ cwd: '/proj' }),
      );
      expect(commanded.stdin.end).toHaveBeenCalledWith('/rename New name\n');
    });

    it('fails with what the CLI said when /rename failed too', async () => {
      const { pending, commanded } = await failBothRequests();
      finishCommand(commanded, 1, '', 'No conversation found with session ID: s1');

      await expect(pending).rejects.toThrow('No conversation found with session ID: s1');
    });

    it('fails when the CLI exits 0 from /rename without saying it renamed', async () => {
      const { pending, commanded } = await failBothRequests();
      finishCommand(commanded, 0, "/rename isn't available in this environment.");

      await expect(pending).rejects.toThrow("isn't available in this environment");
    });
  });

  it('kills a CLI that does not answer the request in time, then tries again without --restricted', async () => {
    vi.useFakeTimers();
    try {
      const silent = new FakeProc();
      const plain = new FakeProc();
      spawnAuthed.mockResolvedValueOnce(silent).mockResolvedValueOnce(plain);

      const pending = renameSessionThroughCli(connectionsRunning(null), 's1', 'Name', '/proj');
      pending.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(31_000);

      expect(killTree).toHaveBeenCalledWith(silent);
      await vi.advanceTimersByTimeAsync(0);
      answer(plain, { subtype: 'success', request_id: 'rename_session-1' });
      await expect(pending).resolves.toBe('request_to_resumed_cli');
    } finally {
      vi.useRealTimers();
    }
  });
});

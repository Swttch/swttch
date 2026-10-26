import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { generateCommitMessage, runClaudeCommitMessage } from '../commit-message';

const claudeMocks = vi.hoisted(() => ({
  spawnAuthed: vi.fn(),
  killTree: vi.fn(),
}));

const claudeSettingsMocks = vi.hoisted(() => ({
  readMergedClaudeSettings: vi.fn(),
}));

vi.mock('../../claude', () => ({
  Claude: {
    spawnAuthed: (...args: unknown[]) => claudeMocks.spawnAuthed(...args),
    killTree: (...args: unknown[]) => claudeMocks.killTree(...args),
  },
}));

vi.mock('../claude-settings', () => ({
  readMergedClaudeSettings: (...args: unknown[]) =>
    claudeSettingsMocks.readMergedClaudeSettings(...args),
}));

function fakeCli(output: string, exitCode: number): EventEmitter {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { on: () => void; end: () => void };
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = {
    on: () => undefined,
    end: () => {
      setTimeout(() => {
        if (exitCode === 0) {
          proc.stdout.emit('data', Buffer.from(output));
        } else {
          proc.stderr.emit('data', Buffer.from(output));
        }
        proc.emit('close', exitCode);
      }, 0);
    },
  };
  return proc;
}

function pendingCli() {
  const proc = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { on: () => void; end: () => void };
  };
  proc.pid = 4321;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = {
    on: () => undefined,
    end: () => undefined,
  };
  return proc;
}

describe('generateCommitMessage Claude compatibility', () => {
  const previousBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  const previousAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    claudeSettingsMocks.readMergedClaudeSettings.mockResolvedValue({
      settings: {},
      overrides: [],
    });
  });

  afterEach(() => {
    if (previousBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousApiKey;
    if (previousAuthToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
    else process.env.ANTHROPIC_AUTH_TOKEN = previousAuthToken;
  });

  it('spawns the CLI for a third-party gateway without credentials in settings', async () => {
    claudeSettingsMocks.readMergedClaudeSettings.mockResolvedValue({
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
        },
      },
      overrides: ['env'],
    });
    claudeMocks.spawnAuthed.mockResolvedValueOnce(
      fakeCli('feat: add new content', 0),
    );

    const message = await runClaudeCommitMessage('Generate a commit message.', '/repo');

    expect(message).toBe('feat: add new content');
    expect(claudeMocks.spawnAuthed).toHaveBeenCalledTimes(1);
  });

  it('spawns the CLI even when settings hold a gateway token and never reads it itself', async () => {
    claudeSettingsMocks.readMergedClaudeSettings.mockResolvedValue({
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://example.com/api/anthropic',
          ANTHROPIC_AUTH_TOKEN: 'token',
        },
      },
      overrides: ['env'],
    });
    claudeMocks.spawnAuthed.mockResolvedValueOnce(
      fakeCli('feat: add new content', 0),
    );

    const message = await runClaudeCommitMessage('Generate a commit message.', '/repo');

    expect(message).toBe('feat: add new content');
    expect(claudeMocks.spawnAuthed).toHaveBeenCalledTimes(1);
  });

  it('skips restricted mode for a third-party Anthropic-compatible gateway', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ccg-commit-message-gateway-'));
    try {
      execFileSync('git', ['init'], { cwd: root });
      writeFileSync(join(root, 'new.txt'), 'New content\n');
      claudeSettingsMocks.readMergedClaudeSettings.mockResolvedValue({
        settings: {
          env: { ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic' },
        },
        overrides: ['env'],
      });
      claudeMocks.spawnAuthed.mockResolvedValueOnce(
        fakeCli('feat: add new content', 0),
      );

      const message = await generateCommitMessage({
        workingDir: root,
        selectedPaths: ['new.txt'],
      });

      expect(message).toBe('feat: add new content');
      expect(claudeSettingsMocks.readMergedClaudeSettings).toHaveBeenCalledWith(root);
      expect(claudeMocks.spawnAuthed).toHaveBeenCalledTimes(1);
      expect(claudeMocks.spawnAuthed.mock.calls[0][0]).not.toContain('--restricted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps restricted mode for the official Anthropic API', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ccg-commit-message-official-'));
    try {
      execFileSync('git', ['init'], { cwd: root });
      writeFileSync(join(root, 'new.txt'), 'New content\n');
      claudeSettingsMocks.readMergedClaudeSettings.mockResolvedValue({
        settings: {
          env: { ANTHROPIC_BASE_URL: 'https://api.anthropic.com' },
        },
        overrides: ['env'],
      });
      claudeMocks.spawnAuthed.mockResolvedValueOnce(
        fakeCli('feat: add new content', 0),
      );

      await generateCommitMessage({
        workingDir: root,
        selectedPaths: ['new.txt'],
      });

      expect(claudeMocks.spawnAuthed.mock.calls[0][0]).toContain('--restricted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retries once without restricted mode for an older CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ccg-commit-message-cli-'));
    try {
      execFileSync('git', ['init'], { cwd: root });
      writeFileSync(join(root, 'new.txt'), 'New content\n');

      claudeMocks.spawnAuthed
        .mockResolvedValueOnce(fakeCli("error: unknown option '--restricted'", 1))
        .mockResolvedValueOnce(fakeCli('feat: add new content', 0));

      const message = await generateCommitMessage({
        workingDir: root,
        selectedPaths: ['new.txt'],
      });

      expect(message).toBe('feat: add new content');
      expect(claudeMocks.spawnAuthed).toHaveBeenCalledTimes(2);
      expect(claudeMocks.spawnAuthed.mock.calls[0][0]).toContain('--restricted');
      expect(claudeMocks.spawnAuthed.mock.calls[1][0]).not.toContain('--restricted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retries once without low effort for an older CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ccg-commit-message-effort-'));
    try {
      execFileSync('git', ['init'], { cwd: root });
      writeFileSync(join(root, 'new.txt'), 'New content\n');

      claudeMocks.spawnAuthed
        .mockRejectedValueOnce(new Error("error: unknown option '--effort'"))
        .mockResolvedValueOnce(fakeCli('feat: add new content', 0));

      const message = await generateCommitMessage({
        workingDir: root,
        selectedPaths: ['new.txt'],
      });

      expect(message).toBe('feat: add new content');
      expect(claudeMocks.spawnAuthed).toHaveBeenCalledTimes(2);
      expect(claudeMocks.spawnAuthed.mock.calls[0][0]).toContain('--effort');
      expect(claudeMocks.spawnAuthed.mock.calls[1][0]).not.toContain('--effort');
      expect(claudeMocks.spawnAuthed.mock.calls[0][1]).toEqual(root);
      expect(claudeMocks.spawnAuthed.mock.calls[0][2]).toMatchObject({
        cwd: root,
        detached: process.platform !== 'win32',
        env: {},
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('kills the CLI when commit-message generation is aborted', async () => {
    const proc = pendingCli();
    claudeMocks.spawnAuthed.mockResolvedValueOnce(proc);

    const controller = new AbortController();
    const generation = runClaudeCommitMessage('Generate a commit message.', '/repo', controller.signal);

    await vi.waitFor(() => expect(claudeMocks.spawnAuthed).toHaveBeenCalled(), {
      timeout: 5_000,
      interval: 10,
    });
    controller.abort();

    await expect(generation).rejects.toThrow(/cancelled/i);
    await vi.waitFor(() => expect(claudeMocks.killTree).toHaveBeenCalled());
    expect(claudeMocks.killTree.mock.calls[0]?.[0]).toBe(proc);
  });

  it('kills the CLI when commit-message output exceeds its limit', async () => {
    const proc = pendingCli();
    claudeMocks.spawnAuthed.mockResolvedValueOnce(proc);

    const generation = runClaudeCommitMessage('Generate a commit message.', '/repo');
    await vi.waitFor(() => expect(claudeMocks.spawnAuthed).toHaveBeenCalled(), {
      timeout: 5_000,
      interval: 10,
    });
    await vi.waitFor(() => expect(proc.stdout.listenerCount('data')).toBe(1), {
      timeout: 5_000,
      interval: 10,
    });
    proc.stdout.emit('data', Buffer.alloc(16_001, 'x'));

    await expect(generation).rejects.toThrow(/output is too large/i);
    await vi.waitFor(() => expect(claudeMocks.killTree).toHaveBeenCalled());
    expect(claudeMocks.killTree.mock.calls[0]?.[0]).toBe(proc);
  });
});

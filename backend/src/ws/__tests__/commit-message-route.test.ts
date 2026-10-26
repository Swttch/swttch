import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCommitMessageRequest } from '../commit-message-route';

describe('handleCommitMessageRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for invalid JSON', async () => {
    const result = await handleCommitMessageRequest('not json{', vi.fn());

    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Invalid JSON body');
  });

  it('returns 400 when workingDir or selectedPaths is missing', async () => {
    const result = await handleCommitMessageRequest('{"selectedPaths":["src/a.ts"]}', vi.fn());

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('workingDir and selectedPaths');
  });

  it('returns 400 when selectedPaths is empty or contains a non-string', async () => {
    const empty = await handleCommitMessageRequest(
      JSON.stringify({ workingDir: '/repo', selectedPaths: [] }),
      vi.fn(),
      '/repo',
    );
    const invalid = await handleCommitMessageRequest(
      JSON.stringify({ workingDir: '/repo', selectedPaths: [7] }),
      vi.fn(),
      '/repo',
    );

    expect(empty.status).toBe(400);
    expect(String(empty.body.error).toLowerCase()).toContain('select at least one file');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toContain('strings');
  });

  it('returns 400 for a relative working directory', async () => {
    const generate = vi.fn();
    const result = await handleCommitMessageRequest(
      JSON.stringify({ workingDir: 'relative/repo', selectedPaths: ['src/a.ts'] }),
      generate,
    );

    expect(result.status).toBe(400);
    expect(result.body.error).toBe('workingDir must be an absolute path');
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects a working directory outside the backend project root', async () => {
    const generate = vi.fn();
    const result = await handleCommitMessageRequest(
      JSON.stringify({ workingDir: '/other/repo', selectedPaths: ['src/a.ts'] }),
      generate,
      '/trusted/repo',
    );

    expect(result.status).toBe(403);
    expect(result.body.error).toBe('workingDir is outside the backend project root');
    expect(generate).not.toHaveBeenCalled();
  });

  it('allows a Git working directory nested inside the backend project root', async () => {
    const generate = vi.fn().mockResolvedValue('feat: update nested repository');
    const result = await handleCommitMessageRequest(
      JSON.stringify({ workingDir: '/trusted/repo/nested', selectedPaths: ['src/a.ts'] }),
      generate,
      '/trusted/repo',
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ commitMessage: 'feat: update nested repository' });
    expect(generate).toHaveBeenCalledWith({
      workingDir: '/trusted/repo/nested',
      selectedPaths: ['src/a.ts'],
    }, undefined);
  });

  it('rejects generation when the backend project root is not configured', async () => {
    const generate = vi.fn();
    const result = await handleCommitMessageRequest(
      JSON.stringify({ workingDir: '/repo', selectedPaths: ['src/a.ts'] }),
      generate,
    );

    expect(result.status).toBe(503);
    expect(result.body.error).toBe('Backend project root is not configured');
    expect(generate).not.toHaveBeenCalled();
  });

  it('delegates a valid request and returns the generated message', async () => {
    const generate = vi.fn().mockResolvedValue('feat: update selected files');
    const result = await handleCommitMessageRequest(
      JSON.stringify({ workingDir: '/trusted/repo', selectedPaths: ['src/a.ts'] }),
      generate,
      '/trusted/repo',
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ commitMessage: 'feat: update selected files' });
    expect(generate).toHaveBeenCalledWith({
      workingDir: '/trusted/repo',
      selectedPaths: ['src/a.ts'],
    }, undefined);
  });

  it('returns 500 without exposing generated content when generation fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const generate = vi.fn().mockRejectedValue(new Error('claude unavailable'));
    const result = await handleCommitMessageRequest(
      JSON.stringify({ workingDir: '/repo', selectedPaths: ['src/a.ts'] }),
      generate,
      '/repo',
    );

    expect(result.status).toBe(500);
    expect(result.body.error).toBe('Failed to generate commit message');
    expect(consoleError).toHaveBeenCalledWith(
      '[node-backend] Commit message generation failed:',
      expect.any(Error),
    );
  });

  it('passes an abort signal to generation', async () => {
    const controller = new AbortController();
    const generate = vi.fn((_request, signal?: AbortSignal) =>
      Promise.resolve(signal === controller.signal ? 'feat: cancelled later' : 'wrong signal'),
    );
    const result = await handleCommitMessageRequest(
      JSON.stringify({ workingDir: '/trusted/repo', selectedPaths: ['src/a.ts'] }),
      generate,
      '/trusted/repo',
      controller.signal,
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ commitMessage: 'feat: cancelled later' });
    expect(generate).toHaveBeenCalledWith(
      { workingDir: '/trusted/repo', selectedPaths: ['src/a.ts'] },
      controller.signal,
    );
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, readdir, stat, chmod, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  swttchEntrypointName,
  updateSessionsEntrypoint,
  updateTranscriptEntrypoint,
} from '../sessionEntrypoint';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'session-entrypoint-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const line = (entrypoint: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'user', entrypoint, ...extra });

describe('swttchEntrypointName', () => {
  it('names the place the session was started from', () => {
    expect(swttchEntrypointName(true)).toBe('swttch-jetbrains');
    expect(swttchEntrypointName(false)).toBe('swttch-standalone');
  });
});

describe('updateTranscriptEntrypoint', () => {
  it('moves every sdk-cli line to the new name and changes nothing else', async () => {
    const file = join(dir, 'a.jsonl');
    const original = [line('sdk-cli', { n: 1 }), JSON.stringify({ type: 'last-prompt' }), line('sdk-cli', { n: 2 })].join('\n') + '\n';
    await writeFile(file, original);

    expect(await updateTranscriptEntrypoint(file, 'swttch-jetbrains')).toEqual({ kind: 'updated', lines: 3 });

    expect(await readFile(file, 'utf8')).toBe(original.replace(/"entrypoint":"sdk-cli"/g, '"entrypoint":"swttch-jetbrains"'));
  });

  it('leaves the other entrypoints of the same file alone', async () => {
    const file = join(dir, 'a.jsonl');
    await writeFile(file, [line('sdk-cli'), line('claude-desktop')].join('\n') + '\n');

    await updateTranscriptEntrypoint(file, 'swttch-standalone');

    const lines = (await readFile(file, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.entrypoint)).toEqual(['swttch-standalone', 'claude-desktop']);
  });

  it('does not touch the words of a message that mention the pair', async () => {
    const file = join(dir, 'a.jsonl');
    const message = line('cli', { text: 'set "entrypoint":"sdk-cli" to cli' });
    await writeFile(file, message + '\n');

    // The pair inside a message is escaped in the file (\"entrypoint\":\"sdk-cli\"), so it must not match.
    expect(await updateTranscriptEntrypoint(file, 'swttch-jetbrains')).toEqual({ kind: 'unchanged' });
    expect(await readFile(file, 'utf8')).toBe(message + '\n');
  });

  it('does not touch a file that has no sdk-cli line, and leaves no copy behind', async () => {
    const file = join(dir, 'a.jsonl');
    await writeFile(file, line('cli') + '\n');
    const before = await stat(file);

    expect(await updateTranscriptEntrypoint(file, 'swttch-jetbrains')).toEqual({ kind: 'unchanged' });

    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    expect(await readdir(dir)).toEqual(['a.jsonl']);
  });

  it('keeps multi-byte text and a missing final newline exactly as they were', async () => {
    const file = join(dir, 'a.jsonl');
    const original = line('sdk-cli', { text: '한글 🙂 テスト' }) + '\n' + line('sdk-cli', { text: 'tail' });
    await writeFile(file, original);

    await updateTranscriptEntrypoint(file, 'swttch-jetbrains');

    expect(await readFile(file, 'utf8')).toBe(original.replace(/"entrypoint":"sdk-cli"/g, '"entrypoint":"swttch-jetbrains"'));
  });

  it('keeps the file permissions, since transcripts are private to the user', async () => {
    const file = join(dir, 'a.jsonl');
    await writeFile(file, line('sdk-cli') + '\n');
    await chmod(file, 0o600);

    await updateTranscriptEntrypoint(file, 'swttch-jetbrains');

    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readdir(dir)).toEqual(['a.jsonl']);
  });

  it('handles a transcript larger than one read chunk', async () => {
    const file = join(dir, 'a.jsonl');
    const many = Array.from({ length: 4000 }, (_, i) => line('sdk-cli', { i, pad: 'x'.repeat(100) }));
    await writeFile(file, many.join('\n') + '\n');

    expect(await updateTranscriptEntrypoint(file, 'swttch-jetbrains')).toEqual({ kind: 'updated', lines: 4000 });

    const text = await readFile(file, 'utf8');
    expect(text.split('\n').length - 1).toBe(4000);
    expect(text).not.toContain('"entrypoint":"sdk-cli"');
  });
});

describe('updateSessionsEntrypoint', () => {
  it('updates the sessions of a folder, skips the running ones and counts each kind', async () => {
    await writeFile(join(dir, 'old.jsonl'), line('sdk-cli') + '\n');
    await writeFile(join(dir, 'live.jsonl'), line('sdk-cli') + '\n');
    await writeFile(join(dir, 'terminal.jsonl'), line('cli') + '\n');
    await writeFile(join(dir, 'notes.txt'), 'not a transcript');

    const result = await updateSessionsEntrypoint(dir, 'swttch-jetbrains', new Set(['live']));

    expect(result).toEqual({ updated: ['old'], running: ['live'], changedMeanwhile: [], failed: [] });
    expect(await readFile(join(dir, 'live.jsonl'), 'utf8')).toContain('"entrypoint":"sdk-cli"');
    expect(await readFile(join(dir, 'old.jsonl'), 'utf8')).toContain('"entrypoint":"swttch-jetbrains"');
    expect(await readFile(join(dir, 'notes.txt'), 'utf8')).toBe('not a transcript');
  });

  it('answers with nothing done for a folder that does not exist', async () => {
    const result = await updateSessionsEntrypoint(join(dir, 'missing'), 'swttch-jetbrains', new Set());
    expect(result).toEqual({ updated: [], running: [], changedMeanwhile: [], failed: [] });
  });
});

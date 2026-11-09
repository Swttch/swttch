import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { needsDesktopTitle, writeDesktopTitles } from '../sessionTitleForDesktop';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desktop-title-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const IDE_TAG =
  '<ide_opened_file>The user opened the file .env in the IDE. This may or may not be related to the current task.</ide_opened_file>';

const userLine = (text: string, entrypoint = 'swttch-jetbrains') =>
  JSON.stringify({
    type: 'user',
    entrypoint,
    sessionId: 's',
    timestamp: '2026-11-09T00:00:00.000Z',
    message: { role: 'user', content: text },
  });

const assistantLine = JSON.stringify({
  type: 'assistant',
  entrypoint: 'swttch-jetbrains',
  timestamp: '2026-11-09T00:00:01.000Z',
  message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
});

const options = (overrides: Record<string, string> = {}, running: string[] = []) => ({
  runningSessionIds: new Set(running),
  overrides,
  includeLastPrompt: false,
});

const entries = async (name: string) =>
  (await readFile(join(dir, `${name}.jsonl`), 'utf8'))
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe('needsDesktopTitle', () => {
  const base = { entrypoint: 'swttch-jetbrains', hasCustomTitle: false };

  it('writes for a session of this app that has no custom-title', () => {
    expect(needsDesktopTitle(base)).toBe(true);
    expect(needsDesktopTitle({ ...base, entrypoint: 'sdk-cli' })).toBe(true);
    expect(needsDesktopTitle({ ...base, entrypoint: 'swttch-standalone' })).toBe(true);
  });

  it('leaves a session started somewhere else alone', () => {
    expect(needsDesktopTitle({ ...base, entrypoint: 'cli' })).toBe(false);
    expect(needsDesktopTitle({ ...base, entrypoint: null })).toBe(false);
  });

  it('leaves a session that already has a custom-title alone', () => {
    expect(needsDesktopTitle({ ...base, hasCustomTitle: true })).toBe(false);
  });
});

describe('writeDesktopTitles', () => {
  it('writes the first prompt without the IDE context tag as a custom-title entry', async () => {
    await writeFile(join(dir, 'a.jsonl'), [userLine(`${IDE_TAG}\n\nFix the login bug`), assistantLine].join('\n') + '\n');

    const result = await writeDesktopTitles(dir, options());

    expect(result.titled).toEqual(['a']);
    const last = (await entries('a')).at(-1);
    expect(last).toEqual({ type: 'custom-title', customTitle: 'Fix the login bug', sessionId: 'a' });
  });

  it('writes the generated title too, since Desktop does not read ai-title', async () => {
    const generated = JSON.stringify({ type: 'ai-title', aiTitle: 'Fix login', sessionId: 'a' });
    await writeFile(join(dir, 'a.jsonl'), [userLine(`${IDE_TAG}\n\nFix the login bug`), assistantLine, generated].join('\n') + '\n');

    await writeDesktopTitles(dir, options());

    expect((await entries('a')).at(-1)).toEqual({ type: 'custom-title', customTitle: 'Fix login', sessionId: 'a' });
  });

  it('writes the name typed in this app', async () => {
    await writeFile(join(dir, 'a.jsonl'), [userLine('hello'), assistantLine].join('\n') + '\n');

    await writeDesktopTitles(dir, options({ a: 'My own name' }));

    expect((await entries('a')).at(-1)).toMatchObject({ type: 'custom-title', customTitle: 'My own name' });
  });

  it('writes nothing the second time', async () => {
    await writeFile(join(dir, 'a.jsonl'), [userLine('Fix the login bug'), assistantLine].join('\n') + '\n');
    await writeDesktopTitles(dir, options());
    const once = await readFile(join(dir, 'a.jsonl'), 'utf8');

    const again = await writeDesktopTitles(dir, options());

    expect(again.titled).toEqual([]);
    expect(await readFile(join(dir, 'a.jsonl'), 'utf8')).toBe(once);
  });

  it('leaves a name chosen with /rename alone', async () => {
    const renamed = JSON.stringify({ type: 'custom-title', customTitle: 'Chosen', sessionId: 'a' });
    await writeFile(join(dir, 'a.jsonl'), [userLine('hello'), assistantLine, renamed].join('\n') + '\n');

    const result = await writeDesktopTitles(dir, options({ a: 'Typed here' }));

    expect(result.titled).toEqual([]);
    expect((await entries('a')).map((e) => e.type)).toEqual(['user', 'assistant', 'custom-title']);
  });

  it('keeps a transcript that does not end with a newline readable', async () => {
    await writeFile(join(dir, 'a.jsonl'), [userLine('Fix it'), assistantLine].join('\n'));

    await writeDesktopTitles(dir, options());

    expect((await entries('a')).map((e) => e.type)).toEqual(['user', 'assistant', 'custom-title']);
  });

  it('skips a session a CLI is running, one from another client, and one with no conversation', async () => {
    await writeFile(join(dir, 'running.jsonl'), [userLine('hello'), assistantLine].join('\n') + '\n');
    await writeFile(join(dir, 'terminal.jsonl'), [userLine('hello', 'cli'), assistantLine].join('\n') + '\n');
    await writeFile(join(dir, 'empty.jsonl'), JSON.stringify({ type: 'file-history-snapshot', entrypoint: 'sdk-cli' }) + '\n');

    const result = await writeDesktopTitles(dir, options({}, ['running']));

    expect(result.titled).toEqual([]);
    expect(result.failed).toEqual([]);
    expect((await entries('running')).map((e) => e.type)).toEqual(['user', 'assistant']);
    expect((await entries('terminal')).map((e) => e.type)).toEqual(['user', 'assistant']);
  });
});

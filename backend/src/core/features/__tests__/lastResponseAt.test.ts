import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { lastResponseAt } from '../lastResponseAt';

/** When a session last answered, read off the end of its transcript. */
describe('lastResponseAt', () => {
  let dir = '';
  const file = () => join(dir, 's.jsonl');
  const line = (type: string, timestamp: string) => JSON.stringify({ type, timestamp, uuid: Math.random().toString(36) });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'resp-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is the time of the last assistant line, whatever follows it', async () => {
    writeFileSync(
      file(),
      [
        line('user', '2026-11-17T04:00:00.000Z'),
        line('assistant', '2026-11-17T04:00:05.000Z'),
        line('assistant', '2026-11-17T04:00:09.000Z'),
        line('user', '2026-11-17T04:00:20.000Z'),
        JSON.stringify({ type: 'custom-title', customTitle: 'x' }),
      ].join('\n') + '\n',
    );

    expect(await lastResponseAt(file())).toBe(Date.parse('2026-11-17T04:00:09.000Z'));
  });

  it('is 0 when the session never answered', async () => {
    writeFileSync(file(), line('user', '2026-11-17T04:00:00.000Z') + '\n');

    expect(await lastResponseAt(file())).toBe(0);
  });

  it('is 0 when there is no file', async () => {
    expect(await lastResponseAt(join(dir, 'none.jsonl'))).toBe(0);
  });

  it('reads only the end of a large transcript, and skips the line cut in the middle', async () => {
    const filler = 'x'.repeat(2000);
    const old = Array.from({ length: 400 }, () => JSON.stringify({ type: 'user', note: filler })).join('\n');
    writeFileSync(file(), [line('assistant', '2026-11-17T01:00:00.000Z'), old, line('assistant', '2026-11-17T05:00:00.000Z')].join('\n') + '\n');

    expect(await lastResponseAt(file())).toBe(Date.parse('2026-11-17T05:00:00.000Z'));
  });
});

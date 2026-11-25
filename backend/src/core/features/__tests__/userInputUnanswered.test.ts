import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { userInputUnanswered } from '../userInputUnanswered';

const NOW = Date.parse('2026-11-23T09:28:00.000Z');
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();
const line = (entry: Record<string, unknown>) => JSON.stringify(entry);
const user = (text: string, secondsAgo: number) => line({ type: 'user', timestamp: at(secondsAgo), message: { role: 'user', content: text } });
const assistant = (secondsAgo: number) => line({ type: 'assistant', timestamp: at(secondsAgo), message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } });
const meta = (type: string) => line({ type });

// A message handed to a CLI that is finishing a turn starts the next turn at once; its first output comes seconds
// later, and the transcript's last line is that message (#711).
describe('userInputUnanswered', () => {
  let dir = '';
  let file = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'unanswered-'));
    file = join(dir, 's.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const write = (...lines: string[]) => writeFileSync(file, lines.join('\n') + '\n');

  it('is true when the last turn line is a message written a moment ago, however many bookkeeping lines follow it', async () => {
    write(assistant(20), meta('system'), user('add one more thing', 5), meta('file-history-snapshot'), meta('api-request'), meta('last-prompt'));
    expect(await userInputUnanswered(file, NOW)).toBe(true);
  });

  it('is false when the last turn line is an answer', async () => {
    write(user('hello', 20), assistant(10), meta('system'));
    expect(await userInputUnanswered(file, NOW)).toBe(false);
  });

  it('is false when the message is the mark of an interrupted turn', async () => {
    write(assistant(20), user('[Request interrupted by user]', 2));
    expect(await userInputUnanswered(file, NOW)).toBe(false);
    write(assistant(20), line({ type: 'user', timestamp: at(2), message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }));
    expect(await userInputUnanswered(file, NOW)).toBe(false);
  });

  it('is false when the message is old: nothing is going to answer it any more', async () => {
    write(assistant(100), user('lost message', 45));
    expect(await userInputUnanswered(file, NOW)).toBe(false);
  });

  it('is false for a transcript with no turn line, and for a file that is not there', async () => {
    write(meta('file-history-snapshot'));
    expect(await userInputUnanswered(file, NOW)).toBe(false);
    expect(await userInputUnanswered(join(dir, 'nope.jsonl'), NOW)).toBe(false);
  });

  it('reads past a huge bookkeeping line at the end of the file', async () => {
    const blob = line({ type: 'api-request-blob', data: 'x'.repeat(200 * 1024) });
    write(assistant(20), user('one more', 4), blob);
    expect(await userInputUnanswered(file, NOW)).toBe(true);
  });
});

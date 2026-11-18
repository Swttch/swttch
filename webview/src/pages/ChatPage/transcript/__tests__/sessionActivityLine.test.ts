import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { LoadedMessageDto } from '../../../../types';
import { toInstance } from '../../../../dto/common';
import { sessionActivityLine } from '../sessionActivityLine';

// A translator that shows what it was asked for: the key's last part, then what it was given.
const t = ((key: string, options?: { count?: number; name?: string; what?: string }) => {
  const short = key.split('.').pop();
  if (options?.what !== undefined) return `${short}:${options.what}`;
  return options?.name ? `${short}:${options.name}` : options?.count !== undefined ? `${short}:${options.count}` : short;
}) as unknown as TFunction;

// Entries as the session's record holds them, read back from disk: a call is one entry, its result another.
const call = (id: string, name: string, input: Record<string, unknown> = {}) => ({
  type: 'assistant',
  uuid: `a-${id}`,
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
});
const result = (id: string, text = 'ok') => ({
  type: 'user',
  uuid: `r-${id}`,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] },
});
const said = (text: string) => ({ type: 'assistant', uuid: `s-${text}`, message: { role: 'assistant', content: [{ type: 'text', text }] } });

const entries = (...raw: unknown[]) => raw.map((entry) => toInstance(LoadedMessageDto, entry as Record<string, unknown>));

describe('sessionActivityLine', () => {
  it('says nothing for a session that has made no call', () => {
    expect(sessionActivityLine(entries(said('Hello')), t)).toBeUndefined();
    expect(sessionActivityLine([], t)).toBeUndefined();
  });

  it('says a command as "Running" and the whole command, which the card cuts where its room ends', () => {
    const command = 'bash ignore/stargazers.sh --diff 2>&1 | grep -iE "new|lost" | head -n 20';
    expect(sessionActivityLine(entries(call('1', 'Bash', { command })), t)).toBe(`Running ${command}`);
  });

  it('says only the first line of a command that has several', () => {
    const body = entries(call('1', 'Bash', { command: 'gh repo view --json nameWithOwner\necho done' }));
    expect(sessionActivityLine(body, t)).toBe("Running gh repo view --json nameWithOwner");
  });

  it('says the description the session wrote for a command, when it wrote one', () => {
    const body = entries(call('1', 'Bash', { command: 'sleep 15', description: 'Waiting 15 seconds' }));
    expect(sessionActivityLine(body, t)).toBe('Waiting 15 seconds');
  });

  it('keeps the wording of the last call after it has answered, until the next call comes', () => {
    const body = entries(call('1', 'Bash', { command: 'git log --oneline -5' }), result('1'));
    expect(sessionActivityLine(body, t)).toBe("Running git log --oneline -5");
  });

  it('says a file being read as "Reading" and the file name, as the desktop app does', () => {
    const body = entries(call('1', 'Read', { file_path: '/repo/README.md' }));
    expect(sessionActivityLine(body, t)).toBe('Reading README.md');
  });

  it('says another kind of call in its own wording', () => {
    const body = entries(call('1', 'Edit', { file_path: '/a/x.ts' }), result('1'));
    expect(sessionActivityLine(body, t)).toBe('editingFile:x.ts');
  });

  it('says a call that has no wording of its own as the summary line of a chat does', () => {
    const body = entries(call('1', 'Grep', { pattern: 'foo' }));
    expect(sessionActivityLine(body, t)).toBe('searching');
  });

  it('says nothing about a call from before the message that began the turn that is running', () => {
    const sent = { type: 'user', uuid: 'p-2', message: { role: 'user', content: 'Now do another thing' } };
    const body = entries(call('1', 'Bash', { command: 'ls' }), result('1'), said('Done.'), sent);
    expect(sessionActivityLine(body, t)).toBeUndefined();
    // And once the new turn makes its first call, that call is the line.
    expect(sessionActivityLine(entries(call('1', 'Bash', { command: 'ls' }), result('1'), said('Done.'), sent, call('2', 'Read', { file_path: '/a/x.ts' })), t)).toBe('Reading x.ts');
  });

  it('reads the last run, not an earlier one', () => {
    const body = entries(call('1', 'Bash', { command: 'ls' }), result('1'), said('Ran it.'), call('2', 'Read', { file_path: '/a/x.ts' }), result('2'));
    expect(sessionActivityLine(body, t)).toBe('Reading x.ts');
  });

  it('does not take the words the session wrote for a line of its own', () => {
    const body = entries(call('1', 'Bash', { command: 'ls' }), result('1'), said('All done, here is what I found.'));
    expect(sessionActivityLine(body, t)).toBe("Running ls");
  });
});

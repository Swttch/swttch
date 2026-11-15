import { describe, expect, it } from 'vitest';
import type { LoadedMessageDto } from '../../../../types';
import { formatTokenCount, runningActivity } from '../streamingActivity';

function assistant(content: unknown[]): LoadedMessageDto {
  return { type: 'assistant', uuid: 'a', message: { role: 'assistant', content } } as unknown as LoadedMessageDto;
}
const call = (id: string, name: string, input: Record<string, unknown> = {}, tool_result?: unknown) => ({
  type: 'tool_use',
  id,
  name,
  input,
  ...(tool_result ? { tool_result } : {}),
});

describe('runningActivity', () => {
  it('finds the last call that has no result, with its own description', () => {
    const found = runningActivity([assistant([call('1', 'Bash', { description: 'Run the tests', command: 'x' })])]);
    expect(found).toEqual({ toolUseId: '1', description: 'Run the tests', phrase: 'command', mark: 'code', file: null });
  });

  it('falls back to the phrase for the kind of call when there is no description', () => {
    expect(runningActivity([assistant([call('1', 'Edit', { file_path: '/a' })])])?.phrase).toBe('editing');
    expect(runningActivity([assistant([call('2', 'Read', { file_path: '/a' })])])?.phrase).toBe('reading');
  });

  it('says which mark draws the call: four dots for a command, circling dots for a read, a row of three for the rest', () => {
    expect(runningActivity([assistant([call('1', 'Bash', { command: 'x' })])])?.mark).toBe('code');
    expect(runningActivity([assistant([call('2', 'Read', { file_path: '/a' })])])?.mark).toBe('read');
    expect(runningActivity([assistant([call('3', 'Edit', { file_path: '/a' })])])?.mark).toBe('default');
    expect(runningActivity([assistant([call('4', 'WebFetch', { url: 'https://a.example' })])])?.mark).toBe('default');
  });

  it('is null when every call has come back', () => {
    expect(runningActivity([assistant([call('1', 'Bash', {}, { type: 'user' })])])).toBeNull();
  });

  it('is null for a call that is drawn as a card of its own', () => {
    expect(runningActivity([assistant([call('1', 'AskUserQuestion', { questions: [] })])])).toBeNull();
  });

  it('finds an earlier call still waiting when a later one has come back', () => {
    const found = runningActivity([assistant([call('1', 'Bash', { description: 'slow' }), call('2', 'Read', {}, { type: 'user' })])]);
    expect(found?.toolUseId).toBe('1');
  });
});

describe('runningActivity across a send', () => {
  const user = (content: unknown): LoadedMessageDto =>
    ({ type: 'user', uuid: 'u', message: { role: 'user', content } }) as unknown as LoadedMessageDto;
  const oldCallWithNoResult = assistant([call('old', 'Bash', { description: 'a call that never came back', command: 'x' })]);

  it('does not look past a send of plain text, where the model is thinking about it', () => {
    expect(runningActivity([oldCallWithNoResult, user('next question')])).toBeNull();
  });

  it('does not look past a send that carries a picture either: its content is a list of blocks, but it is still a send', () => {
    const withPicture = user([
      { type: 'text', text: 'what is in this picture?' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    ]);
    expect(runningActivity([oldCallWithNoResult, withPicture])).toBeNull();
  });

  it('does not look past a send of a picture alone', () => {
    const pictureOnly = user([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }]);
    expect(runningActivity([oldCallWithNoResult, pictureOnly])).toBeNull();
  });

  it('still looks past what the CLI wrote for the call: its result, which is not a send', () => {
    const result = user([{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }]);
    expect(runningActivity([oldCallWithNoResult, result])?.toolUseId).toBe('old');
  });
});

describe('formatTokenCount', () => {
  it('keeps small counts and shortens thousands to one decimal', () => {
    expect(formatTokenCount(725)).toBe('725');
    expect(formatTokenCount(3712)).toBe('3.7k');
    expect(formatTokenCount(12000)).toBe('12k');
  });
});

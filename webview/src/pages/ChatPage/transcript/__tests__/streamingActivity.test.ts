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
    expect(found).toEqual({ toolUseId: '1', description: 'Run the tests', phrase: 'command' });
  });

  it('falls back to the phrase for the kind of call when there is no description', () => {
    expect(runningActivity([assistant([call('1', 'Edit', { file_path: '/a' })])])?.phrase).toBe('editing');
    expect(runningActivity([assistant([call('2', 'Read', { file_path: '/a' })])])?.phrase).toBe('reading');
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

describe('formatTokenCount', () => {
  it('keeps small counts and shortens thousands to one decimal', () => {
    expect(formatTokenCount(725)).toBe('725');
    expect(formatTokenCount(3712)).toBe('3.7k');
    expect(formatTokenCount(12000)).toBe('12k');
  });
});

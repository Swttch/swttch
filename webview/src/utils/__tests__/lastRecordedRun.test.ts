import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { LoadedMessageDto } from '@/types';
import { findLastRecordedRun } from '../lastRecordedRun';

const entries = (...raw: Record<string, unknown>[]): LoadedMessageDto[] =>
  raw.map((r) => plainToInstance(LoadedMessageDto, r));

const reply = (model: string, extra: Record<string, unknown> = {}) => ({
  type: 'assistant',
  message: { role: 'assistant', content: [], model },
  ...extra,
});

describe('findLastRecordedRun', () => {
  it('reads the model and the effort off the newest assistant entry', () => {
    const run = findLastRecordedRun(
      entries(
        reply('claude-sonnet-5-5', { effort: 'low' }),
        { type: 'user', message: { role: 'user', content: 'next' } },
        reply('claude-opus-5-5', { effort: 'high' }),
        { type: 'user', message: { role: 'user', content: 'and next' } },
      ),
    );

    expect(run).toEqual({ model: 'claude-opus-5-5', effort: 'high' });
  });

  it('reports the model with no effort for an entry written before the CLI recorded effort', () => {
    expect(findLastRecordedRun(entries(reply('claude-haiku-5-5')))).toEqual({
      model: 'claude-haiku-5-5',
      effort: null,
    });
  });

  it('passes over an entry the CLI made up for an error, which no model answered', () => {
    const run = findLastRecordedRun(entries(reply('claude-opus-5-5', { effort: 'max' }), reply('<synthetic>')));

    expect(run).toEqual({ model: 'claude-opus-5-5', effort: 'max' });
  });

  it('passes over an entry a subagent wrote', () => {
    const run = findLastRecordedRun(
      entries(reply('claude-opus-5-5', { effort: 'high' }), reply('claude-haiku-5-5', { isSidechain: true })),
    );

    expect(run).toEqual({ model: 'claude-opus-5-5', effort: 'high' });
  });

  it('says nothing for a page with no response in it', () => {
    expect(findLastRecordedRun(entries({ type: 'user', message: { role: 'user', content: 'hi' } }))).toEqual({
      model: null,
      effort: null,
    });
    expect(findLastRecordedRun([])).toEqual({ model: null, effort: null });
  });
});

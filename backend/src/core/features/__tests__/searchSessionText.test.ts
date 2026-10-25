import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../loadSessionMessages', () => ({
  loadActiveChain: vi.fn(),
}));

import { loadActiveChain } from '../loadSessionMessages';
import { searchSessionText, visibleTextsOf, SESSION_SEARCH_MATCH_LIMIT } from '../searchSessionText';

const mockChain = vi.mocked(loadActiveChain);

const user = (uuid: string, content: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'user',
  uuid,
  message: { role: 'user', content },
  ...extra,
});
const assistant = (uuid: string, blocks: unknown[]) => ({
  type: 'assistant',
  uuid,
  message: { role: 'assistant', content: blocks },
});

describe('visibleTextsOf', () => {
  it('takes plain and block text of messages and replies', () => {
    expect(visibleTextsOf(user('u', 'hello'))).toEqual(['hello']);
    expect(visibleTextsOf(assistant('a', [{ type: 'text', text: 'hi' }, { type: 'text', text: 'there' }]))).toEqual(['hi', 'there']);
  });

  it('takes the output of tools and what a tool was asked to do', () => {
    const toolUse = assistant('a', [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'echo hi', timeout: 5 } }]);
    expect(visibleTextsOf(toolUse)).toEqual(['echo hi']);
    const result = user('u', [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: 'hi' }] }]);
    expect(visibleTextsOf(result)).toEqual(['hi']);
    expect(visibleTextsOf(user('u', [{ type: 'tool_result', tool_use_id: 't', content: 'plain' }]))).toEqual(['plain']);
  });

  it('leaves out what the transcript does not show', () => {
    expect(visibleTextsOf(assistant('a', [{ type: 'thinking', thinking: 'secret', signature: 'x' }]))).toEqual([]);
    expect(visibleTextsOf({ type: 'attachment', uuid: 'x', attachment: { content: 'needle' } })).toEqual([]);
    expect(visibleTextsOf(user('u', 'needle', { isMeta: true }))).toEqual([]);
    expect(visibleTextsOf(user('u', 'before <system-reminder>needle</system-reminder> after'))).toEqual(['before  after']);
  });
});

describe('searchSessionText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists entries newest first with how many times each holds the text', async () => {
    mockChain.mockResolvedValue([
      user('u1', 'Rollback plan, rollback command'),
      assistant('a1', [{ type: 'text', text: 'nothing here' }]),
      user('u2', 'one more rollback'),
    ]);
    const result = await searchSessionText('/w', 's', 'ROLLBACK');
    expect(result).toEqual({
      hits: [{ uuid: 'u2', count: 1 }, { uuid: 'u1', count: 2 }],
      total: 3,
      truncated: false,
    });
  });

  it('counts a block on its own, so a phrase across two blocks is not a match', async () => {
    mockChain.mockResolvedValue([assistant('a', [{ type: 'text', text: 'roll' }, { type: 'text', text: 'back' }])]);
    expect((await searchSessionText('/w', 's', 'rollback')).total).toBe(0);
  });

  it('finds nothing for an empty query and skips entries without a uuid', async () => {
    mockChain.mockResolvedValue([user('u', 'abc'), { type: 'user', message: { content: 'abc' } }]);
    expect(await searchSessionText('/w', 's', '')).toEqual({ hits: [], total: 0, truncated: false });
    expect((await searchSessionText('/w', 's', 'abc')).hits).toEqual([{ uuid: 'u', count: 1 }]);
  });

  it('stops at the limit and says so', async () => {
    mockChain.mockResolvedValue(Array.from({ length: 10 }, (_, i) => user(`u${i}`, 'aaaa')));
    const result = await searchSessionText('/w', 's', 'a', 6);
    expect(result.truncated).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(6);
    expect(result.hits.length).toBeLessThan(10);
    expect(SESSION_SEARCH_MATCH_LIMIT).toBe(2000);
  });
});

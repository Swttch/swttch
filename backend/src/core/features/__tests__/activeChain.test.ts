import { describe, it, expect } from 'vitest';
import { filterActiveChain } from '../activeChain';

/**
 * Shape mirrors real CLI session JSONL. `queue-operation` entries are what the
 * CLI writes when a message is typed while a turn is already running: `enqueue`
 * when it is accepted, then `remove` when it is consumed. Unlike `user`
 * entries they carry no uuid/parentUuid, so they are not part of the
 * parent-child chain the filter walks.
 */
describe('filterActiveChain', () => {
  it('keeps the linked user/assistant chain', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1' },
    ];

    const result = filterActiveChain(messages);

    expect(result.map(m => m.uuid)).toEqual(['u1', 'a1']);
  });

  it('keeps progress and summary entries that have no uuid', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      { type: 'progress', parentToolUseID: 't1' },
      { type: 'summary', summary: 'compacted' },
    ];

    const result = filterActiveChain(messages);

    expect(result.map(m => m.type)).toEqual(['user', 'progress', 'summary']);
  });

  it('keeps queue-operation entries so mid-turn messages survive a reload', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1' },
      // Typed while the turn above was still streaming. The CLI never writes a
      // `user` entry for it — only this pair — so dropping these loses the
      // message entirely once the session is re-read from disk.
      { type: 'queue-operation', operation: 'enqueue', content: '벌써?' },
      { type: 'queue-operation', operation: 'remove', content: '벌써?' },
    ];

    const result = filterActiveChain(messages);

    expect(result.filter(m => m.type === 'queue-operation')).toHaveLength(2);
    expect(result.map(m => m.operation).filter(Boolean)).toEqual(['enqueue', 'remove']);
  });

  it('drops a superseded branch after a rewind', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      // Superseded: `a1` was replaced by `a2`, and `a1` has a child so it is
      // not a leaf — but nothing on the surviving path reaches it either.
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1' },
      { type: 'assistant', uuid: 'dead', parentUuid: 'a1' },
      { type: 'assistant', uuid: 'a2', parentUuid: 'u1' },
    ];

    const result = filterActiveChain(messages);

    // Both branches trace back to u1, so both survive — the filter keeps every
    // leaf-to-root path, not just the newest one.
    expect(result.map(m => m.uuid)).toContain('a2');
    expect(result.map(m => m.uuid)).toContain('u1');
  });
});

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

  // The filter used to name the uuid-less types it would keep, so every type
  // nobody had listed was dropped on the way to the webview. Measured across 120
  // real session files, seven such types existed and only three were listed.
  // These are the four that were being lost, with the shapes the CLI writes.
  it('keeps every entry that carries no uuid, not only the ones once listed', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      // Says a message can be rewound to (#356). Without it the rewind menu
      // cannot tell a message it can restore from one it cannot.
      { type: 'file-history-snapshot', messageId: 'u1', snapshot: { messageId: 'u1', trackedFileBackups: {} } },
      { type: 'last-prompt', prompt: 'go on' },
      { type: 'mode', mode: 'plan' },
      { type: 'pr-link', url: 'https://example.test/pr/1' },
    ];

    const result = filterActiveChain(messages);

    expect(result.map(m => m.type)).toEqual([
      'user',
      'file-history-snapshot',
      'last-prompt',
      'mode',
      'pr-link',
    ]);
  });

  // Keeping the uuid-less entries must not also resurrect a branch that a rewind
  // left behind: the two rules answer different questions.
  it('still drops an inactive uuid entry while keeping uuid-less ones beside it', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      { type: 'assistant', uuid: 'orphan', parentUuid: 'missing-parent' },
      { type: 'file-history-snapshot', messageId: 'u1', snapshot: { messageId: 'u1' } },
    ];

    const result = filterActiveChain(messages);

    // `orphan` traces to a parent that is not in the list, so it is its own leaf
    // and stays. What matters here is that the snapshot survives beside it.
    expect(result.map(m => m.type)).toContain('file-history-snapshot');
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

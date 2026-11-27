import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../loadSessionMessages', async () => {
  const actual = await vi.importActual<typeof import('../loadSessionMessages')>('../loadSessionMessages');
  return { ...actual, loadPromptChain: vi.fn() };
});

import {
  loadPromptHistory,
  collectPrompts,
  PROMPT_HISTORY_PAGE_BYTES,
} from '../loadPromptHistory';
import { loadPromptChain, type SessionMessage } from '../loadSessionMessages';

/** The text a prompt entry carries, in whichever shape it was written. */
function textOf(entry: SessionMessage): string {
  const content = (entry.message as { content?: unknown } | undefined)?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b): b is { type: string; text?: string } => !!b && typeof b === 'object')
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('\n');
}

/** A `user` entry the CLI would have written for a prompt the person typed. */
function prompt(uuid: string, text: string, extra: Record<string, unknown> = {}): SessionMessage {
  return {
    type: 'user',
    uuid,
    permissionMode: 'acceptEdits',
    message: { role: 'user', content: [{ type: 'text', text }] },
    ...extra,
  };
}

describe('collectPrompts', () => {
  // What a send is, is tested with the shared rule (shared/__tests__/user-send.test.ts). Here: how the list uses it.
  it('leaves out a subagent\'s own turns, which the chat never shows as the user\'s', () => {
    expect(collectPrompts([prompt('u1', 'subagent turn', { isSidechain: true })])).toEqual([]);
  });

  it('names a message typed during a turn and keeps the records it came from', () => {
    const enqueue = { type: 'queue-operation', operation: 'enqueue', content: 'typed mid-turn', timestamp: 't1' };
    const remove = { type: 'queue-operation', operation: 'remove', content: 'typed mid-turn', timestamp: 't2' };

    const prompts = collectPrompts([prompt('u1', 'before'), enqueue, remove]);

    expect(prompts.map(p => p.key)).toEqual(['u1', 'queued-t2-1']);
    expect(prompts[1].sources).toEqual([enqueue, remove]);
  });
});

describe('loadPromptHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the newest page in transcript order, with a cursor', async () => {
    const chain = Array.from({ length: 25 }, (_, i) => prompt(`u${i}`, `prompt ${i}`));
    vi.mocked(loadPromptChain).mockResolvedValue(chain);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries).toHaveLength(20);
    expect(page.entries[0].uuid).toBe('u5');
    expect(page.entries[19].uuid).toBe('u24');
    expect(page.hasMore).toBe(true);
    expect(page.oldestUuid).toBe('u5');
  });

  it('pages further back from a cursor', async () => {
    const chain = Array.from({ length: 25 }, (_, i) => prompt(`u${i}`, `prompt ${i}`));
    vi.mocked(loadPromptChain).mockResolvedValue(chain);

    const page = await loadPromptHistory('/w', 's1', 'u5');

    expect(page.entries.map(e => e.uuid)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
    expect(page.hasMore).toBe(false);
  });

  it('serves the newest page when the cursor is gone from the chain', async () => {
    // An edit or rewind can rebuild the chain under the client. Returning an
    // empty page would strand the history instead of letting paging self-heal.
    const chain = Array.from({ length: 3 }, (_, i) => prompt(`u${i}`, `prompt ${i}`));
    vi.mocked(loadPromptChain).mockResolvedValue(chain);

    const page = await loadPromptHistory('/w', 's1', 'gone');

    expect(page.entries).toHaveLength(3);
    expect(page.hasMore).toBe(false);
  });

  it('skips the plumbing between prompts', async () => {
    vi.mocked(loadPromptChain).mockResolvedValue([
      prompt('u1', 'first'),
      { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [{ type: 'text', text: 'reply' }] } },
      { type: 'user', uuid: 'u2', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] } },
      prompt('u3', '[Request interrupted by user]'),
      prompt('u4', 'second'),
    ]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries.map(e => e.uuid)).toEqual(['u1', 'u4']);
  });

  it('stops a page at the byte budget rather than the count', async () => {
    // One prompt with a pasted screenshot can be megabytes on its own; a count
    // alone would let a page carry all of them.
    const big = 'x'.repeat(PROMPT_HISTORY_PAGE_BYTES);
    vi.mocked(loadPromptChain).mockResolvedValue([
      prompt('u1', 'small'),
      prompt('u2', big),
      prompt('u3', big),
    ]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries.map(e => e.uuid)).toEqual(['u3']);
    expect(page.hasMore).toBe(true);
  });

  it('always yields the oversized prompt itself rather than an empty page', async () => {
    const huge = 'x'.repeat(PROMPT_HISTORY_PAGE_BYTES * 3);
    vi.mocked(loadPromptChain).mockResolvedValue([prompt('u1', 'small'), prompt('u2', huge)]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries.map(e => e.uuid)).toEqual(['u2']);
    expect(page.hasMore).toBe(true);
  });

  it('passes entries through without editing them', async () => {
    // The original-data principle: the backend must not rename, drop or rewrite
    // any field on the way to the webview.
    const entry = prompt('u1', 'hello', {
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
        ],
      },
      timestamp: '2026-09-03T00:00:00.000Z',
      cwd: '/w',
    });
    vi.mocked(loadPromptChain).mockResolvedValue([entry]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries[0]).toEqual(entry);
  });

  it('includes a prompt that exists only as queue bookkeeping', async () => {
    // Typed while a turn was running: the CLI writes no `user` entry for it at
    // all, so a filter that only reads `user` entries loses the message. The
    // transcript already rebuilds these; the history has to agree.
    vi.mocked(loadPromptChain).mockResolvedValue([
      prompt('u1', 'before'),
      { type: 'queue-operation', operation: 'enqueue', content: 'typed mid-turn' },
      { type: 'queue-operation', operation: 'remove', content: 'typed mid-turn' },
      prompt('u2', 'after'),
    ]);

    const page = await loadPromptHistory('/w', 's1');

    expect(collectPrompts(page.entries).map(p => textOf(p.entry))).toEqual(['before', 'typed mid-turn', 'after']);
  });

  it('rejects a CLI-authored prompt that reached the queue instead of a user entry', async () => {
    // A background task that finishes mid-turn is queued exactly like a message
    // the user typed: enqueue → remove, no `user` entry, so the recovery above
    // picks it up. The content test that rejects these for `user` entries has to
    // run on queue bookkeeping too, or the walk hits them. Measured in one
    // session of this repo: 22 of its 25 recovered queued prompts were
    // task-notifications.
    const notification = '<task-notification>\n<task-id>bb1lmoo7a</task-id>\n<status>completed</status>\n</task-notification>';
    vi.mocked(loadPromptChain).mockResolvedValue([
      prompt('u1', 'before'),
      { type: 'queue-operation', operation: 'enqueue', content: notification },
      { type: 'queue-operation', operation: 'remove', content: notification },
      prompt('u2', 'after'),
    ]);

    const page = await loadPromptHistory('/w', 's1');

    expect(collectPrompts(page.entries).map(p => textOf(p.entry))).toEqual(['before', 'after']);
  });

  it('keeps a queued prompt that merely opens with markup the user typed', async () => {
    // Same by-name list as the `user` entry path: typing about markup is typing.
    vi.mocked(loadPromptChain).mockResolvedValue([
      { type: 'queue-operation', operation: 'enqueue', content: '<div> is not closing, why?' },
      { type: 'queue-operation', operation: 'remove', content: '<div> is not closing, why?' },
    ]);

    const page = await loadPromptHistory('/w', 's1');

    expect(collectPrompts(page.entries).map(p => textOf(p.entry))).toEqual(['<div> is not closing, why?']);
  });

  it('does not double-count a message the CLI also wrote a user entry for', async () => {
    // enqueue → dequeue means it was accepted while idle and a real `user` entry
    // exists; taking the queue entry too would show it twice in a row.
    vi.mocked(loadPromptChain).mockResolvedValue([
      { type: 'queue-operation', operation: 'enqueue', content: 'sent while idle' },
      { type: 'queue-operation', operation: 'dequeue', content: 'sent while idle' },
      prompt('u1', 'sent while idle'),
    ]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].uuid).toBe('u1');
  });

  it('pages from a message typed during a turn, whose name is its cursor', async () => {
    // Sized so the queued prompt lands exactly on the page boundary: 31 prompts in all, a 20-entry page starts at
    // index 11, so the queued one is put there.
    const chain: SessionMessage[] = [];
    for (let i = 0; i < 11; i++) chain.push(prompt(`u${i}`, `prompt ${i}`));
    chain.push({ type: 'queue-operation', operation: 'enqueue', content: 'queued', timestamp: 't' });
    chain.push({ type: 'queue-operation', operation: 'remove', content: 'queued', timestamp: 't' });
    for (let i = 11; i < 30; i++) chain.push(prompt(`u${i}`, `prompt ${i}`));
    vi.mocked(loadPromptChain).mockResolvedValue(chain);

    const page = await loadPromptHistory('/w', 's1');
    expect(page.oldestUuid).toBe('queued-t-1');

    const older = await loadPromptHistory('/w', 's1', page.oldestUuid);
    expect(older.entries.map(e => e.uuid)).toEqual(Array.from({ length: 11 }, (_, i) => `u${i}`));
  });

  it('returns an empty page for a session with no prompts', async () => {
    vi.mocked(loadPromptChain).mockResolvedValue([]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page).toEqual({ entries: [], hasMore: false, oldestUuid: undefined });
  });
});

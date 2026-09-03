import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../loadSessionMessages', async () => {
  const actual = await vi.importActual<typeof import('../loadSessionMessages')>('../loadSessionMessages');
  return { ...actual, loadActiveChain: vi.fn() };
});

import {
  loadPromptHistory,
  isTypedPrompt,
  chainStampsPermissionMode,
  PROMPT_HISTORY_PAGE_BYTES,
} from '../loadPromptHistory';
import { loadActiveChain, type SessionMessage } from '../loadSessionMessages';

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

describe('isTypedPrompt', () => {
  it('accepts a typed prompt, as string content or text blocks', () => {
    expect(isTypedPrompt(prompt('u1', 'hello'), true)).toBe(true);
    expect(isTypedPrompt({
      type: 'user',
      uuid: 'u2',
      permissionMode: 'default',
      message: { role: 'user', content: 'hello' },
    }, true)).toBe(true);
  });

  it('rejects the tool results that make up most user entries', () => {
    // Measured: 1,281 of 1,345 user entries in one session were these.
    expect(isTypedPrompt({
      type: 'user',
      uuid: 'u1',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
    }, true)).toBe(false);
  });

  it('rejects entries the CLI flags as its own', () => {
    expect(isTypedPrompt(prompt('u1', 'skill preamble', { isMeta: true }), true)).toBe(false);
    expect(isTypedPrompt(prompt('u2', 'continued from', { isCompactSummary: true }), true)).toBe(false);
    expect(isTypedPrompt(prompt('u3', 'subagent turn', { isSidechain: true }), true)).toBe(false);
    expect(isTypedPrompt(prompt('u4', 'expanded skill', { isSynthetic: true }), true)).toBe(false);
    expect(isTypedPrompt(prompt('u5', 'expanded skill', { sourceToolUseID: 't1' }), true)).toBe(false);
  });

  it('rejects CLI-authored text that carries no flag at all', () => {
    // These three carry nothing to distinguish them by field — measured across
    // this repo's transcripts, so content is the only signal available.
    const noFlags = { permissionMode: undefined };
    expect(isTypedPrompt(prompt('u1', '<command-name>/model</command-name>', noFlags), false)).toBe(false);
    expect(isTypedPrompt(prompt('u2', '<local-command-stdout>Set model</local-command-stdout>', noFlags), false)).toBe(false);
    expect(isTypedPrompt(prompt('u3', '[Request interrupted by user for tool use]', noFlags), false)).toBe(false);
  });

  it('rejects the prompts the CLI writes into the conversation itself', () => {
    // These DO carry permissionMode — the CLI stamps whatever it processes as a
    // prompt, including its own — so only their text sets them apart. A
    // task-notification showing up in the walk is what surfaced this.
    expect(isTypedPrompt(prompt('u1', '<task-notification>\n<task-id>by3nh39lb</task-id>\n</task-notification>'), true)).toBe(false);
    expect(isTypedPrompt(prompt('u2', '<ide_opened_file>src/App.tsx</ide_opened_file>'), true)).toBe(false);
    expect(isTypedPrompt(prompt('u3', '<system-reminder>be brief</system-reminder>'), true)).toBe(false);
  });

  it('keeps a prompt that merely opens with markup the user typed', () => {
    // The list is by name rather than "any tag" so typing about markup still
    // counts as typing.
    expect(isTypedPrompt(prompt('u1', '<div> is not closing, why?'), true)).toBe(true);
  });

  it('rejects an entry with no text once non-text blocks are ignored', () => {
    expect(isTypedPrompt({
      type: 'user',
      uuid: 'u1',
      permissionMode: 'default',
      message: { role: 'user', content: [{ type: 'image', source: {} }] },
    }, true)).toBe(false);
    expect(isTypedPrompt(prompt('u2', '   '), true)).toBe(false);
  });

  it('requires permissionMode only when the chain stamps it', () => {
    const unstamped: SessionMessage = {
      type: 'user',
      uuid: 'u1',
      message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    };
    // A chain that stamps the field: an entry without it was not a prompt.
    expect(isTypedPrompt(unstamped, true)).toBe(false);
    // A chain old enough not to stamp it must still yield its history rather
    // than reporting an empty one.
    expect(isTypedPrompt(unstamped, false)).toBe(true);
  });
});

describe('chainStampsPermissionMode', () => {
  it('is true when any user entry carries the field', () => {
    expect(chainStampsPermissionMode([prompt('u1', 'a')])).toBe(true);
  });

  it('is false for a chain that never carries it', () => {
    expect(chainStampsPermissionMode([
      { type: 'user', uuid: 'u1', message: { role: 'user', content: 'a' } },
      { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [] } },
    ])).toBe(false);
  });
});

describe('loadPromptHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the newest page in transcript order, with a cursor', async () => {
    const chain = Array.from({ length: 25 }, (_, i) => prompt(`u${i}`, `prompt ${i}`));
    vi.mocked(loadActiveChain).mockResolvedValue(chain);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries).toHaveLength(20);
    expect(page.entries[0].uuid).toBe('u5');
    expect(page.entries[19].uuid).toBe('u24');
    expect(page.hasMore).toBe(true);
    expect(page.oldestUuid).toBe('u5');
  });

  it('pages further back from a cursor', async () => {
    const chain = Array.from({ length: 25 }, (_, i) => prompt(`u${i}`, `prompt ${i}`));
    vi.mocked(loadActiveChain).mockResolvedValue(chain);

    const page = await loadPromptHistory('/w', 's1', 'u5');

    expect(page.entries.map(e => e.uuid)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
    expect(page.hasMore).toBe(false);
  });

  it('serves the newest page when the cursor is gone from the chain', async () => {
    // An edit or rewind can rebuild the chain under the client. Returning an
    // empty page would strand the history instead of letting paging self-heal.
    const chain = Array.from({ length: 3 }, (_, i) => prompt(`u${i}`, `prompt ${i}`));
    vi.mocked(loadActiveChain).mockResolvedValue(chain);

    const page = await loadPromptHistory('/w', 's1', 'gone');

    expect(page.entries).toHaveLength(3);
    expect(page.hasMore).toBe(false);
  });

  it('skips the plumbing between prompts', async () => {
    vi.mocked(loadActiveChain).mockResolvedValue([
      prompt('u1', 'first'),
      { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [{ type: 'text', text: 'reply' }] } },
      { type: 'user', uuid: 'u2', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] } },
      prompt('u3', '[Request interrupted by user]', { permissionMode: undefined }),
      prompt('u4', 'second'),
    ]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries.map(e => e.uuid)).toEqual(['u1', 'u4']);
  });

  it('stops a page at the byte budget rather than the count', async () => {
    // One prompt with a pasted screenshot can be megabytes on its own; a count
    // alone would let a page carry all of them.
    const big = 'x'.repeat(PROMPT_HISTORY_PAGE_BYTES);
    vi.mocked(loadActiveChain).mockResolvedValue([
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
    vi.mocked(loadActiveChain).mockResolvedValue([prompt('u1', 'small'), prompt('u2', huge)]);

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
    vi.mocked(loadActiveChain).mockResolvedValue([entry]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries[0]).toEqual(entry);
  });

  it('includes a prompt that exists only as queue bookkeeping', async () => {
    // Typed while a turn was running: the CLI writes no `user` entry for it at
    // all, so a filter that only reads `user` entries loses the message. The
    // transcript already rebuilds these; the history has to agree.
    vi.mocked(loadActiveChain).mockResolvedValue([
      prompt('u1', 'before'),
      { type: 'queue-operation', operation: 'enqueue', content: 'typed mid-turn' },
      { type: 'queue-operation', operation: 'remove', content: 'typed mid-turn' },
      prompt('u2', 'after'),
    ]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries.map(e => (e.content as string) ?? textOf(e))).toEqual([
      'before', 'typed mid-turn', 'after',
    ]);
  });

  it('does not double-count a message the CLI also wrote a user entry for', async () => {
    // enqueue → dequeue means it was accepted while idle and a real `user` entry
    // exists; taking the queue entry too would show it twice in a row.
    vi.mocked(loadActiveChain).mockResolvedValue([
      { type: 'queue-operation', operation: 'enqueue', content: 'sent while idle' },
      { type: 'queue-operation', operation: 'dequeue', content: 'sent while idle' },
      prompt('u1', 'sent while idle'),
    ]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].uuid).toBe('u1');
  });

  it('starts a page at an entry that has a uuid, since the cursor must be one', async () => {
    // A queued prompt has no uuid to be the cursor. Left at the front of a page,
    // it would be sent again with the next page and the client, which dedupes by
    // uuid, would show it twice.
    //
    // Sized so the queued prompt lands exactly on the page boundary: 31 prompts
    // in all, a 20-entry page starts at index 11, so the queued one is put there.
    const chain: SessionMessage[] = [];
    for (let i = 0; i < 11; i++) chain.push(prompt(`u${i}`, `prompt ${i}`));
    chain.push({ type: 'queue-operation', operation: 'enqueue', content: 'queued' });
    chain.push({ type: 'queue-operation', operation: 'remove', content: 'queued' });
    for (let i = 11; i < 30; i++) chain.push(prompt(`u${i}`, `prompt ${i}`));
    vi.mocked(loadActiveChain).mockResolvedValue(chain);

    const page = await loadPromptHistory('/w', 's1');

    // Without the snap the page would begin on the queued entry, whose uuid is
    // undefined, and the cursor would point past it.
    expect(typeof page.entries[0].uuid).toBe('string');
    expect(page.oldestUuid).toBe(page.entries[0].uuid);
    expect(page.entries[0].uuid).toBe('u10');
  });

  it('returns an empty page for a session with no prompts', async () => {
    vi.mocked(loadActiveChain).mockResolvedValue([]);

    const page = await loadPromptHistory('/w', 's1');

    expect(page).toEqual({ entries: [], hasMore: false, oldestUuid: undefined });
  });
});

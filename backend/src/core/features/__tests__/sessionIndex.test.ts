import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { filterActiveChain } from '../activeChain';
import { readJsonlEntries } from '../readJsonlEntries';
import { getSessionIndex, readIndexedEntries, readWholeChain } from '../sessionIndex';

type Entry = Record<string, unknown>;

/**
 * The index is what the pager and the whole-transcript readers stand on, so it has to say what the old way
 * (parse the whole file, then filter the active chain) said. These compare it with exactly that.
 */
describe('sessionIndex', () => {
  let dir: string;
  let n = 0;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'session-index-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Write a session and return its path and id. Ids are unique so the cache never reuses another test's index. */
  async function session(entries: Entry[], trailingNewline = true): Promise<{ file: string; id: string }> {
    const id = `s${++n}-${Math.random().toString(36).slice(2, 8)}`;
    const file = join(dir, `${id}.jsonl`);
    await writeFile(file, entries.map(e => JSON.stringify(e)).join('\n') + (trailingNewline ? '\n' : ''));
    return { file, id };
  }

  const user = (uuid: string, parentUuid: string | undefined, content: unknown, extra: Entry = {}): Entry => ({
    type: 'user', uuid, parentUuid, timestamp: '2026-11-01T10:00:00.000Z', message: { role: 'user', content }, ...extra,
  });
  const assistant = (uuid: string, parentUuid: string | undefined, blocks: Entry[]): Entry => ({
    type: 'assistant', uuid, parentUuid, timestamp: '2026-11-01T10:00:01.000Z', message: { role: 'assistant', content: blocks },
  });

  /** A tree with a second branch (a rewind), entries without a uuid, and a multi-byte prompt. */
  function branched(): Entry[] {
    return [
      user('u1', undefined, '한글 프롬프트 🙂', { permissionMode: 'default' }),
      assistant('a1', 'u1', [{ type: 'text', text: 'first answer' }]),
      { type: 'summary', summary: 'no uuid, always kept' },
      user('u2-old', 'a1', 'a prompt that was rewound', { permissionMode: 'default' }),
      assistant('a2-old', 'u2-old', [{ type: 'text', text: 'abandoned' }]),
      user('u2', 'a1', 'the prompt that stayed', { permissionMode: 'default' }),
      assistant('a2', 'u2', [{ type: 'text', text: 'second answer' }]),
    ];
  }

  it('lists the same chain as parsing the whole file and filtering it', async () => {
    const { file, id } = await session(branched());
    const index = await getSessionIndex(file, dir, id);
    const reference = filterActiveChain(await readJsonlEntries(file));
    expect(index.entries.map(e => e.uuid)).toEqual(reference.map(e => e.uuid));
    // An entry without a uuid is not part of the parent-child chain, and the filter keeps it.
    expect(index.entries.some(e => e.uuid === undefined)).toBe(true);
  });

  it('reads the whole chain back exactly as it is in the file', async () => {
    const { file, id } = await session(branched());
    const index = await getSessionIndex(file, dir, id);
    const reference = filterActiveChain(await readJsonlEntries(file));
    expect(await readWholeChain(index)).toEqual(reference);
  });

  it('reads any stretch of the chain on its own, in order', async () => {
    const { file, id } = await session(branched());
    const index = await getSessionIndex(file, dir, id);
    const reference = filterActiveChain(await readJsonlEntries(file));
    expect(await readIndexedEntries(index.entries.slice(2, 5))).toEqual(reference.slice(2, 5));
    expect(await readIndexedEntries([index.entries[4], index.entries[0]])).toEqual([reference[4], reference[0]]);
    expect(await readIndexedEntries([])).toEqual([]);
  });

  it('skips blank and malformed lines, as before', async () => {
    const id = `s-bad-${++n}`;
    const file = join(dir, `${id}.jsonl`);
    await writeFile(file, [JSON.stringify(user('u1', undefined, 'hello')), '{broken', '', '   ', JSON.stringify(assistant('a1', 'u1', []))].join('\n'));
    const index = await getSessionIndex(file, dir, id);
    expect(index.entries.map(e => e.uuid)).toEqual(['u1', 'a1']);
    expect((await readWholeChain(index)).map(e => e.uuid)).toEqual(['u1', 'a1']);
  });

  it('takes a last line that has no newline, since a finished file may end that way', async () => {
    const { file, id } = await session(branched(), false);
    const index = await getSessionIndex(file, dir, id);
    expect(index.entries.map(e => e.uuid)).toContain('a2');
  });

  describe('what it keeps of the transcript', () => {
    const HUGE = 'x'.repeat(3_000_000);

    function withHugeResult(): Entry[] {
      return [
        user('p1', undefined, 'run the build', { permissionMode: 'default' }),
        assistant('c1', 'p1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'cat build.log' } }]),
        user('r1', 'c1', [{ type: 'tool_result', tool_use_id: 't1', content: HUGE }], { toolUseResult: { stdout: HUGE } }),
        assistant('c2', 'r1', [{ type: 'text', text: 'done' }]),
        user('p2', 'c2', [{ type: 'text', text: 'thanks' }], { permissionMode: 'default' }),
        { type: 'queue-operation', operation: 'enqueue', content: 'typed while running' },
      ];
    }

    it('holds a prompt chain that is small however big the tool results are', async () => {
      const { file, id } = await session(withHugeResult());
      const index = await getSessionIndex(file, dir, id);
      expect(JSON.stringify(index.promptChain).length).toBeLessThan(5_000);
      // The prompts themselves are whole; the tool result is reduced to what says it is one.
      const byUuid = new Map(index.promptChain.map(e => [e.uuid as string | undefined, e]));
      expect(byUuid.get('p1')).toEqual(withHugeResult()[0]);
      expect(byUuid.get('p2')).toEqual(withHugeResult()[4]);
      expect(byUuid.get('r1')).toMatchObject({ type: 'user', uuid: 'r1', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } });
      expect(index.promptChain.some(e => e.type === 'queue-operation')).toBe(true);
      expect(index.promptChain.some(e => e.type === 'assistant')).toBe(false);
    });

    it('does not keep the bytes of the big entry in the index', async () => {
      const { file, id } = await session(withHugeResult());
      const index = await getSessionIndex(file, dir, id);
      expect(JSON.stringify(index.entries).length).toBeLessThan(2_000);
      expect(JSON.stringify(index.workflowChain).length).toBeLessThan(2_000);
    });

    it('lists the prompts of the active chain in its order, the same ones the whole chain has', async () => {
      const { file, id } = await session(branched());
      const index = await getSessionIndex(file, dir, id);
      const reference = filterActiveChain(await readJsonlEntries(file));
      expect(index.promptChain.map(e => e.uuid)).toEqual(reference.filter(e => e.type === 'user' || e.type === 'queue-operation').map(e => e.uuid));
    });
  });

  describe('growth', () => {
    it('continues from where it stopped when the file only grew, and ends with the same chain as a fresh read', async () => {
      const { file, id } = await session(branched());
      await getSessionIndex(file, dir, id);
      await appendFile(file, [JSON.stringify(user('u3', 'a2', 'a later prompt', { permissionMode: 'default' })), JSON.stringify(assistant('a3', 'u3', []))].join('\n') + '\n');
      const grown = await getSessionIndex(file, dir, id);
      const reference = filterActiveChain(await readJsonlEntries(file));
      expect(grown.entries.map(e => e.uuid)).toEqual(reference.map(e => e.uuid));
      expect(await readWholeChain(grown)).toEqual(reference);
      expect(grown.promptChain.map(e => e.uuid)).toContain('u3');
    });

    it('rereads a file whose last line had no newline when it grows, since that line may have been unfinished', async () => {
      const { file, id } = await session([user('u1', undefined, 'one')], false);
      expect((await getSessionIndex(file, dir, id)).entries.map(e => e.uuid)).toEqual(['u1']);
      await appendFile(file, '\n' + JSON.stringify(assistant('a1', 'u1', [])) + '\n');
      expect((await getSessionIndex(file, dir, id)).entries.map(e => e.uuid)).toEqual(['u1', 'a1']);
    });

    it('rereads the file when it is shorter than before', async () => {
      const { file, id } = await session(branched());
      await getSessionIndex(file, dir, id);
      await writeFile(file, JSON.stringify(user('only', undefined, 'x')) + '\n');
      expect((await getSessionIndex(file, dir, id)).entries.map(e => e.uuid)).toEqual(['only']);
    });
  });

  describe('subagents', () => {
    async function withAgent(): Promise<{ file: string; id: string }> {
      const { file, id } = await session([
        user('u1', undefined, 'go'),
        assistant('a1', 'u1', [{ type: 'tool_use', id: 'toolu_bg', name: 'Agent', input: { description: 'check' } }]),
        user('u2', 'a1', [{ type: 'tool_result', tool_use_id: 'toolu_bg', content: 'launched\nagentId: abc123' }]),
      ]);
      const agentDir = join(dir, id, 'subagents');
      await mkdir(agentDir, { recursive: true });
      await writeFile(join(agentDir, 'agent-abc123.jsonl'), [
        JSON.stringify({ type: 'assistant', uuid: 's1', timestamp: '2026-01-01T00:00:01.000Z', message: { role: 'assistant', content: [] } }),
        JSON.stringify({ type: 'attachment', uuid: 's-skip' }),
        JSON.stringify({ type: 'user', uuid: 's2', parentUuid: 's1', timestamp: '2026-01-01T00:00:02.000Z', message: { role: 'user', content: 'ok' } }),
      ].join('\n') + '\n');
      return { file, id };
    }

    it('puts a subagent\'s entries in after the call that ran it, as progress records, and reads them back whole', async () => {
      const { file, id } = await withAgent();
      const index = await getSessionIndex(file, dir, id);
      expect(index.entries.map(e => e.uuid)).toEqual(['u1', 'a1', 's1', 's2', 'u2']);
      const chain = await readWholeChain(index);
      expect(chain[2]).toEqual({
        type: 'progress',
        parentToolUseID: 'toolu_bg',
        uuid: 's1',
        parentUuid: undefined,
        timestamp: '2026-01-01T00:00:01.000Z',
        data: {
          type: 'agent_progress',
          agentId: 'abc123',
          message: { type: 'assistant', message: { role: 'assistant', content: [] }, uuid: 's1', timestamp: '2026-01-01T00:00:01.000Z' },
        },
      });
      expect(chain.filter(e => e.type === 'progress')).toHaveLength(2);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { createWorkflowProjection, reconstructWorkflowTasks } from '../workflow-tracker';

type Entry = Record<string, unknown>;

const assistant = (uuid: string, blocks: Entry[], timestamp = '2026-11-01T10:00:00.000Z'): Entry => ({
  type: 'assistant', uuid, timestamp, message: { role: 'assistant', content: blocks },
});
const user = (uuid: string, content: unknown, extra: Entry = {}): Entry => ({
  type: 'user', uuid, timestamp: '2026-11-01T10:00:05.000Z', message: { role: 'user', content }, ...extra,
});
const text = (value: string): Entry => ({ type: 'text', text: value });
const call = (id: string, name: string, input: Entry = {}): Entry => ({ type: 'tool_use', id, name, input });
const result = (id: string, content: unknown): Entry => ({ type: 'tool_result', tool_use_id: id, content });

/** A transcript with two background tasks among a lot of ordinary traffic. */
function chain(): Entry[] {
  const noise: Entry[] = [];
  for (let i = 0; i < 20; i++) {
    noise.push(
      assistant(`n-a${i}`, [text(`working ${i}`), call(`read${i}`, 'Read', { file_path: `/x/${i}` })]),
      user(`n-u${i}`, [result(`read${i}`, 'x'.repeat(5000))], { toolUseResult: { stdout: 'x' } }),
    );
  }
  return [
    user('p1', 'please start two things'),
    ...noise.slice(0, 10),
    assistant('a1', [text('starting'), call('ag1', 'Agent', { description: 'review the diff' }), call('sh1', 'Bash', { command: 'sleep 99', run_in_background: true, description: 'wait' })]),
    user('r1', [result('ag1', [{ type: 'text', text: 'agentId: abc123\noutput_file: /tmp/abc123.output' }]), result('sh1', 'Command running in background with ID: bg9. Output is being written to: /tmp/bg9.output')]),
    ...noise.slice(10),
    assistant('a2', [call('plain', 'Bash', { command: 'ls' })]),
    user('r2', [result('plain', 'file-a\nfile-b')]),
    user('note1', '<task-notification>\n<task-id>abc123</task-id>\n<tool-use-id>ag1</tool-use-id>\n<status>completed</status>\n<summary>done</summary>\n<result>looks fine</result>\n</task-notification>'),
    user('p2', [text('and now?')]),
  ];
}

describe('createWorkflowProjection', () => {
  it('reconstructs exactly what the whole chain does', async () => {
    const full = chain();
    const projection = createWorkflowProjection();
    for (const entry of full) projection.add(entry);
    const fromProjection = await reconstructWorkflowTasks(projection.entriesFor(() => true), () => false);
    const fromChain = await reconstructWorkflowTasks(full, () => false);
    expect(fromProjection).toEqual(fromChain);
    expect(fromChain.map(t => t.toolUseId).sort()).toEqual(['ag1', 'sh1']);
    expect(fromChain.find(t => t.toolUseId === 'ag1')?.status).toBe('completed');
  });

  it('keeps only a small part of a long transcript', () => {
    const full = chain();
    const projection = createWorkflowProjection();
    for (const entry of full) projection.add(entry);
    const kept = projection.entriesFor(() => true);
    // The two calls, the one result entry that answers them, and the notification.
    expect(kept.map(e => e.uuid)).toEqual(['a1', 'r1', 'note1']);
    expect(JSON.stringify(kept).length).toBeLessThan(JSON.stringify(full).length / 20);
  });

  it('leaves out the entries that are not on the active chain', async () => {
    const full = chain();
    const projection = createWorkflowProjection();
    for (const entry of full) projection.add(entry);
    // A rewound branch: the call and its result are not in the chain any more.
    const active = new Set(full.map(e => e.uuid as string).filter(u => u !== 'a1' && u !== 'r1'));
    const kept = projection.entriesFor(uuid => uuid === undefined || active.has(uuid));
    const tasks = await reconstructWorkflowTasks(kept, () => false);
    const expected = await reconstructWorkflowTasks(full.filter(e => active.has(e.uuid as string)), () => false);
    expect(tasks).toEqual(expected);
    expect(tasks).toEqual([]);
  });

  it('does not keep the result of a call that is not a background task', () => {
    const projection = createWorkflowProjection();
    projection.add(assistant('a', [call('plain', 'Bash', { command: 'ls' })]));
    projection.add(user('u', [result('plain', 'output')]));
    expect(projection.entriesFor(() => true)).toEqual([]);
  });

  it('keeps the text blocks an answering entry carries, which the rebuild falls back on', () => {
    const projection = createWorkflowProjection();
    projection.add(assistant('a', [call('ag', 'Agent', { description: 'x' })]));
    projection.add(user('u', [result('ag', []), text('agentId: zzz'), { type: 'image', source: { data: 'x'.repeat(1000) } }]));
    const [, answering] = projection.entriesFor(() => true);
    const blocks = ((answering.message as { content: Entry[] }).content).map(b => b.type);
    expect(blocks).toEqual(['tool_result', 'text']);
  });
});

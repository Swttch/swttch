import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadWorkflowAgentTranscript } from '../loadWorkflowAgentTranscript';

let configDir: string;
let transcriptDir: string;
let originalConfigDir: string | undefined;

beforeAll(() => {
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  configDir = mkdtempSync(join(tmpdir(), 'agent-transcript-test-'));
  process.env.CLAUDE_CONFIG_DIR = configDir;

  transcriptDir = join(configDir, 'projects', 'proj-slug', 'sess-1', 'subagents', 'workflows', 'wf_abc123');
  mkdirSync(transcriptDir, { recursive: true });

  const a1 = [
    JSON.stringify({ type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:00.000Z', message: { role: 'user', content: 'go' } }),
    JSON.stringify({
      type: 'assistant',
      uuid: 'u2',
      parentUuid: 'u1',
      timestamp: '2026-01-01T00:00:01.000Z',
      message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    }),
  ].join('\n');
  writeFileSync(join(transcriptDir, 'agent-a1.jsonl'), a1);

  // Trailing malformed line simulates a running agent's partially-written last line.
  writeFileSync(
    join(transcriptDir, 'agent-a2.jsonl'),
    JSON.stringify({ type: 'user', uuid: 'u3', message: { role: 'user', content: 'go' } }) + '\n{"incomple',
  );
});

afterAll(() => {
  rmSync(configDir, { recursive: true, force: true });
  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
});

describe('loadWorkflowAgentTranscript', () => {
  it('loads a completed agent transcript', async () => {
    const result = await loadWorkflowAgentTranscript({ transcriptDir, agentId: 'a1' });
    expect(result.truncated).toBe(false);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({ type: 'user', uuid: 'u1' });
    expect(result.entries[1]).toMatchObject({ type: 'assistant', uuid: 'u2' });
  });

  it('skips a malformed trailing line (agent still writing)', async () => {
    const result = await loadWorkflowAgentTranscript({ transcriptDir, agentId: 'a2' });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ type: 'user', uuid: 'u3' });
  });

  it('returns empty (not an error) when the agent file does not exist yet', async () => {
    const result = await loadWorkflowAgentTranscript({ transcriptDir, agentId: 'not-started-yet' });
    expect(result.entries).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('rejects an agentId whose traversal still lands inside the projects root (SAFE_AGENT_ID is the only guard that catches it)', async () => {
    // "agent-<agentId>.jsonl" with agentId="../../../../../../secret" resolves to
    // .../projects/proj-slug/secret.jsonl — a sibling file still under the
    // projects root, so the transcriptDir-prefix check alone would allow it.
    // Only the SAFE_AGENT_ID regex guard rejects this (verified: with that guard
    // temporarily disabled, this same assertion fails and returns the secret's
    // contents instead of an empty array).
    const secretPath = join(configDir, 'projects', 'proj-slug', 'secret.jsonl');
    writeFileSync(secretPath, JSON.stringify({ type: 'user', message: { role: 'user', content: 'top secret' } }));
    try {
      const result = await loadWorkflowAgentTranscript({ transcriptDir, agentId: '../../../../../../secret' });
      expect(result.entries).toEqual([]);
    } finally {
      rmSync(secretPath, { force: true });
    }
  });

  it('rejects an agentId that escapes the Claude config dir entirely via traversal', async () => {
    const result = await loadWorkflowAgentTranscript({ transcriptDir, agentId: '../../etc/passwd' });
    expect(result.entries).toEqual([]);
  });

  it('rejects a transcriptDir outside the Claude config projects root (path traversal)', async () => {
    const outside = join(tmpdir(), 'outside-config-dir');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'agent-a1.jsonl'), JSON.stringify({ type: 'user', message: { role: 'user', content: 'x' } }));
    try {
      const result = await loadWorkflowAgentTranscript({ transcriptDir: outside, agentId: 'a1' });
      expect(result.entries).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  describe('pages of conversation', () => {
    function writeRecord(name: string, lines: object[]): string {
      const dir = join(configDir, 'projects', 'proj-slug', 'sess-2', 'subagents', 'workflows', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'agent-big.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n'));
      return dir;
    }
    const convo = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ type: i % 2 === 0 ? 'user' : 'assistant', uuid: `c${i}` }));

    it('sends the last page of conversation, newest last, and says where the window starts', async () => {
      const dir = writeRecord('wf_a', convo(100));

      const result = await loadWorkflowAgentTranscript({ transcriptDir: dir, agentId: 'big' });

      expect(result.truncated).toBe(true);
      expect(result.startIndex).toBe(60);
      expect(result.entries).toHaveLength(40);
      expect(result.entries[0]).toMatchObject({ uuid: 'c60' });
      expect(result.entries[result.entries.length - 1]).toMatchObject({ uuid: 'c99' });
    });

    it('reaches a page further back for each page asked for, and the whole record at last', async () => {
      const dir = writeRecord('wf_b', convo(100));

      const two = await loadWorkflowAgentTranscript({ transcriptDir: dir, agentId: 'big', pages: 2 });
      expect(two.startIndex).toBe(20);
      expect(two.entries).toHaveLength(80);
      const three = await loadWorkflowAgentTranscript({ transcriptDir: dir, agentId: 'big', pages: 3 });
      expect(three.truncated).toBe(false);
      expect(three.entries).toHaveLength(100);
    });

    it('keeps the entries of a page that are not conversation, and is not cut short by a lot of them', async () => {
      const bulk = Array.from({ length: 3000 }, (_, i) => ({ type: 'attachment', uuid: `att${i}` }));
      const dir = writeRecord('wf_c', [{ type: 'user', uuid: 'prompt' }, ...bulk, { type: 'assistant', uuid: 'reply' }]);

      const result = await loadWorkflowAgentTranscript({ transcriptDir: dir, agentId: 'big' });

      expect(result.truncated).toBe(false);
      expect(result.entries).toHaveLength(3002);
      expect(result.entries[0]).toMatchObject({ uuid: 'prompt' });
    });
  });
});

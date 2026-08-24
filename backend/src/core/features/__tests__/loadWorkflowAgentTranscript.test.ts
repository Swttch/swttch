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

  it('truncates and flags truncated when entries exceed the cap', async () => {
    const bigDir = join(configDir, 'projects', 'proj-slug', 'sess-2', 'subagents', 'workflows', 'wf_big');
    mkdirSync(bigDir, { recursive: true });
    const lines: string[] = [];
    for (let i = 0; i < 2005; i++) {
      lines.push(JSON.stringify({ type: 'user', uuid: `u${i}`, message: { role: 'user', content: String(i) } }));
    }
    writeFileSync(join(bigDir, 'agent-big.jsonl'), lines.join('\n'));

    const result = await loadWorkflowAgentTranscript({ transcriptDir: bigDir, agentId: 'big' });
    expect(result.truncated).toBe(true);
    expect(result.entries).toHaveLength(2000);
    // Keeps the most recent entries (tail), not the oldest.
    expect(result.entries[result.entries.length - 1]).toMatchObject({ uuid: 'u2004' });
  });
});

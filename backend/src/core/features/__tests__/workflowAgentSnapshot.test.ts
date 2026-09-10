import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, writeFile, mkdir, utimes } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// The snapshot store derives its dir from os.homedir(). Point it at a throwaway
// temp dir so these tests touch real files without writing into the user's home.
let tempHome: string;
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => tempHome };
});

import { saveWorkflowAgentSnapshot, loadWorkflowAgentSnapshot } from '../workflowAgentSnapshot';

const snapshotDir = () => join(tempHome, '.claude-code-gui', 'workflow-agents');

// A per-agent entry as the CLI actually sends it. The fields that matter here
// are the ones the CLI persists nowhere itself.
const liveAgent = {
  type: 'workflow_agent',
  index: 1,
  label: 'probe:field-agent-0',
  phaseIndex: 1,
  phaseTitle: 'Probe',
  agentId: 'acee956d71a0f5ecc',
  model: 'claude-haiku-4-5-20251001',
  state: 'done',
  startedAt: 1789039770372,
  queuedAt: 1789039770370,
  attempt: 1,
  promptPreview: 'Reply with exactly the number 0.',
  lastProgressAt: 1789039794870,
  tokens: 51767,
  toolCalls: 0,
  durationMs: 24494,
  resultPreview: '(No response - session complete)',
};

describe('workflowAgentSnapshot', () => {
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'ccg-wf-snap-'));
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  it('gives back the agent entries exactly as they were stored', async () => {
    await saveWorkflowAgentSnapshot('wf_ce882bfa-ddf', [liveAgent]);

    expect(await loadWorkflowAgentSnapshot('wf_ce882bfa-ddf')).toEqual([liveAgent]);
  });

  it('returns undefined for a workflow that was never snapshotted', async () => {
    expect(await loadWorkflowAgentSnapshot('wf_never-ran')).toBeUndefined();
  });

  it('returns undefined rather than throwing on a corrupt file', async () => {
    await mkdir(snapshotDir(), { recursive: true });
    await writeFile(join(snapshotDir(), 'wf_broken.json'), '{ not json', 'utf8');

    expect(await loadWorkflowAgentSnapshot('wf_broken')).toBeUndefined();
  });

  it('stores nothing for a workflow with no agents', async () => {
    await saveWorkflowAgentSnapshot('wf_empty', []);

    expect(await loadWorkflowAgentSnapshot('wf_empty')).toBeUndefined();
  });

  // The id becomes a filename, so anything that could climb out of the snapshot
  // dir is refused outright rather than cleaned up.
  it('refuses ids that are not plain workflow ids', async () => {
    for (const id of ['../escape', 'wf/../../etc/passwd', 'wf id', '']) {
      await saveWorkflowAgentSnapshot(id, [liveAgent]);
      expect(await loadWorkflowAgentSnapshot(id)).toBeUndefined();
    }
    // Nothing was written anywhere under the snapshot dir either.
    await expect(readdir(snapshotDir())).rejects.toThrow();
  });

  it('drops the oldest snapshots once there are too many', async () => {
    await mkdir(snapshotDir(), { recursive: true });
    // 600 existing snapshots, aged so the ordering is unambiguous.
    for (let i = 0; i < 600; i++) {
      const file = join(snapshotDir(), `wf_old${i}.json`);
      await writeFile(file, JSON.stringify([liveAgent]), 'utf8');
      const when = new Date(1_700_000_000_000 + i * 1000);
      await utimes(file, when, when);
    }

    await saveWorkflowAgentSnapshot('wf_newest', [liveAgent]);

    const left = await readdir(snapshotDir());
    expect(left).toHaveLength(500);
    // The just-written one survives; the oldest are the ones that went.
    expect(left).toContain('wf_newest.json');
    expect(left).not.toContain('wf_old0.json');
    expect(left).toContain('wf_old599.json');
  });
});

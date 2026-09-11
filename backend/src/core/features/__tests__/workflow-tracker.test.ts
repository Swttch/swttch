import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Finishing a workflow now writes its agents under os.homedir() so their names
// survive a reload. Point that at the same throwaway dir these tests already
// use, or the suite would leave files in the developer's real home.
let dir: string;
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => dir };
});

import { reconstructWorkflowTasks, WorkflowProgressTracker } from '../workflow-tracker';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { WorkflowTask } from '../../../shared';

let transcriptDir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'wf-test-'));
  transcriptDir = join(dir, 'subagents', 'workflows', 'wf_abc123-def');
  mkdirSync(transcriptDir, { recursive: true });

  // journal: agent a1 done (with topic), agent a2 still running
  const journal = [
    JSON.stringify({ type: 'started', key: 'k1', agentId: 'a1' }),
    JSON.stringify({ type: 'started', key: 'k2', agentId: 'a2' }),
    JSON.stringify({ type: 'result', key: 'k1', agentId: 'a1', result: { topic: 'океан', fact: '…' } }),
  ].join('\n');
  writeFileSync(join(transcriptDir, 'journal.jsonl'), journal);

  // agent a1 transcript: one assistant turn with usage + a tool_use, spanning 7s.
  // cache_read dominates real subagent turns (context reuse), so it must be counted.
  const a1 = [
    JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:00.000Z', message: { role: 'user', content: 'go' } }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-01-01T00:00:07.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't', name: 'Bash', input: {} }],
        usage: { input_tokens: 15781, cache_creation_input_tokens: 18515, cache_read_input_tokens: 50000, output_tokens: 244 },
      },
    }),
  ].join('\n');
  writeFileSync(join(transcriptDir, 'agent-a1.jsonl'), a1);

  // agent a2 transcript: running, no usage yet
  writeFileSync(
    join(transcriptDir, 'agent-a2.jsonl'),
    JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:01.000Z', message: { role: 'user', content: 'go' } }),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function messages() {
  const launched =
    `Workflow launched in background. Task ID: w1\n` +
    `Summary: demo\n` +
    `Transcript dir: ${transcriptDir}\n` +
    `Script file: ${transcriptDir}/script.js`;
  const notif = [
    '<task-notification>',
    '<task-id>w1</task-id>',
    '<tool-use-id>toolu_1</tool-use-id>',
    `<output-file>${dir}/tasks/w1.output</output-file>`,
    '<status>completed</status>',
    '<summary>Dynamic workflow "demo" completed</summary>',
    '<result>{"ok":true}</result>',
    '<usage><agent_count>2</agent_count><subagent_tokens>68760</subagent_tokens><tool_uses>1</tool_uses><duration_ms>7000</duration_ms></usage>',
    '</task-notification>',
  ].join('\n');

  return [
    {
      type: 'assistant',
      timestamp: '2026-01-01T00:00:00.000Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Workflow',
            input: { description: 'demo', script: "export const meta = { name: 'demo-flow', phases: [{ title: 'Phase 1' }] }" },
          },
        ],
      },
    },
    {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: launched }] },
    },
    { type: 'user', message: { role: 'user', content: notif } },
  ] as Array<Record<string, unknown>>;
}

describe('reconstructWorkflowTasks', () => {
  it('rebuilds a finished workflow with agents, phases, status and usage', async () => {
    const tasks = await reconstructWorkflowTasks(messages());
    expect(tasks).toHaveLength(1);
    const t = tasks[0];

    expect(t.toolUseId).toBe('toolu_1');
    expect(t.name).toBe('demo-flow');
    expect(t.taskId).toBe('w1');
    expect(t.workflowId).toBe('wf_abc123-def');
    expect(t.transcriptDir).toBe(transcriptDir);
    expect(t.status).toBe('completed');
    expect(t.summary).toContain('completed');
    expect(t.result).toBe('{"ok":true}');
    expect(t.phases).toEqual([{ title: 'Phase 1' }]);
    // The envelope's own tag names, not renamed on the way through.
    expect(t.usage).toMatchObject({ agent_count: 2, subagent_tokens: 68760, tool_uses: 1, duration_ms: 7000 });

    // agents aggregated from transcript files
    expect(t.agents).toHaveLength(2);
    const a1 = t.agents.find((a) => a.agentId === 'a1')!;
    expect(a1.state).toBe('done'); // the journal recorded a result for a1
    expect(a1.result).toEqual({ topic: 'океан', fact: '…' }); // carried through verbatim
    expect(a1.tokens).toBe(15781 + 18515 + 50000 + 244); // input + cache_creation + cache_read + output
    expect(a1.toolCalls).toBe(1);
    expect(a1.durationMs).toBe(7000);
    expect(a1.reconstructed).toBe(true);

    // Nothing on disk records the live fields, so a rebuilt agent must leave
    // them absent rather than invent stand-ins. `label` in particular used to
    // be filled with the result's `topic` or a slice of the id, which made a
    // guess indistinguishable from something the CLI actually said.
    expect(a1.label).toBeUndefined();
    expect(a1.model).toBeUndefined();
    expect(a1.promptPreview).toBeUndefined();

    // a2 has no journal result, so its state is simply unknown here. Settling
    // that against the workflow's own terminal status is the webview's call
    // (see agentDisplayStatus) — the backend does not overwrite it.
    const a2 = t.agents.find((a) => a.agentId === 'a2')!;
    expect(a2.state).toBeUndefined();
  });

  it('returns [] when there is no Workflow tool_use', async () => {
    const tasks = await reconstructWorkflowTasks([
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } },
    ]);
    expect(tasks).toEqual([]);
  });

  // A workflow whose transcript has no terminal <task-notification> (interrupted,
  // or its final event was lost). Without the live check it would be resurrected
  // as 'running' on every reload — the bug this guards against.
  function messagesWithoutNotification() {
    const launched = `Workflow launched in background. Task ID: w1\nTranscript dir: ${transcriptDir}`;
    return [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_x', name: 'Workflow', input: { description: 'demo' } }],
        },
      },
      {
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: launched }] },
      },
    ] as Array<Record<string, unknown>>;
  }

  it('settles a notification-less workflow to stopped when it is not live', async () => {
    const tasks = await reconstructWorkflowTasks(messagesWithoutNotification(), () => false);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('stopped');
    // The workflow's own status settles, but the agents' `state` is the CLI's
    // field and stays exactly as the journal left it: a1 has a result, a2 has
    // none. Painting a2 as interrupted is display work the webview does from
    // this pair of facts, so the backend must not bake it in here.
    expect(tasks[0].agents.find((a) => a.agentId === 'a1')!.state).toBe('done');
    expect(tasks[0].agents.find((a) => a.agentId === 'a2')!.state).toBeUndefined();
  });

  it('leaves agent state untouched for a live workflow too', async () => {
    const tasks = await reconstructWorkflowTasks(messagesWithoutNotification(), () => true);
    expect(tasks[0].status).toBe('running');
    expect(tasks[0].agents.find((a) => a.agentId === 'a2')!.state).toBeUndefined();
  });

  it('keeps a notification-less workflow running when it is still live', async () => {
    const tasks = await reconstructWorkflowTasks(messagesWithoutNotification(), (id) => id === 'toolu_x');
    expect(tasks[0].status).toBe('running');
  });

  it('defaults a notification-less workflow to stopped when no live check is given', async () => {
    const tasks = await reconstructWorkflowTasks(messagesWithoutNotification());
    expect(tasks[0].status).toBe('stopped');
  });
});

describe('WorkflowProgressTracker stop handling', () => {
  /** Capture WORKFLOW_PROGRESS broadcasts into a flat list. */
  function makeTracker() {
    const broadcasts: WorkflowTask[] = [];
    const connections = {
      broadcastToSession: (_sessionId: string, _type: string, payload: Record<string, unknown>) => {
        broadcasts.push(JSON.parse(JSON.stringify(payload)) as WorkflowTask);
      },
    } as unknown as ConnectionManager;
    const tracker = WorkflowProgressTracker.create(connections);
    return { tracker, broadcasts, last: () => broadcasts[broadcasts.length - 1] };
  }

  const startedEvent = {
    type: 'system',
    subtype: 'task_started',
    tool_use_id: 'toolu_1',
    task_id: 'w1',
    workflow_name: 'demo-flow',
  };

  // The per-agent entry the CLI puts in `workflow_progress[]`, captured verbatim
  // from a real `claude -p --output-format stream-json` run. Every field here
  // has to reach the webview under this exact name: the backend is a courier,
  // not an editor (CLAUDE.md's original-data rule). It used to keep six of these
  // and drop the rest, which is why nothing could show which model ran an agent.
  const liveAgentEntry = {
    type: 'workflow_agent',
    index: 2,
    label: 'probe:agent-1',
    phaseIndex: 1,
    phaseTitle: 'Probe',
    agentId: 'aaff59243a072b430',
    model: 'claude-haiku-4-5-20251001',
    state: 'progress',
    startedAt: 1789038911212,
    queuedAt: 1789038911210,
    attempt: 1,
    promptPreview: 'Reply with exactly the number 1.',
    lastProgressAt: 1789038912162,
    tokens: 1234,
    toolCalls: 2,
  };

  it('carries every field of a live agent entry through to the webview', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'toolu_1',
      workflow_progress: [liveAgentEntry],
    });

    expect(last().agents).toHaveLength(1);
    expect(last().agents[0]).toMatchObject(liveAgentEntry);
  });

  it('keeps a field an earlier delta established when a later one omits it', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'toolu_1',
      workflow_progress: [liveAgentEntry],
    });
    // A later delta for the same slot reports only what changed. Merging is what
    // keeps `label`/`model`/`promptPreview` alive; without it the agent would
    // lose its name the moment it finished.
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'toolu_1',
      workflow_progress: [{ type: 'workflow_agent', index: 2, agentId: 'aaff59243a072b430', state: 'error', error: 'boom', durationMs: 950 }],
    });

    const agent = last().agents[0];
    expect(agent.label).toBe('probe:agent-1');
    expect(agent.model).toBe('claude-haiku-4-5-20251001');
    expect(agent.promptPreview).toBe('Reply with exactly the number 1.');
    expect(agent.state).toBe('error');
    expect(agent.error).toBe('boom');
    expect(agent.durationMs).toBe(950);
  });

  // The whole reason for snapshotting: the CLI reports an agent's label, model
  // and promptPreview only on the live stream and persists none of it, so
  // reopening a finished workflow used to show a column of raw ids. What we saw
  // while it streamed is written down at the end, and the reload path hands
  // back those same entries.
  it('replays the live agent entries after a reload instead of rebuilding ids', async () => {
    const { tracker } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    // The immediate tool_result is what tells the live task its transcript dir,
    // and its basename is the id the snapshot is filed under.
    tracker.handleEvent('s1', {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: `Task ID: w1\nTranscript dir: ${transcriptDir}`,
          },
        ],
      },
    });
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'toolu_1',
      workflow_progress: [{ ...liveAgentEntry, agentId: 'a1' }],
    });
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_notification',
      tool_use_id: 'toolu_1',
      status: 'completed',
    });

    // Snapshot writes are fire-and-forget, so let the microtask queue drain.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const [rebuilt] = await reconstructWorkflowTasks(messages());
    const a1 = rebuilt.agents.find((a) => a.agentId === 'a1')!;
    expect(a1.label).toBe('probe:agent-1');
    expect(a1.model).toBe('claude-haiku-4-5-20251001');
    expect(a1.promptPreview).toBe('Reply with exactly the number 1.');
    // It is the live entry, not a reconstruction, so it carries no such flag.
    expect(a1.reconstructed).toBeUndefined();
  });

  it('passes through a field this codebase has never heard of', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'toolu_1',
      workflow_progress: [{ ...liveAgentEntry, somethingNewTheCliAdded: 'keep me' }],
    });

    expect(last().agents[0]['somethingNewTheCliAdded']).toBe('keep me');
  });

  it('settles a running workflow as stopped on interrupt (stopRunning) and broadcasts it', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    expect(last().status).toBe('running');

    tracker.stopRunning('s1');
    const t = last();
    expect(t.status).toBe('stopped');
    expect(t.endedAt).toBeGreaterThan(0);
    expect(t.usage?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('does not overwrite a completed workflow when stopped afterwards', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_notification',
      tool_use_id: 'toolu_1',
      status: 'completed',
    });
    expect(last().status).toBe('completed');

    tracker.stopRunning('s1');
    expect(last().status).toBe('completed');
  });

  it('only touches workflows of the targeted session', () => {
    const { tracker, broadcasts } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    tracker.handleEvent('s2', { ...startedEvent, tool_use_id: 'toolu_2' });

    tracker.stopRunning('s1');
    const s2 = broadcasts.filter((b) => b.toolUseId === 'toolu_2');
    expect(s2.every((b) => b.status === 'running')).toBe(true);
  });

  it('settles still-running workflows on process close (stopSession)', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    tracker.stopSession('s1');
    expect(last().status).toBe('stopped');
  });

  it('isRunning reflects live state and flips off once stopped', () => {
    const { tracker } = makeTracker();
    expect(tracker.isRunning('s1', 'toolu_1')).toBe(false); // unknown
    tracker.handleEvent('s1', startedEvent);
    expect(tracker.isRunning('s1', 'toolu_1')).toBe(true);
    expect(tracker.isRunning('s2', 'toolu_1')).toBe(false); // wrong session
    tracker.stopRunning('s1');
    expect(tracker.isRunning('s1', 'toolu_1')).toBe(false);
  });

  // issue #347: the agent-transcript modal needs transcriptDir while the
  // workflow is still running, not only after a reload. task_progress never
  // carries it — only the Workflow tool's immediate tool_result does, as an
  // ordinary type:'user' message rather than a task_* system event.
  it('picks up transcriptDir from the Workflow tool_result while the workflow is live', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    expect(last().transcriptDir).toBeUndefined();

    const launched =
      `Workflow launched in background. Task ID: w1\n` +
      `Transcript dir: /home/user/.claude/projects/p/s/subagents/workflows/wf_live123`;
    tracker.handleEvent('s1', {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: launched }] },
    });

    const t = last();
    expect(t.transcriptDir).toBe('/home/user/.claude/projects/p/s/subagents/workflows/wf_live123');
    expect(t.workflowId).toBe('wf_live123');
    expect(t.taskId).toBe('w1');
  });

  it('ignores a user tool_result for an unknown tool_use_id', () => {
    const { tracker, broadcasts } = makeTracker();
    tracker.handleEvent('s1', {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_unknown', content: 'Transcript dir: /x' }] },
    });
    expect(broadcasts).toHaveLength(0);
  });

  it('does not overwrite transcriptDir once set', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', startedEvent);
    const first = 'Workflow launched in background. Task ID: w1\nTranscript dir: /first';
    tracker.handleEvent('s1', {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: first }] },
    });
    expect(last().transcriptDir).toBe('/first');

    const second = 'Workflow launched in background. Task ID: w1\nTranscript dir: /second';
    tracker.handleEvent('s1', {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: second }] },
    });
    expect(last().transcriptDir).toBe('/first');
  });
});

// issue #347: a plain background Bash command (e.g. `run_in_background`) shares
// the same task_started/task_updated/task_notification event channel as a
// dynamic Workflow run, distinguished only by task_type. Before taskType was
// tracked, WorkflowProgressTracker treated every one of these as a workflow —
// naming it the placeholder "workflow" and later showing an empty "No agents
// yet." detail modal for something that was never a workflow to begin with.
describe('WorkflowProgressTracker local_bash background tasks', () => {
  function makeTracker() {
    const broadcasts: WorkflowTask[] = [];
    const connections = {
      broadcastToSession: (_sessionId: string, _type: string, payload: Record<string, unknown>) => {
        broadcasts.push(JSON.parse(JSON.stringify(payload)) as WorkflowTask);
      },
    } as unknown as ConnectionManager;
    const tracker = WorkflowProgressTracker.create(connections);
    return { tracker, broadcasts, last: () => broadcasts[broadcasts.length - 1] };
  }

  const bashStarted = {
    type: 'system',
    subtype: 'task_started',
    tool_use_id: 'toolu_bash1',
    task_id: 'b1vd4nw2o',
    description: '1초마다 카운트 출력하는 60초 백그라운드 작업',
    task_type: 'local_bash',
  };

  it('tags task_type and names the task from its description, not the "workflow" placeholder', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', bashStarted);
    const t = last();
    expect(t.taskType).toBe('local_bash');
    expect(t.name).toBe('1초마다 카운트 출력하는 60초 백그라운드 작업');
    expect(t.name).not.toBe('workflow');
    expect(t.agents).toEqual([]);
  });

  it('does not try to JSON-parse a local_bash output file as a workflow envelope', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', bashStarted);
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_notification',
      tool_use_id: 'toolu_bash1',
      task_id: 'b1vd4nw2o',
      status: 'completed',
      output_file: join(dir, 'does-not-exist-as-json.output'),
      summary: 'Background command "1초마다 카운트 출력하는 60초 백그라운드 작업" completed (exit code 0)',
    });
    const t = last();
    expect(t.status).toBe('completed');
    expect(t.outputFile).toBe(join(dir, 'does-not-exist-as-json.output'));
    // The plain-text log is read on demand by GET_BACKGROUND_TASK_OUTPUT, not
    // parsed here as JSON — result must stay unset, and the event's own
    // summary must survive (readOutputFile would silently return {} for a
    // non-JSON file and overwrite nothing, but must not run at all here).
    expect(t.result).toBeUndefined();
    expect(t.summary).toBe('Background command "1초마다 카운트 출력하는 60초 백그라운드 작업" completed (exit code 0)');
  });

  it('leaves taskType unset for an ordinary workflow event (backward compatible)', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_started',
      tool_use_id: 'toolu_wf1',
      task_id: 'w1',
      workflow_name: 'demo-flow',
      task_type: 'local_workflow',
    });
    expect(last().taskType).toBe('local_workflow');
  });

  it('picks up outputFile from a local_bash tool_result while the task is still running (before task_notification)', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', bashStarted);
    expect(last().outputFile).toBeUndefined();

    const toolResult =
      'Command running in background with ID: b0i10sn6r. Output is being written to: ' +
      '/private/tmp/claude-501/-private-tmp-ccg-demo/bf89560d/tasks/b0i10sn6r.output. ' +
      'You will be notified when it completes. To check interim output, use Read on that file path.';
    tracker.handleEvent('s1', {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_bash1', content: toolResult }] },
    });

    const t = last();
    expect(t.outputFile).toBe('/private/tmp/claude-501/-private-tmp-ccg-demo/bf89560d/tasks/b0i10sn6r.output');
    expect(t.taskId).toBe('b0i10sn6r');
    // A bash task's tool_result must never be mistaken for a Workflow's
    // "Transcript dir:" result — no transcriptDir/workflowId should appear.
    expect(t.transcriptDir).toBeUndefined();
    expect(t.workflowId).toBeUndefined();
  });

  // A backgrounded command whose owning CLI is killed never sends a terminal
  // task_notification, so the tracker kept its entry at `running` with nothing
  // to contradict it — four such tasks sat there for seven hours while their
  // logs already said `[killed]`. The log's closing line is the notice.
  describe('settling from the log the CLI closes', () => {
    function startedBashTaskWithLog(contents: string) {
      const dir = mkdtempSync(join(tmpdir(), 'wf-bash-'));
      const outputFile = join(dir, 'task.output');
      writeFileSync(outputFile, contents);

      const { tracker, last } = makeTracker();
      tracker.handleEvent('s1', bashStarted);
      tracker.handleEvent('s1', {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_bash1',
              content: `Command running in background with ID: b1. Output is being written to: ${outputFile}. more.`,
            },
          ],
        },
      });
      expect(last().status).toBe('running');
      return { tracker, last, outputFile, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
    }

    it('settles a killed task as stopped', () => {
      const { tracker, last, outputFile, cleanup } = startedBashTaskWithLog('\n[killed]\n');
      tracker.settleByOutputFile(outputFile);

      expect(last().status).toBe('stopped');
      expect(last().endedAt).toBeGreaterThan(0);
      cleanup();
    });

    it('settles a clean exit as completed and a non-zero one as failed', () => {
      const ok = startedBashTaskWithLog('hello\n[exited with code 0]\n');
      ok.tracker.settleByOutputFile(ok.outputFile);
      expect(ok.last().status).toBe('completed');
      ok.cleanup();

      const bad = startedBashTaskWithLog('boom\n[exited with code 2]\n');
      bad.tracker.settleByOutputFile(bad.outputFile);
      expect(bad.last().status).toBe('failed');
      bad.cleanup();
    });

    // A quiet command is not a finished one. `sleep`, or anything writing to a
    // file rather than stdout, leaves the log empty for its whole run.
    it('leaves a task running while its log carries no closing line', () => {
      const { tracker, last, outputFile, cleanup } = startedBashTaskWithLog('');
      tracker.settleByOutputFile(outputFile);
      expect(last().status).toBe('running');

      const partial = startedBashTaskWithLog('still working\n');
      partial.tracker.settleByOutputFile(partial.outputFile);
      expect(partial.last().status).toBe('running');

      cleanup();
      partial.cleanup();
    });

    it('does not reopen a task that already finished', () => {
      const { tracker, last, outputFile, cleanup } = startedBashTaskWithLog('\n[killed]\n');
      tracker.handleEvent('s1', {
        type: 'system',
        subtype: 'task_notification',
        tool_use_id: 'toolu_bash1',
        status: 'completed',
      });
      expect(last().status).toBe('completed');

      tracker.settleByOutputFile(outputFile);
      expect(last().status).toBe('completed');
      cleanup();
    });
  });

  it('does not overwrite outputFile once set from the immediate tool_result', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', bashStarted);
    const first = 'Command running in background with ID: b0i10sn6r. Output is being written to: /first.output. more text.';
    tracker.handleEvent('s1', {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_bash1', content: first }] },
    });
    expect(last().outputFile).toBe('/first.output');

    const second = 'Command running in background with ID: b0i10sn6r. Output is being written to: /second.output. more text.';
    tracker.handleEvent('s1', {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_bash1', content: second }] },
    });
    expect(last().outputFile).toBe('/first.output');
  });
});

// issue #383: a Cancel click resolves through the TaskStop reminder fallback
// (see useCancelBackgroundTask), which sometimes lands on a task_id the CLI
// itself has no record of — e.g. a backgrounded agent whose owning CLI
// session already exited. Without settling on this signal, no terminal
// task_notification is ever coming for such a task, and the panel is left
// ticking a 'running' card's token/duration counters forever.
describe('WorkflowProgressTracker "No task found" settling', () => {
  function makeTracker() {
    const broadcasts: WorkflowTask[] = [];
    const connections = {
      broadcastToSession: (_sessionId: string, _type: string, payload: Record<string, unknown>) => {
        broadcasts.push(JSON.parse(JSON.stringify(payload)) as WorkflowTask);
      },
    } as unknown as ConnectionManager;
    const tracker = WorkflowProgressTracker.create(connections);
    return { tracker, broadcasts, last: () => broadcasts[broadcasts.length - 1] };
  }

  const agentStarted = {
    type: 'system',
    subtype: 'task_started',
    tool_use_id: 'toolu_agent1',
    task_id: 'ac1d41ea660ea28e4',
    description: 'Investigate the repo',
    task_type: 'local_agent',
  };

  function taskStopErrorEvent(taskId: string) {
    return {
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'toolu_taskstop1',
          content: `<tool_use_error>No task found with ID: ${taskId}</tool_use_error>`,
        }],
      },
    };
  }

  it('settles a running task to stopped when the CLI reports it unknown', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', agentStarted);
    expect(last().status).toBe('running');

    tracker.handleEvent('s1', taskStopErrorEvent('ac1d41ea660ea28e4'));

    const t = last();
    expect(t.status).toBe('stopped');
    expect(t.endedAt).toBeGreaterThan(0);
  });

  it('does not settle a task in a different session', () => {
    const { tracker, broadcasts } = makeTracker();
    tracker.handleEvent('s1', agentStarted);
    tracker.handleEvent('s2', taskStopErrorEvent('ac1d41ea660ea28e4'));

    const s1Broadcasts = broadcasts.filter((b) => b.toolUseId === 'toolu_agent1');
    expect(s1Broadcasts.every((b) => b.status === 'running')).toBe(true);
  });

  it('does not overwrite an already-completed task', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', agentStarted);
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_notification',
      tool_use_id: 'toolu_agent1',
      task_id: 'ac1d41ea660ea28e4',
      status: 'completed',
    });
    expect(last().status).toBe('completed');

    tracker.handleEvent('s1', taskStopErrorEvent('ac1d41ea660ea28e4'));
    expect(last().status).toBe('completed');
  });

  it('ignores a "No task found" for a task_id nothing is tracking', () => {
    const { tracker, broadcasts } = makeTracker();
    tracker.handleEvent('s1', agentStarted);
    const before = broadcasts.length;

    tracker.handleEvent('s1', taskStopErrorEvent('some-other-id'));

    expect(broadcasts).toHaveLength(before);
  });
});

// Reload used to rebuild workflows and nothing else, because the scan matched
// only `name === 'Workflow'`. The live progress stream is never replayed, so a
// backgrounded Agent or Bash task that the reload skipped was gone from the
// panel for good: reopening a session showed only the tasks started after it
// was reopened.
describe('reconstructWorkflowTasks: backgrounded Agent and Bash tasks', () => {
  // The CLI's own wording, copied from a recorded session transcript rather
  // than paraphrased — these strings are the contract the parsers read.
  const agentLaunched = [
    'Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)',
    "agentId: a40be17f1967a0861 (internal ID - do not mention to user. Use SendMessage with to: 'a40be17f1967a0861', summary: '<5-10 word recap>' to continue this agent.)",
    'The agent is working in the background. You will be notified automatically when it completes.',
    'output_file: /tmp/tasks/a40be17f1967a0861.output',
  ].join('\n');

  const bashLaunched =
    'Command running in background with ID: b27yhtv6i. Output is being written to: /tmp/tasks/b27yhtv6i.output. ';

  function toolUse(id: string, name: string, input: Record<string, unknown>) {
    return {
      type: 'assistant',
      timestamp: '2026-01-01T00:00:00.000Z',
      message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
    } as Record<string, unknown>;
  }

  function toolResult(id: string, content: string) {
    return {
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] },
    } as Record<string, unknown>;
  }

  it('rebuilds a backgrounded Agent call, with the agentId the launch text states as its task id', async () => {
    const tasks = await reconstructWorkflowTasks([
      toolUse('toolu_a', 'Agent', {
        description: 'Describe webview utils dir',
        prompt: 'Read every .ts file…',
        subagent_type: 'general-purpose',
        run_in_background: true,
      }),
      toolResult('toolu_a', agentLaunched),
    ]);

    expect(tasks).toHaveLength(1);
    const t = tasks[0];
    expect(t.taskType).toBe('local_agent');
    // Named from `description`, the same field the live path names it from.
    expect(t.name).toBe('Describe webview utils dir');
    expect(t.taskId).toBe('a40be17f1967a0861');
    expect(t.outputFile).toBe('/tmp/tasks/a40be17f1967a0861.output');
    // One agent, not a workflow of many, and no script to declare phases.
    expect(t.agents).toEqual([]);
    expect(t.phases).toEqual([]);
  });

  it('rebuilds a backgrounded Bash call', async () => {
    const tasks = await reconstructWorkflowTasks([
      toolUse('toolu_b', 'Bash', { command: 'pnpm build', description: 'Build the bundle', run_in_background: true }),
      toolResult('toolu_b', bashLaunched),
    ]);

    expect(tasks).toHaveLength(1);
    const t = tasks[0];
    expect(t.taskType).toBe('local_bash');
    expect(t.name).toBe('Build the bundle');
    expect(t.taskId).toBe('b27yhtv6i');
    expect(t.outputFile).toBe('/tmp/tasks/b27yhtv6i.output');
  });

  // Both tools run inline unless asked to background themselves, and an inline
  // call never becomes a task. Rebuilding one would put a row in the panel for
  // something that was never a background task at all.
  it('ignores Agent and Bash calls that were not backgrounded', async () => {
    const tasks = await reconstructWorkflowTasks([
      toolUse('toolu_c', 'Agent', { description: 'inline agent', prompt: 'do it' }),
      toolUse('toolu_d', 'Bash', { command: 'ls', description: 'list' }),
      toolUse('toolu_e', 'Bash', { command: 'ls', description: 'list', run_in_background: false }),
    ]);

    expect(tasks).toEqual([]);
  });

  it('settles a rebuilt Agent task from its terminal notification', async () => {
    const notif = [
      '<task-notification>',
      '<task-id>a40be17f1967a0861</task-id>',
      '<tool-use-id>toolu_a</tool-use-id>',
      '<output-file>/tmp/tasks/a40be17f1967a0861.output</output-file>',
      '<status>completed</status>',
      '<summary>Agent "Describe webview utils dir" finished</summary>',
      '<usage><subagent_tokens>113355</subagent_tokens><tool_uses>31</tool_uses><duration_ms>132873</duration_ms></usage>',
      '</task-notification>',
    ].join('\n');

    const tasks = await reconstructWorkflowTasks([
      toolUse('toolu_a', 'Agent', { description: 'Describe webview utils dir', run_in_background: true }),
      toolResult('toolu_a', agentLaunched),
      { type: 'user', message: { role: 'user', content: notif } } as Record<string, unknown>,
    ]);

    expect(tasks[0].status).toBe('completed');
    expect(tasks[0].usage).toMatchObject({ subagent_tokens: 113355, tool_uses: 31, duration_ms: 132873 });
  });

  // Without a live tracker saying otherwise, a task with no terminal
  // notification was interrupted — it must not come back claiming to run.
  it('settles a rebuilt task with no notification to stopped unless it is live', async () => {
    const messages = [
      toolUse('toolu_a', 'Agent', { description: 'still going', run_in_background: true }),
      toolResult('toolu_a', agentLaunched),
    ];

    expect((await reconstructWorkflowTasks(messages))[0].status).toBe('stopped');
    expect((await reconstructWorkflowTasks(messages, (id) => id === 'toolu_a'))[0].status).toBe('running');
  });
});

// The tracker used to pick a few fields out of what the CLI sent, rename them,
// and drop the rest. That cost real information: the envelope's <note> — the
// CLI saying a finished agent can be resumed and will then notify again under
// the same task-id — reached nothing that could act on it.
describe('what the CLI reported, as it reported it', () => {
  function makeTracker() {
    const broadcasts: WorkflowTask[] = [];
    const connections = {
      broadcastToSession: (_sessionId: string, _type: string, payload: Record<string, unknown>) => {
        broadcasts.push(JSON.parse(JSON.stringify(payload)) as WorkflowTask);
      },
    } as unknown as ConnectionManager;
    const tracker = WorkflowProgressTracker.create(connections);
    return { tracker, broadcasts, last: () => broadcasts[broadcasts.length - 1] };
  }

  function agentNotification(extra: string[] = []) {
    return [
      '<task-notification>',
      '<task-id>a40be17f1967a0861</task-id>',
      '<tool-use-id>toolu_a</tool-use-id>',
      '<status>completed</status>',
      '<summary>Agent "x" finished</summary>',
      ...extra,
      '<usage><subagent_tokens>113355</subagent_tokens><tool_uses>31</tool_uses><duration_ms>132873</duration_ms></usage>',
      '</task-notification>',
    ].join('\n');
  }

  function rebuild(notif: string) {
    return reconstructWorkflowTasks([
      {
        type: 'assistant',
        timestamp: '2026-01-01T00:00:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_a', name: 'Agent', input: { description: 'x', run_in_background: true } }],
        },
      },
      { type: 'user', message: { role: 'user', content: notif } },
    ] as Array<Record<string, unknown>>);
  }

  it('keeps a tag the envelope carries that nothing reads yet', async () => {
    const note = 'A task-notification fires each time this agent stops. The user can send it another message and resume it.';
    const tasks = await rebuild(agentNotification([`<note>${note}</note>`]));

    expect(tasks[0].events?.task_notification?.['note']).toBe(note);
  });

  // Every tag of the envelope is kept, not a chosen few, and the text it was
  // parsed from is kept beside them.
  it('keeps every tag of the envelope, and the envelope itself', async () => {
    const notif = agentNotification();
    const tasks = await rebuild(notif);
    const kept = tasks[0].events?.task_notification as Record<string, unknown>;

    expect(kept['task-id']).toBe('a40be17f1967a0861');
    expect(kept['status']).toBe('completed');
    expect(kept['summary']).toBe('Agent "x" finished');
    expect(kept['raw']).toBe(notif);
  });

  // The live events and the persisted envelope name the same figure
  // differently. Both are kept as sent; neither is normalised into the other.
  it('keeps the envelope\'s token name, and the live event\'s own, each as sent', async () => {
    const rebuilt = await rebuild(agentNotification());
    expect(rebuilt[0].usage).toMatchObject({ subagent_tokens: 113355, tool_uses: 31, duration_ms: 132873 });
    expect(rebuilt[0].usage).not.toHaveProperty('total_tokens');

    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_started',
      tool_use_id: 'toolu_live',
      task_id: 'a1',
      task_type: 'local_agent',
      description: 'x',
    });
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'toolu_live',
      usage: { total_tokens: 121729, tool_uses: 2, duration_ms: 105449 },
    });

    expect(last().usage).toEqual({ total_tokens: 121729, tool_uses: 2, duration_ms: 105449 });
  });

  // An agent count we worked out from the agent list is not something the CLI
  // said, and mixing it into the CLI's own object made the two impossible to
  // tell apart. The webview counts the agents it was given instead.
  it('does not put our own agent count into the CLI\'s usage object', async () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_started',
      tool_use_id: 'toolu_live2',
      task_type: 'local_workflow',
      workflow_name: 'wf',
    });
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'toolu_live2',
      workflow_progress: [{ type: 'workflow_agent', index: 1, agentId: 'a1', label: 'one' }],
      usage: { total_tokens: 10, tool_uses: 1, duration_ms: 5 },
    });

    expect(last().agents).toHaveLength(1);
    expect(last().usage).not.toHaveProperty('agent_count');
    expect(last().usage).not.toHaveProperty('agentCount');
  });
});

// The CLI states whether a task was actually backgrounded, and we were not
// reading it. An ordinary inline Bash call emits task_started too, so every
// `ls` the model ran landed in the Background tasks panel and ticked the
// running badge on the way past — measured live: one `sleep 12 && echo hi`,
// run explicitly not in the background, took the panel from 6 rows to 7.
describe('only tasks the CLI says were backgrounded', () => {
  function makeTracker() {
    const broadcasts: WorkflowTask[] = [];
    const connections = {
      broadcastToSession: (_sessionId: string, _type: string, payload: Record<string, unknown>) => {
        broadcasts.push(JSON.parse(JSON.stringify(payload)) as WorkflowTask);
      },
    } as unknown as ConnectionManager;
    const tracker = WorkflowProgressTracker.create(connections);
    return { tracker, broadcasts, last: () => broadcasts[broadcasts.length - 1] };
  }

  // Verbatim shape of an inline Bash run, from a recorded stream.
  const inlineBash = {
    type: 'system',
    subtype: 'task_started',
    task_id: 'b8iwesz1c',
    owned_by_subagent: true,
    tool_use_id: 'toolu_inline',
    description: 'Sleep for 90 seconds',
    is_backgrounded: false,
    task_type: 'local_bash',
  };

  it('ignores a Bash call the CLI says was not backgrounded', () => {
    const { tracker, broadcasts } = makeTracker();
    tracker.handleEvent('s1', inlineBash);
    expect(broadcasts).toHaveLength(0);
  });

  it('still tracks a Bash call that was backgrounded', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', { ...inlineBash, tool_use_id: 'toolu_bg', is_backgrounded: true });
    expect(last().toolUseId).toBe('toolu_bg');
    expect(last().taskType).toBe('local_bash');
  });

  // A workflow never carries the field, because it is always backgrounded.
  it('still tracks a workflow, which states no such field', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_started',
      tool_use_id: 'toolu_wf',
      task_type: 'local_workflow',
      workflow_name: 'demo',
    });
    expect(last().toolUseId).toBe('toolu_wf');
  });

  // Progress events build an entry on demand, so an inline task's progress
  // would otherwise put back the row task_started just declined to make.
  it('keeps ignoring it when later events arrive for the same task', () => {
    const { tracker, broadcasts } = makeTracker();
    tracker.handleEvent('s1', inlineBash);
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'toolu_inline',
      usage: { total_tokens: 10, tool_uses: 1, duration_ms: 5 },
    });
    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_notification',
      tool_use_id: 'toolu_inline',
      status: 'completed',
    });

    expect(broadcasts).toHaveLength(0);
  });
});

// Nothing the CLI sends about a task is discarded on the way to the webview.
// The named fields on the task are conveniences read off these events; this is
// the record they were read from.
describe('the CLI events, kept whole', () => {
  function makeTracker() {
    const broadcasts: WorkflowTask[] = [];
    const connections = {
      broadcastToSession: (_sessionId: string, _type: string, payload: Record<string, unknown>) => {
        broadcasts.push(JSON.parse(JSON.stringify(payload)) as WorkflowTask);
      },
    } as unknown as ConnectionManager;
    const tracker = WorkflowProgressTracker.create(connections);
    return { tracker, broadcasts, last: () => broadcasts[broadcasts.length - 1] };
  }

  // Verbatim from a recorded stream. Half of these fields had no field of
  // their own on the task and were dropped where nothing could see them.
  const agentStarted = {
    type: 'system',
    subtype: 'task_started',
    task_id: 'aa68a75caf638ed39',
    tool_use_id: 'toolu_a',
    description: 'Sleep 90 then report',
    subagent_type: 'general-purpose',
    is_backgrounded: true,
    spawn_depth: 1,
    task_type: 'local_agent',
    prompt: 'sleep 90 using Bash, then reply done',
    uuid: '953e8ace-dfb2-4fa0-8b75-1e2c2be4a573',
    session_id: 's1',
  };

  it('keeps task_started whole, including fields no task field is named for', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', agentStarted);

    expect(last().events?.task_started).toEqual([agentStarted]);
    // The ones that used to be read and thrown away, or never read at all.
    const started = last().events?.task_started?.[0];
    expect(started?.['prompt']).toBe('sleep 90 using Bash, then reply done');
    expect(started?.['subagent_type']).toBe('general-purpose');
    expect(started?.['spawn_depth']).toBe(1);
  });

  it('keeps task_progress whole, including last_tool_name', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', agentStarted);
    const progress = {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'toolu_a',
      task_id: 'aa68a75caf638ed39',
      description: 'Sleep 90 then report',
      subagent_type: 'general-purpose',
      last_tool_name: 'Bash',
      summary: 'running sleep',
      usage: { total_tokens: 100, tool_uses: 1, duration_ms: 5 },
      session_id: 's1',
      uuid: 'u2',
    };
    tracker.handleEvent('s1', progress);

    expect(last().events?.task_progress).toEqual(progress);
    expect(last().events?.task_progress?.['last_tool_name']).toBe('Bash');
  });

  it('keeps the terminal notification whole', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', agentStarted);
    const notif = {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'aa68a75caf638ed39',
      tool_use_id: 'toolu_a',
      status: 'completed',
      output_file: '/tmp/tasks/aa68a75caf638ed39.output',
      summary: 'done',
      usage: { total_tokens: 64217, tool_uses: 1, duration_ms: 110162 },
      session_id: 's1',
      uuid: 'u3',
    };
    tracker.handleEvent('s1', notif);

    expect(last().events?.task_notification).toEqual(notif);
  });
});

// task_updated is addressed by task_id alone — it carries no tool_use_id — so
// routing it through onProgress dropped it on the first line. 179 of them sat
// unread in one machine's logs, and two things were being reconstructed the
// hard way because of it.
describe('task_updated', () => {
  function makeTracker() {
    const broadcasts: WorkflowTask[] = [];
    const connections = {
      broadcastToSession: (_sessionId: string, _type: string, payload: Record<string, unknown>) => {
        broadcasts.push(JSON.parse(JSON.stringify(payload)) as WorkflowTask);
      },
    } as unknown as ConnectionManager;
    const tracker = WorkflowProgressTracker.create(connections);
    return { tracker, broadcasts, last: () => broadcasts[broadcasts.length - 1] };
  }

  const inlineBash = {
    type: 'system',
    subtype: 'task_started',
    task_id: 'byemn0kwq',
    tool_use_id: 'toolu_b',
    description: '프록시 존중 여부 대조 실측',
    is_backgrounded: false,
    task_type: 'local_bash',
  };

  function updated(patch: Record<string, unknown>) {
    return { type: 'system', subtype: 'task_updated', task_id: 'byemn0kwq', patch, uuid: 'u', session_id: 's1' };
  }

  // The real sequence from a recorded session: a command starts inline, the
  // user sends it to the background, and it is killed later. Judging only by
  // task_started, such a task would be hidden from the panel for good.
  it('reports a task that starts inline and is later sent to the background', () => {
    const { tracker, broadcasts, last } = makeTracker();

    tracker.handleEvent('s1', inlineBash);
    expect(broadcasts).toHaveLength(0);

    tracker.handleEvent('s1', updated({ is_backgrounded: true }));

    expect(broadcasts.length).toBeGreaterThan(0);
    expect(last().toolUseId).toBe('toolu_b');
    expect(last().description).toBe('프록시 존중 여부 대조 실측');
  });

  // The same fact the output log's `[killed]` line carries, except the CLI
  // states it outright and nobody has to read a file to find out.
  it('settles the task from the patch, mapping the CLI\'s own word for it', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', inlineBash);
    tracker.handleEvent('s1', updated({ is_backgrounded: true }));

    tracker.handleEvent('s1', updated({ status: 'killed', end_time: 1789059708585 }));

    expect(last().status).toBe('stopped');
    expect(last().endedAt).toBe(1789059708585);
  });

  it('carries completed and failed through under our own names for them', () => {
    for (const [cliStatus, ours] of [['completed', 'completed'], ['failed', 'failed']] as const) {
      const { tracker, last } = makeTracker();
      tracker.handleEvent('s1', { ...inlineBash, is_backgrounded: true });
      tracker.handleEvent('s1', updated({ status: cliStatus, end_time: 1 }));
      expect(last().status).toBe(ours);
    }
  });

  it('keeps every patch, in the order they arrived', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', inlineBash);
    tracker.handleEvent('s1', updated({ is_backgrounded: true }));
    tracker.handleEvent('s1', updated({ status: 'killed', end_time: 1789059708585 }));

    const kept = last().events?.task_updated ?? [];
    expect(kept).toHaveLength(2);
    expect(kept[0]['patch']).toEqual({ is_backgrounded: true });
    expect(kept[1]['patch']).toEqual({ status: 'killed', end_time: 1789059708585 });
  });

  it('ignores a patch for a task_id it is not tracking', () => {
    const { tracker, broadcasts } = makeTracker();
    tracker.handleEvent('s1', updated({ status: 'completed', end_time: 1 }));
    expect(broadcasts).toHaveLength(0);
  });
});

// Resuming an agent makes the CLI start it again under a NEW tool_use_id while
// keeping the SAME task_id — its own notification says so: "the same task-id
// may notify more than once". Keyed by tool_use_id alone, that became a second
// row for one agent, and the panel showed it sitting in "running" and
// "finished" at the same time.
describe('a resumed agent stays one task', () => {
  function makeTracker() {
    const broadcasts: WorkflowTask[] = [];
    const connections = {
      broadcastToSession: (_sessionId: string, _type: string, payload: Record<string, unknown>) => {
        broadcasts.push(JSON.parse(JSON.stringify(payload)) as WorkflowTask);
      },
    } as unknown as ConnectionManager;
    const tracker = WorkflowProgressTracker.create(connections);
    return {
      tracker,
      broadcasts,
      last: () => broadcasts[broadcasts.length - 1],
      rows: () => new Set(broadcasts.map((b) => b.toolUseId)),
    };
  }

  // Verbatim shapes from a recorded session.
  const launch = {
    type: 'system',
    subtype: 'task_started',
    task_id: 'a40be17f1967a0861',
    tool_use_id: 'toolu_launch',
    description: 'Describe webview utils dir',
    subagent_type: 'general-purpose',
    is_backgrounded: true,
    spawn_depth: 1,
    task_type: 'local_agent',
    prompt: 'Read every .ts file directly inside webview/src/utils…',
  };
  const finished = {
    type: 'system',
    subtype: 'task_notification',
    task_id: 'a40be17f1967a0861',
    tool_use_id: 'toolu_launch',
    status: 'completed',
    summary: 'Complete.',
  };
  // The resume: new tool_use_id, same task_id, and a prompt that is the message
  // which resumed it rather than the one it was launched with.
  const resume = {
    ...launch,
    tool_use_id: 'toolu_resume',
    prompt: 'Your final return value was just "Complete." — please output the paragraph.',
  };

  it('does not open a second row for the resumed agent', () => {
    const { tracker, rows } = makeTracker();
    tracker.handleEvent('s1', launch);
    tracker.handleEvent('s1', finished);
    tracker.handleEvent('s1', resume);

    expect(rows()).toEqual(new Set(['toolu_launch']));
  });

  it('puts the finished task back to running', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', launch);
    tracker.handleEvent('s1', finished);
    expect(last().status).toBe('completed');
    expect(last().endedAt).toBeDefined();

    tracker.handleEvent('s1', resume);

    expect(last().status).toBe('running');
    expect(last().endedAt).toBeUndefined();
  });

  // A resume reports `description: "(resumed)"` and the resuming message as its
  // prompt. Writing those over the row would erase what it has been about.
  it('keeps the name and start time the launch gave it', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', launch);
    const startedAt = last().startedAt;

    tracker.handleEvent('s1', { ...resume, description: '(resumed)' });

    expect(last().name).toBe('Describe webview utils dir');
    expect(last().startedAt).toBe(startedAt);
  });

  it('keeps both task_started events, launch first', () => {
    const { tracker, last } = makeTracker();
    tracker.handleEvent('s1', launch);
    tracker.handleEvent('s1', resume);

    const started = last().events?.task_started ?? [];
    expect(started).toHaveLength(2);
    expect(started[0]['prompt']).toBe('Read every .ts file directly inside webview/src/utils…');
    expect(started[1]['prompt']).toBe('Your final return value was just "Complete." — please output the paragraph.');
  });

  // Everything after a resume arrives under the new tool_use_id, so the
  // alias has to carry the later events back to the original row.
  it('follows later events sent under the new tool_use_id', () => {
    const { tracker, last, rows } = makeTracker();
    tracker.handleEvent('s1', launch);
    tracker.handleEvent('s1', resume);

    tracker.handleEvent('s1', {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'a40be17f1967a0861',
      tool_use_id: 'toolu_resume',
      status: 'completed',
      summary: 'the paragraph',
      usage: { total_tokens: 200, tool_uses: 3, duration_ms: 900 },
    });

    expect(rows()).toEqual(new Set(['toolu_launch']));
    expect(last().status).toBe('completed');
    expect(last().summary).toBe('the paragraph');
    expect(last().usage).toMatchObject({ total_tokens: 200 });
  });

  // Two unrelated tasks must not be merged just because both are agents.
  it('leaves a genuinely different task alone', () => {
    const { tracker, rows } = makeTracker();
    tracker.handleEvent('s1', launch);
    tracker.handleEvent('s1', { ...launch, task_id: 'other', tool_use_id: 'toolu_other' });

    expect(rows()).toEqual(new Set(['toolu_launch', 'toolu_other']));
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { reconstructWorkflowTasks, WorkflowProgressTracker } from '../workflow-tracker';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { WorkflowTask } from '../../../shared';

let dir: string;
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
    expect(t.usage).toMatchObject({ agentCount: 2, subagentTokens: 68760, toolUses: 1, durationMs: 7000 });

    // agents aggregated from transcript files
    expect(t.agents).toHaveLength(2);
    const a1 = t.agents.find((a) => a.agentId === 'a1')!;
    expect(a1.status).toBe('done');
    expect(a1.label).toBe('океан'); // derived from journal result.topic
    expect(a1.tokens).toBe(15781 + 18515 + 50000 + 244); // input + cache_creation + cache_read + output
    expect(a1.tools).toBe(1);
    expect(a1.durationMs).toBe(7000);

    // a2 has no journal result, but the workflow is completed (terminal), so it
    // is settled to done — a finished card must not show pulsing running dots.
    const a2 = t.agents.find((a) => a.agentId === 'a2')!;
    expect(a2.status).toBe('done');
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
    // No agent stays running, but an interrupted one (a2, no journal result)
    // goes grey 'stopped' — never green 'done'. a1 finished, so it stays done.
    expect(tasks[0].agents.some((a) => a.status === 'running')).toBe(false);
    expect(tasks[0].agents.find((a) => a.agentId === 'a1')!.status).toBe('done');
    expect(tasks[0].agents.find((a) => a.agentId === 'a2')!.status).toBe('stopped');
  });

  it('keeps a live workflow\'s unfinished agents running', async () => {
    const tasks = await reconstructWorkflowTasks(messagesWithoutNotification(), () => true);
    expect(tasks[0].status).toBe('running');
    expect(tasks[0].agents.some((a) => a.status === 'running')).toBe(true);
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

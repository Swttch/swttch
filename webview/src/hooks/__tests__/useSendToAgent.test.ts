import { describe, it, expect } from 'vitest';
import type { WorkflowTask } from '@/shared';
import { agentAddressOf, buildSendToAgentReminder } from '../useSendToAgent';

function makeTask(overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    toolUseId: 'toolu_1',
    name: 'Describe webview utils dir',
    status: 'completed',
    startedAt: 0,
    phases: [],
    agents: [],
    ...overrides,
  };
}

describe('agentAddressOf', () => {
  // A backgrounded Agent's taskId IS its agentId: the launch text states them
  // as one value and the notification reports it as `task-id`.
  it('gives a backgrounded Agent its own id', () => {
    expect(agentAddressOf(makeTask({ taskType: 'local_agent', taskId: 'a40be17f1967a0861' })))
      .toBe('a40be17f1967a0861');
  });

  // A workflow is not an agent. Its agents each have an address of their own,
  // reached through the picker rather than through the task.
  it('gives a workflow none', () => {
    expect(agentAddressOf(makeTask({ taskType: 'local_workflow', taskId: 'wzj14if9q' }))).toBeUndefined();
  });

  it('gives a Bash task none', () => {
    expect(agentAddressOf(makeTask({ taskType: 'local_bash', taskId: 'b27yhtv6i' }))).toBeUndefined();
  });

  // A task rebuilt before the id was known has nothing to address.
  it('gives none when the id is not known yet', () => {
    expect(agentAddressOf(makeTask({ taskType: 'local_agent' }))).toBeUndefined();
  });
});

describe('buildSendToAgentReminder', () => {
  // Wrapped as a system-reminder so it reaches the model and renders nothing:
  // parseUserContent strips these blocks and an entry left with no displayable
  // text is dropped. The conversation belongs in the agent's own view.
  it('is entirely a system-reminder, so the chat shows nothing', () => {
    const text = buildSendToAgentReminder('a40be17f1967a0861', 'try the other directory');
    expect(text.startsWith('<system-reminder>')).toBe(true);
    expect(text.endsWith('</system-reminder>')).toBe(true);
  });

  it('names the address and asks for the tool by name', () => {
    const text = buildSendToAgentReminder('a40be17f1967a0861', 'try the other directory');
    expect(text).toContain('a40be17f1967a0861');
    expect(text).toContain('SendMessage');
  });

  // The message is the user's, not ours to summarise.
  it('carries the message verbatim', () => {
    const message = 'Use "quotes" and <angle brackets> and\nkeep the line break';
    expect(buildSendToAgentReminder('a1', message)).toContain(message);
  });

  // Marked off so a message that reads like an instruction is not mistaken for
  // one addressed to the model itself.
  it('fences the message off from the instruction around it', () => {
    const text = buildSendToAgentReminder('a1', 'stop what you are doing');
    expect(text).toContain('\n---\nstop what you are doing\n---\n');
    expect(text).toContain('not addressed');
  });
});

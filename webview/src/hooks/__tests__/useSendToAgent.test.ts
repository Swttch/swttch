import { describe, it, expect } from 'vitest';
import type { WorkflowTask } from '@/shared';
import { agentAddressOf, buildSendToAgentReminder, buildSendToSessionMessage } from '../useSendToAgent';

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

/**
 * The `@@` panel's delivery.
 *
 * Same mechanism as the background-agent reminder, different kind of address: a
 * peer session is reached by the `name` that `claude agents --json` prints.
 */
describe('buildSendToSessionMessage', () => {
  const COMPOSER = '@@fix the proxy tests pass over here';
  const BODY = 'tests pass over here';

  it('names the session as the SendMessage target', () => {
    const built = buildSendToSessionMessage('proj-aa', COMPOSER, BODY);

    expect(built).toContain("SendMessage tool (to: 'proj-aa')");
  });

  it('carries the body between markers, so the model does not answer it', () => {
    const built = buildSendToSessionMessage('proj-aa', COMPOSER, BODY);

    expect(built).toContain('---\ntests pass over here\n---');
    expect(built).toContain('NOT addressed to you');
  });

  /**
   * The user typed this, so the user should see it. `parseUserContent` strips
   * `<system-reminder>` blocks and keeps everything around them, so the
   * composer text has to sit OUTSIDE the block to survive into the bubble.
   *
   * The background-agent path does the opposite on purpose: that conversation
   * belongs in the agent's own transcript. A peer session has no such view, so
   * a message that vanished on send would look like one that failed to send.
   */
  it('leaves what the user typed outside the reminder, so it renders as their bubble', () => {
    const built = buildSendToSessionMessage('proj-aa', COMPOSER, BODY);

    const visible = built.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
    expect(visible).toBe(COMPOSER);
  });

  it('keeps the chip in the bubble but not in what travels', () => {
    const built = buildSendToSessionMessage('proj-aa', COMPOSER, BODY);

    const visible = built.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
    expect(visible).toContain('@@fix the proxy');
    expect(built).toContain('---\ntests pass over here\n---');
  });

  it('says it is another session on this machine, not a background agent', () => {
    const peer = buildSendToSessionMessage('proj-aa', COMPOSER, BODY);
    const agent = buildSendToAgentReminder('a40be17f1967a0861', 'hi');

    expect(peer).toContain('another Claude session');
    expect(agent).toContain('background agent');
  });
});

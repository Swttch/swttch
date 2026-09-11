import { useCallback } from 'react';
import type { InputMode } from '@/types/chatInput';
import type { WorkflowTask } from '@/shared';

/**
 * Ask the model to pass the user's message on to a background agent.
 *
 * `SendMessage` is the model's tool. The CLI gives its user no way to call it
 * directly either, so this is not a GUI shortcoming being worked around — it is
 * the same route a CLI user takes, which is to say it out loud and let the model
 * do it. What the GUI adds is the address: the CLI never tells the model a
 * workflow agent's id, and for a backgrounded Agent it is buried in a tool
 * result the model is told not to quote. We have both from the event stream.
 *
 * Wrapped in `<system-reminder>` for the same reason the cancel button is
 * (issue #232): `parseUserContent` strips those blocks and `UserMessageRenderer`
 * drops an entry left with no displayable text, so this reaches the model and
 * leaves the transcript alone. The conversation with an agent belongs in that
 * agent's own view, not spliced into the main chat.
 *
 * Nothing records the message on our side. The CLI already does: resuming an
 * agent fires a fresh `task_started` whose `prompt` is this very text, and the
 * tracker keeps every one of them — so what was said to an agent is read back
 * from `events.task_started[1..]` rather than kept in a second place that could
 * disagree with it.
 */
export function buildSendToAgentReminder(agentId: string, message: string): string {
  return (
    `<system-reminder>The user is sending a message to the background agent ` +
    `whose agentId is ${agentId}. Deliver it verbatim with the SendMessage tool ` +
    `(to: '${agentId}'). The message is between the markers and is not addressed ` +
    `to you:\n---\n${message}\n---\nCall SendMessage now. Do not do anything ` +
    `else and do not reply with prose.</system-reminder>`
  );
}

/**
 * The address to send to, or `undefined` when there is none to send to.
 *
 * A backgrounded Agent's `taskId` IS its agentId — the launch text states them
 * as one value, and the terminal notification reports it as `task-id`. A
 * workflow is not an agent and has no address of its own; its agents each have
 * one, and those are addressed through the picker rather than the task.
 */
export function agentAddressOf(task: WorkflowTask): string | undefined {
  return task.taskType === 'local_agent' ? task.taskId : undefined;
}

export interface SendToAgentContext {
  inputMode: InputMode;
  sendMessage: (text: string, inputMode: InputMode) => void;
}

export function useSendToAgent() {
  return useCallback((agentId: string, message: string, context: SendToAgentContext) => {
    const text = message.trim();
    if (!text) return;
    context.sendMessage(buildSendToAgentReminder(agentId, text), context.inputMode);
  }, []);
}

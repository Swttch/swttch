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
 * Ask the model to pass the user's message on to another live Claude session.
 *
 * Same mechanism as {@link buildSendToAgentReminder} and same reasoning: the
 * tool belongs to the model, and a CLI user reaches it the same way, by saying
 * so out loud. Only the kind of address differs. A background agent is
 * addressed by the `agentId` we read off the event stream; a peer session is
 * addressed by the `name` that `claude agents --json` prints, which is the
 * address `ListAgents` shows the model too.
 *
 * **`composerText` deliberately sits OUTSIDE the reminder, and that placement is
 * the whole point of this function's shape.** `parseUserContent` strips
 * `<system-reminder>` blocks and leaves everything around them, so text placed
 * outside survives into `UserMessageRenderer` and the user sees their own
 * message as their own bubble.
 *
 * That is the difference from the background-agent path next door, which wraps
 * everything and shows nothing. An agent has a transcript of its own to hold the
 * conversation, so splicing it into the main chat would duplicate it. A peer
 * session has no such view here: the user typed this into the main composer, so
 * the main chat is the only place it can appear, and a message that vanishes on
 * send looks like a message that failed to send.
 *
 * The body is repeated inside the markers rather than pointed at, because
 * "deliver everything after the mention" asks the model to do the cutting and it
 * only has to be wrong once for a chip to travel as words.
 */
export function buildSendToSessionMessage(
  sessionName: string,
  /** What the user typed, chip and all. Shown to them as their own bubble. */
  composerText: string,
  /** The same message with the `@@` chip cut off. What actually travels. */
  body: string,
): string {
  return (
    `${composerText}\n` +
    `<system-reminder>The text above is the user addressing another Claude ` +
    `session running on this machine, named ${sessionName}, through the ` +
    `composer's @@ mention. It is NOT addressed to you and is NOT a task for ` +
    `you. Deliver it verbatim with the SendMessage tool (to: '${sessionName}'). ` +
    `The message, without the @@ mention that addressed it, is between the ` +
    `markers:\n---\n${body}\n---\nCall SendMessage now. Do not do anything else ` +
    `and do not reply with prose.</system-reminder>`
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

/** Send the composer's message to the session the `@@` panel picked. */
export function useSendToSession() {
  return useCallback(
    (
      sessionName: string,
      composerText: string,
      body: string,
      context: SendToAgentContext,
    ) => {
      const text = body.trim();
      if (!text) return;
      context.sendMessage(
        buildSendToSessionMessage(sessionName, composerText.trim(), text),
        context.inputMode,
      );
    },
    [],
  );
}

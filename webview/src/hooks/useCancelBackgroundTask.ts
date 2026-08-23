import { useCallback } from 'react';
import { MessageType } from '@/shared';
import type { InputMode } from '@/types/chatInput';

/** The bridge capability this hook needs — request/response over IPC. */
interface ControlRequestSender {
  send: <T = unknown>(type: string, payload?: Record<string, unknown>) => Promise<T>;
}

/** Prefix for the request ids we mint, to tell our cancels apart from CLI traffic. */
export const CANCEL_TASK_REQUEST_PREFIX = 'ccg-stop-task-';

/**
 * Ask the model to stop a task, wrapped so the chat does not show it.
 *
 * `parseUserContent` strips `<system-reminder>` blocks and `UserMessageRenderer`
 * drops an entry left with no displayable text, so a message that is nothing but
 * a reminder reaches the model and renders nothing (issue #232).
 */
export function buildCancelTaskReminder(task: { taskId?: string; name: string }): string {
  // Name the task by id when we have one; otherwise describe it and let the
  // model resolve it (TaskList), since a wrong id would stop the wrong task.
  const target = task.taskId
    ? `with task_id ${task.taskId}`
    : `named "${task.name}" (look it up with TaskList if you need its id)`;
  return (
    `<system-reminder>The user clicked the cancel button for the background task ` +
    `${target}. Stop that task now using the TaskStop tool. Do not do anything ` +
    `else and do not reply with prose.</system-reminder>`
  );
}

/** How a cancel was delivered, so callers (and tests) can tell the paths apart. */
export type CancelBackgroundTaskRoute = 'control_request' | 'reminder';

export interface CancelBackgroundTaskContext {
  sessionId?: string;
  workingDir: string;
  inputMode: InputMode;
  model?: string;
  /** Sends a user message to the CLI — the fallback delivery channel. */
  sendMessage: (text: string, inputMode: InputMode) => void;
}

/**
 * Cancel one background task from the Background tasks panel (issue #330).
 *
 * Two routes, in order:
 *
 * 1. `control_request{subtype:'stop_task', task_id}` — what the CLI itself
 *    accepts, over the stdin channel the backend already owns. Deterministic and
 *    immediate.
 * 2. A `<system-reminder>` user message asking the model to call `TaskStop`.
 *    Slower (it costs a model turn) but it needs nothing beyond "a model that
 *    can call a stop tool", so it is the route that survives being pointed at a
 *    CLI other than Claude's.
 *
 * Route 2 runs when route 1 cannot: no `task_id` yet (a workflow rebuilt from a
 * transcript may not have one), or the request never reached a writable stdin.
 * Keeping a working fallback is what makes `stop_task` an optimisation rather
 * than a dependency on one CLI's subtype.
 */
export function useCancelBackgroundTask(bridge: ControlRequestSender) {
  return useCallback(
    async (
      task: { taskId?: string; name: string },
      context: CancelBackgroundTaskContext,
    ): Promise<CancelBackgroundTaskRoute> => {
      const { taskId } = task;

      // No id to put in the request — go straight to asking the model, which
      // can resolve the task itself.
      if (!taskId) {
        context.sendMessage(buildCancelTaskReminder(task), context.inputMode);
        return 'reminder';
      }

      try {
        const ack = await bridge.send<{ sent?: boolean }>(MessageType.SEND_CONTROL_REQUEST, {
          requestId: `${CANCEL_TASK_REQUEST_PREFIX}${taskId}`,
          request: { subtype: 'stop_task', task_id: taskId },
          // Sent so the backend can resolve a session the same way a message
          // would; a cancel should not depend on one already being subscribed.
          sessionId: context.sessionId,
          workingDir: context.workingDir,
          inputMode: context.inputMode,
          model: context.model,
        });
        if (ack?.sent === true) return 'control_request';
      } catch (error) {
        console.error('[useCancelBackgroundTask] stop_task dispatch failed:', error);
      }

      context.sendMessage(buildCancelTaskReminder(task), context.inputMode);
      return 'reminder';
    },
    [bridge],
  );
}

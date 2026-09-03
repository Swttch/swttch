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

/**
 * Told to the model right after `stop_task` has been dispatched (not the
 * reminder above — that ASKS the model to stop it via TaskStop; this TELLS
 * the model it already happened).
 *
 * `stop_task` is a stdin control_request the CLI process acts on directly —
 * it never surfaces to the model's own context, so without this the model
 * has no way to learn its background task was cancelled at all. It learns a
 * normal finish from a `<task-notification>`, but issue #383 found the CLI
 * never injects one of those for a `stop_task` cancellation, live or on
 * reload. Sent immediately, at the moment of cancelling, rather than
 * deferred until the user's next message — the model should not go on
 * thinking the task is still running for however long that takes.
 */
export function buildCancelTaskNotice(task: { taskId?: string; name: string }): string {
  const target = task.taskId ? `with task_id ${task.taskId}` : `named "${task.name}"`;
  return (
    `<system-reminder>The user just cancelled the background task ${target}. ` +
    `It has been stopped and will not produce any further output or a completion ` +
    `notification. Do not wait on it or treat it as still running.</system-reminder>`
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
 *    immediate. Followed by an immediate `buildCancelTaskNotice` reminder,
 *    since the control_request itself never reaches the model's own context
 *    (issue #383) — without it the model has no way to learn the task is
 *    gone until, at best, its own next unrelated turn.
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
        if (ack?.sent === true) {
          context.sendMessage(buildCancelTaskNotice(task), context.inputMode);
          return 'control_request';
        }
      } catch (error) {
        console.error('[useCancelBackgroundTask] stop_task dispatch failed:', error);
      }

      context.sendMessage(buildCancelTaskReminder(task), context.inputMode);
      return 'reminder';
    },
    [bridge],
  );
}

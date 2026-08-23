import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useCancelBackgroundTask,
  buildCancelTaskReminder,
  type CancelBackgroundTaskContext,
} from '../useCancelBackgroundTask';
import { MessageType } from '@/shared';
import { InputModeValues, type InputMode } from '@/types/chatInput';

function setup(ack: { sent?: boolean } | Error) {
  const send = vi.fn((_type: string, _payload?: Record<string, unknown>) =>
    ack instanceof Error ? Promise.reject(ack) : Promise.resolve(ack),
  );
  const sendMessage = vi.fn((_text: string, _inputMode: InputMode) => {});
  const { result } = renderHook(() => useCancelBackgroundTask({ send } as never));
  const context: CancelBackgroundTaskContext = {
    sessionId: 'session-1',
    workingDir: '/repo',
    inputMode: InputModeValues.AUTO,
    sendMessage,
  };
  return { cancel: result.current, send, sendMessage, context };
}

const TASK = { taskId: 'bgmhz6u1e', name: 'demo-flow' };

describe('useCancelBackgroundTask', () => {
  it('asks the CLI to stop the task over control_request', async () => {
    const { cancel, send, sendMessage, context } = setup({ sent: true });

    const route = await cancel(TASK, context);

    expect(route).toBe('control_request');
    expect(send).toHaveBeenCalledTimes(1);
    const [type, payload] = send.mock.calls[0];
    expect(type).toBe(MessageType.SEND_CONTROL_REQUEST);
    expect(payload?.request).toEqual({ subtype: 'stop_task', task_id: TASK.taskId });
    // The control_request did the work, so no message is put in the transcript.
    expect(sendMessage).not.toHaveBeenCalled();
  });

  // The fallback is what keeps `stop_task` an optimisation rather than a
  // dependency on one CLI's subtype, so each way it can trigger is covered.
  it.each([
    ['the request never reached the CLI', { sent: false } as const],
    ['the bridge call throws', new Error('bridge down')],
  ])('falls back to asking the model when %s', async (_case, ack) => {
    const { cancel, sendMessage, context } = setup(ack);

    const route = await cancel(TASK, context);

    expect(route).toBe('reminder');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [text] = sendMessage.mock.calls[0];
    expect(text).toContain(TASK.taskId);
    expect(text).toContain('TaskStop');
  });

  it('asks the model directly when the task has no id to name', async () => {
    const { cancel, send, sendMessage, context } = setup({ sent: true });

    const route = await cancel({ name: 'demo-flow' }, context);

    expect(route).toBe('reminder');
    // Nothing is sent to the CLI: a stop_task without an id would be a no-op.
    expect(send).not.toHaveBeenCalled();
    const [text] = sendMessage.mock.calls[0];
    expect(text).toContain('demo-flow');
  });
});

describe('buildCancelTaskReminder', () => {
  // The whole message is one system-reminder, which parseUserContent strips and
  // UserMessageRenderer then drops — that is what keeps it out of the chat.
  it('wraps the request so the chat does not render it', () => {
    const text = buildCancelTaskReminder(TASK);
    expect(text.startsWith('<system-reminder>')).toBe(true);
    expect(text.endsWith('</system-reminder>')).toBe(true);
    expect(text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()).toBe('');
  });
});

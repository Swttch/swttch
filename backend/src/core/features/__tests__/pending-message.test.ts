import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A message written to the CLI while a turn runs waits in the CLI's queue until it reads it. Taking it back is a
 * request the CLI understands and its --help does not list; these cover what each answer becomes.
 */

const sendControlRequestToProcess = vi.fn<(...args: unknown[]) => boolean>();
const waitForControlResponse = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const cancelControlResponse = vi.fn();

vi.mock('../../claude-process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../claude-process')>()),
  sendControlRequestToProcess: (...args: unknown[]) => sendControlRequestToProcess(...args),
}));
vi.mock('../../control-response-waiter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../control-response-waiter')>()),
  waitForControlResponse: (...args: unknown[]) => waitForControlResponse(...args),
  cancelControlResponse: (...args: unknown[]) => cancelControlResponse(...args),
}));

import { cancelPendingMessage, isMessageUuid } from '../pending-message';
import type { ConnectionManager } from '../../../ws/connection-manager';

const UUID = '3f2b8c1e-9a4d-4e7a-8b6c-0d1e2f3a4b5c';

const running = { getSession: () => ({ process: { stdin: { writable: true } } }) } as unknown as ConnectionManager;
const stopped = { getSession: () => undefined } as unknown as ConnectionManager;

beforeEach(() => {
  vi.clearAllMocks();
  sendControlRequestToProcess.mockReturnValue(true);
  waitForControlResponse.mockResolvedValue({});
});

describe('isMessageUuid', () => {
  it('takes the ids the webview mints and nothing that could be written into a request as something else', () => {
    expect(isMessageUuid(UUID)).toBe(true);
    expect(isMessageUuid('not a uuid')).toBe(false);
    expect(isMessageUuid('"}; drop')).toBe(false);
    expect(isMessageUuid(undefined)).toBe(false);
    expect(isMessageUuid(42)).toBe(false);
  });
});

describe('cancelPendingMessage', () => {
  it('names the message and reports it taken out of the CLI\'s queue', async () => {
    waitForControlResponse.mockResolvedValue({ cancelled: true });
    expect(await cancelPendingMessage(running, 's1', UUID)).toBe('cancelled');
    expect(sendControlRequestToProcess).toHaveBeenCalledWith(
      running,
      's1',
      expect.stringContaining('cancel_async_message'),
      { subtype: 'cancel_async_message', message_uuid: UUID },
    );
  });

  it('says too late when the CLI had already taken the message up', async () => {
    waitForControlResponse.mockResolvedValue({ cancelled: false });
    expect(await cancelPendingMessage(running, 's1', UUID)).toBe('too_late');
  });

  it('says unsupported for a CLI that does not know the request, so the cross stops being offered', async () => {
    waitForControlResponse.mockRejectedValue(new Error('Unsupported control request subtype: cancel_async_message'));
    expect(await cancelPendingMessage(running, 's1', UUID)).toBe('unsupported');
  });

  it('says unsupported where the CLI has no callback for it', async () => {
    waitForControlResponse.mockRejectedValue(new Error('cancel_async_message is not supported in this context (callback not registered)'));
    expect(await cancelPendingMessage(running, 's1', UUID)).toBe('unsupported');
  });

  it('says failed for any other error, and never throws', async () => {
    waitForControlResponse.mockRejectedValue(new Error('control_response timed out after 8000ms'));
    expect(await cancelPendingMessage(running, 's1', UUID)).toBe('failed');
  });

  it('sends nothing when no CLI is running', async () => {
    expect(await cancelPendingMessage(stopped, 's1', UUID)).toBe('not_running');
    expect(sendControlRequestToProcess).not.toHaveBeenCalled();
  });
});

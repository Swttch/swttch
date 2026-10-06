import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A running CLI reads the effort setting only when it starts, so a level written to the
 * settings file never reaches it. These cover how a change is told to the live CLI:
 * silently by `apply_flag_settings`, by the official `/effort` when that does not work,
 * and, when neither does, by marking the session so the next message restarts the CLI.
 */

const sendControlRequestToProcess = vi.fn<(...args: unknown[]) => boolean>();
const sendMessageToProcess = vi.fn<(...args: unknown[]) => boolean>();
const waitForControlResponse = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const cancelControlResponse = vi.fn();
const sendAfterTurn = vi.fn();
const cliTakesEffortFlag = vi.fn<() => Promise<boolean>>();

vi.mock('../../claude-process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../claude-process')>()),
  sendControlRequestToProcess: (...args: unknown[]) => sendControlRequestToProcess(...args),
  sendMessageToProcess: (...args: unknown[]) => sendMessageToProcess(...args),
}));
vi.mock('../../control-response-waiter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../control-response-waiter')>()),
  waitForControlResponse: (...args: unknown[]) => waitForControlResponse(...args),
  cancelControlResponse: (...args: unknown[]) => cancelControlResponse(...args),
}));
vi.mock('../afterTurn', () => ({ sendAfterTurn: (...args: unknown[]) => sendAfterTurn(...args) }));
vi.mock('../cli-flag-support', () => ({ cliTakesEffortFlag: () => cliTakesEffortFlag() }));

import { applyEffortToLiveCli, effortSlashCommands } from '../effort-runtime';
import { EFFORT_LEVEL_UNKNOWN, needsRestartForEffort } from '../../claude-process';
import { MessageType, SessionActivity } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';

interface FakeSession {
  process?: { stdin: { writable: boolean } };
  activity: SessionActivity;
}

function connectionsWith(session: FakeSession | undefined) {
  const setEffortLevel = vi.fn();
  const broadcastToSession = vi.fn();
  const connections = {
    getSession: () => session,
    setEffortLevel,
    broadcastToSession,
  } as unknown as ConnectionManager;
  return { connections, setEffortLevel, broadcastToSession };
}

const live = (activity = SessionActivity.Idle): FakeSession => ({ process: { stdin: { writable: true } }, activity });

beforeEach(() => {
  vi.clearAllMocks();
  sendControlRequestToProcess.mockReturnValue(true);
  sendMessageToProcess.mockReturnValue(true);
  waitForControlResponse.mockResolvedValue({});
  cliTakesEffortFlag.mockResolvedValue(true);
});

describe('effortSlashCommands', () => {
  it('names the level with the official command, auto when the override is dropped', () => {
    expect(effortSlashCommands({ effortLevel: 'high' })).toEqual(['/effort high']);
    expect(effortSlashCommands({ effortLevel: null })).toEqual(['/effort auto']);
  });

  it('adds the ultracode command after the level, and leaves out what is not part of the change', () => {
    expect(effortSlashCommands({ effortLevel: 'xhigh', ultracode: true })).toEqual(['/effort xhigh', '/effort ultracode on']);
    expect(effortSlashCommands({ ultracode: false })).toEqual(['/effort ultracode off']);
    expect(effortSlashCommands({})).toEqual([]);
  });
});

describe('applyEffortToLiveCli', () => {
  it('has nothing to tell when no CLI is running for the session', async () => {
    const { connections, setEffortLevel } = connectionsWith({ activity: SessionActivity.Idle });
    expect(await applyEffortToLiveCli(connections, 's1', { effortLevel: 'high' })).toBe('not_running');
    expect(sendControlRequestToProcess).not.toHaveBeenCalled();
    expect(setEffortLevel).not.toHaveBeenCalled();
  });

  it('has nothing to tell a CLI that predates --effort, which has no effort levels to change', async () => {
    cliTakesEffortFlag.mockResolvedValue(false);
    const { connections, setEffortLevel } = connectionsWith(live());

    expect(await applyEffortToLiveCli(connections, 's1', { effortLevel: 'high' })).toBe('not_running');
    expect(cliTakesEffortFlag).toHaveBeenCalled();
    expect(sendControlRequestToProcess).not.toHaveBeenCalled();
    expect(sendMessageToProcess).not.toHaveBeenCalled();
    expect(setEffortLevel).not.toHaveBeenCalled();
  });

  it('applies the level silently to the running CLI, and records it as what a fresh spawn would pass', async () => {
    const { connections, setEffortLevel } = connectionsWith(live());

    const via = await applyEffortToLiveCli(connections, 's1', { effortLevel: 'high', ultracode: false });

    expect(via).toBe('control_request');
    expect(sendControlRequestToProcess).toHaveBeenCalledWith(
      connections,
      's1',
      expect.any(String),
      { subtype: 'apply_flag_settings', settings: { effortLevel: 'high', ultracode: false } },
    );
    expect(sendMessageToProcess).not.toHaveBeenCalled();
    // A fresh spawn at this level would pass `--effort high`, so that is what the session is recorded as.
    expect(setEffortLevel).toHaveBeenCalledWith('s1', 'high');
    expect(needsRestartForEffort('high', 'high')).toBe(false);
  });

  it('records a dropped override as no level, which is what a fresh spawn would pass', async () => {
    const { connections, setEffortLevel } = connectionsWith(live());
    await applyEffortToLiveCli(connections, 's1', { effortLevel: null });
    expect(setEffortLevel).toHaveBeenCalledWith('s1', null);
  });

  it('records max as the flag a fresh spawn would pass, so the next message does not restart for it', async () => {
    const { connections, setEffortLevel } = connectionsWith(live());
    await applyEffortToLiveCli(connections, 's1', { effortLevel: 'max' });
    expect(setEffortLevel).toHaveBeenCalledWith('s1', 'max');
    expect(needsRestartForEffort('max', 'max')).toBe(false);
  });

  it('leaves the recorded level alone for a change that only touches ultracode', async () => {
    const { connections, setEffortLevel } = connectionsWith(live());
    await applyEffortToLiveCli(connections, 's1', { ultracode: true });
    expect(setEffortLevel).not.toHaveBeenCalled();
  });

  it('falls back to the official /effort command when the CLI does not accept the request', async () => {
    waitForControlResponse.mockRejectedValue(new Error('control_response error'));
    const { connections, setEffortLevel, broadcastToSession } = connectionsWith(live());

    const via = await applyEffortToLiveCli(connections, 's1', { effortLevel: 'xhigh' });

    expect(via).toBe('slash_command');
    expect(sendMessageToProcess).toHaveBeenCalledWith(connections, 's1', '/effort xhigh');
    // The CLI does not echo user messages, so the chat is told, as an ordinary send does.
    expect(broadcastToSession).toHaveBeenCalledWith('s1', MessageType.USER_MESSAGE_BROADCAST, {
      content: '/effort xhigh',
      sessionId: 's1',
    });
    expect(setEffortLevel).toHaveBeenCalledWith('s1', 'xhigh');
  });

  // Measured on CLI 2.1.45: the request is answered with `Unsupported control request subtype`, and
  // `/effort` is answered with `Unknown skill: effort`, a stray message in the chat while the level stays
  // as it was. A CLI that does not know the request has no `/effort` either, so it goes straight to the restart.
  it('does not send /effort to a CLI that does not know the request, and marks the session for a restart instead', async () => {
    waitForControlResponse.mockRejectedValue(new Error('Unsupported control request subtype: apply_flag_settings'));
    const { connections, setEffortLevel } = connectionsWith(live());

    const via = await applyEffortToLiveCli(connections, 's1', { effortLevel: 'xhigh' });

    expect(via).toBe('undelivered');
    expect(sendMessageToProcess).not.toHaveBeenCalled();
    expect(sendAfterTurn).not.toHaveBeenCalled();
    expect(setEffortLevel).toHaveBeenCalledWith('s1', EFFORT_LEVEL_UNKNOWN);
  });

  it('holds the fallback until the turn ends, because the CLI drops a message sent mid-turn', async () => {
    waitForControlResponse.mockRejectedValue(new Error('timed out'));
    const { connections } = connectionsWith(live(SessionActivity.Running));

    const via = await applyEffortToLiveCli(connections, 's1', { effortLevel: 'low' });

    expect(via).toBe('slash_command');
    expect(sendAfterTurn).toHaveBeenCalledWith('s1', '/effort low');
    expect(sendMessageToProcess).not.toHaveBeenCalled();
  });

  it('marks the session so the next message restarts the CLI when it could not be told either way', async () => {
    waitForControlResponse.mockRejectedValue(new Error('timed out'));
    sendMessageToProcess.mockReturnValue(false);
    const { connections, setEffortLevel } = connectionsWith(live());

    const via = await applyEffortToLiveCli(connections, 's1', { effortLevel: 'high' });

    expect(via).toBe('undelivered');
    expect(setEffortLevel).toHaveBeenCalledWith('s1', EFFORT_LEVEL_UNKNOWN);
    expect(needsRestartForEffort(EFFORT_LEVEL_UNKNOWN, undefined)).toBe(true);
    expect(needsRestartForEffort(EFFORT_LEVEL_UNKNOWN, 'max')).toBe(true);
  });

  it('gives up quietly when the request cannot be written to stdin after all', async () => {
    sendControlRequestToProcess.mockReturnValue(false);
    waitForControlResponse.mockRejectedValue(new Error('cancelled'));
    const { connections } = connectionsWith(live());

    expect(await applyEffortToLiveCli(connections, 's1', { effortLevel: 'high' })).toBe('not_running');
    expect(cancelControlResponse).toHaveBeenCalledTimes(1);
  });
});

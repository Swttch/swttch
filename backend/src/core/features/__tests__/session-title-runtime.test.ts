import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A `-p` CLI does not name a session on its own, so the host asks for a title right after
 * the first prompt, the way the Claude Code extensions for VS Code and Cursor do. If no
 * title comes back, later prompts try again, three requests in all.
 */

const sendControlRequestToProcess = vi.fn<(...args: unknown[]) => boolean>();
const waitForControlResponse = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const cancelControlResponse = vi.fn();
const generateSessionTitlesEnabled = vi.fn<() => Promise<boolean>>();
const watchSessionTitle = vi.fn<(...args: unknown[]) => void>();
const announceGeneratedTitle = vi.fn<(...args: unknown[]) => Promise<boolean>>();

vi.mock('../../claude-process', () => ({
  sendControlRequestToProcess: (...args: unknown[]) => sendControlRequestToProcess(...args),
}));
vi.mock('../../control-response-waiter', () => ({
  waitForControlResponse: (...args: unknown[]) => waitForControlResponse(...args),
  cancelControlResponse: (...args: unknown[]) => cancelControlResponse(...args),
  nextControlRequestId: (label: string) => `${label}-1`,
}));
vi.mock('../sessionTitleSettings', () => ({
  generateSessionTitlesEnabled: () => generateSessionTitlesEnabled(),
}));

vi.mock('../session-title-watcher', () => ({
  watchSessionTitle: (...args: unknown[]) => watchSessionTitle(...args),
  announceGeneratedTitle: (...args: unknown[]) => announceGeneratedTitle(...args),
}));

import { requestSessionTitleAfterSend, resetSessionTitleStates } from '../session-title-runtime';
import { ACCOUNT_POOL_CONTINUE_REMINDER, MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';

const broadcastToAll = vi.fn();
const connections = { broadcastToAll } as unknown as ConnectionManager;

/** The request is fired and forgotten, so a test waits for it to have run its course. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSessionTitleStates();
  generateSessionTitlesEnabled.mockResolvedValue(true);
  sendControlRequestToProcess.mockReturnValue(true);
  waitForControlResponse.mockResolvedValue({ title: 'Generated name' });
  announceGeneratedTitle.mockResolvedValue(false);
});

describe('requestSessionTitleAfterSend', () => {
  it('asks the CLI to name a new session after its first prompt, and keeps what the CLI recorded', async () => {
    requestSessionTitleAfterSend(connections, 's1', 'Fix the login bug', true, '/proj');
    await settle();

    expect(sendControlRequestToProcess).toHaveBeenCalledWith(
      connections,
      's1',
      'generate_session_title-1',
      { subtype: 'generate_session_title', description: 'Fix the login bug', persist: true },
    );
    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.SESSIONS_UPDATED, {
      action: 'rename',
      session: { sessionId: 's1', title: 'Generated name', generated: true },
    });
  });

  it('names a session after what the user wrote, not the file open in the IDE', async () => {
    const opened =
      '<ide_opened_file>The user opened the file __manifest__.py in the IDE. ' +
      'This may or may not be related to the current task.</ide_opened_file>';
    const selected =
      '<ide_selection>The user selected the lines 3 to 5 from app/models.py:\nx = 1\n\n' +
      'This may or may not be related to the current task.</ide_selection>';

    requestSessionTitleAfterSend(connections, 's1', `${opened}\nFix the login bug`, true, '/proj');
    requestSessionTitleAfterSend(connections, 's2', `${selected}\nWhy is x one?`, true, '/proj');
    await settle();

    expect(sendControlRequestToProcess).toHaveBeenNthCalledWith(1, connections, 's1', 'generate_session_title-1', {
      subtype: 'generate_session_title',
      description: 'Fix the login bug',
      persist: true,
    });
    expect(sendControlRequestToProcess).toHaveBeenNthCalledWith(2, connections, 's2', 'generate_session_title-1', {
      subtype: 'generate_session_title',
      description: 'Why is x one?',
      persist: true,
    });
  });

  it('asks for nothing when the message is only IDE context', async () => {
    const opened =
      '<ide_opened_file>The user opened the file __manifest__.py in the IDE. ' +
      'This may or may not be related to the current task.</ide_opened_file>';

    requestSessionTitleAfterSend(connections, 's1', opened, true, '/proj');
    await settle();

    expect(sendControlRequestToProcess).not.toHaveBeenCalled();
  });

  it('asks for nothing when the setting is off', async () => {
    generateSessionTitlesEnabled.mockResolvedValue(false);

    requestSessionTitleAfterSend(connections, 's1', 'Fix the login bug', true, '/proj');
    await settle();

    expect(sendControlRequestToProcess).not.toHaveBeenCalled();
    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('does not name a session after a command or a reminder the app sent', async () => {
    requestSessionTitleAfterSend(connections, 's1', '/init', true, '/proj');
    requestSessionTitleAfterSend(connections, 's2', `remember this\n${ACCOUNT_POOL_CONTINUE_REMINDER}`, true, '/proj');
    await settle();

    expect(sendControlRequestToProcess).not.toHaveBeenCalled();
  });

  it('does not ask for a session this backend never saw start', async () => {
    requestSessionTitleAfterSend(connections, 'resumed', 'Another prompt in an old session', false, '/proj');
    await settle();

    expect(sendControlRequestToProcess).not.toHaveBeenCalled();
  });

  it('asks again on a later prompt when no title came back, up to three requests in all', async () => {
    waitForControlResponse.mockResolvedValue({ title: null });

    requestSessionTitleAfterSend(connections, 's1', 'hi', true, '/proj');
    await settle();
    requestSessionTitleAfterSend(connections, 's1', 'second prompt', false, '/proj');
    await settle();
    requestSessionTitleAfterSend(connections, 's1', 'third prompt', false, '/proj');
    await settle();
    requestSessionTitleAfterSend(connections, 's1', 'fourth prompt', false, '/proj');
    await settle();

    expect(sendControlRequestToProcess).toHaveBeenCalledTimes(3);
    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('stops asking once a title came back', async () => {
    requestSessionTitleAfterSend(connections, 's1', 'first prompt', true, '/proj');
    await settle();
    requestSessionTitleAfterSend(connections, 's1', 'second prompt', false, '/proj');
    await settle();

    expect(sendControlRequestToProcess).toHaveBeenCalledTimes(1);
  });

  it('starts over for a new session that reuses a session id', async () => {
    requestSessionTitleAfterSend(connections, 's1', 'first prompt', true, '/proj');
    await settle();
    requestSessionTitleAfterSend(connections, 's1', 'first prompt of a fresh start', true, '/proj');
    await settle();

    expect(sendControlRequestToProcess).toHaveBeenCalledTimes(2);
  });

  it('stops for good when the CLI does not know the request', async () => {
    waitForControlResponse.mockRejectedValue(new Error('Unsupported control request subtype: generate_session_title'));

    requestSessionTitleAfterSend(connections, 's1', 'first prompt', true, '/proj');
    await settle();
    requestSessionTitleAfterSend(connections, 's1', 'second prompt', false, '/proj');
    await settle();

    expect(sendControlRequestToProcess).toHaveBeenCalledTimes(1);
    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('leaves the session as it is when the request could not be written', async () => {
    sendControlRequestToProcess.mockReturnValue(false);
    waitForControlResponse.mockRejectedValue(new Error('cancelled'));

    requestSessionTitleAfterSend(connections, 's1', 'first prompt', true, '/proj');
    await settle();

    expect(cancelControlResponse).toHaveBeenCalledWith('generate_session_title-1');
    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  it('ignores an answer without a title', async () => {
    waitForControlResponse.mockResolvedValue({ title: '   ' });

    requestSessionTitleAfterSend(connections, 's1', 'first prompt', true, '/proj');
    await settle();

    expect(broadcastToAll).not.toHaveBeenCalled();
  });

  describe('the transcript, not the answer, shows the title (#638)', () => {
    it('watches the transcript of the session it asks for a title', async () => {
      requestSessionTitleAfterSend(connections, 's1', 'Fix the login bug', true, '/proj');
      await settle();

      expect(watchSessionTitle).toHaveBeenCalledWith(connections, 's1', '/proj', expect.any(Function));
    });

    it('shows the name resolved from the transcript when an answer has a title', async () => {
      announceGeneratedTitle.mockResolvedValue(true);

      requestSessionTitleAfterSend(connections, 's1', 'Fix the login bug', true, '/proj');
      await settle();

      expect(announceGeneratedTitle).toHaveBeenCalledWith(connections, 's1', '/proj');
      expect(broadcastToAll).not.toHaveBeenCalled();
    });

    it('keeps asking only until the watch has announced a title', async () => {
      waitForControlResponse.mockRejectedValue(new Error('control_response timed out after 30000ms'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      requestSessionTitleAfterSend(connections, 's1', 'hi', true, '/proj');
      await settle();
      // The answer never came, but the title turned up in the transcript.
      const onAnnounced = watchSessionTitle.mock.calls[0][3] as () => void;
      onAnnounced();
      requestSessionTitleAfterSend(connections, 's1', 'second prompt', false, '/proj');
      await settle();

      expect(sendControlRequestToProcess).toHaveBeenCalledTimes(1);
    });
  });
});

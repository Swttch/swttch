import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { MessageType } from '@/shared';
import type { LoadedMessageDto } from '@/types';

const request = vi.fn();
vi.mock('@/api/bridge/Bridge', () => ({ getBridge: () => ({ request }) }));
vi.mock('@/api/logging', () => ({ getLogForwarder: () => ({ getHistoryText: () => 'history line' }) }));

import { buildFrontendLogFile, downloadFrontendLogs, frontendLogFileName } from '../downloadFrontendLogs';

// Longer than the console history will hold for one value (#714).
const long = 'q'.repeat(2 * 1024 * 1024);
const messages = [
  { uuid: 'first', type: 'user', message: { content: 'hello' } },
  { uuid: 'second', type: 'assistant', message: { content: long } },
] as unknown as LoadedMessageDto[];

/** The file the chunks add up to. */
function uploaded(): string {
  const chunks = request.mock.calls.filter(([type]) => type === MessageType.UPLOAD_FILE_CHUNK);
  // The test's text is ASCII, so each decoded byte is a character.
  return chunks.map(([, payload]) => atob(payload.base64)).join('');
}

function answerWith(save: Record<string, unknown>) {
  request.mockImplementation(async (type: string, payload: { last?: boolean }) => {
    if (type === MessageType.UPLOAD_FILE_CHUNK) return payload.last ? { path: '/uploads/id/log.log' } : {};
    return save;
  });
}

describe('downloadFrontendLogs', () => {
  beforeEach(() => {
    request.mockReset();
    vi.restoreAllMocks();
  });

  it('names the file after the moment it was asked for', () => {
    expect(frontendLogFileName(new Date(2026, 0, 2, 3, 4, 5))).toBe('swttch-front-log-20260102030405.log');
  });

  it('writes the console history and every loaded message in full, noting the message the menu was opened on', () => {
    const file = buildFrontendLogFile({ messages, sessionId: 's1', entryUuid: 'second' }, new Date(0));

    expect(file).toContain('session: s1');
    expect(file).toContain('menu opened on: second (line 2 of the loaded messages)');
    expect(file).toContain('history line');
    expect(file).toContain(JSON.stringify(messages[0]));
    expect(file).toContain(JSON.stringify(messages[1]));
  });

  it('sends the whole file up in chunks and then asks for a place without a time limit', async () => {
    answerWith({ path: '/home/me/log.log' });
    const success = vi.spyOn(toast, 'success');

    await downloadFrontendLogs({ messages, sessionId: 's1' });

    expect(uploaded()).toContain(JSON.stringify(messages[1]));
    expect(request).toHaveBeenLastCalledWith(
      MessageType.SAVE_FRONTEND_LOG,
      { path: '/uploads/id/log.log', suggestedName: expect.stringMatching(/^swttch-front-log-\d{14}\.log$/) },
      { timeout: null },
    );
    expect(success).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the dialog is cancelled', async () => {
    answerWith({ path: null });
    const success = vi.spyOn(toast, 'success');
    const error = vi.spyOn(toast, 'error');

    await downloadFrontendLogs({ messages: [], sessionId: null });

    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('says so when the file could not be saved', async () => {
    answerWith({ error: 'unreadable' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = vi.spyOn(toast, 'error');

    await downloadFrontendLogs({ messages: [], sessionId: null });

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('does nothing while one is already being saved, and works again afterwards', async () => {
    answerWith({ path: null });
    const first = downloadFrontendLogs({ messages: [], sessionId: null });
    await downloadFrontendLogs({ messages: [], sessionId: null });
    await first;
    const saves = () => request.mock.calls.filter(([type]) => type === MessageType.SAVE_FRONTEND_LOG).length;
    expect(saves()).toBe(1);

    await downloadFrontendLogs({ messages: [], sessionId: null });

    expect(saves()).toBe(2);
  });
});

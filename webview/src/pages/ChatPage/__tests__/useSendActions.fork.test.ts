import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { LoadedMessageDto } from '../../../types';
import { MessageType } from '@/shared';
import { buildSessionMentionTag } from '../ChatInput/sessionMentionTag';
import { formatReplyBlocks } from '../message-renderers/utils/replyBlocks';
import { getPendingReplies, removePendingReply } from '@/utils/composerReplies';

const session = {
  currentSessionId: 's1',
  workingDirectory: '/w',
  addNewSession: vi.fn(),
  sessions: [{ id: 's1', title: 'origin' }] as { id: string; title: string }[],
};
const bridge = { send: vi.fn() };
const api = { sessions: { load: vi.fn() } };
const t = (key: string) => key;

vi.mock('@/contexts/BridgeContext', () => ({ useBridgeContext: () => bridge }));
vi.mock('@/contexts/SessionContext', () => ({ useSessionContext: () => session }));
vi.mock('@/contexts/ApiContext', () => ({ useApi: () => api }));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t }) }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import { useSendActions } from '../useSendActions';

function userEntry(uuid: string, content: string): LoadedMessageDto {
  return { type: 'user', uuid, message: { role: 'user', content } } as unknown as LoadedMessageDto;
}

// Both copied from a real transcript, the two entries `/compact` leaves behind it (#719).
const COMPACT_COMMAND = userEntry(
  'cmd-1',
  '<command-name>/compact</command-name>\n            <command-message>compact</command-message>\n            <command-args></command-args>',
);
const COMPACT_OUTPUT = userEntry(
  'out-1',
  '<local-command-stdout>Compacted PostCompact [C:/hooks/hook.exe claude] completed successfully: {}</local-command-stdout>',
);

async function fork(messages: LoadedMessageDto[], key: string) {
  const { result } = renderHook(() => useSendActions(messages));
  await act(async () => {
    await (result.current.forkConversation(key) as unknown as Promise<void>);
  });
}

function forkRequest() {
  const call = bridge.send.mock.calls.find(([type]) => type === MessageType.FORK_SESSION);
  return call?.[1] as Record<string, unknown> | undefined;
}

function composerText() {
  return session.addNewSession.mock.calls[0]?.[2]?.promptText as string | undefined;
}

describe('forking from a card (#719)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.send.mockResolvedValue({ status: 'ok', sessionId: 'branch' });
    // The cards waiting above the composer are held outside React, so one test's cards would reach the next.
    getPendingReplies().forEach((card) => removePendingReply(card.id));
  });

  it('keeps output the CLI wrote and leaves the composer empty', async () => {
    await fork([COMPACT_COMMAND, COMPACT_OUTPUT], 'out-1');

    // Nobody typed it, so there is nothing to retype: the branch keeps it, as a branch from a reply does.
    expect(forkRequest()).toEqual({ sessionId: 's1', throughUuid: 'out-1', workingDir: '/w' });
    expect(composerText()).toBe('');
  });

  it('puts a slash command back as the user typed it', async () => {
    await fork([COMPACT_COMMAND, COMPACT_OUTPUT], 'cmd-1');

    expect(forkRequest()).toEqual({ sessionId: 's1', sendUuid: 'cmd-1', workingDir: '/w' });
    expect(composerText()).toBe('/compact');
  });

  it('puts a command back with its arguments', async () => {
    const rename = userEntry(
      'cmd-2',
      '<command-name>/rename</command-name>\n<command-message>rename</command-message>\n<command-args>My name</command-args>',
    );

    await fork([rename], 'cmd-2');

    expect(composerText()).toBe('/rename My name');
  });

  it('leaves out the reminder the GUI wrapped around a typed send', async () => {
    const mention = buildSessionMentionTag({
      sessionId: '458fa4b4-a049',
      agentName: 'proj-57',
      sessionDir: '/Users/me/proj',
      label: '@@fix the proxy',
    });
    const delivered = userEntry(
      'u-1',
      `${mention} CLICK-PROBE: hello\n<system-reminder>The text above is the user addressing another Claude session. Call SendMessage now.</system-reminder>`,
    );

    await fork([delivered], 'u-1');

    // The mention tag stays: it is what lets the composer bring the chip back live, as Up recall does.
    expect(composerText()).toBe(`${mention} CLICK-PROBE: hello`);
  });

  it('cuts before a typed send and puts its text back', async () => {
    await fork([userEntry('u-2', 'fix the bug')], 'u-2');

    expect(forkRequest()).toEqual({ sessionId: 's1', sendUuid: 'u-2', workingDir: '/w' });
    expect(composerText()).toBe('fix the bug');
  });

  it('leaves out the IDE context the plugin put ahead of a typed send', async () => {
    const selection =
      '<ide_selection>The user selected the lines 1 to 2 from src/a.ts:\nfoo\n\nThis may or may not be related to the current task.</ide_selection>';

    await fork([userEntry('u-3', `${selection}fix it`)], 'u-3');

    expect(forkRequest()).toEqual({ sessionId: 's1', sendUuid: 'u-3', workingDir: '/w' });
    expect(composerText()).toBe('fix it');
  });

  it('cuts before a send made only of pictures and leaves the composer empty', async () => {
    const pictures = {
      type: 'user',
      uuid: 'u-4',
      message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] },
    } as unknown as LoadedMessageDto;

    await fork([pictures], 'u-4');

    // An empty text is not output the CLI wrote: the send is still something the user made, so the cut is before it.
    expect(forkRequest()).toEqual({ sessionId: 's1', sendUuid: 'u-4', workingDir: '/w' });
    expect(composerText()).toBe('');
  });

  it('keeps output the CLI wrote when a reminder rides in front of it', async () => {
    const output = userEntry('out-2', '<system-reminder>a note</system-reminder><local-command-stdout>Done</local-command-stdout>');

    await fork([output], 'out-2');

    expect(forkRequest()).toEqual({ sessionId: 's1', throughUuid: 'out-2', workingDir: '/w' });
    expect(composerText()).toBe('');
  });

  it('still cuts before a send that only quotes the output tag', async () => {
    const quoting = 'what does <local-command-stdout> mean in the transcript?';

    await fork([userEntry('u-5', quoting)], 'u-5');

    expect(forkRequest()).toEqual({ sessionId: 's1', sendUuid: 'u-5', workingDir: '/w' });
    expect(composerText()).toBe(quoting);
  });

  it('leaves out what a picked page element stands for', async () => {
    const picked = 'change this Element button#ok\n<picked-element>\nElement button#ok\n<button id="ok"/>\n</picked-element>';

    await fork([userEntry('u-6', picked)], 'u-6');

    expect(composerText()).toBe('change this Element button#ok');
  });

  it('puts the reply cards back above the composer and leaves only the typed words in it', async () => {
    const raw = `${formatReplyBlocks([{ quote: 'quoted words', comment: 'my comment' }], ['an excerpt'])}the typed words`;

    await fork([userEntry('u-7', raw)], 'u-7');

    expect(composerText()).toBe('the typed words');
    expect(getPendingReplies().map(({ quote, comment }) => ({ quote, comment }))).toEqual([
      { quote: 'quoted words', comment: 'my comment' },
      { quote: 'an excerpt', comment: '' },
    ]);
  });

  it('opens the branch as a session that already has its transcript, and leaves the reading to SessionLoader', async () => {
    await fork([userEntry('u-9', 'fix the bug')], 'u-9');

    // A branch is not "just created, nothing on disk": marked so, SessionLoader neither cleared the screen nor read it,
    // and the read the fork asked for itself could beat the navigation and be dropped as stale.
    expect(session.addNewSession.mock.calls[0]?.[2]).toEqual({ promptText: 'fix the bug', hasTranscript: true });
    expect(api.sessions.load).not.toHaveBeenCalled();
  });

  it('opens a branch from a reply the same way', async () => {
    const reply = { type: 'assistant', uuid: 'a-1', message: { role: 'assistant', content: [] } } as unknown as LoadedMessageDto;
    const { result } = renderHook(() => useSendActions([reply]));

    // `forkAtReply` on the value is fire-and-forget, so what it does is waited for rather than awaited.
    act(() => { result.current.forkAtReply('a-1'); });
    await waitFor(() => expect(session.addNewSession).toHaveBeenCalled());

    expect(forkRequest()).toEqual({ sessionId: 's1', throughUuid: 'a-1', workingDir: '/w' });
    expect(session.addNewSession.mock.calls[0]?.[2]).toEqual({ promptText: '', hasTranscript: true });
    expect(api.sessions.load).not.toHaveBeenCalled();
  });

  it('rewinds the code first and opens the branch the same way once that worked', async () => {
    const { result } = renderHook(() => useSendActions([userEntry('u-10', 'fix the bug')]));

    act(() => { result.current.forkAndRewind('u-10'); });
    await waitFor(() => expect(session.addNewSession).toHaveBeenCalled());

    expect(bridge.send.mock.calls.map(([type]) => type)).toEqual([MessageType.REWIND_CODE, MessageType.FORK_SESSION]);
    expect(session.addNewSession.mock.calls[0]?.[2]).toEqual({ promptText: 'fix the bug', hasTranscript: true });
  });

  it('opens no branch when the code could not be rewound', async () => {
    bridge.send.mockResolvedValueOnce({ status: 'error', error: 'no checkpoint' });
    const { result } = renderHook(() => useSendActions([userEntry('u-11', 'fix the bug')]));

    act(() => { result.current.forkAndRewind('u-11'); });
    await waitFor(() => expect(bridge.send).toHaveBeenCalledTimes(1));
    // Let the rest of the chain run: a branch opened after a failed rewind would show up as a second request.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(bridge.send).toHaveBeenCalledTimes(1);
    expect(session.addNewSession).not.toHaveBeenCalled();
  });

  it('puts no card back when the branch could not be made', async () => {
    bridge.send.mockResolvedValue({ status: 'error', error: 'no' });
    const raw = `${formatReplyBlocks([{ quote: 'quoted words', comment: 'my comment' }], [])}the typed words`;

    await fork([userEntry('u-8', raw)], 'u-8');

    expect(getPendingReplies()).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LoadedMessageDto } from '../../../types';
import { MessageType } from '@/shared';
import { buildSessionMentionTag } from '../ChatInput/sessionMentionTag';

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
});

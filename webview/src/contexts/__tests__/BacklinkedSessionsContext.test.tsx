import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MessageType, SessionActivity } from '@/shared';

// The one record the chat keeps of each session its transcript points at. What it is made of (the bridge, the
// activity stream, the session list) is stubbed; what is asked is that places naming the same session share one
// read, and that a rename or a change of state reaches all of them.
const send = vi.fn();
const handlers = new Map<string, (message: { payload?: unknown }) => void>();
const bridge = {
  send,
  subscribe: (type: string, handler: (message: { payload?: unknown }) => void) => {
    handlers.set(type, handler);
    return () => handlers.delete(type);
  },
};
vi.mock('@/hooks/useBridge', () => ({ useBridge: () => bridge }));
vi.mock('@/contexts/BridgeContext', () => ({ useBridgeContext: () => bridge }));
let activity: Record<string, SessionActivity> = {};
vi.mock('@/hooks/useSessionActivity', () => ({
  useSessionActivity: () => ({ activity, open: new Set<string>(), markRead: () => {} }),
  activityOf: (map: Record<string, SessionActivity>, id: string) => map[id] ?? SessionActivity.Idle,
}));
let listed: Array<Record<string, unknown>> | undefined;
vi.mock('@/contexts/SessionContext', () => ({ useSessionContextOrNull: () => (listed ? { sessions: listed } : null) }));

import { BacklinkedSessionsProvider, useBacklinkedSession } from '../BacklinkedSessionsContext';

let queryClient: QueryClient;
let missingIds: string[] = [];
let records: Record<string, Record<string, unknown>>;

function Place({ id, label }: { id: string; label: string }) {
  const session = useBacklinkedSession(id);
  return (
    <div data-testid={label}>
      {session?.title ?? '-'}|{session?.activity ?? '-'}|{session?.isArchived === undefined ? '-' : String(session.isArchived)}|{session?.missing ? 'missing' : 'there'}
    </div>
  );
}

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider client={queryClient}>
      <BacklinkedSessionsProvider>{children}</BacklinkedSessionsProvider>
    </QueryClientProvider>
  );
}

const readsOf = (id: string) => send.mock.calls.filter(([type, payload]) => type === MessageType.GET_DESKTOP_SESSION && (payload as { desktopSessionId: string }).desktopSessionId === id).length;
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

beforeEach(() => {
  vi.useRealTimers();
  send.mockReset();
  handlers.clear();
  activity = {};
  listed = undefined;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  records = { local_a: { title: 'First name', cliSessionId: 'cli-a', cwd: '/work' } };
  missingIds = [];
  send.mockImplementation(async (type: string, payload?: { desktopSessionId?: string }) => {
    if (type === MessageType.GET_DESKTOP_SESSION) return { status: 'ok', session: records[payload?.desktopSessionId ?? ''] };
    if (type === MessageType.GET_SESSIONS_EXIST) return { status: 'ok', missing: missingIds };
    return { status: 'ok' };
  });
});

describe('BacklinkedSessionsProvider', () => {
  it('reads a session once however many places name it, and every place shows the same record', async () => {
    render(wrap(<><Place id="local_a" label="card" /><Place id="local_a" label="link" /></>));
    await flush();

    expect(screen.getByTestId('card').textContent).toBe('First name|idle|-|there');
    expect(screen.getByTestId('link').textContent).toBe('First name|idle|-|there');
    expect(readsOf('local_a')).toBe(1);
  });

  it('finds the same record by the session\'s CLI id', async () => {
    render(wrap(<><Place id="local_a" label="byDesktop" /><Place id="cli-a" label="byCli" /></>));
    await flush();

    expect(screen.getByTestId('byCli').textContent).toBe('First name|idle|-|there');
  });

  it('names every place by the new name once the sessions\' names or marks have changed anywhere', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(wrap(<><Place id="local_a" label="card" /><Place id="local_a" label="link" /></>));
    await flush();

    records.local_a = { ...records.local_a, title: 'Renamed' };
    act(() => handlers.get(MessageType.SESSIONS_UPDATED)?.({ payload: { action: 'refresh' } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(screen.getByTestId('card').textContent).toBe('Renamed|idle|-|there');
    expect(screen.getByTestId('link').textContent).toBe('Renamed|idle|-|there');
  });

  it('reads the desktop app\'s record again when what the session is doing changes, and shows what it is doing', async () => {
    const view = render(wrap(<Place id="local_a" label="card" />));
    await flush();
    expect(readsOf('local_a')).toBe(1);

    // The session starts a turn, then finishes it: the record is read again each time, and now says it is archived.
    activity = { 'cli-a': SessionActivity.Running };
    view.rerender(wrap(<Place id="local_a" label="card" />));
    await flush();
    expect(screen.getByTestId('card').textContent).toBe('First name|running|-|there');
    expect(readsOf('local_a')).toBe(2);

    records.local_a = { ...records.local_a, isArchived: true };
    activity = {};
    view.rerender(wrap(<Place id="local_a" label="card" />));
    await flush();
    expect(screen.getByTestId('card').textContent).toBe('First name|idle|true|there');
  });

  it('shows the name and the activity of a session this app lists, which has no desktop record', async () => {
    listed = [{ id: 'cli-b', title: 'Listed', fullTitle: 'Listed in full', sessionDir: '/elsewhere', sessionMark: { desktopArchived: false } }];
    activity = { 'cli-b': SessionActivity.Running };
    render(wrap(<Place id="cli-b" label="child" />));
    await flush();

    expect(screen.getByTestId('child').textContent).toBe('Listed in full|running|false|there');
    expect(readsOf('cli-b')).toBe(0);
  });

  it('stops reading a session once no place names it', async () => {
    const view = render(wrap(<Place id="local_a" label="card" />));
    await flush();
    view.rerender(wrap(<div />));
    await flush();

    records.local_a = { ...records.local_a, title: 'Later' };
    await queryClient.invalidateQueries({ queryKey: ['desktop-session'] });
    await flush();

    expect(readsOf('local_a')).toBe(1);
  });

  it('tells the backend which sessions to keep the state of, each with the folder it lives in', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    records = { local_a: { title: 'First name', cliSessionId: 'cli-a', cwd: '/work/a' } };
    render(wrap(<Place id="local_a" label="card" />));
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    const call = send.mock.calls.find(([type]) => type === MessageType.WATCH_SESSIONS);
    expect(call?.[1]).toEqual({ sessions: [{ sessionId: 'cli-a', workingDir: '/work/a' }] });
  });

  it('shows a session as unread (done) when the backend says it answered and was not looked at', async () => {
    activity = { 'cli-a': SessionActivity.Done };
    render(wrap(<Place id="local_a" label="card" />));
    await flush();

    expect(screen.getByTestId('card').textContent).toBe('First name|done|-|there');
  });

  it('says a session was deleted when its transcript is gone, and not before it is asked', async () => {
    missingIds = ['cli-a'];
    render(wrap(<Place id="local_a" label="card" />));
    await flush();
    await flush();

    expect(screen.getByTestId('card').textContent).toBe('First name|idle|-|missing');
  });

  it('says a session the desktop app deleted was deleted', async () => {
    records = { local_a: { title: 'Gone', cliSessionId: 'cli-a', deleted: true } };
    render(wrap(<Place id="local_a" label="card" />));
    await flush();

    expect(screen.getByTestId('card').textContent).toBe('Gone|idle|-|missing');
  });

  it('says a session the session-management MCP archived is archived, and one brought back is not', async () => {
    listed = [
      { id: 'cli-b', title: 'Archived here', sessionDir: '/w', sessionMark: { archivedAt: 1000, desktopArchived: false } },
      { id: 'cli-c', title: 'Brought back', sessionDir: '/w', sessionMark: { archivedAt: -1, desktopArchived: false } },
    ];
    render(wrap(<><Place id="cli-b" label="archived" /><Place id="cli-c" label="back" /></>));
    await flush();

    expect(screen.getByTestId('archived').textContent).toBe('Archived here|idle|true|there');
    expect(screen.getByTestId('back').textContent).toBe('Brought back|idle|false|there');
  });
});

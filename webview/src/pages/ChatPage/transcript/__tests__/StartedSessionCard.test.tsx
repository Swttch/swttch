import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SessionActivity } from '@/shared';
import type { DesktopSession } from '@/hooks/useDesktopSession';
import type { ToolCall } from '../buildSegments';

// The card a session Claude started leaves in the transcript: its states (starting, working, waiting for the
// person, archived, not started), when it can be opened, and where a click on it goes. What the card reads (the
// desktop app's record of the session, what sessions are doing) is stubbed; what is asked is what it draws.
let desktopSession: DesktopSession | undefined;
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
let activity: Record<string, SessionActivity> = {};
vi.mock('@/hooks/useDesktopSession', async (importActual) => ({ ...(await importActual<typeof import('@/hooks/useDesktopSession')>()), useDesktopSession: () => desktopSession }));
vi.mock('@/hooks/useSessionActivity', () => ({
  useSessionActivity: () => ({ activity, open: new Set<string>(), markRead: () => {} }),
  activityOf: (map: Record<string, SessionActivity>, id: string) => map[id] ?? SessionActivity.Idle,
}));

// The line the session's own chat ends on is read from its record by a hook of its own (tested apart): here it is
// handed over, and what is asked is whether the card draws it under the title and for which sessions it is asked.
let activityLine: string | undefined;
let askedFor: Array<string | undefined> = [];
vi.mock('@/hooks/useSessionActivityLine', () => ({
  useSessionActivityLine: (sessionId: string | undefined) => {
    askedFor.push(sessionId);
    return sessionId ? activityLine : undefined;
  },
}));

import { StartedSessionCard } from '../TranscriptToolRun';

function resultOf(text: string, isError = false) {
  return { message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_s', content: text, is_error: isError }] } };
}

function callOf(options: { title?: string; answer?: string; isError?: boolean } = {}): ToolCall {
  const toolUse: Record<string, unknown> = { id: 'toolu_s', name: 'mcp__ccd_session__start_session', input: { title: options.title ?? 'Child session' } };
  if (options.answer !== undefined) toolUse.tool_result = resultOf(options.answer, options.isError === true);
  return { toolUse, message: {} } as unknown as ToolCall;
}

const ANSWER = 'Started session "Child session" (session_id: local_da58, name: child)';

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname + location.search}</div>;
}

let queryClient: QueryClient;
function renderCard(call: ToolCall) {
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sessions/parent']}>
        {node}
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(wrap(<StartedSessionCard call={call} />));
  return { ...view, again: (next: ToolCall) => view.rerender(wrap(<StartedSessionCard call={next} />)) };
}

const card = () => document.querySelector('[data-transcript-started-session]') as HTMLElement;
const link = () => card().querySelector('a') as HTMLAnchorElement;

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  desktopSession = undefined;
  activity = {};
  activityLine = undefined;
  askedFor = [];
  queryClient = new QueryClient();
});

describe('StartedSessionCard: the line under the title', () => {
  const activityText = () => card().querySelector('[data-started-session-activity]');

  it('draws what the session is doing under its title while the session works', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    activity = { 'cli-1': SessionActivity.Running };
    activityLine = 'Running gh repo view --json nameWithOwner';
    renderCard(callOf({ answer: ANSWER }));

    expect(activityText()?.textContent).toBe('Running gh repo view --json nameWithOwner');
    expect(link().textContent).toContain('Child session');
    // The title stays the first line and the activity is the line under it.
    expect(link().textContent?.indexOf('Child session')).toBeLessThan(link().textContent?.indexOf('Running gh repo view') ?? -1);
  });

  it('says only that work goes on, with moving dots, when the session works but there is no call to say yet', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    activity = { 'cli-1': SessionActivity.Running };
    renderCard(callOf({ answer: ANSWER }));

    // The line is there all the while the session works, so the card keeps its height between two calls.
    expect(activityText()).not.toBeNull();
    expect(activityText()?.querySelector('[data-started-session-working]')?.textContent).toBe('Working...');
    // The second and third dot are the ones that come and go.
    expect(activityText()?.querySelector('.working-dots-2')).not.toBeNull();
    expect(activityText()?.querySelector('.working-dots-3')).not.toBeNull();
  });

  it('puts the call in the place of the dots once there is one', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    activity = { 'cli-1': SessionActivity.Running };
    activityLine = 'Reading README.md';
    renderCard(callOf({ answer: ANSWER }));

    expect(activityText()?.textContent).toBe('Reading README.md');
    expect(activityText()?.querySelector('[data-started-session-working]')).toBeNull();
  });

  it('draws no second line once the session is not working, as the desktop app does', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    activityLine = 'Running gh repo view --json nameWithOwner';
    for (const state of [SessionActivity.Idle, SessionActivity.Done, SessionActivity.Awaiting]) {
      activity = { 'cli-1': state };
      const view = renderCard(callOf({ answer: ANSWER }));
      expect(activityText()).toBeNull();
      view.unmount();
    }
  });

  it('asks for the line only for a session that works: not one being started, not started, or idle', () => {
    renderCard(callOf());
    expect(askedFor.every((id) => id === undefined)).toBe(true);

    askedFor = [];
    renderCard(callOf({ answer: 'could not start', isError: true }));
    expect(askedFor.every((id) => id === undefined)).toBe(true);

    askedFor = [];
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    renderCard(callOf({ answer: ANSWER }));
    expect(askedFor.every((id) => id === undefined)).toBe(true);
  });

  it('asks for the line of the session the card names once it works', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    activity = { 'cli-1': SessionActivity.Running };
    renderCard(callOf({ answer: ANSWER }));

    expect(askedFor).toContain('cli-1');
  });
});

describe('StartedSessionCard: states', () => {
  it('is starting, and cannot be opened, until the answer that names the session arrives', () => {
    renderCard(callOf());

    expect(card().dataset.state).toBe('starting');
    expect(link().getAttribute('href')).toBeNull();
    expect(link().getAttribute('aria-disabled')).toBe('true');
    expect(link().querySelector('.transcript-card-shimmer')).not.toBeNull();
    expect(card().querySelector('[data-started-session-dot]')).not.toBeNull();
  });

  it('says a session is being started while the call has no title yet', () => {
    renderCard(callOf({ title: '' }));

    expect(link().textContent).not.toBe('');
    expect(link().querySelector('.transcript-card-shimmer')?.textContent).not.toBe('');
  });

  it('can be opened, with nothing moving, once the session is known and idle', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    renderCard(callOf({ answer: ANSWER }));

    expect(card().dataset.state).toBe('idle');
    expect(link().getAttribute('href')).toContain('/sessions/cli-1?workingDir=%2Fwork%2Fapp');
    expect(link().querySelector('.transcript-card-shimmer')).toBeNull();
    expect(card().querySelector('[data-started-session-dot]')).toBeNull();
  });

  it('is working, with the dot and the moving name, while the session runs a turn', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    activity = { 'cli-1': SessionActivity.Running };
    renderCard(callOf({ answer: ANSWER }));

    expect(card().dataset.state).toBe('working');
    expect(link().getAttribute('href')).not.toBeNull();
    expect(link().querySelector('.transcript-card-shimmer')).not.toBeNull();
    expect(card().querySelector('[data-started-session-dot]')).not.toBeNull();
  });

  it('says the session needs the person when its last turn ended on a question, and not while it works', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app', awaitingPerson: true };
    const view = renderCard(callOf({ answer: ANSWER }));
    expect(card().dataset.state).toBe('needs-input');

    activity = { 'cli-1': SessionActivity.Running };
    view.again(callOf({ answer: ANSWER }));
    expect(card().dataset.state).toBe('working');
  });

  it('says it is archived once the session is archived', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app', isArchived: true };
    renderCard(callOf({ answer: ANSWER }));

    expect(card().dataset.state).toBe('archived');
  });

  it('is not started, and cannot be opened, when the call failed', () => {
    renderCard(callOf({ answer: 'start_session failed', isError: true }));

    expect(card().dataset.state).toBe('not-started');
    expect(link().getAttribute('href')).toBeNull();
  });
});

describe('StartedSessionCard: unread, deleted, archived', () => {
  it('keeps a dot that does not move, of the colour of a session waiting for the person, once the session answered and was not looked at', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    activity = { 'cli-1': SessionActivity.Done };
    renderCard(callOf({ answer: ANSWER }));

    expect(card().dataset.state).toBe('unread');
    expect(card().querySelector('[data-started-session-unread]')).not.toBeNull();
    // Not the dot of a session at work: it neither pulses nor moves the name.
    expect(card().querySelector('[data-started-session-dot]')).toBeNull();
    expect(link().querySelector('.transcript-card-shimmer')).toBeNull();
    expect(link().getAttribute('href')).not.toBeNull();
  });

  it('draws no dot once the session is read', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    renderCard(callOf({ answer: ANSWER }));

    expect(card().querySelector('[data-started-session-unread]')).toBeNull();
  });

  it('leaves the dot to the label when the session waits for the person, and to the working dot while it works', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app', awaitingPerson: true };
    activity = { 'cli-1': SessionActivity.Done };
    const view = renderCard(callOf({ answer: ANSWER }));
    expect(card().querySelector('[data-started-session-unread]')).toBeNull();

    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    activity = { 'cli-1': SessionActivity.Running };
    view.again(callOf({ answer: ANSWER }));
    expect(card().querySelector('[data-started-session-unread]')).toBeNull();
    expect(card().querySelector('[data-started-session-dot]')).not.toBeNull();
  });

  it('says the session was deleted, cannot be opened, and tells so with a notice instead of going there', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app', deleted: true };
    activity = { 'cli-1': SessionActivity.Done };
    renderCard(callOf({ answer: ANSWER }));

    expect(card().dataset.state).toBe('deleted');
    expect(link().getAttribute('href')).toBeNull();
    expect(card().querySelector('[data-started-session-unread]')).toBeNull();

    fireEvent.click(link());

    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('where').textContent).toBe('/sessions/parent');
  });

  it('says the session is archived, and can still be opened', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app', isArchived: true };
    renderCard(callOf({ answer: ANSWER }));

    expect(card().dataset.state).toBe('archived');
    expect(link().getAttribute('href')).not.toBeNull();
  });
});

describe('StartedSessionCard: a click', () => {
  it('goes to the session in this page, not in a new tab', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    renderCard(callOf({ answer: ANSWER }));

    expect(link().getAttribute('target')).toBeNull();
    fireEvent.click(link());

    expect(screen.getByTestId('where').textContent).toBe('/sessions/cli-1?workingDir=%2Fwork%2Fapp');
  });

  it('leaves a click made to open elsewhere (modifier key) to the browser', () => {
    desktopSession = { cliSessionId: 'cli-1', cwd: '/work/app' };
    renderCard(callOf({ answer: ANSWER }));

    fireEvent.click(link(), { ctrlKey: true });

    expect(screen.getByTestId('where').textContent).toBe('/sessions/parent');
  });

  it('does nothing while the session cannot be opened yet', () => {
    renderCard(callOf());

    fireEvent.click(link());

    expect(screen.getByTestId('where').textContent).toBe('/sessions/parent');
  });
});

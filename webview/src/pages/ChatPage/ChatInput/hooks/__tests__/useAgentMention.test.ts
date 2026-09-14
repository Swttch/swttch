import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUseActiveSessions = vi.fn();

// importOriginal, not a bare factory: this module also exports
// ACTIVE_SESSIONS_QUERY_KEY, and a whole-module factory would erase it.
vi.mock('@/hooks/queries/useActiveSessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useActiveSessions')>()),
  useActiveSessions: (...args: unknown[]) => mockUseActiveSessions(...args),
}));

import { useAgentMention, rowLabel } from '../useAgentMention';

const SELF = 'self-session-id';

function agent(overrides: Record<string, unknown> = {}) {
  return {
    pid: 1,
    cwd: '/Users/me/proj',
    kind: 'interactive',
    startedAt: 1000,
    sessionId: 'peer-a',
    name: 'proj-aa',
    ...overrides,
  } as never;
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'peer-a',
    sessionDir: '/Users/me/proj',
    title: 'fix the proxy',
    lastTimestamp: '2026-09-14T10:00:00.000Z',
    createdAt: '2026-09-14T09:00:00.000Z',
    messageCount: null,
    isSidechain: false,
    ...overrides,
  } as never;
}

function setList(agents: unknown[], entries: Record<string, unknown> = {}) {
  mockUseActiveSessions.mockReturnValue({
    agents,
    entries,
    isPending: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
  });
}

function setup(initialValue = '') {
  const onChange = vi.fn();
  const onPickRecipient = vi.fn();
  let value = initialValue;
  const hook = renderHook(() =>
    useAgentMention({
      currentSessionId: SELF,
      value,
      onChange,
      onPickRecipient,
    }),
  );
  return { hook, onChange, onPickRecipient, setValue: (v: string) => { value = v; } };
}

/** A keydown event shaped enough for the handler. */
function key(k: string) {
  return { key: k, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLElement>;
}

describe('useAgentMention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setList([]);
  });

  it('stays closed until the caret is in a "@@" token', () => {
    const { hook } = setup();
    expect(hook.result.current.isActive).toBe(false);

    act(() => hook.result.current.detectAgent('@', 1));
    expect(hook.result.current.isActive).toBe(false);

    act(() => hook.result.current.detectAgent('@@', 2));
    expect(hook.result.current.isActive).toBe(true);
  });

  it('never offers the session doing the asking', () => {
    setList(
      [agent({ sessionId: SELF, name: 'proj-me' }), agent({ sessionId: 'peer-a' })],
      { [SELF]: entry({ sessionId: SELF, title: 'my own tab' }), 'peer-a': entry() },
    );
    const { hook } = setup('@@');

    act(() => hook.result.current.detectAgent('@@', 2));

    expect(hook.result.current.rows.map((r) => r.agent.sessionId)).toEqual(['peer-a']);
  });

  it('narrows by the session title', () => {
    setList(
      [agent({ sessionId: 'a', name: 'proj-aa' }), agent({ sessionId: 'b', name: 'proj-bb' })],
      { a: entry({ sessionId: 'a', title: 'fix the proxy' }), b: entry({ sessionId: 'b', title: 'write the docs' }) },
    );
    const { hook } = setup('@@docs');

    act(() => hook.result.current.detectAgent('@@docs', 6));

    expect(hook.result.current.rows.map((r) => r.agent.sessionId)).toEqual(['b']);
  });

  it('narrows by the session name too, since that is what tells two tabs apart', () => {
    setList(
      [agent({ sessionId: 'a', name: 'proj-aa' }), agent({ sessionId: 'b', name: 'proj-bb' })],
      { a: entry({ sessionId: 'a', title: 'same title' }), b: entry({ sessionId: 'b', title: 'same title' }) },
    );
    const { hook } = setup('@@bb');

    act(() => hook.result.current.detectAgent('@@bb', 4));

    expect(hook.result.current.rows.map((r) => r.agent.name)).toEqual(['proj-bb']);
  });

  it('puts the most recently active session first', () => {
    setList(
      [agent({ sessionId: 'old', name: 'p-o' }), agent({ sessionId: 'new', name: 'p-n' })],
      {
        old: entry({ sessionId: 'old', lastTimestamp: '2026-09-14T08:00:00.000Z' }),
        new: entry({ sessionId: 'new', lastTimestamp: '2026-09-14T12:00:00.000Z' }),
      },
    );
    const { hook } = setup('@@');

    act(() => hook.result.current.detectAgent('@@', 2));

    expect(hook.result.current.rows.map((r) => r.agent.sessionId)).toEqual(['new', 'old']);
  });

  it('walks the list with the arrow keys and wraps at both ends', () => {
    setList(
      [agent({ sessionId: 'a', name: 'p-a' }), agent({ sessionId: 'b', name: 'p-b' })],
      { a: entry({ sessionId: 'a' }), b: entry({ sessionId: 'b' }) },
    );
    const { hook } = setup('@@');
    act(() => hook.result.current.detectAgent('@@', 2));

    expect(hook.result.current.selectedIndex).toBe(0);
    act(() => { hook.result.current.handleKeyDown(key('ArrowDown')); });
    expect(hook.result.current.selectedIndex).toBe(1);
    act(() => { hook.result.current.handleKeyDown(key('ArrowDown')); });
    expect(hook.result.current.selectedIndex).toBe(0);
    act(() => { hook.result.current.handleKeyDown(key('ArrowUp')); });
    expect(hook.result.current.selectedIndex).toBe(1);
  });

  it('replaces the "@@query" token with an inline mention chip', () => {
    setList([agent({ sessionId: 'peer-a', name: 'proj-aa' })], { 'peer-a': entry() });
    const { hook, onChange, onPickRecipient, setValue } = setup();

    setValue('before @@fix after');
    // Caret sits just past "@@fix": offsets 7..12.
    act(() => hook.result.current.detectAgent('before @@fix after', 12));
    act(() => { hook.result.current.selectRow(0); });

    // `@fix the proxy ` lands in place, and the caret follows the space, so the
    // user keeps typing the sentence rather than inside the chip.
    expect(onChange).toHaveBeenCalledWith('before @@fix the proxy  after');
    expect(onPickRecipient).toHaveBeenCalledWith(
      {
        name: 'proj-aa',
        sessionId: 'peer-a',
        sessionDir: '/Users/me/proj',
        label: 'fix the proxy',
        token: '@@fix the proxy',
      },
      23,
      'before @@fix the proxy  after',
    );
  });

  it('cuts a long title short in the chip, so it does not push the sentence off the line', () => {
    const long = 'this is a very long session title that would fill the line';
    setList([agent({ sessionId: 'peer-a' })], { 'peer-a': entry({ title: long }) });
    const { hook, onPickRecipient } = setup('@@');

    act(() => hook.result.current.detectAgent('@@', 2));
    act(() => { hook.result.current.selectRow(0); });

    const { token, label } = onPickRecipient.mock.calls[0][0];
    expect(token).toBe('@@this is a very long sess…');
    // The panel row keeps the title at the length every session row uses (50,
    // as toTitle cuts it); only the inline chip is cut shorter than that.
    expect(label).toBe(long.slice(0, 50));
    expect(token.length).toBeLessThan(label.length);
  });

  it('closes once a row is picked', () => {
    setList([agent()], { 'peer-a': entry() });
    const { hook } = setup('@@');
    act(() => hook.result.current.detectAgent('@@', 2));
    act(() => { hook.result.current.selectRow(0); });

    expect(hook.result.current.isActive).toBe(false);
  });

  it('leaves Enter alone when there is nothing to pick', () => {
    setList([]);
    const { hook } = setup('@@');
    act(() => hook.result.current.detectAgent('@@', 2));

    // Swallowing Enter on an empty list would strand a user who already typed a
    // message and just wants to send it.
    let handled = true;
    act(() => { handled = hook.result.current.handleKeyDown(key('Enter')); });
    expect(handled).toBe(false);
  });

  it('closes on Escape', () => {
    setList([agent()], { 'peer-a': entry() });
    const { hook } = setup('@@');
    act(() => hook.result.current.detectAgent('@@', 2));
    act(() => { hook.result.current.handleKeyDown(key('Escape')); });

    expect(hook.result.current.isActive).toBe(false);
  });

  it('only asks the backend while the panel is open', () => {
    const { hook } = setup();
    expect(mockUseActiveSessions).toHaveBeenLastCalledWith(false);

    act(() => hook.result.current.detectAgent('@@', 2));
    expect(mockUseActiveSessions).toHaveBeenLastCalledWith(true);
  });
});

describe('rowLabel', () => {
  it('runs the title through the same transform the session dropdown uses', () => {
    const label = rowLabel({
      agent: agent(),
      entry: entry({ title: '<command-name>/foo</command-name>real prompt' }),
    });
    // parseUserContent strips the tag, so the row reads like the session row.
    expect(label).not.toContain('<command-name>');
    expect(label).toContain('real prompt');
  });

  it('falls back to the working directory when the first prompt parsed away to nothing', () => {
    // What a session started BY another session looks like: its opening message
    // was wrapped in a system tag, so toTitle strips it to its placeholder.
    const label = rowLabel({
      agent: agent({ cwd: '/Users/me/some-project' }),
      entry: entry({ title: '<system-reminder>deliver this</system-reminder>' }),
    });
    expect(label).toBe('some-project');
  });

  it('falls back to the working directory when the session has no title yet', () => {
    const label = rowLabel({ agent: agent({ cwd: '/Users/me/some-project' }), entry: undefined });
    expect(label).toBe('some-project');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { ReactNode, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MessageType } from '@/shared';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
let connected = true;
let changedHandler: ((message: IPCMessage) => void) | null = null;

const mockSubscribe = vi.fn((type: string, handler: (message: IPCMessage) => void) => {
  if (type === MessageType.CLAUDE_SETTINGS_CHANGED) changedHandler = handler;
  return () => { /* unsubscribe */ };
});

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: connected, send: mockSend, subscribe: mockSubscribe, lastError: null }),
}));

vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDir: () => ({ workingDirectory: '/proj', setWorkingDirectory: vi.fn(), ideRoot: null }),
}));

import { ClaudeSettingsProvider, useClaudeSettings } from '../ClaudeSettingsContext';

function Consumer() {
  const { settings } = useClaudeSettings();
  return <span data-testid="ready">{settings ? 'ready' : 'no'}</span>;
}

/** Shows what the banner reads (#595): the unreadable files, the last save error, and a way to save. */
function ProblemProbe() {
  const { unreadable, saveError, updateSetting } = useClaudeSettings();
  return (
    <>
      <span data-testid="unreadable">{unreadable.map((u) => `${u.file}|${u.reason}`).join(';')}</span>
      <span data-testid="saveError">{saveError ?? ''}</span>
      <button data-testid="save" onClick={() => void updateSetting('effortLevel', 'high').catch(() => undefined)} />
    </>
  );
}

function makeWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    const [client] = useState(() => createTestQueryClient());
    return (
      <QueryClientProvider client={client}>
        <ClaudeSettingsProvider>{children}</ClaudeSettingsProvider>
      </QueryClientProvider>
    );
  };
}

const claudeGets = () => mockSend.mock.calls.filter((c) => c[0] === MessageType.GET_CLAUDE_SETTINGS);
const mergedGets = () => claudeGets().filter((c) => !(c[1] as { scope?: string })?.scope);
const scopeGets = () => claudeGets().filter((c) => (c[1] as { scope?: string })?.scope);

describe('ClaudeSettingsContext', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ status: 'ok', settings: {}, overrides: [] });
    connected = true;
    changedHandler = null;
  });

  it('dedupes GET_CLAUDE_SETTINGS across consumers: merged once + scope once, regardless of consumer count', async () => {
    const Wrapper = makeWrapper();
    render(
      <>
        <Consumer />
        <Consumer />
        <Consumer />
      </>,
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(mergedGets().length).toBe(1));
    // Three consumers, yet exactly one merged + one scope request hit the backend.
    expect(mergedGets().length).toBe(1);
    expect(scopeGets().length).toBe(1);
  });

  it('applies a CLAUDE_SETTINGS_CHANGED push without firing another merged GET', async () => {
    const Wrapper = makeWrapper();
    render(<Consumer />, { wrapper: Wrapper });

    await waitFor(() => expect(changedHandler).not.toBeNull());
    await waitFor(() => expect(mergedGets().length).toBe(1));
    const before = mergedGets().length;

    act(() => {
      changedHandler!({ payload: { settings: { theme: 'dark' }, overrides: [] } } as unknown as IPCMessage);
    });

    // Push patches the cache via setQueryData — no extra merged GET is issued.
    expect(mergedGets().length).toBe(before);
  });

  // #595: a settings file that cannot be read makes every setting look unset. The list of such files has to
  // reach the screen, and it has to clear on its own once the file reads again, including when the cause was
  // another program holding the file open, which changes nothing in the file and so pushes nothing.
  describe('unreadable settings files', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('exposes the unreadable files from the merged read', async () => {
      mockSend.mockResolvedValue({
        status: 'ok', settings: {}, overrides: [],
        unreadable: [{ file: '/h/.claude/settings.json', reason: 'EBUSY' }],
      });
      const { getByTestId } = render(<ProblemProbe />, { wrapper: makeWrapper() });

      await waitFor(() => expect(getByTestId('unreadable').textContent).toBe('/h/.claude/settings.json|EBUSY'));
    });

    it('takes the list from a CLAUDE_SETTINGS_CHANGED push, so repairing the file clears it without a reload', async () => {
      mockSend.mockResolvedValue({
        status: 'ok', settings: {}, overrides: [],
        unreadable: [{ file: '/h/.claude/settings.json', reason: 'bad' }],
      });
      const { getByTestId } = render(<ProblemProbe />, { wrapper: makeWrapper() });
      await waitFor(() => expect(getByTestId('unreadable').textContent).not.toBe(''));

      act(() => {
        changedHandler!({ payload: { settings: { effortLevel: 'max' }, overrides: [], unreadable: [] } } as unknown as IPCMessage);
      });

      await waitFor(() => expect(getByTestId('unreadable').textContent).toBe(''));
      // The push alone settled it: no extra read was needed.
      expect(mergedGets().length).toBe(1);
    });

    it('asks again every few seconds while a file is unreadable, and stops once nothing is', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockSend.mockResolvedValue({
        status: 'ok', settings: {}, overrides: [],
        unreadable: [{ file: '/h/.claude/settings.json', reason: 'EBUSY' }],
      });
      const { getByTestId } = render(<ProblemProbe />, { wrapper: makeWrapper() });
      await waitFor(() => expect(mergedGets().length).toBe(1));

      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      await waitFor(() => expect(mergedGets().length).toBeGreaterThanOrEqual(2));

      // The lock is released: the next answer lists nothing, and the polling stops.
      mockSend.mockResolvedValue({ status: 'ok', settings: { effortLevel: 'max' }, overrides: [], unreadable: [] });
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      await waitFor(() => expect(getByTestId('unreadable').textContent).toBe(''));

      const settled = mergedGets().length;
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(mergedGets().length).toBe(settled);
    });

    it('does not poll while every file reads', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      render(<Consumer />, { wrapper: makeWrapper() });
      await waitFor(() => expect(mergedGets().length).toBe(1));

      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

      expect(mergedGets().length).toBe(1);
    });
  });

  describe('save errors', () => {
    it('drops the reason of a refused save once the unreadable file reads again, without another save', async () => {
      const { getByTestId } = render(<ProblemProbe />, { wrapper: makeWrapper() });
      await waitFor(() => expect(mergedGets().length).toBe(1));

      // The save is refused because the file is unreadable, and the re-read names it.
      mockSend.mockImplementation(async (type: string) =>
        type === MessageType.SAVE_CLAUDE_SETTINGS
          ? { status: 'error', error: 'refusing to overwrite x' }
          : { status: 'ok', settings: {}, overrides: [], unreadable: [{ file: 'x', reason: 'EBUSY' }] });
      await act(async () => { getByTestId('save').click(); });
      await waitFor(() => expect(getByTestId('saveError').textContent).toBe('refusing to overwrite x'));
      await waitFor(() => expect(getByTestId('unreadable').textContent).toBe('x|EBUSY'));

      // The file reads again (pushed here; polled in the app): the stale refusal goes with it.
      act(() => {
        changedHandler!({ payload: { settings: {}, overrides: [], unreadable: [] } } as unknown as IPCMessage);
      });
      await waitFor(() => expect(getByTestId('saveError').textContent).toBe(''));
    });

    it('keeps the reason of a refused save, and clears it when a later save goes through', async () => {
      const { getByTestId } = render(<ProblemProbe />, { wrapper: makeWrapper() });
      await waitFor(() => expect(mergedGets().length).toBe(1));

      mockSend.mockImplementation(async (type: string) =>
        type === MessageType.SAVE_CLAUDE_SETTINGS ? { status: 'error', error: 'refusing to overwrite x' } : { status: 'ok', settings: {}, overrides: [] });
      await act(async () => { getByTestId('save').click(); });
      await waitFor(() => expect(getByTestId('saveError').textContent).toBe('refusing to overwrite x'));

      mockSend.mockImplementation(async () => ({ status: 'ok', settings: {}, overrides: [] }));
      await act(async () => { getByTestId('save').click(); });
      await waitFor(() => expect(getByTestId('saveError').textContent).toBe(''));
    });
  });
});

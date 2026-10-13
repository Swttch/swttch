import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act, cleanup } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MessageType } from '@/shared';
import { i18n } from '@/i18n';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

/**
 * The indicator as the chat renders it: under the real settings provider, fed by a
 * bridge that answers like the backend does (the settings file as it is, unfiltered).
 * The other tests hand the indicator a settings value directly; this is the whole path
 * from the file's JSON to the verb on screen.
 */

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
let changedHandler: ((message: IPCMessage) => void) | null = null;

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: mockSend,
    subscribe: (type: string, handler: (message: IPCMessage) => void) => {
      if (type === MessageType.CLAUDE_SETTINGS_CHANGED) changedHandler = handler;
      return () => {};
    },
    lastError: null,
  }),
}));

vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDir: () => ({ workingDirectory: '/proj', setWorkingDirectory: vi.fn(), ideRoot: null }),
}));

import { ClaudeSettingsProvider, useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { StreamingIndicator } from '../index';

/** Holds the indicator back until the settings have arrived, as a chat opened a while ago has them. */
function AfterSettingsLoad({ children }: { children: ReactNode }) {
  const { isLoading } = useClaudeSettings();
  return isLoading ? null : <>{children}</>;
}

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(() => createTestQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ClaudeSettingsProvider>
        <AfterSettingsLoad>{children}</AfterSettingsLoad>
      </ClaudeSettingsProvider>
    </QueryClientProvider>
  );
}

function answerWith(settings: Record<string, unknown>) {
  mockSend.mockImplementation(async (type: string) => {
    if (type === MessageType.GET_CLAUDE_SETTINGS) return { status: 'ok', settings, overrides: [] };
    return { status: 'ok' };
  });
}

const verbText = (container: HTMLElement) => container.querySelector('.font-mono')?.textContent;

// The built-in list already holds common words such as "Processing" and "Working", so a
// check that a verb is NOT the user's has to use one the list cannot contain.
const BUILT_IN = i18n.t('chat:streamingIndicator.verbs', { returnObjects: true }) as string[];
const UNIQUE_VERB = 'Quokka-herding';

beforeEach(() => {
  mockSend.mockReset();
  changedHandler = null;
});

afterEach(cleanup);

describe('StreamingIndicator under the real settings provider (#548)', () => {
  it('shows the verb written in the settings file', async () => {
    answerWith({ spinnerVerbs: { mode: 'replace', verbs: ['Processing'] } });

    const { container } = render(<StreamingIndicator />, { wrapper: Wrapper });

    await waitFor(() => expect(verbText(container)).toBe('Processing...'));
  });

  it('shows a built-in verb when the file has no spinnerVerbs', async () => {
    answerWith({});

    const { container } = render(<StreamingIndicator />, { wrapper: Wrapper });

    await waitFor(() => expect(verbText(container)).toMatch(/^.+\.\.\.$/));
    expect(BUILT_IN).toContain(verbText(container)?.replace(/\.\.\.$/, ''));
  });

  it('shows a built-in verb or one from the file in append mode, never a blank', async () => {
    answerWith({ spinnerVerbs: { mode: 'append', verbs: [UNIQUE_VERB] } });

    const { container } = render(<StreamingIndicator />, { wrapper: Wrapper });

    await waitFor(() => expect(verbText(container)).toMatch(/^.+\.\.\.$/));
    expect([...BUILT_IN, UNIQUE_VERB]).toContain(verbText(container)?.replace(/\.\.\.$/, ''));
  });

  it('switches to the new verbs when the file is edited while a turn is running', async () => {
    // The backend pushes CLAUDE_SETTINGS_CHANGED when the file changes on disk. The next
    // verb change picks from the new list, which is at most a few seconds away.
    answerWith({ spinnerVerbs: { mode: 'replace', verbs: ['Processing'] } });
    const { container } = render(<StreamingIndicator />, { wrapper: Wrapper });
    await waitFor(() => expect(verbText(container)).toBe('Processing...'));
    await waitFor(() => expect(changedHandler).not.toBeNull());

    act(() => {
      changedHandler!({
        payload: { settings: { spinnerVerbs: { mode: 'replace', verbs: ['Working'] } }, overrides: [] },
      } as unknown as IPCMessage);
    });

    await waitFor(() => expect(verbText(container)).toBe('Working...'), { timeout: 4000 });
  }, 8000);
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// The hook is handed to every row of the classic transcript through a context, so a value that changes
// identity makes every row draw again (#680).
const session = {
  currentSessionId: 's1',
  workingDirectory: '/w',
  addNewSession: vi.fn(),
  sessions: [{ id: 's1', title: 'a' }] as { id: string; title: string }[],
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

describe('useSendActions', () => {
  beforeEach(() => {
    session.sessions = [{ id: 's1', title: 'a' }];
  });

  it('keeps the same value when the session list is replaced', () => {
    const { result, rerender } = renderHook(({ messages }) => useSendActions(messages), {
      initialProps: { messages: [] as never[] },
    });
    const first = result.current;
    session.sessions = [{ id: 's1', title: 'renamed' }];
    rerender({ messages: [] });
    expect(result.current).toBe(first);
  });

  it('keeps the same value when the messages change', () => {
    const { result, rerender } = renderHook(({ messages }) => useSendActions(messages), {
      initialProps: { messages: [] as never[] },
    });
    const first = result.current;
    rerender({ messages: [{ type: 'user', uuid: 'u' }] as never[] });
    expect(result.current).toBe(first);
  });
});

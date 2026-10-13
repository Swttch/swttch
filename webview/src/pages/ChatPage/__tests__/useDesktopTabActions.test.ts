import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDesktopTabActions } from '../useDesktopTabActions';
import { DESKTOP_TAB_ACTION, DESKTOP_TAB_RESULT } from '@/shared/desktop-tab';

const actions = vi.hoisted(() => ({ scheduledMessages: vi.fn(), backgroundTasks: vi.fn(), tunnel: vi.fn(), assets: vi.fn() }));
vi.mock('../SessionHeader/dock/useDockItemActions', () => ({ useDockItemActions: () => actions }));
vi.mock('@/components/HelpModal/useShortcutContext', () => ({ useShortcutContext: () => ({ mac: true, ideAttached: false, composer: {}, voiceShortcut: null }) }));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('Desktop tab action boundary', () => {
  it('delegates only supported actions from the same-origin owning frame and acknowledges them', () => {
    const parent = { postMessage: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent);
    const { unmount } = renderHook(useDesktopTabActions);
    const dispatch = (action: string, source = parent, origin = window.location.origin) => window.dispatchEvent(new MessageEvent('message', { source, origin, data: { type: DESKTOP_TAB_ACTION, id: 'request-1', action } }));
    dispatch('assets', window);
    dispatch('assets', parent, 'https://other.example');
    dispatch('constructor');
    expect(actions.assets).not.toHaveBeenCalled();
    for (const action of ['scheduled-messages', 'background-tasks', 'tunnel', 'assets']) dispatch(action);
    for (const activate of Object.values(actions)) expect(activate).toHaveBeenCalledTimes(1);
    expect(parent.postMessage).toHaveBeenLastCalledWith({ type: DESKTOP_TAB_RESULT, id: 'request-1', ok: true }, window.location.origin);
    dispatch('get-shortcuts');
    const calls = vi.mocked(parent.postMessage).mock.calls;
    const description = calls[calls.length - 1][0];
    expect(description.shortcuts.some((row: { id: string }) => row.id === 'sendMessage')).toBe(true);
    expect(description.shortcuts.some((row: { id: string }) => row.id === 'openClaudeCode')).toBe(false);
    unmount();
    dispatch('assets');
    expect(actions.assets).toHaveBeenCalledTimes(1);
  });
});

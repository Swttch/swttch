import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { DockItemId } from '@/types/settings';
import { OPEN_ASSETS_EVENT } from '../actions';

const openNewTab = vi.fn();
const tunnelActivate = vi.fn();

vi.mock('@/contexts/SessionContext', () => ({ useSessionContext: () => ({ openNewTab }) }));
vi.mock('@/contexts/WorkflowStateContext', () => ({
  useWorkflowState: () => ({ panelOpen: false, openPanel: vi.fn(), closePanel: vi.fn() }),
}));
vi.mock('@/contexts/ScheduledMessagesContext', () => ({
  useScheduledMessages: () => ({ panelOpen: false, openPanel: vi.fn(), closePanel: vi.fn() }),
}));
vi.mock('../../useTunnelAction', () => ({ useTunnelAction: () => ({ activate: tunnelActivate }) }));

import { useDockItemActions } from '../useDockItemActions';

beforeEach(() => vi.clearAllMocks());

describe('useDockItemActions', () => {
  it('gives every dock item an action', () => {
    // The dock icon can carry its own onClick and still work while the ⋮ menu
    // row does nothing, because the row is driven from this map alone. Asserting
    // over the enum is what makes a newly shipped item fail here instead of
    // silently shipping a dead menu row.
    const { result } = renderHook(() => useDockItemActions());

    for (const id of Object.values(DockItemId)) {
      expect(result.current[id], `no action registered for DockItemId.${id}`).toBeTypeOf('function');
    }
  });

  it('opens the Assets modal through the shared event', () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_ASSETS_EVENT, listener);
    const { result } = renderHook(() => useDockItemActions());

    result.current[DockItemId.ASSETS]!();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_ASSETS_EVENT, listener);
  });

  it('routes the new-tab item to the session context', () => {
    const { result } = renderHook(() => useDockItemActions());

    result.current[DockItemId.NEW_TAB]!();

    expect(openNewTab).toHaveBeenCalledTimes(1);
  });
});

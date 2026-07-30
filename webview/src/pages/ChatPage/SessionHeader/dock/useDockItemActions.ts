import { useCallback, useMemo } from 'react';
import { Route } from '@/router';
import { openSettingsAt } from '@/utils/openSettingsAt';
import { useSessionContext } from '@/contexts/SessionContext';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { useScheduledMessages } from '@/contexts/ScheduledMessagesContext';
import { OPEN_ACCOUNT_USAGE_EVENT } from '@/commandPalette/sections/model/AccountUsageItem';
import { DockItemId } from '@/types/settings';
import { useTunnelAction } from '../useTunnelAction';

/**
 * One `activate` per dock item, so the dock icon and the ⋮ menu row trigger the
 * exact same thing. Keeping them here — rather than duplicating a click handler
 * in each view — is what makes "wherever you click it, it behaves the same" a
 * structural property instead of a convention someone has to remember.
 *
 * Panel items (scheduled messages, background tasks) TOGGLE, matching what their
 * icons have always done: clicking an open panel's icon closes it.
 *
 * {@link DockItemId.ACCOUNT_SWITCHER} is absent on purpose. It has no single
 * action — its dock icon opens a dropdown, and the ⋮ menu lists the accounts
 * inline instead (nesting a submenu inside the menu would revive the
 * open/close arbitration bugs of #236/#244).
 */
export type DockItemActions = Partial<Record<DockItemId, () => void>>;

export function useDockItemActions(): DockItemActions {
  const { openNewTab } = useSessionContext();
  const workflows = useWorkflowState();
  const scheduled = useScheduledMessages();
  const tunnel = useTunnelAction();

  const openUsage = useCallback(() => {
    window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_USAGE_EVENT));
  }, []);

  const openSettings = useCallback(() => {
    // Honours the user's "Open Settings as" preference (overlay vs dedicated tab)
    // — the same helper every other entry point into settings uses.
    void openSettingsAt(Route.SETTINGS_GENERAL);
  }, []);

  const toggleWorkflows = useCallback(() => {
    if (workflows.panelOpen) workflows.closePanel();
    else workflows.openPanel();
  }, [workflows]);

  const toggleScheduled = useCallback(() => {
    if (scheduled.panelOpen) scheduled.closePanel();
    else scheduled.openPanel();
  }, [scheduled]);

  return useMemo(
    () => ({
      [DockItemId.TOKEN_BATTERY]: openUsage,
      [DockItemId.SCHEDULED_MESSAGES]: toggleScheduled,
      [DockItemId.BACKGROUND_TASKS]: toggleWorkflows,
      [DockItemId.TUNNEL]: tunnel.activate,
      [DockItemId.SETTINGS]: openSettings,
      [DockItemId.NEW_TAB]: openNewTab,
    }),
    [openUsage, toggleScheduled, toggleWorkflows, tunnel.activate, openSettings, openNewTab],
  );
}

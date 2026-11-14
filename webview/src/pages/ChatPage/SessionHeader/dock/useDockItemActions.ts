import { useCallback, useMemo } from 'react';
import { Route } from '@/router';
import { openSettingsAt } from '@/utils/openSettingsAt';
import { useSessionContext } from '@/contexts/SessionContext';
import { useWorkflowState } from '@/contexts/WorkflowStateContext';
import { useScheduledMessages } from '@/contexts/ScheduledMessagesContext';
import { OPEN_ACCOUNT_USAGE_EVENT } from '@/commandPalette/sections/model/AccountUsageItem';
import { TOGGLE_SIDE_QUESTION_EVENT } from '@/contexts/SideQuestionContext';
import { DockItemId } from '@/types/settings';
import { useTunnelAction } from '../useTunnelAction';
import { openAssetsModal } from './actions';
import { AssetScreenSource } from '@/shared';
import { TOGGLE_SESSION_RAIL_EVENT } from '../../SessionRail/event';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';

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
 *
 * An action is handed the modifier keys of the click that ran it, so an item
 * whose icon does something else on a Cmd/Ctrl-click (the tunnel opens the
 * session in the browser) does the same from its ⋮ menu row. Callers that run
 * an item without a click (desktop tab commands) pass nothing, which reads as a
 * plain click.
 */
export interface DockClickModifiers {
  metaKey: boolean;
  ctrlKey: boolean;
}

export type DockItemActions = Partial<Record<DockItemId, (click?: DockClickModifiers) => void>>;

export function useDockItemActions(): DockItemActions {
  const { openNewTab } = useSessionContext();
  const workflows = useWorkflowState();
  const scheduled = useScheduledMessages();
  const tunnel = useTunnelAction();

  const openUsage = useCallback(() => {
    window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_USAGE_EVENT));
  }, []);

  const openAssetsFromMenu = useCallback(() => openAssetsModal(AssetScreenSource.Overflow), []);

  // The shortcut and the command palette raise this same event, so every way in
  // opens, closes, or un-parks the one window.
  const toggleSideQuestion = useCallback(() => {
    window.dispatchEvent(new CustomEvent(TOGGLE_SIDE_QUESTION_EVENT));
  }, []);

  const toggleSessionRail = useCallback(() => {
    window.dispatchEvent(new Event(TOGGLE_SESSION_RAIL_EVENT));
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
      [DockItemId.TUNNEL]: tunnel.handleClick,
      [DockItemId.SETTINGS]: openSettings,
      [DockItemId.ASSETS]: openAssetsFromMenu,
      [DockItemId.SIDE_QUESTION]: toggleSideQuestion,
      [DockItemId.SESSION_RAIL]: toggleSessionRail,
      [DockItemId.NEW_TAB]: openNewTab,
      [DockItemId.BROWSER]: () => filePreviewPaneStore.toggleBrowser(),
    }),
    [openUsage, toggleScheduled, toggleWorkflows, tunnel.handleClick, openSettings, openNewTab, openAssetsFromMenu, toggleSideQuestion, toggleSessionRail],
  );
}

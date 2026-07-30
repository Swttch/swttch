import type { ComponentType } from 'react';
import {
  ClockIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  PlusIcon,
  QueueListIcon,
  UserCircleIcon,
  Battery50Icon,
} from '@heroicons/react/24/outline';
import { DockItemId } from '@/types/settings';
import { TokenBatteryButton } from '../TokenBatteryButton';
import { ScheduledMessagesButton } from '../ScheduledMessagesButton';
import { BackgroundTasksButton } from '../BackgroundTasksButton';
import { TunnelButton } from '../TunnelButton';
import { SettingsButton } from '../SettingsButton';
import { NewTabButton } from '../NewTabButton';
import { AccountSwitcher } from '../AccountSwitcher';

/**
 * One entry per item that can live in the header dock or the ⋮ overflow menu.
 *
 * Deliberately shallow: it names the icon, the label, and the component that
 * renders the dock icon — it does NOT hold the click behaviour. Actions live in
 * {@link useDockItemActions} because a plain object cannot call hooks, and each
 * item needs live state (a badge count, the battery level, whether the tunnel is
 * up). Keeping state inside the item's own component is also what lets an item
 * hide itself (`return null`) without the dock knowing why.
 */
export interface DockItemDef {
  id: DockItemId;
  /** i18n key in the `chat` namespace. Reuses each feature's existing label. */
  labelKey: string;
  /** Shown in the ⋮ menu row and in the dock editor. */
  icon: ComponentType<{ className?: string }>;
  /**
   * Renders the dock icon. Owns its own hooks, its own live status, and the
   * decision to render nothing when the feature has nothing to show (no
   * reservations, not logged in, no usage data).
   */
  DockView: ComponentType;
}

/**
 * Declaration order doubles as the fallback order: an item missing from a saved
 * layout is appended to `hidden` in this sequence (see normalizeDockLayout), so a
 * newly shipped item lands in the ⋮ menu rather than nowhere.
 */
export const DOCK_ITEMS: readonly DockItemDef[] = [
  {
    id: DockItemId.TOKEN_BATTERY,
    labelKey: 'sessionHeader.dock.items.tokenBattery',
    icon: Battery50Icon,
    DockView: TokenBatteryButton,
  },
  {
    id: DockItemId.SCHEDULED_MESSAGES,
    labelKey: 'scheduledMessages.title',
    icon: ClockIcon,
    DockView: ScheduledMessagesButton,
  },
  {
    id: DockItemId.BACKGROUND_TASKS,
    labelKey: 'sessionHeader.backgroundTasks.title',
    icon: QueueListIcon,
    DockView: BackgroundTasksButton,
  },
  {
    id: DockItemId.TUNNEL,
    labelKey: 'sessionHeader.tunnel.title',
    icon: ComputerDesktopIcon,
    DockView: TunnelButton,
  },
  {
    id: DockItemId.SETTINGS,
    labelKey: 'sessionHeader.dock.items.settings',
    icon: Cog6ToothIcon,
    DockView: SettingsButton,
  },
  {
    id: DockItemId.NEW_TAB,
    labelKey: 'sessionHeader.newTab.title',
    icon: PlusIcon,
    DockView: NewTabButton,
  },
  {
    id: DockItemId.ACCOUNT_SWITCHER,
    labelKey: 'sessionHeader.accountSwitcher.title',
    icon: UserCircleIcon,
    DockView: AccountSwitcher,
  },
];

const BY_ID = new Map(DOCK_ITEMS.map((item) => [item.id, item]));

/** Look up an item definition. Returns undefined for an id this build removed. */
export function getDockItem(id: DockItemId): DockItemDef | undefined {
  return BY_ID.get(id);
}

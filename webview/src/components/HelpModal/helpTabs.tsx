import type { ComponentType } from 'react';
import { ShortcutsTab } from './ShortcutsTab';
import type { ShortcutContext } from './shortcutCatalog';

/** Which panel of the help modal is showing. */
export enum HelpTab {
  Shortcuts = 'shortcuts',
}

/** What every tab panel is handed. */
export interface HelpTabPanelProps {
  context: ShortcutContext;
}

export interface HelpTabDef {
  id: HelpTab;
  /** Key in common.json for the tab's label. */
  labelKey: string;
  Panel: ComponentType<HelpTabPanelProps>;
}

/**
 * The tabs, left to right. The first is the one the modal opens on, and adding
 * a tab is one more entry here plus a member of {@link HelpTab}.
 */
export const HELP_TABS: readonly HelpTabDef[] = [
  { id: HelpTab.Shortcuts, labelKey: 'helpModal.tabs.shortcuts', Panel: ShortcutsTab },
];

export const DEFAULT_HELP_TAB: HelpTab = HELP_TABS[0].id;

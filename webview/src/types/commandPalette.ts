// ============================================
// Slash Command Panel Types
// ============================================

import React from 'react';

// Icon Types
export enum IconType {
  Terminal = 'terminal',
  File = 'file',
  Settings = 'settings',
  Link = 'link',
  Command = 'command',
  Clock = 'clock',
}

// Panel Section Types
export enum PanelSectionId {
  Context = 'context',
  Model = 'model',
  Customize = 'customize',
  SlashCommands = 'slashCommands',
  Settings = 'settings',
  Support = 'support',
}

// Panel Item Types
export enum PanelItemType {
  Action = 'action',
  Toggle = 'toggle',
  Link = 'link',
  Command = 'command',
  Info = 'info',
}

export interface PanelItemBase {
  id: string;
  label: string;
  type: PanelItemType;
  icon?: IconType;
  valueComponent?: () => React.ReactNode;
  /** Rendered right after the label (secondary color), e.g. Effort's "(Extra high)". */
  labelSuffix?: () => React.ReactNode;
  disabled?: boolean;
  /** Hover tooltip shown on a disabled row explaining why it's unavailable (e.g. model capability gating). */
  disabledReason?: string;
  keepOpen?: boolean;
  /** Hidden from the panel by default; only surfaced when the filter query matches its label. */
  searchOnly?: boolean;
  /** Extra search terms; the item also matches the filter query when one of these contains it. */
  keywords?: string[];
  textStyle?: {
    underline?: boolean;
    italic?: boolean;
    align?: 'left' | 'right';
    size?: 'small' | 'normal';
    color?: 'primary' | 'secondary';
  };
}

export interface ActionItem extends PanelItemBase {
  type: PanelItemType.Action;
  action: () => void | Promise<void>;
}

export interface ToggleItem extends PanelItemBase {
  type: PanelItemType.Toggle;
  toggled: boolean;
  onToggle: (value: boolean) => void;
}

export interface LinkItem extends PanelItemBase {
  type: PanelItemType.Link;
  href: string;
}

export interface CommandItem extends PanelItemBase {
  type: PanelItemType.Command;
  name: string;
  description: string;
  action: () => void | Promise<void>;
}

export interface InfoItem extends PanelItemBase {
  type: PanelItemType.Info;
}

export type PanelItem = ActionItem | ToggleItem | LinkItem | CommandItem | InfoItem;

// Panel Section
export interface PanelSection {
  id: PanelSectionId;
  title: string;
  items: PanelItem[];
  scrollable?: boolean;
  maxHeight?: number;
  showDividerAbove: boolean;
  onHeaderClick?: () => void;
}

// State Types
export interface CommandPaletteState {
  isOpen: boolean;
  filterQuery: string;
  selectedSectionIndex: number;
  selectedItemIndex: number;
}

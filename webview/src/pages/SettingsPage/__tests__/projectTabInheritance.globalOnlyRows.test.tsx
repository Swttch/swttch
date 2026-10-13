import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import enSettings from '@/i18n/locales/en/settings.json';

/**
 * #547, the global-only rows. Some settings have no per-project meaning: a row
 * for one of them writes the user's file whichever tab is open. On the project
 * tab such a row used to look editable and then change something the tab does
 * not show, and the allow-all switch drew the project's own empty file as "off"
 * while the global value it actually runs on was "on".
 *
 * On the project tab these rows are inert, as the allow-all and nonessential
 * traffic rows already were, and they draw the value in effect.
 */

type Store = Record<string, unknown>;

let mockScope: 'global' | 'project' = 'global';
let mockAppOwn: Store = {};
let mockAppMerged: Store = {};

// Hoisted with the vi.mock calls below, which run before any plain declaration.
const { noop } = vi.hoisted(() => ({ noop: vi.fn() }));

vi.mock('@/contexts/SettingsContext', () => {
  const value = () => ({
    scope: mockScope,
    scopeSettings: mockAppOwn,
    settings: mockAppMerged,
    overrides: [] as string[],
    updateSetting: noop,
    updateSettingWithScope: noop,
    resetToGlobal: noop,
    ideAttached: false,
    ideProduct: '',
  });
  return { useSettings: value, useSettingsOrNull: value };
});
vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ scope: mockScope, scopeSettings: {}, settings: {}, overrides: [] }),
  useClaudeSettingsOrNull: () => null,
}));
vi.mock('@/contexts/AllowAllCommandsContext', () => ({
  useAllowAllCommands: () => ({
    requestEnableByDefault: noop,
    disableByDefault: noop,
    sponsorLocked: false,
  }),
}));
vi.mock('@/utils/followSponsorOffer', () => ({ followSponsorOffer: noop }));
vi.mock('@/utils/reportSponsorGate', () => ({ reportSponsorGate: noop }));
// The host mode row exists only inside an IDE.
vi.mock('@/config/environment', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isJetBrains: () => true,
}));

import { ChatPaginationRow } from '../General/Basics/ChatPaginationRow';
import { HostModeRow } from '../General/Basics/HostModeRow';
import { OpenSettingsRow } from '../General/Basics/OpenSettingsRow';
import { UiDirectionRow } from '../General/Basics/UiDirectionRow';
import { AllowAllCommandsRow } from '../Permissions/AllowAllCommands/AllowAllCommandsRow';

function label(path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enSettings);
  if (typeof value !== 'string') throw new Error(`no English string at settings:${path}`);
  return value;
}

/** The wrapper the global-only guard puts around a control it has switched off. */
const isInert = (control: HTMLElement) => control.closest('.pointer-events-none') !== null;

interface GlobalOnlyRow {
  name: string;
  Row: ComponentType;
  /** Finds the row's control. */
  control: () => HTMLElement;
  key: string;
  /** A value the row draws as "on" / as the non-default choice, and what it shows. */
  value: unknown;
  expectShows: (control: HTMLElement) => void;
}

const GLOBAL_ONLY_ROWS: GlobalOnlyRow[] = [
  {
    name: 'ChatPaginationRow',
    Row: ChatPaginationRow,
    control: () => screen.getByRole('switch', { name: label('general.chatPagination.label') }),
    key: 'chatPagination',
    value: false,
    expectShows: (c) => expect(c).toHaveAttribute('aria-checked', 'false'),
  },
  {
    name: 'UiDirectionRow',
    Row: UiDirectionRow,
    control: () => screen.getByRole('switch'),
    key: 'uiDirection',
    value: 'rtl',
    expectShows: (c) => expect(c).toHaveAttribute('aria-checked', 'true'),
  },
  {
    name: 'OpenSettingsRow',
    Row: OpenSettingsRow,
    control: () => screen.getByRole('button', { name: /./ }),
    key: 'openSettingsAs',
    value: 'new-tab',
    expectShows: (c) => expect(c).toHaveTextContent(label('general.openSettings.newTab')),
  },
  {
    name: 'HostModeRow',
    Row: HostModeRow,
    control: () => screen.getByRole('button', { name: /./ }),
    key: 'hostMode',
    value: 'tool-window',
    expectShows: (c) => expect(c).toHaveTextContent(label('general.hostMode.sidebar')),
  },
  {
    name: 'AllowAllCommandsRow',
    Row: AllowAllCommandsRow,
    control: () => screen.getByRole('switch', { name: label('permissions.allowAllCommands.label') }),
    key: 'allowAllCommandsByDefault',
    value: true,
    expectShows: (c) => expect(c).toHaveAttribute('aria-checked', 'true'),
  },
];

beforeEach(() => {
  mockScope = 'global';
  mockAppOwn = {};
  mockAppMerged = {};
});

describe.each(GLOBAL_ONLY_ROWS)('$name', (row) => {
  it('is inert on the project tab and draws the value in effect', () => {
    mockScope = 'project';
    mockAppOwn = {};
    mockAppMerged = { [row.key]: row.value };
    render(<row.Row />);

    const control = row.control();
    expect(isInert(control)).toBe(true);
    row.expectShows(control);
  });

  it('stays editable on the global tab', () => {
    mockScope = 'global';
    mockAppOwn = { [row.key]: row.value };
    mockAppMerged = { [row.key]: row.value };
    render(<row.Row />);

    const control = row.control();
    expect(isInert(control)).toBe(false);
    row.expectShows(control);
  });
});

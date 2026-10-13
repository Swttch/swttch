import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentType } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import enSettings from '@/i18n/locales/en/settings.json';
import { projectValueBadge, resetFromBadge } from './projectValueBadge';

/**
 * #547 for the rows that used to answer "nothing is set here" on the project
 * tab with a placeholder, an empty field or a "Not set" entry instead of the
 * value the project actually uses. That was honest about the project's own
 * file and no help to someone who wants to know what they get. These rows now
 * draw the inherited value like every other row, and keep their way of taking
 * an override back.
 */

type Store = Record<string, unknown>;

let mockScope: 'global' | 'project' = 'global';
let mockAppOwn: Store = {};
let mockAppMerged: Store = {};
let mockClaudeOwn: Store = {};
let mockClaudeMerged: Store = {};

const updateSettingMock = vi.fn();
const resetToGlobalMock = vi.fn();
const noop = vi.fn();

vi.mock('@/contexts/SettingsContext', () => {
  const value = () => ({
    scope: mockScope,
    scopeSettings: mockAppOwn,
    settings: mockAppMerged,
    overrides: [] as string[],
    updateSetting: updateSettingMock,
    updateSettingWithScope: noop,
    resetToGlobal: resetToGlobalMock,
    ideAttached: false,
    ideProduct: '',
  });
  return { useSettings: value, useSettingsOrNull: value };
});

vi.mock('@/contexts/ClaudeSettingsContext', () => {
  const value = () => ({
    scope: mockScope,
    scopeSettings: mockClaudeOwn,
    settings: mockClaudeMerged,
    overrides: [] as string[],
    updateSetting: updateSettingMock,
    updateSettingWithScope: noop,
    resetToGlobal: resetToGlobalMock,
  });
  return { useClaudeSettings: value, useClaudeSettingsOrNull: value };
});

// DefaultModeRow reads the live session and the model catalog.
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null, isLoading: false, refresh: vi.fn() }),
}));
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ sessionModel: null }),
}));

import { DebugModeRow } from '../Advanced/Debugging/DebugModeRow';
import { LogLevelRow } from '../Advanced/Debugging/LogLevelRow';
import { ColorThemeRow } from '../Appearance/Theme/ColorThemeRow';
import { FontSizeRow } from '../Appearance/Theme/FontSizeRow';
import { LineSpacingRow } from '../Appearance/Theme/LineSpacingRow';
import { AutoScrollThresholdRow } from '../Appearance/Scrolling/AutoScrollThresholdRow';
import { UiLanguageRow } from '../General/Basics/UiLanguageRow';
import { BypassModeRow } from '../Permissions/BypassMode/BypassModeRow';
import { DefaultModeRow } from '../Permissions/DefaultMode/DefaultModeRow';

function label(path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enSettings);
  if (typeof value !== 'string') throw new Error(`no English string at settings:${path}`);
  return value;
}

const inheritedBadge = () => screen.queryByRole('img', { name: /Not set in this project/ });

interface NotSetRow {
  name: string;
  Row: ComponentType;
  store: 'app' | 'claude';
  /** The whole object stored for this scope, with the row's value in it. */
  withValue: (value: unknown) => Store;
  inheritedValue: unknown;
  ownValue: unknown;
  expectShows: (value: unknown) => void;
}

const selectText = (name: string) => screen.getByRole('button', { name });

const NOT_SET_ROWS: NotSetRow[] = [
  {
    name: 'DebugModeRow',
    Row: DebugModeRow,
    store: 'app',
    withValue: (v) => ({ debugMode: v }),
    inheritedValue: true,
    ownValue: false,
    expectShows: (v) => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', String(v)),
  },
  {
    name: 'LogLevelRow',
    Row: LogLevelRow,
    store: 'app',
    withValue: (v) => ({ logLevel: v }),
    inheritedValue: 'debug',
    ownValue: 'error',
    expectShows: (v) =>
      expect(selectText(label('advanced.debugging.logLevel.label'))).toHaveTextContent(
        v === 'debug' ? label('advanced.debugging.logLevel.debug') : label('advanced.debugging.logLevel.error'),
      ),
  },
  {
    name: 'ColorThemeRow',
    Row: ColorThemeRow,
    store: 'app',
    withValue: (v) => ({ theme: v }),
    inheritedValue: 'dark',
    ownValue: 'light',
    expectShows: (v) =>
      expect(selectText(label('appearance.theme.colorTheme.label'))).toHaveTextContent(
        v === 'dark' ? label('appearance.theme.colorTheme.dark') : label('appearance.theme.colorTheme.light'),
      ),
  },
  {
    name: 'UiLanguageRow',
    Row: UiLanguageRow,
    store: 'app',
    withValue: (v) => ({ uiLanguage: v }),
    inheritedValue: 'korean',
    ownValue: 'japanese',
    expectShows: (v) =>
      expect(selectText(label('general.uiLanguage.label'))).toHaveTextContent(
        v === 'korean' ? /한국어|Korean/ : /日本語|Japanese/,
      ),
  },
  {
    name: 'FontSizeRow',
    Row: FontSizeRow,
    store: 'app',
    withValue: (v) => ({ fontSize: v }),
    inheritedValue: 20,
    ownValue: 15,
    expectShows: (v) => expect(screen.getByRole('spinbutton')).toHaveValue(v as number),
  },
  {
    name: 'LineSpacingRow',
    Row: LineSpacingRow,
    store: 'app',
    withValue: (v) => ({ lineHeight: v }),
    inheritedValue: 1.8,
    ownValue: 1.4,
    expectShows: (v) => expect(screen.getByRole('spinbutton')).toHaveValue(v as number),
  },
  {
    name: 'AutoScrollThresholdRow',
    Row: AutoScrollThresholdRow,
    store: 'app',
    withValue: (v) => ({ autoScrollThreshold: v }),
    inheritedValue: 120,
    ownValue: 40,
    expectShows: (v) => expect(screen.getByRole('spinbutton')).toHaveValue(v as number),
  },
  {
    name: 'BypassModeRow',
    Row: BypassModeRow,
    store: 'claude',
    withValue: (v) => ({ permissions: { disableBypassPermissionsMode: v } }),
    inheritedValue: 'disable',
    ownValue: 'disable',
    expectShows: () =>
      expect(screen.getByRole('switch', { name: label('permissions.bypassMode.label') })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
  },
  {
    name: 'DefaultModeRow',
    Row: DefaultModeRow,
    store: 'claude',
    withValue: (v) => ({ permissions: { defaultMode: v } }),
    inheritedValue: 'plan',
    ownValue: 'acceptEdits',
    expectShows: (v) =>
      expect(selectText(label('permissions.defaultMode.label'))).toHaveTextContent(
        v === 'plan' ? 'Plan mode' : 'Edit automatically',
      ),
  },
];

function setStores(row: NotSetRow, own: Store, merged: Store) {
  if (row.store === 'app') {
    mockAppOwn = own;
    mockAppMerged = merged;
  } else {
    mockClaudeOwn = own;
    mockClaudeMerged = merged;
  }
}

beforeEach(() => {
  mockScope = 'global';
  mockAppOwn = {};
  mockAppMerged = {};
  mockClaudeOwn = {};
  mockClaudeMerged = {};
  updateSettingMock.mockReset();
  resetToGlobalMock.mockReset();
});

describe.each(NOT_SET_ROWS)('$name', (row) => {
  const { Row } = row;

  describe('on the project tab', () => {
    beforeEach(() => {
      mockScope = 'project';
    });

    it('shows the value inherited from global when the project has not set one', () => {
      setStores(row, {}, row.withValue(row.inheritedValue));
      render(<Row />);

      row.expectShows(row.inheritedValue);
      expect(inheritedBadge()).toBeInTheDocument();
      expect(projectValueBadge()).not.toBeInTheDocument();
    });

    it("shows the project's own value, unmarked, when the project set one", async () => {
      setStores(row, row.withValue(row.ownValue), row.withValue(row.ownValue));
      render(<Row />);

      row.expectShows(row.ownValue);
      expect(inheritedBadge()).not.toBeInTheDocument();
      expect(projectValueBadge()).toBeInTheDocument();

      // The reset link in the badge's tooltip takes the project's value back.
      // Claude's permissions live in one object, so there the link rewrites the
      // object without the key rather than deleting a top-level key.
      await resetFromBadge();
      const [storedKey] = Object.keys(row.withValue(row.ownValue));
      if (storedKey === 'permissions') {
        expect(updateSettingMock).toHaveBeenCalledWith('permissions', {});
      } else {
        expect(resetToGlobalMock).toHaveBeenCalledWith(storedKey);
      }
    });
  });

  describe('on the global tab', () => {
    it('shows the global value, unmarked', () => {
      setStores(row, row.withValue(row.ownValue), row.withValue(row.inheritedValue));
      render(<Row />);

      row.expectShows(row.ownValue);
      expect(inheritedBadge()).not.toBeInTheDocument();
      expect(projectValueBadge()).not.toBeInTheDocument();
    });
  });
});

describe('taking a project override back', () => {
  beforeEach(() => {
    mockScope = 'project';
  });

  it('offers "Not set" on the log level once the project has its own value, and clears it', () => {
    mockAppOwn = { logLevel: 'error' };
    mockAppMerged = { logLevel: 'error' };
    render(<LogLevelRow />);

    fireEvent.click(screen.getByRole('button', { name: label('advanced.debugging.logLevel.label') }));
    fireEvent.click(screen.getByRole('option', { name: label('advanced.debugging.logLevel.notSet') }));

    expect(resetToGlobalMock).toHaveBeenCalledWith('logLevel');
    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('lets the user keep an inherited value by choosing it, which stores it in the project', () => {
    mockAppOwn = {};
    mockAppMerged = { logLevel: 'debug' };
    render(<LogLevelRow />);

    fireEvent.click(screen.getByRole('button', { name: label('advanced.debugging.logLevel.label') }));
    fireEvent.click(screen.getByRole('option', { name: label('advanced.debugging.logLevel.debug') }));

    expect(updateSettingMock).toHaveBeenCalledWith('logLevel', 'debug');
  });

  it('empties the field to drop the override on a numeric row', () => {
    mockAppOwn = { fontSize: 15 };
    mockAppMerged = { fontSize: 15 };
    render(<FontSizeRow />);

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });

    expect(resetToGlobalMock).toHaveBeenCalledWith('fontSize');
  });
});

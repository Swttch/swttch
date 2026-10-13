import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import enSettings from '@/i18n/locales/en/settings.json';
import { projectValueBadge, resetFromBadge } from './projectValueBadge';

/**
 * #547 for the rows that draw a value rather than a switch: text and number
 * fields, dropdowns, the shortcut recorder. Same claim as the toggle table
 * (projectTabInheritance.test.tsx): a project that says nothing about a key
 * shows what it inherits, marked as inherited, and a project that did set the
 * key shows its own value unmarked.
 */

type Store = Record<string, unknown>;

let mockScope: 'global' | 'project' = 'global';
let mockAppOwn: Store = {};
let mockAppMerged: Store = {};
let mockClaudeOwn: Store = {};
let mockClaudeMerged: Store = {};

const noop = vi.fn();
const { appReset, claudeReset } = vi.hoisted(() => ({ appReset: vi.fn(), claudeReset: vi.fn() }));

vi.mock('@/contexts/SettingsContext', () => {
  const value = () => ({
    scope: mockScope,
    scopeSettings: mockAppOwn,
    settings: mockAppMerged,
    overrides: [] as string[],
    updateSetting: noop,
    updateSettingWithScope: noop,
    resetToGlobal: appReset,
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
    updateSetting: noop,
    updateSettingWithScope: noop,
    resetToGlobal: claudeReset,
  });
  return { useClaudeSettings: value, useClaudeSettingsOrNull: value };
});

// The diff presentation row only offers a choice with the built-in diff surface
// and a layout that has room for an overlay; pin both so the choice is shown.
vi.mock('@/hooks/useIdeDiffAvailable', () => ({
  useResolvedDiffSurface: () => 'built-in',
  useAutoOpenDiffEnabled: () => true,
}));
vi.mock('@/hooks/useDiffOverlayAllowed', () => ({
  useDiffOverlayAllowed: () => true,
}));

import { LanguageRow } from '../General/Basics/LanguageRow';
import { FileSuggestionRow } from '../General/Basics/FileSuggestionRow';
import { EnabledRow } from '../General/Voice/EnabledRow';
import { ShortcutRow } from '../General/Voice/ShortcutRow';
import { SilenceTimeoutRow } from '../General/Voice/SilenceTimeoutRow';
import { SpokenLanguageRow } from '../General/Voice/SpokenLanguageRow';
import { PresentationRow } from '../General/DiffView/PresentationRow';

function label(path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enSettings);
  if (typeof value !== 'string') throw new Error(`no English string at settings:${path}`);
  return value;
}

const inheritedBadge = () => screen.queryByRole('img', { name: /Not set in this project/ });

interface ValueRow {
  name: string;
  Row: ComponentType;
  store: 'app' | 'claude';
  /** The settings key the row's value lives under. */
  key: string;
  /** What the row would draw if it read the project's own, empty, file. */
  inheritedValue: unknown;
  ownValue: unknown;
  /** Finds the control and checks it shows [value]. */
  expectShows: (value: unknown) => void;
}

const VALUE_ROWS: ValueRow[] = [
  {
    name: 'LanguageRow',
    Row: LanguageRow,
    store: 'claude',
    key: 'language',
    inheritedValue: 'korean',
    ownValue: 'japanese',
    expectShows: (v) =>
      expect(screen.getByRole('textbox', { name: label('general.language.label') })).toHaveValue(v as string),
  },
  {
    name: 'FileSuggestionRow',
    Row: FileSuggestionRow,
    store: 'claude',
    key: 'fileSuggestion',
    inheritedValue: { type: 'command', command: 'global-suggester' },
    ownValue: { type: 'command', command: 'project-suggester' },
    expectShows: (v) =>
      expect(screen.getByRole('textbox', { name: 'fileSuggestion' })).toHaveValue(
        (v as { command: string }).command,
      ),
  },
  {
    name: 'Voice EnabledRow',
    Row: EnabledRow,
    store: 'claude',
    key: 'voice',
    inheritedValue: { enabled: false },
    ownValue: { enabled: false },
    expectShows: () =>
      expect(screen.getByRole('switch', { name: label('general.voice.enabled.label') })).toHaveAttribute(
        'aria-checked',
        'false',
      ),
  },
  {
    name: 'Voice ShortcutRow',
    Row: ShortcutRow,
    store: 'app',
    key: 'voice',
    inheritedValue: { shortcut: 'Alt+K' },
    ownValue: { shortcut: 'Alt+J' },
    expectShows: (v) =>
      expect(screen.getByRole('button', { name: label('general.voice.shortcut.label') })).toHaveTextContent(
        (v as { shortcut: string }).shortcut.slice(-1),
      ),
  },
  {
    name: 'Voice SilenceTimeoutRow',
    Row: SilenceTimeoutRow,
    store: 'app',
    key: 'voice',
    inheritedValue: { silenceTimeout: 7 },
    ownValue: { silenceTimeout: 4 },
    expectShows: (v) =>
      expect(screen.getByRole('spinbutton', { name: label('general.voice.silenceTimeout.label') })).toHaveValue(
        (v as { silenceTimeout: number }).silenceTimeout,
      ),
  },
  {
    name: 'Voice SpokenLanguageRow',
    Row: SpokenLanguageRow,
    store: 'app',
    key: 'voice',
    inheritedValue: { speechLanguage: 'ko' },
    ownValue: { speechLanguage: 'ja' },
    expectShows: (v) =>
      expect(screen.getByRole('button', { name: label('general.voice.speechLanguage.label') })).toHaveTextContent(
        (v as { speechLanguage: string }).speechLanguage === 'ko' ? /Korean/i : /Japanese/i,
      ),
  },
  {
    name: 'PresentationRow',
    Row: PresentationRow,
    store: 'app',
    key: 'browserDiffPresentation',
    inheritedValue: 'overlay',
    ownValue: 'new-tab',
    expectShows: (v) =>
      expect(screen.getByRole('button', { name: label('diffView.presentation.label') })).toHaveTextContent(
        v === 'overlay' ? label('diffView.presentation.overlay') : label('diffView.presentation.newTab'),
      ),
  },
];

function setStores(row: ValueRow, own: Store, merged: Store) {
  if (row.store === 'app') {
    mockAppOwn = own;
    mockAppMerged = merged;
  } else {
    mockClaudeOwn = own;
    mockClaudeMerged = merged;
  }
}

beforeEach(() => {
  appReset.mockReset();
  claudeReset.mockReset();
  mockScope = 'global';
  mockAppOwn = {};
  mockAppMerged = {};
  mockClaudeOwn = {};
  mockClaudeMerged = {};
});

describe.each(VALUE_ROWS)('$name', (row) => {
  const { Row, key } = row;

  describe('on the project tab', () => {
    beforeEach(() => {
      mockScope = 'project';
    });

    it('shows the global value when the project has not set one', () => {
      setStores(row, {}, { [key]: row.inheritedValue });
      render(<Row />);

      row.expectShows(row.inheritedValue);
      expect(inheritedBadge()).toBeInTheDocument();
      expect(projectValueBadge()).not.toBeInTheDocument();
    });

    it("shows the project's own value, unmarked, when the project set one", async () => {
      setStores(row, { [key]: row.ownValue }, { [key]: row.ownValue });
      render(<Row />);

      row.expectShows(row.ownValue);
      expect(inheritedBadge()).not.toBeInTheDocument();
      expect(projectValueBadge()).toBeInTheDocument();
      await resetFromBadge();
      const reset = row.store === 'claude' ? claudeReset : appReset;
      expect(reset).toHaveBeenCalledWith(row.key);
    });
  });

  describe('on the global tab', () => {
    it('shows the global value, unmarked', () => {
      setStores(row, { [key]: row.ownValue }, { [key]: row.inheritedValue });
      render(<Row />);

      row.expectShows(row.ownValue);
      expect(inheritedBadge()).not.toBeInTheDocument();
      expect(projectValueBadge()).not.toBeInTheDocument();
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import enSettings from '@/i18n/locales/en/settings.json';
import { projectValueBadge, resetFromBadge } from './projectValueBadge';

/**
 * #547, across the whole settings screen: a project that says nothing about a
 * key uses the global value, so the project tab has to show that value rather
 * than whatever constant the row falls back on.
 *
 * One table instead of a test file per row, because the claim is the same for
 * every row and a row that forgets it is exactly the bug. Every toggle row of
 * the screen is listed; a new one is added here, not skipped.
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

import { HideToolCallsRow } from '../Appearance/Chat/HideToolCallsRow';
import { SoftWrapRow } from '../Appearance/Theme/SoftWrapRow';
import { AutoResumeOnLimitRow } from '../General/Basics/AutoResumeOnLimitRow';
import { AttachEditorContextRow } from '../Ide/Integration/AttachEditorContextRow';
import { FocusInputRow } from '../Ide/Integration/FocusInputRow';
import { FileCheckpointingRow } from '../General/Basics/FileCheckpointingRow';
import { RespectGitignoreRow } from '../General/Basics/RespectGitignoreRow';
import { ShowThinkingSummariesRow } from '../General/Basics/ShowThinkingSummariesRow';

/** `a.b.c` into the English catalog, the string the row's label really renders. */
function label(path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enSettings);
  if (typeof value !== 'string') throw new Error(`no English string at settings:${path}`);
  return value;
}

interface ToggleRow {
  name: string;
  Row: ComponentType;
  labelPath: string;
  /** Which store the row's key lives in. */
  store: 'app' | 'claude';
  key: string;
  /** What the row draws when nothing anywhere has set the key. */
  builtInDefault: boolean;
}

const TOGGLE_ROWS: ToggleRow[] = [
  { name: 'HideToolCallsRow', Row: HideToolCallsRow, labelPath: 'appearance.hideToolCalls.label', store: 'app', key: 'hideToolCalls', builtInDefault: false },
  { name: 'SoftWrapRow', Row: SoftWrapRow, labelPath: 'appearance.softWrap.label', store: 'app', key: 'softWrap', builtInDefault: false },
  { name: 'AutoResumeOnLimitRow', Row: AutoResumeOnLimitRow, labelPath: 'general.autoResumeOnLimit.label', store: 'app', key: 'autoResumeOnLimit', builtInDefault: false },
  { name: 'AttachEditorContextRow', Row: AttachEditorContextRow, labelPath: 'ide.attachEditorContext.label', store: 'app', key: 'attachEditorContext', builtInDefault: true },
  { name: 'FocusInputRow', Row: FocusInputRow, labelPath: 'ide.focusInputOnEditorContext.label', store: 'app', key: 'focusInputOnEditorContext', builtInDefault: true },
  { name: 'FileCheckpointingRow', Row: FileCheckpointingRow, labelPath: 'general.fileCheckpointing.label', store: 'claude', key: 'fileCheckpointingEnabled', builtInDefault: true },
  { name: 'RespectGitignoreRow', Row: RespectGitignoreRow, labelPath: 'general.respectGitignore.label', store: 'claude', key: 'respectGitignore', builtInDefault: false },
  { name: 'ShowThinkingSummariesRow', Row: ShowThinkingSummariesRow, labelPath: 'general.showThinkingSummaries.label', store: 'claude', key: 'showThinkingSummaries', builtInDefault: false },
];

const inheritedBadge = () => screen.queryByRole('img', { name: /Not set in this project/ });

function setStores(row: ToggleRow, own: Store, merged: Store) {
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

describe.each(TOGGLE_ROWS)('$name', (row) => {
  const { Row, key, builtInDefault } = row;
  const opposite = !builtInDefault;
  const theSwitch = () => screen.getByRole('switch', { name: label(row.labelPath) });

  describe('on the project tab', () => {
    beforeEach(() => {
      mockScope = 'project';
    });

    it('shows the global value when the project has not set one', () => {
      setStores(row, {}, { [key]: opposite });
      render(<Row />);

      expect(theSwitch()).toHaveAttribute('aria-checked', String(opposite));
      expect(inheritedBadge()).toBeInTheDocument();
      expect(projectValueBadge()).not.toBeInTheDocument();
    });

    it('shows the built-in default when neither global nor project set one', () => {
      setStores(row, {}, {});
      render(<Row />);

      expect(theSwitch()).toHaveAttribute('aria-checked', String(builtInDefault));
      expect(inheritedBadge()).toBeInTheDocument();
      expect(projectValueBadge()).not.toBeInTheDocument();
    });

    it("shows the project's own value, unmarked, when the project set one", async () => {
      setStores(row, { [key]: opposite }, { [key]: opposite });
      render(<Row />);

      expect(theSwitch()).toHaveAttribute('aria-checked', String(opposite));
      expect(inheritedBadge()).not.toBeInTheDocument();
      expect(projectValueBadge()).toBeInTheDocument();
      await resetFromBadge();
      const reset = row.store === 'claude' ? claudeReset : appReset;
      expect(reset).toHaveBeenCalledWith(row.key);
    });
  });

  describe('on the global tab', () => {
    it('shows the global value, unmarked', () => {
      setStores(row, { [key]: opposite }, { [key]: builtInDefault });
      render(<Row />);

      expect(theSwitch()).toHaveAttribute('aria-checked', String(opposite));
      expect(inheritedBadge()).not.toBeInTheDocument();
      expect(projectValueBadge()).not.toBeInTheDocument();
    });
  });
});

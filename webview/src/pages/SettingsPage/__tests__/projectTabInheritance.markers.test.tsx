import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import { projectValueBadge, resetFromBadge } from './projectValueBadge';

/**
 * #547 for the rows that already draw the value in effect (they read the merged
 * settings), so the value on the project tab was right. What they did not say
 * is where it came from, and several did not say on the global tab that a
 * project overrides them either.
 *
 * Three markers, each asserted for every such row:
 * - the project tab, the project silent: "inherited"
 * - the project tab, the project set it: no marker
 * - the global tab, a project overriding the key: "the project overrides this"
 */

type Store = Record<string, unknown>;

let mockScope: 'global' | 'project' = 'global';
let mockAppOwn: Store = {};
let mockAppMerged: Store = {};
let mockAppOverrides: string[] = [];
let mockClaudeOwn: Store = {};
let mockClaudeMerged: Store = {};
let mockClaudeOverrides: string[] = [];

const noop = vi.fn();
const { appReset, claudeReset } = vi.hoisted(() => ({ appReset: vi.fn(), claudeReset: vi.fn() }));

vi.mock('@/contexts/SettingsContext', () => {
  const value = () => ({
    scope: mockScope,
    scopeSettings: mockAppOwn,
    settings: mockAppMerged,
    overrides: mockAppOverrides,
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
    overrides: mockClaudeOverrides,
    updateSetting: noop,
    updateSettingWithScope: noop,
    resetToGlobal: claudeReset,
  });
  return { useClaudeSettings: value, useClaudeSettingsOrNull: value };
});

// Rows that ask the backend for something while they mount.
// One `send` for every render, as the real hook gives: useDetectedPath re-asks
// whenever `send` changes, so a fresh function per render never stops asking.
const { bridgeSend } = vi.hoisted(() => ({ bridgeSend: vi.fn() }));
bridgeSend.mockResolvedValue({ editors: [], terminals: [], path: null });
vi.mock('@/hooks/useBridge', () => ({ useBridge: () => ({ send: bridgeSend }) }));
vi.mock('@/api/ClaudeCodeApi', () => ({
  api: {
    notifications: { bannerPersistence: () => Promise.resolve('unknown') },
    sounds: { play: () => Promise.resolve() },
  },
}));
vi.mock('@/notifications', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSystemSounds: () => ({ sounds: [], loading: false, error: null }),
}));
vi.mock('@/hooks/useIdeDiffAvailable', () => ({
  useResolvedDiffSurface: () => 'built-in',
  useAutoOpenDiffEnabled: () => true,
}));
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null, isLoading: false, refresh: vi.fn() }),
}));
vi.mock('@/hooks/useVersionInfo', () => ({ useVersionInfo: () => ({ cliVersion: null }) }));
vi.mock('@/contexts/FableProbeContext', () => ({
  useFableProbe: () => ({
    probedAvailable: null,
    probedCanonicalModel: null,
    probeFableAvailability: vi.fn(),
  }),
  shouldProbeFable: () => false,
}));
vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDir: () => ({ workingDirectory: '/project' }),
}));

import { BannerRow } from '../General/Notifications/BannerRow';
import { SoundRow } from '../General/Notifications/SoundRow';
import { VolumeRow } from '../General/Notifications/VolumeRow';
import { AutoOpenRow } from '../General/DiffView/AutoOpenRow';
import { SurfaceRow } from '../General/DiffView/SurfaceRow';
import { SyncToDefaultRow } from '../Model/Defaults/SyncToDefaultRow';
import { GenerateSessionTitlesRow } from '../General/Basics/GenerateSessionTitlesRow';
import { SessionTitleFromLastPromptRow } from '../General/Basics/SessionTitleFromLastPromptRow';
import { DefaultModelRow } from '../Model/Defaults/DefaultModelRow';
import { CliPathRow } from '../Cli/Tools/CliPathRow';
import { NodePathRow } from '../Cli/Tools/NodePathRow';
import { TerminalAppRow } from '../Cli/Tools/TerminalAppRow';
import { OpenFilesWithRow } from '../Cli/Tools/OpenFilesWithRow';

interface MergedRow {
  name: string;
  Row: ComponentType;
  store: 'app' | 'claude';
  key: string;
}

const MERGED_ROWS: MergedRow[] = [
  { name: 'BannerRow', Row: BannerRow, store: 'app', key: 'notificationBanner' },
  { name: 'SoundRow', Row: SoundRow, store: 'app', key: 'notificationSound' },
  { name: 'VolumeRow', Row: VolumeRow, store: 'app', key: 'notificationSoundVolume' },
  { name: 'AutoOpenRow', Row: AutoOpenRow, store: 'app', key: 'autoOpenDiffOnPermission' },
  { name: 'SurfaceRow', Row: SurfaceRow, store: 'app', key: 'diffSurface' },
  { name: 'SyncToDefaultRow', Row: SyncToDefaultRow, store: 'app', key: 'syncModelToDefault' },
  { name: 'GenerateSessionTitlesRow', Row: GenerateSessionTitlesRow, store: 'app', key: 'generateSessionTitles' },
  { name: 'SessionTitleFromLastPromptRow', Row: SessionTitleFromLastPromptRow, store: 'app', key: 'sessionTitleFromLastPrompt' },
  { name: 'DefaultModelRow', Row: DefaultModelRow, store: 'claude', key: 'model' },
  { name: 'CliPathRow', Row: CliPathRow, store: 'app', key: 'cliPath' },
  { name: 'NodePathRow', Row: NodePathRow, store: 'app', key: 'nodePath' },
  { name: 'TerminalAppRow', Row: TerminalAppRow, store: 'app', key: 'terminalApp' },
  { name: 'OpenFilesWithRow', Row: OpenFilesWithRow, store: 'app', key: 'openFilesWith' },
];

const inheritedBadge = () => screen.queryByRole('img', { name: /Not set in this project/ });
const overrideBadge = () => screen.queryByRole('img', { name: /The project overrides this/ });

function setStores(row: MergedRow, own: Store, merged: Store, overrides: string[]) {
  if (row.store === 'app') {
    mockAppOwn = own;
    mockAppMerged = merged;
    mockAppOverrides = overrides;
  } else {
    mockClaudeOwn = own;
    mockClaudeMerged = merged;
    mockClaudeOverrides = overrides;
  }
}

beforeEach(() => {
  appReset.mockReset();
  claudeReset.mockReset();
  mockScope = 'global';
  mockAppOwn = {};
  mockAppMerged = {};
  mockAppOverrides = [];
  mockClaudeOwn = {};
  mockClaudeMerged = {};
  mockClaudeOverrides = [];
});

describe.each(MERGED_ROWS)('$name', (row) => {
  const { Row, key } = row;

  it('marks a project-tab value the project never set as inherited', () => {
    mockScope = 'project';
    setStores(row, {}, { [key]: 'from-global' }, []);
    render(<Row />);

    expect(inheritedBadge()).toBeInTheDocument();
    expect(projectValueBadge()).not.toBeInTheDocument();
    expect(overrideBadge()).not.toBeInTheDocument();
  });

  it('leaves a project-tab value the project set unmarked', async () => {
    mockScope = 'project';
    setStores(row, { [key]: 'from-project' }, { [key]: 'from-project' }, [key]);
    render(<Row />);

    expect(inheritedBadge()).not.toBeInTheDocument();
    expect(projectValueBadge()).toBeInTheDocument();
    await resetFromBadge();
    const reset = row.store === 'claude' ? claudeReset : appReset;
    expect(reset).toHaveBeenCalledWith(row.key);
  });

  it('says on the global tab that a project overrides it', () => {
    setStores(row, { [key]: 'from-global' }, { [key]: 'from-project' }, [key]);
    render(<Row />);

    expect(overrideBadge()).toBeInTheDocument();
    expect(inheritedBadge()).not.toBeInTheDocument();
    expect(projectValueBadge()).not.toBeInTheDocument();
  });

  it('shows no marker on the global tab when no project overrides it', () => {
    setStores(row, { [key]: 'from-global' }, { [key]: 'from-global' }, []);
    render(<Row />);

    expect(overrideBadge()).not.toBeInTheDocument();
    expect(inheritedBadge()).not.toBeInTheDocument();
    expect(projectValueBadge()).not.toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { toModelAlias } from '@/types/models';
import type { ModelInfo } from '@/types/slashCommand';

/**
 * The Default Model row of CLI settings showed an EMPTY dropdown for anyone who
 * had picked a model: the saved value was handed to the picker folded down to a
 * coarse family alias ("opus[1m]" -> "opus"), no option carries that folded
 * value, and an unmatched Select renders nothing at all.
 *
 * These lock the round-trip: whatever the settings file holds must select the
 * row the user chose, and picking a row must save a value that selects it again.
 */

const updateClaudeSettingMock = vi.fn();
let mockClaudeSettings: Record<string, unknown> = {};
let mockModels: ModelInfo[] = [];

vi.mock('@/contexts/SettingsContext', () => ({
  // Rows read project-override info through this; null = nothing overridden.
  useSettingsOrNull: () => null,
  useSettings: () => ({ settings: {}, updateSetting: vi.fn(), ideAttached: false, ideProduct: '' }),
}));
vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  // Rows read project-override info through this; null = nothing overridden.
  useClaudeSettingsOrNull: () => null,
  useClaudeSettings: () => ({ settings: mockClaudeSettings, updateSetting: updateClaudeSettingMock }),
}));
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: { response: { response: { models: mockModels } } } }),
}));
vi.mock('@/hooks/useVersionInfo', () => ({ useVersionInfo: () => ({ cliVersion: '2.1.170' }) }));
vi.mock('@/contexts/WorkingDirContext', () => ({ useWorkingDir: () => ({ workingDirectory: '/tmp' }) }));
vi.mock('@/contexts/FableProbeContext', () => ({
  useFableProbe: () => ({ probedAvailable: null, probeFableAvailability: vi.fn() }),
  shouldProbeFable: () => false,
}));
// Resolve synchronously so the detection round-trips settle within render and
// don't land as un-acted state updates after the assertions.
vi.mock('@/hooks/useBridge', () => ({
  useBridge: () => ({ send: () => ({ then: () => ({ catch: () => undefined }) }) }),
}));

import { CliSettings } from '../index';

/** The catalog a real account serves, Fable row included. */
const CATALOG: ModelInfo[] = [
  {
    value: 'default',
    resolvedModel: 'claude-opus-5[1m]',
    displayName: 'Default (recommended)',
    description: 'Opus 5 with 1M context · Best for everyday tasks',
  },
  { value: 'fable', resolvedModel: 'claude-fable-5', displayName: 'Fable', description: 'Fable 5 · creative' },
  {
    value: 'opus[1m]',
    resolvedModel: 'claude-opus-5[1m]',
    displayName: 'Opus (1M context)',
    description: 'Opus 5 with 1M context · hard tasks',
  },
  { value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: 'Sonnet 5 · everyday' },
  { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku', description: 'Haiku 4.5 · fast' },
];

/** The label the Default Model dropdown currently displays. */
function modelTriggerLabel(): string {
  return screen.getByRole('button', { name: 'Default Model' }).textContent ?? '';
}

beforeEach(() => {
  updateClaudeSettingMock.mockReset();
  mockClaudeSettings = {};
  mockModels = CATALOG;
});

describe('CLI settings — Default Model dropdown', () => {
  it('displays the saved model, not an empty trigger', () => {
    // The regression: this exact value rendered a blank dropdown.
    mockClaudeSettings = { model: 'opus[1m]' };
    render(<CliSettings />);
    expect(modelTriggerLabel()).toContain('Opus (1M context)');
  });

  it('displays every catalog row a user could have saved', () => {
    for (const row of CATALOG.filter((m) => m.value !== 'default')) {
      mockClaudeSettings = { model: row.value };
      const { unmount } = render(<CliSettings />);
      expect(modelTriggerLabel()).toContain(row.displayName);
      unmount();
    }
  });

  it('shows the default row when no model is saved', () => {
    mockClaudeSettings = {};
    render(<CliSettings />);
    expect(modelTriggerLabel()).toContain('Default (recommended)');
  });

  it('shows a default label before the CLI has served a catalog', () => {
    mockModels = [];
    mockClaudeSettings = {};
    render(<CliSettings />);
    expect(modelTriggerLabel().trim()).not.toBe('');
  });

  it('rules out the folded-alias value that caused the blank dropdown', () => {
    // The old code passed `toModelAlias(saved)` as the Select value. Assert here
    // that no option carries that folded value, so the shape of the bug is
    // pinned even though the buggy line is gone: were it reintroduced, the
    // Select would again match nothing and render blank.
    const optionValues = ['', ...CATALOG.filter((m) => m.value !== 'default').map((m) => m.value)];
    expect(toModelAlias('opus[1m]')).toBe('opus');
    expect(optionValues).not.toContain(toModelAlias('opus[1m]'));
  });
});

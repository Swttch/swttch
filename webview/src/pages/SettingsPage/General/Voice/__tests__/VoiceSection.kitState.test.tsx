import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DictationErrorKind } from '@/shared';
import type { DictationAvailability } from '@/hooks/queries/useDictationAvailability';

/**
 * Acceptance for: "As a Windows user whose @swttch/extend-kit is installed and
 * current, I want the voice settings to tell me that the kit could not be
 * STARTED, instead of telling me to install what I already have."
 *
 * The reporter in #471 had 0.7.3 installed and `ccb --capabilities` answered
 * correctly when he ran it himself. The backend could not run it — every spawn
 * went through cmd.exe, which split `C:\Program Files\nodejs\node.exe` at its
 * space — and reported the failure as a missing kit. This screen said "Voice
 * input needs @swttch/extend-kit. Install it from the top right." He ended up
 * reading the shipped backend.mjs to find out what was actually wrong.
 */

let availability: DictationAvailability | undefined;

vi.mock('@/hooks/queries/useDictationAvailability', () => ({
  useDictationAvailability: () => ({ availability, loading: availability === undefined }),
}));

// Installed, and the installer's own lookup is happy: this file is about the
// failures that only show up when something tries to USE the kit.
vi.mock('@/hooks/queries/useExtendKit', () => ({
  useExtendKit: () => ({
    info: { packageName: '@swttch/extend-kit', installed: '0.7.3', latest: '0.7.3', updatable: false },
    loading: false,
    install: vi.fn(),
    installing: false,
  }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => null,
  useSettings: () => ({ scopeSettings: { voice: {} }, updateSetting: vi.fn() }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettingsOrNull: () => null,
  useClaudeSettings: () => ({ scopeSettings: {} }),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

// Imported AFTER the mocks so they are wired first.
import { VoiceSection } from '..';

const TORN =
  "@swttch/extend-kit is installed but could not be run: 'C:\\Program' is not recognized as an internal or external command";

describe('Voice settings and the state of the kit', () => {
  beforeEach(() => {
    availability = undefined;
  });

  it('says the kit could not be started, not that it is missing', () => {
    availability = {
      available: false,
      reason: DictationErrorKind.KIT_UNUSABLE,
      detail: TORN,
    };
    render(<VoiceSection />);

    expect(screen.getByText(/could not be started/i)).toBeDefined();
    expect(screen.queryByText(/Install it from the top right/i)).toBeNull();
  });

  it('shows what the failed run said, because nothing else names the cause', () => {
    availability = {
      available: false,
      reason: DictationErrorKind.KIT_UNUSABLE,
      detail: TORN,
    };
    render(<VoiceSection />);

    expect(screen.getByText(/'C:\\Program' is not recognized/)).toBeDefined();
  });

  it('says the kit is out of date when that is the failure', () => {
    availability = {
      available: false,
      reason: DictationErrorKind.KIT_TOO_OLD,
      detail: null,
    };
    render(<VoiceSection />);

    expect(screen.getByText(/too old/i)).toBeDefined();
    // "Install it" is the wrong instruction for something already installed.
    expect(screen.queryByText(/Install it from the top right/i)).toBeNull();
  });

  it('locks the rows that cannot do anything while the kit cannot run', () => {
    availability = {
      available: false,
      reason: DictationErrorKind.KIT_UNUSABLE,
      detail: TORN,
    };
    const { container } = render(<VoiceSection />);

    const rows = container.querySelector('[aria-disabled="true"]');
    expect(rows).not.toBeNull();
    expect(rows?.className).toContain('pointer-events-none');
  });

  it('says nothing and locks nothing once the kit works', () => {
    availability = { available: true, reason: null, detail: null };
    const { container } = render(<VoiceSection />);

    expect(screen.queryByText(/could not be started/i)).toBeNull();
    expect(screen.queryByText(/too old/i)).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });
});

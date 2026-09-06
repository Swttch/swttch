import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DictationErrorKind } from '@/shared';
import type { DictationAvailability } from '@/hooks/queries/useDictationAvailability';

/**
 * Acceptance for: "As a user signed in with an API key, I want the voice
 * settings to tell me why dictation cannot run, instead of looking ready and
 * failing when I press the microphone."
 *
 * The kit installs fine on such a machine, so every kit-shaped check says yes.
 * What is missing is the Claude account login the transcription service
 * authorizes with, and nothing on this screen used to mention it (#355).
 */

let availability: DictationAvailability | undefined;

vi.mock('@/hooks/queries/useDictationAvailability', () => ({
  useDictationAvailability: () => ({ availability, loading: availability === undefined }),
}));

// Installed and current: this file is about the OTHER reason dictation refuses.
vi.mock('@/hooks/queries/useExtendKit', () => ({
  useExtendKit: () => ({
    info: { packageName: '@swttch/extend-kit', installed: '0.4.0', latest: '0.4.0', updatable: false },
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
import { VoiceSection } from '../VoiceSection';

describe('Voice settings and the login they depend on', () => {
  beforeEach(() => {
    availability = undefined;
  });

  it('says a Claude account login is needed when there is none', () => {
    availability = { available: false, reason: DictationErrorKind.NOT_LOGGED_IN };
    render(<VoiceSection />);

    expect(screen.getByText(/signed-in Claude account/i)).toBeDefined();
  });

  // The kit is installed, so telling this user to install it sends them to a
  // control that reports success and changes nothing.
  it('does not blame the kit for a missing login', () => {
    availability = { available: false, reason: DictationErrorKind.NOT_LOGGED_IN };
    render(<VoiceSection />);

    expect(screen.queryByText(/extend-kit\. Install it/i)).toBeNull();
  });

  it('locks the rows that cannot do anything without a login', () => {
    availability = { available: false, reason: DictationErrorKind.NOT_LOGGED_IN };
    const { container } = render(<VoiceSection />);

    const rows = container.querySelector('[aria-disabled="true"]');
    expect(rows).not.toBeNull();
    expect(rows?.className).toContain('pointer-events-none');
  });

  // Same reasoning as the kit: the toggle is the way back, and a user who turned
  // voice input off must not need to sign in first to turn it on again.
  it('leaves the on/off toggle usable', () => {
    availability = { available: false, reason: DictationErrorKind.NOT_LOGGED_IN };
    render(<VoiceSection />);

    const toggle = screen.getByRole('switch', { name: /voice input/i });
    expect(toggle.closest('[aria-disabled="true"]')).toBeNull();
  });

  it('says nothing and locks nothing once a login is there', () => {
    availability = { available: true, reason: null };
    const { container } = render(<VoiceSection />);

    expect(screen.queryByText(/signed-in Claude account/i)).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  it('says nothing while the answer is still unknown', () => {
    // Undefined means the query is in flight. Telling someone who is signed in
    // that they are not is worse than saying nothing for a moment.
    availability = undefined;
    const { container } = render(<VoiceSection />);

    expect(screen.queryByText(/signed-in Claude account/i)).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });
});

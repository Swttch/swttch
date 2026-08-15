import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Acceptance for: "As someone who also uses the CLI, I want /voice's on/off
 * state to carry over to the GUI."
 */

let claudeVoice: Record<string, unknown> | undefined;
const updateClaudeSetting = vi.fn();

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ scopeSettings: { voice: {} }, updateSetting: vi.fn() }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({
    scopeSettings: { voice: claudeVoice },
    updateSetting: updateClaudeSetting,
  }),
}));

vi.mock('@/hooks/queries/useExtendKit', () => ({
  useExtendKit: () => ({
    info: { packageName: '@swttch/extend-kit', installed: '0.4.0', latest: '0.4.0', updatable: false },
    loading: false,
    install: vi.fn(),
    installing: false,
  }),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

// Imported AFTER the mocks so they are wired first.
import { VoiceSection } from '../VoiceSection';

function toggle(): HTMLElement {
  return screen.getByRole('switch', { name: /voice input/i });
}

/** What the last write sent to Claude's settings. */
function lastWrite(): Record<string, unknown> {
  const calls = updateClaudeSetting.mock.calls;
  const call = calls[calls.length - 1];
  expect(call?.[0]).toBe('voice');
  return call?.[1] as Record<string, unknown>;
}

describe('Voice settings — sharing on/off with the CLI', () => {
  beforeEach(() => {
    claudeVoice = undefined;
    updateClaudeSetting.mockClear();
  });

  it('is on when Claude has no opinion yet', () => {
    // Claude Code treats a missing key as off, because its dictation must be
    // switched on with /voice. We have no such command and the microphone
    // button is right there, so inheriting that would hide the feature from
    // everyone who never opened a terminal.
    claudeVoice = undefined;
    render(<VoiceSection />);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('is off when the CLI turned it off', () => {
    claudeVoice = { enabled: false };
    render(<VoiceSection />);
    expect(toggle().getAttribute('aria-checked')).toBe('false');
  });

  it('is on when the CLI turned it on', () => {
    claudeVoice = { enabled: true };
    render(<VoiceSection />);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('writes the change to Claude’s own settings, not ours', () => {
    // Same key /voice toggles, so turning it off here turns it off there.
    claudeVoice = { enabled: true };
    render(<VoiceSection />);
    fireEvent.click(toggle());
    expect(lastWrite().enabled).toBe(false);
  });

  it('keeps the CLI-only keys it does not understand', () => {
    // `mode` and `autoSubmit` belong to the CLI's key handling and mean nothing
    // in a GUI. Dropping them on write would reconfigure the terminal from a
    // screen that never mentions them.
    claudeVoice = { enabled: true, mode: 'tap', autoSubmit: true };
    render(<VoiceSection />);
    fireEvent.click(toggle());

    const written = lastWrite();
    expect(written.mode).toBe('tap');
    expect(written.autoSubmit).toBe(true);
    expect(written.enabled).toBe(false);
  });

  it('dims the rest of the settings while it is off', () => {
    claudeVoice = { enabled: false };
    const { container } = render(<VoiceSection />);
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
  });

  it('leaves the toggle itself usable while off, since it is the way back', () => {
    claudeVoice = { enabled: false };
    render(<VoiceSection />);

    fireEvent.click(toggle());
    expect(lastWrite().enabled).toBe(true);
  });
});

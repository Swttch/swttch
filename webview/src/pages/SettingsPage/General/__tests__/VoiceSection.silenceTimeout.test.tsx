import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingKey, type VoiceSettings } from '@/types/settings';

/**
 * Acceptance for: "As someone dictating, I want to decide how long recording
 * waits through silence."
 */

let voice: VoiceSettings = {};
const updateSetting = vi.fn();

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ scopeSettings: { voice }, updateSetting }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ scopeSettings: {} }),
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

/** The seconds input, found by its label rather than by position. */
function timeoutInput(): HTMLInputElement {
  return screen.getByLabelText(/wait time/i) as HTMLInputElement;
}

/** What the last save wrote. */
function lastSaved(): VoiceSettings {
  const calls = updateSetting.mock.calls;
  const call = calls[calls.length - 1];
  expect(call?.[0]).toBe(SettingKey.VOICE);
  return call?.[1] as VoiceSettings;
}

describe('Voice settings — how long recording waits', () => {
  beforeEach(() => {
    voice = {};
    updateSetting.mockClear();
  });

  it('shows the shipped default when nothing is set', () => {
    render(<VoiceSection />);
    expect(timeoutInput().value).toBe('15');
  });

  it('shows the configured value', () => {
    voice = { silenceTimeout: 5 };
    render(<VoiceSection />);
    expect(timeoutInput().value).toBe('5');
  });

  it('saves a value the user types', () => {
    render(<VoiceSection />);
    fireEvent.change(timeoutInput(), { target: { value: '5' } });
    expect(lastSaved().silenceTimeout).toBe(5);
  });

  it('clamps anything longer than the service will wait', () => {
    // The service stops listening after 15s of silence, so a longer setting is
    // a deadline that could never arrive.
    render(<VoiceSection />);
    fireEvent.change(timeoutInput(), { target: { value: '600' } });
    expect(lastSaved().silenceTimeout).toBe(15);
  });

  it('has no "never stop" value, since the service stops anyway', () => {
    // 0 would promise a recording that outlives what the service allows: it
    // ends at 15s of silence no matter what we set, so the option would be a
    // promise we cannot keep. It clamps up to the minimum instead.
    render(<VoiceSection />);
    fireEvent.change(timeoutInput(), { target: { value: '0' } });
    expect(lastSaved().silenceTimeout).toBe(1);

    fireEvent.change(timeoutInput(), { target: { value: '-5' } });
    expect(lastSaved().silenceTimeout).toBe(1);
  });

  it('leaves the language alone when the timeout changes', () => {
    // Both live in the same `voice` object; writing one must not drop the other.
    voice = { speechLanguage: 'ko' };
    render(<VoiceSection />);
    fireEvent.change(timeoutInput(), { target: { value: '7' } });
    expect(lastSaved().speechLanguage).toBe('ko');
  });
});

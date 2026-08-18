import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ExtendKitInfo } from '@/hooks/queries/useExtendKit';

/**
 * Acceptance for: "As a user without the kit, I want to see why the voice
 * settings are locked and install it right there."
 */

let kitInfo: ExtendKitInfo | undefined;
let installing = false;
const installMock = vi.fn(() => Promise.resolve());

vi.mock('@/hooks/queries/useExtendKit', () => ({
  useExtendKit: () => ({
    info: kitInfo,
    loading: kitInfo === undefined,
    install: installMock,
    installing,
  }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ scopeSettings: { voice: {} }, updateSetting: vi.fn() }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ scopeSettings: {} }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// Imported AFTER the mocks so they are wired first.
import { VoiceSection } from '../VoiceSection';

describe('Voice settings — the kit it depends on', () => {
  beforeEach(() => {
    installing = false;
    installMock.mockClear();
    kitInfo = undefined;
  });

  it('locks the settings when the kit is not installed', () => {
    kitInfo = { packageName: '@swttch/extend-kit', installed: null, latest: '1.0.0', updatable: false };
    const { container } = render(<VoiceSection />);

    // Given no kit, the rows are dimmed and take no input — configuring
    // something that cannot run reads as a broken screen.
    const rows = container.querySelector('[aria-disabled="true"]');
    expect(rows).not.toBeNull();
    expect(rows?.className).toContain('pointer-events-none');
  });

  // Voice input can be turned off from the first-use question, which promises
  // this screen as the way back. Locking the toggle along with the rest would
  // strand anyone who took that offer — and anyone who cannot install the kit at
  // all is left staring at a microphone button they can never remove (#299).
  it('leaves the on/off toggle usable when the kit is not installed', () => {
    kitInfo = { packageName: '@swttch/extend-kit', installed: null, latest: '1.0.0', updatable: false };
    render(<VoiceSection />);

    const toggle = screen.getByRole('switch', { name: /voice input/i });
    expect(toggle.closest('[aria-disabled="true"]')).toBeNull();
  });

  it('offers an install button when the kit is missing', () => {
    kitInfo = { packageName: '@swttch/extend-kit', installed: null, latest: '1.0.0', updatable: false };
    render(<VoiceSection />);
    expect(screen.getByRole('button', { name: /install/i })).toBeDefined();
  });

  it('installs when that button is pressed', async () => {
    kitInfo = { packageName: '@swttch/extend-kit', installed: null, latest: '1.0.0', updatable: false };
    render(<VoiceSection />);

    fireEvent.click(screen.getByRole('button', { name: /install/i }));
    await waitFor(() => expect(installMock).toHaveBeenCalled());
  });

  it('shows the installed version and unlocks the settings', () => {
    kitInfo = { packageName: '@swttch/extend-kit', installed: '0.4.0', latest: '0.4.0', updatable: false };
    const { container } = render(<VoiceSection />);

    expect(screen.getByText('v0.4.0')).toBeDefined();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  it('offers an update when a newer version exists', () => {
    kitInfo = { packageName: '@swttch/extend-kit', installed: '0.4.0', latest: '0.5.0', updatable: true };
    render(<VoiceSection />);

    expect(screen.getByText('v0.4.0')).toBeDefined();
    expect(screen.getByRole('button', { name: /update/i })).toBeDefined();
    // No "up to date" claim while an update is waiting.
    expect(screen.queryByText(/up to date/i)).toBeNull();
  });

  it('says it is current when there is nothing to update to', () => {
    // A bare version number reads as "not checked yet"; saying so is what tells
    // the user the check ran and came back clean.
    kitInfo = { packageName: '@swttch/extend-kit', installed: '0.4.0', latest: '0.4.0', updatable: false };
    render(<VoiceSection />);

    expect(screen.getByText(/up to date/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /update/i })).toBeNull();
  });

  it('updates to the newer version when that button is pressed', async () => {
    kitInfo = { packageName: '@swttch/extend-kit', installed: '0.4.0', latest: '0.5.0', updatable: true };
    render(<VoiceSection />);

    fireEvent.click(screen.getByRole('button', { name: /update/i }));
    await waitFor(() => expect(installMock).toHaveBeenCalled());
  });

  it('still shows the version when the registry could not be reached', () => {
    // Offline: `latest` is unknown, which is not a reason to hide what is
    // installed or to lock a section that works fine.
    kitInfo = { packageName: '@swttch/extend-kit', installed: '0.4.0', latest: null, updatable: false };
    const { container } = render(<VoiceSection />);

    expect(screen.getByText('v0.4.0')).toBeDefined();
    expect(screen.queryByRole('button', { name: /update/i })).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
    // Nor does it claim to be current: with the registry unreachable we do not
    // know that, and saying so would be a guess dressed as a fact.
    expect(screen.queryByText(/up to date/i)).toBeNull();
  });

  it('shows nothing about the kit until its state is known', () => {
    // Undefined means the query is still in flight; flashing "Install" at
    // someone who has it installed would be wrong.
    kitInfo = undefined;
    const { container } = render(<VoiceSection />);

    expect(screen.queryByRole('button', { name: /install/i })).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });
});

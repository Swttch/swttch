import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TunnelModal } from '../index';

/**
 * The sleep prevention switch used to be disabled whenever the tunnel was off,
 * which made an independent feature unreachable unless the user first turned on
 * an unrelated one. Sleep prevention has nothing to do with the tunnel; it is
 * reachable in either tunnel state.
 */

const baseStatus = {
  tunnelEnabled: false,
  tunnelUrl: null as string | null,
  tunnelLoading: false,
  pairUrl: null,
  pairLoading: false,
  issuePairing: vi.fn(),
  cloudflaredAvailable: true,
  awaitingInstallConsent: false,
  installing: false,
  preventSleep: false,
  sleepLoading: false,
  sleepExternalChange: 'none' as 'none' | 'setting' | 'scheme',
  error: null,
  errorCode: null,
  handleTunnelToggle: vi.fn(),
  handleSleepToggle: vi.fn(),
  confirmInstallAndStart: vi.fn(),
  cancelInstall: vi.fn(),
  retryTunnel: vi.fn(),
};

let status = { ...baseStatus };

vi.mock('@/hooks', () => ({
  useTunnelStatus: () => status,
}));
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

/**
 * The switch that sits in the same row as the "prevent sleep" label, found
 * through the label rather than by position so adding a row above cannot
 * silently point this at the tunnel's own switch.
 */
function sleepSwitch(): HTMLElement {
  const label = screen.getByText('tunnelModal.preventSleep');
  const row = label.parentElement?.parentElement;
  if (!row) throw new Error('sleep prevention row not found');
  return within(row).getByRole('switch');
}

describe('the sleep prevention switch', () => {
  it('is reachable while the tunnel is OFF', () => {
    status = { ...baseStatus, tunnelEnabled: false };
    render(<TunnelModal onClose={vi.fn()} />);

    expect(sleepSwitch()).not.toBeDisabled();
  });

  it('is reachable while the tunnel is ON', () => {
    status = { ...baseStatus, tunnelEnabled: true, tunnelUrl: 'https://example.test' };
    render(<TunnelModal onClose={vi.fn()} />);

    expect(sleepSwitch()).not.toBeDisabled();
  });

  it('is held only while its own request is in flight', () => {
    // The one legitimate reason to block the switch is its own pending call, so a
    // double click cannot race two opposite requests against each other.
    status = { ...baseStatus, tunnelEnabled: false, sleepLoading: true };
    render(<TunnelModal onClose={vi.fn()} />);

    expect(sleepSwitch()).toBeDisabled();
  });
});

describe('the sleep prevention hint', () => {
  it('appears while sleep prevention is on, so the limit is stated where it is chosen', () => {
    status = { ...baseStatus, preventSleep: true };
    render(<TunnelModal onClose={vi.fn()} />);

    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByText(`tunnelModal.sleepGuardHint${n}Lead`)).toBeInTheDocument();
    }
  });

  it('is absent while sleep prevention is off', () => {
    status = { ...baseStatus, preventSleep: false };
    render(<TunnelModal onClose={vi.fn()} />);

    expect(screen.queryByText('tunnelModal.sleepGuardHint1Lead')).not.toBeInTheDocument();
  });
});

describe('the notice that someone else changed the lid setting', () => {
  it('names a changed setting while the switch is on', () => {
    status = { ...baseStatus, preventSleep: true, sleepExternalChange: 'setting' };
    render(<TunnelModal onClose={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('tunnelModal.sleepGuardChangedSetting');
  });

  it('names a switched power plan while the switch is on', () => {
    status = { ...baseStatus, preventSleep: true, sleepExternalChange: 'scheme' };
    render(<TunnelModal onClose={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('tunnelModal.sleepGuardChangedScheme');
  });

  it('is absent when nothing changed', () => {
    status = { ...baseStatus, preventSleep: true, sleepExternalChange: 'none' };
    render(<TunnelModal onClose={vi.fn()} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

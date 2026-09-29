import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TunnelSettings } from '../index';

/**
 * The Settings page shows the same sleep prevention setting as the tunnel modal:
 * the same words, the same switch rule, the same hint. These tests pin that the
 * page does not carry a second copy with its own rules (it used to: the switch was
 * disabled while the tunnel was off, and the description said it only applied
 * "while the tunnel is active").
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

vi.mock('@/hooks', () => ({ useTunnelStatus: () => status }));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

function sleepSwitch(): HTMLElement {
  const row = screen.getByText('tunnelModal.preventSleep', { selector: 'label' }).closest('div.py-4');
  if (!row) throw new Error('sleep prevention row not found');
  return row.querySelector('button[role="switch"]') as HTMLElement;
}

describe('Settings > Tunnel > sleep prevention', () => {
  it('uses the modal wording, not a copy of its own', () => {
    status = { ...baseStatus };
    render(<TunnelSettings />);

    expect(screen.getByText('tunnelModal.keepAwake')).toBeInTheDocument();
    expect(screen.queryByText('tunnel.sleepPrevention.description')).not.toBeInTheDocument();
  });

  it('is reachable while the tunnel is OFF', () => {
    status = { ...baseStatus, tunnelEnabled: false };
    render(<TunnelSettings />);

    expect(sleepSwitch()).not.toBeDisabled();
  });

  it('shows the hint while on, and not while off', () => {
    status = { ...baseStatus, preventSleep: true };
    const { unmount } = render(<TunnelSettings />);
    expect(screen.getByText('tunnelModal.sleepGuardHint1Lead')).toBeInTheDocument();
    unmount();

    status = { ...baseStatus, preventSleep: false };
    render(<TunnelSettings />);
    expect(screen.queryByText('tunnelModal.sleepGuardHint1Lead')).not.toBeInTheDocument();
  });

  it('shows the same notice as the modal when the lid setting was changed elsewhere', () => {
    status = { ...baseStatus, preventSleep: true, sleepExternalChange: 'setting' };
    render(<TunnelSettings />);

    expect(screen.getByRole('status')).toHaveTextContent('tunnelModal.sleepGuardChangedSetting');
  });
});

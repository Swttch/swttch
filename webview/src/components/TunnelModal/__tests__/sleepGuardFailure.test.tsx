import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TunnelModal } from '../index';

/**
 * #554: when sleep prevention would not turn on, the Remote Tunnel dialog showed
 * the reason in the tunnel's red panel, titled "Couldn't start the tunnel", with a
 * "Try again" that started the tunnel. The reason belongs under the Prevent Sleep
 * switch, titled for sleep prevention, with no tunnel retry.
 */

const LID_ERROR = 'Could not read the lid close setting from the system';

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
  sleepError: null as string | null,
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

describe('the failure to turn on sleep prevention', () => {
  it('is shown under the Prevent Sleep switch, titled for sleep prevention', () => {
    status = { ...baseStatus, sleepError: LID_ERROR };
    render(<TunnelModal onClose={vi.fn()} />);

    const sleepSection = screen.getByText('tunnelModal.preventSleep').closest('div.border-t');
    if (!sleepSection) throw new Error('sleep prevention section not found');
    const alert = within(sleepSection as HTMLElement).getByRole('alert');
    expect(alert).toHaveTextContent('tunnelModal.sleepGuardError');
    expect(alert).toHaveTextContent(LID_ERROR);
  });

  it('is absent when nothing failed', () => {
    status = { ...baseStatus };
    render(<TunnelModal onClose={vi.fn()} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

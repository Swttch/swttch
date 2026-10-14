import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TunnelSettings } from '../index';

/**
 * #554: the Settings page reads the same hook as the Remote Tunnel dialog, so it
 * showed the same wrong thing. A sleep prevention failure is shown with the
 * sleep prevention setting, titled for it, and never as a tunnel error.
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

vi.mock('@/hooks', () => ({ useTunnelStatus: () => status }));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe('Settings > Tunnel > a failed attempt to turn sleep prevention on', () => {
  it('is shown with the sleep prevention setting, titled for it', () => {
    status = { ...baseStatus, sleepError: LID_ERROR };
    render(<TunnelSettings />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('tunnelModal.sleepGuardError');
    expect(alert).toHaveTextContent(LID_ERROR);
  });

  it('is absent when nothing failed', () => {
    status = { ...baseStatus };
    render(<TunnelSettings />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

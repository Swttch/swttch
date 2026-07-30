import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TunnelButton } from '../TunnelButton';
import { OPEN_TUNNEL_EVENT } from '../dock/actions';
import { MessageType } from '@/shared';

const send = vi.fn();
const openUrl = vi.fn();

vi.mock('@/hooks', () => ({
  useTunnelStatus: () => ({ tunnelEnabled: false }),
  useBridge: () => ({ send }),
}));
vi.mock('@/adapters', () => ({
  getAdapter: () => ({ openUrl }),
}));
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('TunnelButton', () => {
  const openTunnel = vi.fn();

  beforeEach(() => {
    send.mockReset();
    openUrl.mockReset();
    openTunnel.mockReset();
    window.addEventListener(OPEN_TUNNEL_EVENT, openTunnel);
    window.history.replaceState({}, '', '/sessions/new?workingDir=%2Ffoo&panelId=jcef-1');
  });

  afterEach(() => {
    window.removeEventListener(OPEN_TUNNEL_EVENT, openTunnel);
  });

  it('Cmd+click requests a local pairing code and opens the browser with ?pair= appended', async () => {
    // The system browser is a separate storage partition; it must redeem its own
    // single-use code, so Cmd+click issues one and carries it in the URL.
    send.mockResolvedValue({ status: 'ok', code: 'browser-code' });
    render(<TunnelButton />);

    fireEvent.click(screen.getByRole('button'), { metaKey: true });

    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(MessageType.ISSUE_LOCAL_PAIRING, {});
    const opened = new URL(openUrl.mock.calls[0][0] as string);
    expect(opened.searchParams.get('pair')).toBe('browser-code');
    // Existing query params are preserved (the browser opens the SAME session).
    expect(opened.searchParams.get('workingDir')).toBe('/foo');
    // panelId is NOT touched here — resolvePanelId gives each browser tab its own
    // in-memory id, an independent concern from the pairing flow.
    // The modal must NOT open on a Cmd+click.
    expect(openTunnel).not.toHaveBeenCalled();
  });

  // The modal is owned by the app shell, not by this button: the same item can be
  // triggered from the ⋮ menu, whose row unmounts the moment the menu closes.
  it('plain click asks the app shell to open the modal (no browser open, no pairing request)', () => {
    render(<TunnelButton />);
    fireEvent.click(screen.getByRole('button'));
    expect(openTunnel).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });
});

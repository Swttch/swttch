import { useCallback } from 'react';
import { useBridge } from '@/hooks';
import { getAdapter } from '@/adapters';
import { MessageType } from '@/shared';
import { OPEN_TUNNEL_EVENT } from './dock/actions';

/**
 * The tunnel item's behaviour, shared by its dock icon and its ⋮ menu row so the
 * two can never drift apart.
 *
 * `activate` handles the plain click; a Cmd/Ctrl-click routes to `openInBrowser`
 * instead. The modal itself is opened via {@link OPEN_TUNNEL_EVENT} rather than
 * local state, because the menu row unmounts as soon as the menu closes.
 */
export function useTunnelAction() {
  const { send } = useBridge();

  // Cmd/Ctrl+click opens the CURRENT session in the system browser. The browser
  // is a separate storage partition from JCEF, so it cannot reuse the JCEF auth
  // token — request a fresh single-use pairing code and carry it in the URL
  // (`?pair=`, never the token). The browser redeems it at POST /pair for its own
  // token; from then on that browser reuses its own stored token.
  const openInBrowser = useCallback(async () => {
    // panelId is intentionally NOT touched here: resolvePanelId already gives
    // every browser tab a unique in-memory id no matter how it was opened — that
    // is an independent concern from the #204 pairing flow.
    const target = new URL(window.location.href);
    try {
      const res = await send(MessageType.ISSUE_LOCAL_PAIRING, {});
      const p = res.payload ?? res;
      if (p.status === 'ok' && typeof p.code === 'string') {
        target.searchParams.set('pair', p.code);
      }
    } catch {
      // Fall back to opening without a code; the browser surfaces its own
      // disconnected state rather than failing silently here.
    }
    await getAdapter().openUrl(target.toString());
  }, [send]);

  const activate = useCallback(() => {
    window.dispatchEvent(new CustomEvent(OPEN_TUNNEL_EVENT));
  }, []);

  /** Click handler for both views: Cmd/Ctrl-click opens a browser, else the modal. */
  const handleClick = useCallback(
    (e: { metaKey: boolean; ctrlKey: boolean }) => {
      if (e.metaKey || e.ctrlKey) {
        void openInBrowser();
      } else {
        activate();
      }
    },
    [openInBrowser, activate],
  );

  return { activate, openInBrowser, handleClick };
}

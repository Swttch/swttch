// webview/src/api/bridge/resolvePanelId.ts

import { isJetBrains } from '../../config/environment';

/**
 * The id this page load answers to, decided once and then never revisited.
 *
 * Resolving again later is not the same question asked twice — it is a question
 * whose inputs move. In the IDE the id arrives on the URL, and the URL is rewritten
 * the moment the first message creates a session (`navigateToSession` rebuilds it
 * from `workingDir` and `rootDir` alone), so a second reading finds nothing and
 * falls through to a freshly minted one. The panel would then be known to the
 * backend under the id it connected with and to everything else under a different
 * one, which is how a desktop banner ended up carrying `panelId=none`.
 *
 * In the browser it is unique per JS context — a new tab, HOWEVER it was opened
 * (new-tab button, Cmd+click, duplicate), is a new context — and stable across
 * re-renders within one page load. A reload mints a new one, which is correct: a
 * reload is a fresh connection and focus is re-reported.
 */
let resolvedPanelId: string | null = null;

/**
 * Resolve a stable panelId identifying THIS webview panel, used to route
 * panel-scoped backend pushes (editor-context / ide-selection file badge,
 * NATIVE_DROP) and desktop-notification clicks back to the exact panel. panelId
 * identity is INDEPENDENT of the #204 pairing flow — every tab must get its own
 * regardless of how it was opened — and INDEPENDENT of navigation, which is what
 * the cache above is for.
 *
 *   - JCEF: Kotlin embeds a stable `?panelId=<uuid>` per IDE panel and re-injects
 *     it on reload, so the URL param is authoritative — for as long as it is
 *     there. It is read on the first call, which happens while the page is still
 *     on the URL the IDE opened (WebSocketConnector asks before the socket is
 *     opened, ahead of any in-app navigation), and kept from then on.
 *   - Browser: `window.open` COPIES both the opener's URL and its sessionStorage
 *     into a new tab, so NEITHER can distinguish tabs — every tab would inherit
 *     the opener's id and collide in the backend's 1:1 panelId→connection index.
 *     A module-level in-memory id is unique per JS context instead, so each
 *     browser tab gets its own no matter how it was opened.
 */
export function resolvePanelId(): string {
  if (resolvedPanelId) return resolvedPanelId;
  if (isJetBrains()) {
    const fromUrl = new URLSearchParams(window.location.search).get('panelId');
    if (fromUrl) {
      resolvedPanelId = fromUrl;
      return resolvedPanelId;
    }
  }
  resolvedPanelId = crypto.randomUUID();
  return resolvedPanelId;
}

/** @internal test-only: reset the resolved panelId (simulates a new tab). */
export function _resetPanelIdCache(): void {
  resolvedPanelId = null;
}

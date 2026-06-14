/**
 * Whether we're running inside the JetBrains IDE (JCEF) rather than a standalone
 * browser. Detected by the `panelId` the IDE embeds in the page URL.
 *
 * We must NOT key this off `'Notification' in window`: recent JCEF/CEF builds
 * expose a `Notification` object that is present but non-functional (CEF #2951),
 * so that check wrongly classifies the IDE as a browser. `panelId` is only ever
 * set by the IDE host (see WebSocketConnector / ClaudeCodePanel), never in
 * standalone mode.
 */
export function isIdeHost(): boolean {
  if (typeof window === 'undefined') return false;
  return !!new URLSearchParams(window.location.search).get('panelId');
}

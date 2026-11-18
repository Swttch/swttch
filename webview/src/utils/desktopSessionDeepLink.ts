import { getAdapter } from '@/adapters';
import { ClientEnv } from '@/shared';

/**
 * The address that makes the Claude Desktop app resume a session. The id is the CLI session id, the one this app
 * already names its own sessions by (not the `local_` name Desktop gives the sessions it started itself).
 */
export function desktopSessionDeepLink(cliSessionId: string): string {
  return `claude://resume?session=${encodeURIComponent(cliSessionId)}`;
}

/**
 * Hands the session to the Claude Desktop app. In the IDE the address goes to the system through the adapter. In
 * a browser a plain `window.open` would leave an empty tab behind for an address that is not a web page, so the
 * browser is given an anchor to follow in the current tab, which only asks the system to open the app.
 */
export async function openSessionInDesktop(cliSessionId: string): Promise<void> {
  const url = desktopSessionDeepLink(cliSessionId);
  const adapter = getAdapter();
  if (adapter.type !== ClientEnv.BROWSER) {
    await adapter.openUrl(url);
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noreferrer';
  anchor.click();
}

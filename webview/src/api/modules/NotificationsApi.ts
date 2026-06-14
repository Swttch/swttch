import { BridgeClient } from '../bridge/BridgeClient';
import type { ApiConfig } from '../ClaudeCodeApi';
import { MessageType } from '@/shared';

/**
 * Notifications API module
 *
 * Bridges to the host's native desktop-notification support via
 * `SHOW_NOTIFICATION { title, body, workingDir }`.
 *
 * Only used in JCEF (the JetBrains IDE), where the page has no browser
 * `Notification` API — the IDE host raises the notification instead. In
 * browser/standalone mode the webview shows the notification itself and never
 * calls this. The backend ACKs immediately, so callers treat it as
 * fire-and-forget.
 *
 * `workingDir` routes the request to the IDE host serving that project root when
 * several IDEs share one backend. `panelId` (the per-tab id embedded in the page
 * URL by the IDE) then selects the exact panel inside that IDE, so the host shows
 * the notification for — and its "Open session" action returns to — the right
 * session tab.
 */
export class NotificationsApi {
  constructor(
    private bridge: BridgeClient,
    private getConfig: () => ApiConfig,
  ) {}

  /**
   * Ask the host to show a native notification.
   *
   * `workingDir` defaults to the API's configured working directory and `panelId`
   * to the one in the page URL, so the IDE host can route to the exact session tab.
   */
  async show(params: { title: string; body: string; workingDir?: string }): Promise<void> {
    const workingDir = params.workingDir ?? this.getConfig().workingDir;
    const panelId = new URLSearchParams(window.location.search).get('panelId');
    await this.bridge.request(MessageType.SHOW_NOTIFICATION, {
      title: params.title,
      body: params.body,
      ...(workingDir ? { workingDir } : {}),
      ...(panelId ? { panelId } : {}),
    });
  }
}

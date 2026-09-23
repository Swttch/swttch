import { BridgeClient } from '../bridge/BridgeClient';
import type { ApiConfig } from '../ClaudeCodeApi';
import { MessageType } from '@/shared';

export type BannerPersistence = 'persistent' | 'transient' | 'unknown';

interface BannerPersistenceResponse {
  persistence?: BannerPersistence;
}

interface ShowNotificationResponse {
  /** False when the user has switched banners off in the settings file. */
  allowed?: boolean;
}

/**
 * Notifications API module
 *
 * Asks the backend to raise a banner via
 * `SHOW_NOTIFICATION { title, body, workingDir, panelId }`.
 *
 * Every screen calls this, in the IDE and in the browser alike, because the
 * backend is where "does this user want banners" is answered — it reads the
 * `notificationBanner` setting as the request arrives, so no screen holds a
 * copy of that answer that could go stale behind the settings overlay.
 *
 * What comes back says whether a banner may appear. In the IDE the backend has
 * already raised it through the host by then; in the browser only the page can
 * draw one, so the reply is the page's permission to do it itself.
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
   * Whether the OS keeps our banners on screen until dismissed.
   *
   * `unknown` everywhere the question does not apply — Windows and Linux, where
   * the notification itself decides — so a caller that gets `unknown` should say
   * nothing rather than guess.
   */
  async bannerPersistence(): Promise<BannerPersistence> {
    const response = await this.bridge.request<BannerPersistenceResponse>(
      MessageType.GET_BANNER_PERSISTENCE,
      {},
    );
    return response?.persistence ?? 'unknown';
  }

  /** Put the user in front of the OS switch that controls the above. */
  async openSystemSettings(): Promise<void> {
    await this.bridge.request(MessageType.OPEN_NOTIFICATION_SETTINGS, {});
  }

  /**
   * Ask the backend whether a banner may be shown, and have it show one where
   * it can. Resolves true when a banner is wanted, false when the user has
   * turned them off.
   *
   * `workingDir` defaults to the API's configured working directory and `panelId`
   * to the one in the page URL, so the IDE host can route to the exact session tab.
   */
  async show(params: {
    title: string;
    body: string;
    workingDir?: string;
    /**
     * Label for the desktop banner's button, already translated.
     *
     * Translated here rather than in the backend, which has no locale. Not
     * decoration: on macOS the button's presence is what keeps the notifier
     * process listening long enough to report a click back to us, which is how
     * a clicked banner returns the user to this session.
     */
    clickActionTitle?: string;
  }): Promise<boolean> {
    const workingDir = params.workingDir ?? this.getConfig().workingDir;
    const panelId = new URLSearchParams(window.location.search).get('panelId');
    const response = await this.bridge.request<ShowNotificationResponse>(
      MessageType.SHOW_NOTIFICATION,
      {
        title: params.title,
        body: params.body,
        clickActionTitle: params.clickActionTitle,
        ...(workingDir ? { workingDir } : {}),
        ...(panelId ? { panelId } : {}),
      },
    );
    // A backend that predates the flag answered without it; treat that as
    // allowed so an older pairing keeps notifying rather than going quiet.
    return response?.allowed !== false;
  }
}

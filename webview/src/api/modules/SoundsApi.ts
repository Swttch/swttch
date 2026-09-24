import { BridgeClient } from '../bridge/BridgeClient';
import type { ApiConfig } from '../ClaudeCodeApi';
import type { SystemSound } from '../../notifications/types';
import { MessageType } from '@/shared';

interface ListSystemSoundsResponse {
  sounds?: SystemSound[];
}

/**
 * Sounds API module
 *
 * Bridges to the backend's OS system-sound integration:
 *  - `LIST_SYSTEM_SOUNDS` enumerates the sounds the host OS can play.
 *  - `PLAY_NOTIFICATION_SOUND {}` rings whichever sound the user saved for
 *    notifications (fire-and-forget).
 *  - `PLAY_SYSTEM_SOUND { soundId }` plays one named sound, for the settings
 *    preview (fire-and-forget; the backend ACKs at spawn time, not when
 *    playback finishes).
 *
 * The two playback calls are deliberately different requests rather than one
 * with an optional name, because they are different acts. The preview says
 * "let me hear this particular sound", which only the settings row can know.
 * The notification says "ring the notification sound", whose name is the
 * backend's to look up — no screen carries a copy that could go stale.
 */
export class SoundsApi {
  constructor(
    private bridge: BridgeClient,
    private getConfig: () => ApiConfig,
  ) {}

  /**
   * Fetch the list of OS system sounds available for playback.
   *
   * Returns an empty array when the backend reports no sounds (e.g. an OS
   * without a known sound directory, or a directory that is present but empty).
   */
  async list(): Promise<SystemSound[]> {
    const response = await this.bridge.request<ListSystemSoundsResponse>(
      MessageType.LIST_SYSTEM_SOUNDS,
      {},
    );
    return response?.sounds ?? [];
  }

  /**
   * Ring the notification sound the user chose.
   *
   * Carries no sound name. The backend reads the `notificationSound` setting
   * when the request arrives, so a screen that has been open since before the
   * user changed the setting still rings the new sound.
   *
   * `workingDir` names the project whose settings apply, so a project-scoped
   * choice wins over the global one just as it does for every other setting.
   */
  async playNotificationSound(): Promise<void> {
    const workingDir = this.getConfig().workingDir;
    await this.bridge.request(MessageType.PLAY_NOTIFICATION_SOUND, {
      ...(workingDir ? { workingDir } : {}),
    });
  }

  /**
   * Ask the backend to play one OS system sound by id, for the settings
   * preview.
   *
   * `volumeStep` (1-10) names the loudness outright instead of letting the
   * backend read the saved one, so the preview plays at the value the user is
   * holding rather than the one that happens to be written. Omitted plays at
   * the default step.
   *
   * The backend spawns the OS-native player (`afplay`, PowerShell, `paplay`)
   * and ACKs immediately, so callers should treat this as fire-and-forget.
   */
  async play(soundId: string, volumeStep?: number): Promise<void> {
    await this.bridge.request(MessageType.PLAY_SYSTEM_SOUND, {
      soundId,
      ...(volumeStep === undefined ? {} : { volumeStep }),
    });
  }
}

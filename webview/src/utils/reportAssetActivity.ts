import { getBridge } from '@/api/bridge/Bridge';
import { MessageType, type AssetActivityKind, type AssetScreenSource } from '@/shared';

interface AssetActivityProps {
  /** Which door into the Assets screen was used. Only for a screen open. */
  from?: AssetScreenSource;
}

/**
 * Tell the backend something happened on the Assets surfaces, so it can be
 * measured.
 *
 * Opening the screen happens entirely in the webview, so without this report the
 * backend has no way to learn it occurred at all. Same reasoning, and same
 * fire-and-forget shape, as the IMAGE_ATTACHED report: nothing ACKs it, and a
 * lost ping matters far less than getting in the way of what the user is doing.
 *
 * The sponsor gate is NOT reported here. It is raised by several features now,
 * so it goes through {@link reportSponsorGate} instead, whose event names can
 * name the feature that raised it.
 *
 * Carries enum values only. Never anything the user typed — the Assets index
 * holds a caption of their own prompt, and it must not travel here.
 */
export function reportAssetActivity(kind: AssetActivityKind, props: AssetActivityProps = {}): void {
  try {
    getBridge().sendRaw({
      type: MessageType.ASSET_ACTIVITY,
      payload: { kind, ...props },
      timestamp: Date.now(),
    });
  } catch {
    // Socket not open yet. Measurement must never surface to the user.
  }
}

import { AssetActivityKind, AssetScreenSource } from '@/shared';
import { reportAssetActivity } from '@/utils/reportAssetActivity';

/**
 * Window events that open header-owned surfaces from anywhere.
 *
 * A dock item can be triggered from two places — its icon in the dock, or its row
 * in the ⋮ overflow menu — and the menu unmounts the moment it closes. So a
 * surface that must outlive its trigger (a modal) cannot keep its open state
 * inside the trigger component: dragging the item out of the dock would remove
 * the only component able to show it.
 *
 * Instead the surface lives at the app shell and listens here, mirroring how
 * OPEN_ACCOUNT_USAGE_EVENT already lets the header, the command palette, a slash
 * command, and the stream context all open one usage modal.
 */

/** Ask the app shell to open the remote-tunnel modal. */
export const OPEN_TUNNEL_EVENT = 'open-tunnel-modal';

/** Ask the app shell to open the session Assets modal. */
export const OPEN_ASSETS_EVENT = 'open-assets-modal';

/**
 * Raise {@link OPEN_ASSETS_EVENT}, recording which door was used.
 *
 * Exported so the dock icon and the ⋮ menu row dispatch the identical thing;
 * a second `dispatchEvent` written out in a view is exactly how the two
 * triggers drift apart. Reporting here rather than at each call site keeps that
 * property true for the measurement as well.
 *
 * `from` is required because the whole point of measuring it is to tell the
 * three entry points apart — one of them ships hidden, and "nobody uses the
 * dock" and "nobody can find the dock" must not look the same in the data.
 */
export function openAssetsModal(from: AssetScreenSource): void {
  reportAssetActivity(AssetActivityKind.ScreenOpened, { from });
  window.dispatchEvent(new Event(OPEN_ASSETS_EVENT));
}

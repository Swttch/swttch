import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { AssetActivityKind, AssetScreenSource } from '../../shared';
import { trackEvent } from '../features/telemetry';

const KNOWN_KINDS = new Set<string>(Object.values(AssetActivityKind));
const KNOWN_SOURCES = new Set<string>(Object.values(AssetScreenSource));

/**
 * Turn a reported activity into the event name it is measured under.
 *
 * The kind — and, for a screen open, the entry point — go into the NAME rather
 * than into properties. Rybbit reports unique users per event name but (as far
 * as we could measure) cannot filter users by a custom property, and every
 * question here is about people: how many came through the dock. Counting hits
 * instead would let one person opening the screen twenty times read like twenty
 * people.
 */
export function assetEventName(kind: string, source: unknown): string {
  if (kind === AssetActivityKind.ScreenOpened && typeof source === 'string' && KNOWN_SOURCES.has(source)) {
    return `asset_${kind}_${source}`;
  }
  return `asset_${kind}`;
}

/**
 * ASSET_ACTIVITY — record something that happened on the Assets surfaces.
 *
 * Exists for the same reason IMAGE_ATTACHED does: opening the Assets screen
 * happens inside the webview and reaches the backend no other way, so without
 * this the feature is invisible in usage data.
 *
 * The sponsor gate used to be reported through here as well. It moved to
 * SPONSOR_GATE_ACTIVITY, because the same offer is now raised by several
 * features and an event name beginning `asset_` could only ever measure one of
 * them.
 *
 * An unrecognized kind is dropped rather than forwarded. These names are read as
 * measurements later, and a stale build or a hand-crafted socket message must
 * not be able to invent one.
 *
 * Properties carry enum values only — never anything the user typed. The Assets
 * index holds a caption of the user's own prompt, and it must never travel here.
 */
export function assetActivityHandler(
  _connectionId: string,
  message: IPCMessage,
  _connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const kind = message.payload?.kind;
  if (typeof kind !== 'string' || !KNOWN_KINDS.has(kind)) return;

  trackEvent(assetEventName(kind, message.payload?.from));
}

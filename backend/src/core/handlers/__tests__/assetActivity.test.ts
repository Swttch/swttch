import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType, AssetActivityKind, AssetScreenSource } from '../../../shared';

const trackEvent = vi.fn();
vi.mock('../../features/telemetry', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

const { assetActivityHandler, assetEventName } = await import('../assetActivity');

const connections = {} as ConnectionManager;
const bridge = {} as Bridge;

function report(payload: Record<string, unknown>): void {
  const message: IPCMessage = { type: MessageType.ASSET_ACTIVITY, payload, timestamp: 0 } as IPCMessage;
  assetActivityHandler('c1', message, connections, bridge);
}

const lastName = () => trackEvent.mock.calls[trackEvent.mock.calls.length - 1]?.[0];
const lastProps = () => trackEvent.mock.calls[trackEvent.mock.calls.length - 1]?.[1];

beforeEach(() => trackEvent.mockReset());

describe('assetEventName', () => {
  it('puts the entry point in the NAME, so each door can be counted in people', () => {
    // Rybbit reports unique users per event name but not per custom property.
    // As a property, one person opening the screen twenty times would be
    // indistinguishable from twenty people coming through that door.
    expect(assetEventName(AssetActivityKind.ScreenOpened, AssetScreenSource.Dock)).toBe(
      'asset_screen_opened_dock',
    );
    expect(assetEventName(AssetActivityKind.ScreenOpened, AssetScreenSource.Overflow)).toBe(
      'asset_screen_opened_overflow',
    );
    expect(assetEventName(AssetActivityKind.ScreenOpened, AssetScreenSource.Viewer)).toBe(
      'asset_screen_opened_viewer',
    );
  });

  it('drops an unrecognized entry point rather than minting a name from it', () => {
    // These names are read as measurements later; a stale build must not be able
    // to invent one.
    expect(assetEventName(AssetActivityKind.ScreenOpened, 'sideways')).toBe('asset_screen_opened');
  });
});

describe('assetActivityHandler', () => {
  it('records the screen being opened, by the door it was opened from', () => {
    report({ kind: AssetActivityKind.ScreenOpened, from: AssetScreenSource.Dock });

    expect(lastName()).toBe('asset_screen_opened_dock');
  });

  it('ignores a kind it does not know', () => {
    report({ kind: 'definitely_not_a_kind' });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('ignores a payload with no kind at all', () => {
    report({});
    report({ kind: 42 });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('no longer answers for the sponsor gate', () => {
    // The gate moved to SPONSOR_GATE_ACTIVITY once several features began
    // raising the same offer: a name beginning `asset_` could only ever measure
    // one of them. A stale build still sending the old kind must not quietly
    // resurrect a name nothing reads any more.
    report({ kind: 'gate_seen', lockedCount: 24 });
    report({ kind: 'gate_clicked' });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('carries nothing the user typed', () => {
    // The Assets index holds a caption of the user's own prompt; it must not
    // reach telemetry even if a caller hands it over.
    report({
      kind: AssetActivityKind.ScreenOpened,
      messagePreview: 'my secret project plan',
      from: AssetScreenSource.Dock,
    });

    expect(JSON.stringify(lastProps() ?? {})).not.toContain('secret');
  });
});

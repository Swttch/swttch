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

  it('leaves the name unsuffixed for kinds that have no entry point', () => {
    expect(assetEventName(AssetActivityKind.GateSeen, undefined)).toBe('asset_gate_seen');
    expect(assetEventName(AssetActivityKind.GateClicked, undefined)).toBe('asset_gate_clicked');
  });

  it('drops an unrecognized entry point rather than minting a name from it', () => {
    // These names are read as measurements later; a stale build must not be able
    // to invent one.
    expect(assetEventName(AssetActivityKind.ScreenOpened, 'sideways')).toBe('asset_screen_opened');
  });
});

describe('assetActivityHandler', () => {
  it('records the gate being shown, with how much was out of reach', () => {
    report({ kind: AssetActivityKind.GateSeen, lockedCount: 24 });

    expect(lastName()).toBe('asset_gate_seen');
    expect(lastProps()).toEqual({ lockedCount: 24 });
  });

  it('records the invitation being followed', () => {
    report({ kind: AssetActivityKind.GateClicked });

    expect(lastName()).toBe('asset_gate_clicked');
    expect(lastProps()).toEqual({});
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

  it('never forwards a non-numeric lockedCount', () => {
    report({ kind: AssetActivityKind.GateSeen, lockedCount: '24' });

    expect(lastProps()).toEqual({});
  });

  it('carries nothing the user typed', () => {
    // The Assets index holds a caption of the user's own prompt; it must not
    // reach telemetry even if a caller hands it over.
    report({
      kind: AssetActivityKind.GateSeen,
      lockedCount: 3,
      messagePreview: 'my secret project plan',
      from: AssetScreenSource.Dock,
    });

    expect(JSON.stringify(lastProps())).not.toContain('secret');
    expect(lastProps()).toEqual({ lockedCount: 3 });
  });
});

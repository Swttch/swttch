import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ setting: false as unknown, sponsor: false, installed: true }));

vi.mock('../settings', () => ({
  readMergedSettings: vi.fn(async () => ({ settings: { desktopSessionSync: state.setting }, overrides: [] })),
}));
vi.mock('../license', () => ({ getSponsorStatus: vi.fn(async () => ({ isSponsor: state.sponsor })) }));
vi.mock('../../session-mcp', () => ({ isSessionMcpInstalled: vi.fn(async () => state.installed) }));

import {
  applyDesktopRunning,
  desktopSyncEnabled,
  desktopSyncSettingChanged,
  rememberDesktopState,
  resetDesktopSyncCache,
} from '../desktopSync';
import type { DesktopSessionState } from '../desktopSessions';

function connectionsFake() {
  return { setDesktopRunning: vi.fn(), broadcastToAll: vi.fn() };
}

function running(...ids: string[]): DesktopSessionState {
  return { starters: new Map(), archived: new Set(), titles: new Map(), running: new Set(ids) };
}

describe('reflecting the Claude desktop app', () => {
  beforeEach(() => {
    resetDesktopSyncCache();
    state.setting = false;
    state.sponsor = false;
    state.installed = true;
  });

  it('is off until the switch is on', async () => {
    state.sponsor = true;
    expect(await desktopSyncEnabled()).toBe(false);
  });

  it('is off for someone who is not a sponsor, even with the switch on', async () => {
    state.setting = true;
    expect(await desktopSyncEnabled()).toBe(false);
  });

  it('is on for a sponsor with the switch on', async () => {
    state.setting = true;
    state.sponsor = true;
    expect(await desktopSyncEnabled()).toBe(true);
  });

  it('hands the running sessions to every screen only while it is on and the package is installed', async () => {
    const connections = connectionsFake();
    rememberDesktopState(running('a', 'b'));

    await applyDesktopRunning(connections as never);
    expect([...connections.setDesktopRunning.mock.calls[0][0]]).toEqual([]);

    state.setting = true;
    state.sponsor = true;
    resetDesktopSyncCache();
    await applyDesktopRunning(connections as never);
    expect([...connections.setDesktopRunning.mock.calls[1][0]]).toEqual(['a', 'b']);

    state.installed = false;
    await applyDesktopRunning(connections as never);
    expect([...connections.setDesktopRunning.mock.calls[2][0]]).toEqual([]);
  });

  it('applies a flipped switch at once, without waiting for the desktop app to write, and has every list read again', async () => {
    const connections = connectionsFake();
    rememberDesktopState(running('a'));
    state.sponsor = true;
    await applyDesktopRunning(connections as never);
    expect([...connections.setDesktopRunning.mock.calls[0][0]]).toEqual([]);

    state.setting = true;
    await desktopSyncSettingChanged(connections as never);

    expect([...connections.setDesktopRunning.mock.calls[1][0]]).toEqual(['a']);
    expect(connections.broadcastToAll).toHaveBeenCalledWith(expect.any(String), { action: 'refresh' });
  });
});

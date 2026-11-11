import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ setting: false as unknown, sponsor: false, installed: true }));

vi.mock('../settings', () => ({
  readMergedSettings: vi.fn(async () => ({ settings: { desktopSessionSync: state.setting }, overrides: [] })),
}));
vi.mock('../license', () => ({ getSponsorStatus: vi.fn(async () => ({ isSponsor: state.sponsor })) }));
vi.mock('../../session-mcp', () => ({ isSessionMcpInstalled: vi.fn(async () => state.installed) }));

// The package's commands are the only way to the desktop app's records; a test says what they print.
const desktop = vi.hoisted(() => ({
  read: undefined as undefined | (() => unknown),
  watched: [] as Array<{ stop: ReturnType<typeof vi.fn>; emit: (s: unknown, c: unknown) => void }>,
}));
vi.mock('../desktopSessions', async () => {
  const empty = { starters: new Map(), archived: new Set(), titles: new Map(), running: new Set() };
  return {
    EMPTY_DESKTOP_STATE: empty,
    readDesktopState: vi.fn(async () => (desktop.read ? desktop.read() : empty)),
    watchDesktopState: vi.fn((onChange: (s: unknown, c: unknown) => void) => {
      const stop = vi.fn();
      desktop.watched.push({ stop, emit: onChange });
      return stop;
    }),
  };
});

import {
  applyDesktopRunning,
  currentDesktopState,
  desktopSyncEnabled,
  syncDesktopWatch,
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
  beforeEach(async () => {
    // A watching left running by the test before is stopped, with the switch off.
    state.setting = false;
    resetDesktopSyncCache();
    await syncDesktopWatch(connectionsFake() as never);
    resetDesktopSyncCache();
    state.setting = false;
    state.sponsor = false;
    state.installed = true;
    desktop.read = undefined;
    desktop.watched.length = 0;
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

  describe('watching through the package', () => {
    it('starts no watching while the switch is off, and none for someone who is not a sponsor', async () => {
      const connections = connectionsFake();
      await syncDesktopWatch(connections as never);
      state.setting = true;
      resetDesktopSyncCache();
      await syncDesktopWatch(connections as never);
      expect(desktop.watched).toHaveLength(0);
    });

    it('starts one watching while it is on, and a second ask does not start another', async () => {
      state.setting = true;
      state.sponsor = true;
      const connections = connectionsFake();
      await syncDesktopWatch(connections as never);
      await syncDesktopWatch(connections as never);
      expect(desktop.watched).toHaveLength(1);
    });

    it('starts it again when asked to restart, as after the package was updated', async () => {
      state.setting = true;
      state.sponsor = true;
      const connections = connectionsFake();
      await syncDesktopWatch(connections as never);
      await syncDesktopWatch(connections as never, true);
      expect(desktop.watched).toHaveLength(2);
      expect(desktop.watched[0].stop).toHaveBeenCalled();
    });

    it('stops watching when the switch is turned off', async () => {
      state.setting = true;
      state.sponsor = true;
      const connections = connectionsFake();
      await syncDesktopWatch(connections as never);
      state.setting = false;
      await desktopSyncSettingChanged(connections as never);
      expect(desktop.watched[0].stop).toHaveBeenCalled();
      expect([...connections.setDesktopRunning.mock.calls.at(-1)![0]]).toEqual([]);
    });

    it('tells every screen to read its list again when the desktop app changes a list, and hands over what runs when that changes', async () => {
      state.setting = true;
      state.sponsor = true;
      const connections = connectionsFake();
      await syncDesktopWatch(connections as never);
      desktop.watched[0].emit(running('a'), { list: true, running: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(connections.broadcastToAll).toHaveBeenCalledWith(expect.any(String), { action: 'refresh' });
      expect([...connections.setDesktopRunning.mock.calls.at(-1)![0]]).toEqual(['a']);
    });

    it('answers the lists from what the watching last said, and nothing while the sync is off', async () => {
      state.setting = true;
      state.sponsor = true;
      const connections = connectionsFake();
      await syncDesktopWatch(connections as never);
      desktop.watched[0].emit({ ...running(), titles: new Map([['a', 'Boss']]) }, { list: true, running: false });
      expect((await currentDesktopState()).titles.get('a')).toBe('Boss');

      state.setting = false;
      resetDesktopSyncCache();
      expect((await currentDesktopState()).titles.size).toBe(0);
    });
  });
});

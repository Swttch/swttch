import { describe, it, expect, vi, afterEach } from 'vitest';

const macState = vi.hoisted(() => ({ mac: true }));
vi.mock('@/config/environment', async (orig) => ({
  ...(await orig<typeof import('@/config/environment')>()),
  isMac: () => macState.mac,
}));

import { isArchiveShortcut, canToggleArchive, toggleArchiveOfOpenSession } from '../archiveShortcut';
import { KeyboardRegistry } from '../KeyboardRegistry';
import type { CommandPaletteServices } from '../types';

const key = (patch: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, code: '', key: '', ...patch }) as KeyboardEvent;

const services = (opts: { available?: boolean; sessionId?: string | null; archived?: boolean }) => {
  const setArchived = vi.fn().mockResolvedValue(true);
  const value = {
    session: { currentSessionId: opts.sessionId === undefined ? 's1' : opts.sessionId },
    archive: { available: opts.available ?? true, isCurrentArchived: opts.archived ?? false, setArchived },
  } as unknown as CommandPaletteServices;
  return { value, setArchived };
};

describe('isArchiveShortcut', () => {
  afterEach(() => {
    macState.mac = true;
  });

  it('is Cmd+Option+A on macOS, on the physical key even where the character typed is "å"', () => {
    expect(isArchiveShortcut(key({ metaKey: true, altKey: true, code: 'KeyA', key: 'å' }))).toBe(true);
    expect(isArchiveShortcut(key({ metaKey: true, altKey: true, code: 'KeyA', key: 'a' }))).toBe(true);
  });

  it('is Ctrl+Alt+A elsewhere', () => {
    macState.mac = false;
    expect(isArchiveShortcut(key({ ctrlKey: true, altKey: true, code: 'KeyA', key: 'a' }))).toBe(true);
  });

  it('is nothing else', () => {
    expect(isArchiveShortcut(key({ metaKey: true, code: 'KeyA' }))).toBe(false);
    expect(isArchiveShortcut(key({ altKey: true, code: 'KeyA' }))).toBe(false);
    expect(isArchiveShortcut(key({ metaKey: true, altKey: true, shiftKey: true, code: 'KeyA' }))).toBe(false);
    expect(isArchiveShortcut(key({ metaKey: true, altKey: true, code: 'KeyC' }))).toBe(false);
    expect(isArchiveShortcut(key({ ctrlKey: true, altKey: true, code: 'KeyA' }))).toBe(false);
  });

  it('ignores the keys while they are held', () => {
    expect(isArchiveShortcut(key({ metaKey: true, altKey: true, code: 'KeyA', repeat: true }))).toBe(false);
  });
});

describe('canToggleArchive', () => {
  it('needs the session-management MCP and a saved session, and takes an archived one too', () => {
    expect(canToggleArchive(services({}).value)).toBe(true);
    expect(canToggleArchive(services({ archived: true }).value)).toBe(true);
    expect(canToggleArchive(services({ available: false }).value)).toBe(false);
    expect(canToggleArchive(services({ sessionId: null }).value)).toBe(false);
  });
});

describe('toggleArchiveOfOpenSession', () => {
  it('archives a session that is not archived', async () => {
    const { value, setArchived } = services({});
    await toggleArchiveOfOpenSession(value);
    expect(setArchived).toHaveBeenCalledWith('s1', true);
  });

  it('brings back a session that is archived', async () => {
    const { value, setArchived } = services({ archived: true });
    await toggleArchiveOfOpenSession(value);
    expect(setArchived).toHaveBeenCalledWith('s1', false);
  });

  it('does nothing where the shortcut does not work', async () => {
    const { value, setArchived } = services({ available: false });
    expect(await toggleArchiveOfOpenSession(value)).toBe(false);
    expect(setArchived).not.toHaveBeenCalled();
  });
});

describe('as a binding', () => {
  it('leaves the key unclaimed where it does not work, so the page still types it', () => {
    const current = { value: services({ sessionId: null }).value };
    const registry = new KeyboardRegistry();
    registry.register({
      id: 'toggle-archive-conversation',
      match: (e) => isArchiveShortcut(e) && canToggleArchive(current.value),
      execute: async () => {},
    });
    expect(registry.handleKeyEvent(key({ metaKey: true, altKey: true, code: 'KeyA' }))).toBe(false);
    current.value = services({}).value;
    expect(registry.handleKeyEvent(key({ metaKey: true, altKey: true, code: 'KeyA' }))).toBe(true);
  });
});

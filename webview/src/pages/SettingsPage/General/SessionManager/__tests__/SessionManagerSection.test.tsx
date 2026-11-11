import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionManagerSection } from '../index';

let syncOn = false;
let dragOn = false;
const updateSetting = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettingsOrNull: () => null,
  useSettings: () => ({ settings: { desktopSessionSync: syncOn, sessionListDragDrop: dragOn }, updateSetting }),
}));

let installed: string | null = '0.4.0';
vi.mock('@/hooks/queries/useSessionMcp', () => ({
  useSessionMcp: () => ({
    info: { packageName: '@swttch/session-manager-mcp', installed, latest: '0.4.0', updatable: false, updating: false },
    loading: false,
    install: vi.fn(),
    installing: false,
    uninstall: vi.fn(),
    uninstalling: false,
    refresh: vi.fn(),
    refreshing: false,
  }),
}));

let sponsor = true;
const ensureSponsor = vi.fn(async () => sponsor);
vi.mock('@/utils/ensureSponsor', () => ({ ensureSponsor: (...args: unknown[]) => ensureSponsor(...(args as [])) }));

beforeEach(() => {
  syncOn = false;
  dragOn = false;
  sponsor = true;
  installed = '0.4.0';
  updateSetting.mockReset();
  ensureSponsor.mockClear();
});

const LABEL = 'Reflect changes from Claude Desktop';

describe('Settings > General > Session manager', () => {
  it('shows the version of the package at the right of the title, as the voice input section does', () => {
    render(<SessionManagerSection />);
    expect(screen.getByText('Session manager')).toBeInTheDocument();
    expect(screen.getByText('v0.4.0')).toBeInTheDocument();
    expect(screen.getByText('Up to date')).toBeInTheDocument();
  });

  it('offers to install the package while it is not installed, and says the rows below need it', () => {
    installed = null;
    render(<SessionManagerSection />);
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
    expect(screen.getByText(/Needs the session-management package/)).toBeInTheDocument();
  });

  it('turns the sync on for a sponsor', async () => {
    render(<SessionManagerSection />);
    fireEvent.click(screen.getByRole('switch', { name: LABEL }));
    await waitFor(() => expect(updateSetting).toHaveBeenCalledWith('desktopSessionSync', true));
    expect(ensureSponsor).toHaveBeenCalledTimes(1);
  });

  it('leaves the sync off for someone who is not a sponsor', async () => {
    sponsor = false;
    render(<SessionManagerSection />);
    fireEvent.click(screen.getByRole('switch', { name: LABEL }));
    await waitFor(() => expect(ensureSponsor).toHaveBeenCalledTimes(1));
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it('turns the sync off without asking whether the person is a sponsor', async () => {
    syncOn = true;
    sponsor = false;
    render(<SessionManagerSection />);
    fireEvent.click(screen.getByRole('switch', { name: LABEL }));
    await waitFor(() => expect(updateSetting).toHaveBeenCalledWith('desktopSessionSync', false));
    expect(ensureSponsor).not.toHaveBeenCalled();
  });

  it('says in a window what the sync reflects, item by item, when "learn more" is pressed', () => {
    render(<SessionManagerSection />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const items = [...dialog.querySelectorAll('li')].map((li) => li.textContent);
    expect(items.map((item) => item?.split(':')[0])).toEqual([
      'Parent and child sessions',
      'Archived sessions',
      'Titles',
      'Running sessions',
    ]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  describe('the drag and drop switch', () => {
    const DRAG = 'Drag a session onto another to make it a child session';

    it('turns on for a sponsor', async () => {
      render(<SessionManagerSection />);
      fireEvent.click(screen.getByRole('switch', { name: DRAG }));
      await waitFor(() => expect(updateSetting).toHaveBeenCalledWith('sessionListDragDrop', true));
    });

    it('stays off for someone who is not a sponsor', async () => {
      sponsor = false;
      render(<SessionManagerSection />);
      fireEvent.click(screen.getByRole('switch', { name: DRAG }));
      await waitFor(() => expect(ensureSponsor).toHaveBeenCalledTimes(1));
      expect(updateSetting).not.toHaveBeenCalled();
    });

    it('turns off without asking whether the person is a sponsor', async () => {
      dragOn = true;
      sponsor = false;
      render(<SessionManagerSection />);
      fireEvent.click(screen.getByRole('switch', { name: DRAG }));
      await waitFor(() => expect(updateSetting).toHaveBeenCalledWith('sessionListDragDrop', false));
      expect(ensureSponsor).not.toHaveBeenCalled();
    });
  });
});

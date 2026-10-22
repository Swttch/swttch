import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { i18n } from '@/i18n';
import { _resetRuntimeCache } from '@/config/environment';
import { LinkMenu } from '../LinkMenu';
import { linkMenuStore } from '@/utils/linkMenuStore';
import { installExternalLinkRouting } from '@/utils/externalLinkRouting';

const openUrl = vi.fn((_url: string) => Promise.resolve());
const openFile = vi.fn((_path: string, _line?: number, _column?: number) => Promise.resolve());
const openFileWithSystemApp = vi.fn((_path: string) => Promise.resolve());
const revealFile = vi.fn((_path: string) => Promise.resolve());
const writeText = vi.fn((_text: string) => Promise.resolve());

vi.mock('@/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/adapters')>()),
  getAdapter: () => ({ openUrl, openFile, openFileWithSystemApp, revealFile }),
}));

const URL_UNDER_POINTER = 'https://example.com/pull/71';

describe('LinkMenu — external link', () => {
  beforeEach(() => {
    openUrl.mockClear();
    openFile.mockClear();
    openFileWithSystemApp.mockClear();
    revealFile.mockClear();
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    act(() => linkMenuStore.close());
    document.body.innerHTML = '';
  });

  it('shows nothing until a link is right-clicked', () => {
    render(<LinkMenu />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers to open the link in the browser and to copy its address', () => {
    render(<LinkMenu />);
    act(() => linkMenuStore.open({ target: { kind: 'external', url: URL_UNDER_POINTER }, x: 40, y: 60 }));
    expect(screen.getByRole('menuitem', { name: i18n.t('chat:externalLink.openInBrowser') })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: i18n.t('chat:externalLink.copyAddress') })).toBeTruthy();
  });

  it('copies the exact address of the link and closes', async () => {
    render(<LinkMenu />);
    act(() => linkMenuStore.open({ target: { kind: 'external', url: URL_UNDER_POINTER }, x: 40, y: 60 }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('chat:externalLink.copyAddress') }));
    });
    expect(writeText).toHaveBeenCalledWith(URL_UNDER_POINTER);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the link in the browser and closes', async () => {
    render(<LinkMenu />);
    act(() => linkMenuStore.open({ target: { kind: 'external', url: URL_UNDER_POINTER }, x: 40, y: 60 }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('chat:externalLink.openInBrowser') }));
    });
    expect(openUrl).toHaveBeenCalledWith(URL_UNDER_POINTER);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('tells the user when the link could not be opened (#567)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openUrl.mockRejectedValueOnce(new Error('no browser'));
    render(<LinkMenu />);
    act(() => linkMenuStore.open({ target: { kind: 'external', url: URL_UNDER_POINTER }, x: 40, y: 60 }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('chat:externalLink.openInBrowser') }));
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('closes on Escape and on a press outside the menu', () => {
    render(<LinkMenu />);
    act(() => linkMenuStore.open({ target: { kind: 'external', url: URL_UNDER_POINTER }, x: 40, y: 60 }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    act(() => linkMenuStore.open({ target: { kind: 'external', url: URL_UNDER_POINTER }, x: 40, y: 60 }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  describe('opened by a right click on a link', () => {
    let uninstall: () => void;

    beforeEach(() => {
      (window as unknown as { __JCEF__?: boolean }).__JCEF__ = true;
      _resetRuntimeCache();
      uninstall = installExternalLinkRouting();
    });

    afterEach(() => {
      uninstall();
      delete (window as unknown as { __JCEF__?: boolean }).__JCEF__;
      _resetRuntimeCache();
    });

    function rightClick(href: string): boolean {
      const anchor = document.createElement('a');
      anchor.setAttribute('href', href);
      anchor.textContent = 'link';
      document.body.appendChild(anchor);
      return anchor.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 60 }),
      );
    }

    it('replaces the browser menu with ours for an external link', () => {
      render(<LinkMenu />);
      let notPrevented = true;
      act(() => {
        notPrevented = rightClick(URL_UNDER_POINTER);
      });
      expect(notPrevented).toBe(false);
      expect(screen.getByRole('menu')).toBeTruthy();
    });

    it('leaves the browser menu alone for a link to our own page', () => {
      render(<LinkMenu />);
      let notPrevented = false;
      act(() => {
        notPrevented = rightClick(`${window.location.origin}/settings/general`);
      });
      expect(notPrevented).toBe(true);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('leaves the browser menu alone outside the IDE', () => {
      delete (window as unknown as { __JCEF__?: boolean }).__JCEF__;
      _resetRuntimeCache();
      render(<LinkMenu />);
      let notPrevented = false;
      act(() => {
        notPrevented = rightClick(URL_UNDER_POINTER);
      });
      expect(notPrevented).toBe(true);
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });
});

// The same menu for a local file link (#567): what a terminal user does with a file.
describe('LinkMenu — local file link', () => {
  const FILE = 'C:/Users/me/AppData/Local/Temp/perf/x.png';

  beforeEach(() => {
    openFile.mockClear();
    openFileWithSystemApp.mockClear();
    revealFile.mockClear();
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    act(() => linkMenuStore.close());
    document.body.innerHTML = '';
  });

  const openMenu = (line?: number, column?: number) => {
    render(<LinkMenu />);
    act(() => linkMenuStore.open({ target: { kind: 'file', path: FILE, line, column }, x: 40, y: 60 }));
  };
  const item = (key: string) => screen.getByRole('menuitem', { name: i18n.t(`chat:fileLink.${key}`) });

  it('offers open, open with the system app, show in the file manager and copy path', () => {
    openMenu();
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      i18n.t('chat:fileLink.open'),
      i18n.t('chat:fileLink.openWithSystemApp'),
      i18n.t('chat:fileLink.showInFileManager'),
      i18n.t('chat:fileLink.copyPath'),
    ]);
  });

  it('opens the file at its line and closes', async () => {
    openMenu(12, 3);
    await act(async () => {
      fireEvent.click(item('open'));
    });
    expect(openFile).toHaveBeenCalledWith(FILE, 12, 3);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('hands the file to the system app', async () => {
    openMenu();
    await act(async () => {
      fireEvent.click(item('openWithSystemApp'));
    });
    expect(openFileWithSystemApp).toHaveBeenCalledWith(FILE);
  });

  it('shows the file in the file manager', async () => {
    openMenu();
    await act(async () => {
      fireEvent.click(item('showInFileManager'));
    });
    expect(revealFile).toHaveBeenCalledWith(FILE);
  });

  it('copies the exact path', async () => {
    openMenu();
    await act(async () => {
      fireEvent.click(item('copyPath'));
    });
    expect(writeText).toHaveBeenCalledWith(FILE);
  });

  it('tells the user when an action fails', async () => {
    revealFile.mockRejectedValueOnce(new Error('not-found'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openMenu();
    await act(async () => {
      fireEvent.click(item('showInFileManager'));
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

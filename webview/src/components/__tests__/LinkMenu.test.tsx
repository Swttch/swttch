import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { i18n } from '@/i18n';
import { _resetRuntimeCache } from '@/config/environment';
import { LinkMenu } from '../LinkMenu';
import { linkMenuStore } from '@/utils/linkMenuStore';
import { installExternalLinkRouting } from '@/utils/externalLinkRouting';

const openUrl = vi.fn((_url: string) => Promise.resolve());
const writeText = vi.fn((_text: string) => Promise.resolve());

vi.mock('@/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/adapters')>()),
  getAdapter: () => ({ openUrl }),
}));

const URL_UNDER_POINTER = 'https://example.com/pull/71';

describe('LinkMenu — external link', () => {
  beforeEach(() => {
    openUrl.mockClear();
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

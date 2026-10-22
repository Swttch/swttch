import { useEffect, useSyncExternalStore } from 'react';
import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { useTranslation } from '@/i18n';
import { linkMenuStore, type LinkMenuTarget } from '@/utils/linkMenuStore';
import { Portal } from './Portal';

const MENU_WIDTH = 192;
const ITEM_HEIGHT = 36;
const MENU_PADDING = 8;
const EDGE_GAP = 8;

const ITEM_CLASS =
  'block w-full px-3 py-2 text-start text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary';

/**
 * The menu a right click on a link in a reply opens. The browser's own offers no
 * way to copy the link's address, which is the one thing a reply with a link in
 * it most often needs (the link text of `[text](url)` is not the address).
 * Mounted once; whatever handles the right click decides when it opens.
 */
export function LinkMenu() {
  const { t } = useTranslation('chat');
  const open = useSyncExternalStore(linkMenuStore.subscribe, linkMenuStore.get);

  // Same ways out as every other menu in the app: a press elsewhere, Escape,
  // and anything that moves the page out from under the pointer (resize, wheel).
  useEffect(() => {
    if (!open) return;
    const close = () => linkMenuStore.close();
    const onMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-link-menu]')) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close);
    };
  }, [open]);

  if (!open) return null;

  const { target, x, y } = open;
  const items = menuItems(target, t);
  const menuHeight = items.length * ITEM_HEIGHT + MENU_PADDING;
  const left = Math.max(EDGE_GAP, Math.min(x, window.innerWidth - MENU_WIDTH - EDGE_GAP));
  const top = Math.max(EDGE_GAP, Math.min(y, window.innerHeight - menuHeight - EDGE_GAP));

  return (
    <Portal>
      <div
        role="menu"
        data-link-menu
        style={{ position: 'fixed', left, top, width: MENU_WIDTH }}
        className="z-[1000] overflow-hidden rounded-lg border border-border-default bg-surface-overlay py-1 shadow-lg"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              linkMenuStore.close();
              item.run();
            }}
            className={ITEM_CLASS}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Portal>
  );
}

interface MenuItem {
  label: string;
  run: () => void;
}

/** The entries for what was right-clicked, in the order they are shown. */
function menuItems(target: LinkMenuTarget, t: TFunction<'chat'>): MenuItem[] {
  const copy = (text: string, done: string, failed: string) => () => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(done))
      .catch(() => toast.error(failed));
  };

  if (target.kind === 'external') {
    return [
      {
        label: t('externalLink.openInBrowser'),
        run: () => {
          getAdapter()
            .openUrl(target.url)
            .catch((err) => {
              console.error('[LinkMenu] Failed to open external link:', err);
              toast.error(t('externalLink.openFailed'));
            });
        },
      },
      {
        label: t('externalLink.copyAddress'),
        run: copy(target.url, t('externalLink.copyDone'), t('externalLink.copyFailed')),
      },
    ];
  }

  // A local file: the same actions a terminal user has through the file manager.
  const { path, line, column } = target;
  const failed = (err: unknown) => {
    console.error('[LinkMenu] Failed to act on file link:', err);
    toast.error(t('fileOpenFailed', { path }));
  };
  return [
    { label: t('fileLink.open'), run: () => getAdapter().openFile(path, line, column).catch(failed) },
    {
      label: t('fileLink.openWithSystemApp'),
      run: () => getAdapter().openFileWithSystemApp(path).catch(failed),
    },
    { label: t('fileLink.showInFileManager'), run: () => getAdapter().revealFile(path).catch(failed) },
    { label: t('fileLink.copyPath'), run: copy(path, t('fileLink.copyDone'), t('fileLink.copyFailed')) },
  ];
}

import { useEffect, useRef, useState } from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { DockEditor } from './DockEditor';

/**
 * The ⋮ button and its menu — the single place every dockable header feature is
 * reachable from, no matter how the user arranged their dock.
 *
 * The menu body is {@link DockEditor}: there is no separate "browse" listing
 * that switches into an "edit" mode. Every item is always shown split into its
 * two sections and is always draggable by its handle, while clicking the row
 * itself (not the handle) runs the item and closes the menu — the same way a
 * click always worked before this menu existed.
 *
 * Account switching is deliberately NOT here: it is a picker (a list of saved
 * accounts), not a single action, and keeps its own always-visible icon to the
 * right of this menu instead of nesting a submenu inside it.
 */
export function OverflowMenu() {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside closes, mirroring SessionDropdown and AccountSwitcher.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-surface-hover"
        title={t('sessionHeader.dock.overflowTitle')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <EllipsisVerticalIcon className="w-5 h-5" />
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-1 w-[17rem] bg-surface-raised border border-border-default rounded-md shadow-xl overflow-hidden z-50">
          <DockEditor onRun={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

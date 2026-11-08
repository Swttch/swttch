import { useEffect, useRef, useState } from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { DockEditor } from './DockEditor';
import { TranscriptViewMenuSection, TRANSCRIPT_VIEW_SUBMENU_ATTRIBUTE } from './TranscriptViewMenuSection';
import { OPEN_DOCK_EDITOR_EVENT } from '../../Onboarding/openDockEditor';

/**
 * The ⋮ button and its menu — the single place every dockable header feature is
 * reachable from, no matter how the user arranged their dock.
 *
 * The menu body is {@link DockEditor}: there is no separate "browse" listing
 * that switches into an "edit" mode. Every item is always shown in one ordered
 * list, always draggable by its handle and toggleable into the dock via its eye
 * icon, while clicking the row itself (neither of those) runs the item and
 * closes the menu — the same way a click always worked before this menu existed.
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
      const target = e.target as Element;
      // The Transcript view menu is drawn into <body>, outside this box, yet is part of this menu.
      if (target.closest?.(`[${TRANSCRIPT_VIEW_SUBMENU_ATTRIBUTE}]`)) return;
      if (ref.current && !ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // The onboarding checklist points here for "arrange the dock": the editor is
  // this menu's body, so showing it means opening this menu.
  useEffect(() => {
    const onRequest = () => setOpen(true);
    window.addEventListener(OPEN_DOCK_EDITOR_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_DOCK_EDITOR_EVENT, onRequest);
  }, []);

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
        <div className="absolute end-0 top-full mt-1 w-[17rem] bg-surface-raised border border-border-default rounded-md shadow-xl z-50">
          <DockEditor onRun={() => setOpen(false)} />
          <TranscriptViewMenuSection onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

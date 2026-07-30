import { useEffect, useRef, useState } from 'react';
import { EllipsisVerticalIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { DockItemId } from '@/types/settings';
import { useAuthContext } from '@/contexts';
import { AccountSwitcherMenu } from '../AccountSwitcher/AccountSwitcherMenu';
import { DOCK_ITEMS } from './registry';
import { DockEditor } from './DockEditor';
import { useDockLayout } from './useDockLayout';
import { useDockItemActions } from './useDockItemActions';

/**
 * The ⋮ button and its menu — the single place every header feature is reachable
 * from, no matter how the user arranged their dock.
 *
 * Two modes:
 * - **normal** lists ALL items and runs them on click. Items already in the dock
 *   stay listed (with a marker) so a feature never moves out from under someone
 *   who learned to find it here.
 * - **edit** hands over to {@link DockEditor}, where each item sits in exactly one
 *   of two sections and is dragged between them.
 *
 * Dragging is confined to edit mode on purpose: rows that are always draggable
 * turn an ordinary click into an accidental rearrangement.
 */
export function OverflowMenu() {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { layout } = useDockLayout();
  const actions = useDockItemActions();
  const { loggedIn } = useAuthContext();

  // Click-outside closes, mirroring SessionDropdown and AccountSwitcher.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    // Leave edit mode with the menu, so reopening always starts in the mode the
    // user reaches for most.
    setEditing(false);
  };

  const docked = new Set(layout.docked);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-surface-hover"
        title={t('sessionHeader.dock.overflowTitle')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <EllipsisVerticalIcon className="w-5 h-5" />
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-1 w-[17rem] bg-surface-raised border border-border-default rounded-md shadow-xl overflow-hidden z-50">
          {editing ? (
            <DockEditor />
          ) : (
            <div className="py-1">
              {DOCK_ITEMS.map((item) => {
                // The account item has no single action: its rows ARE the accounts.
                if (item.id === DockItemId.ACCOUNT_SWITCHER) {
                  if (loggedIn !== true) return null;
                  return (
                    <div key={item.id} className="border-t border-border-default first:border-t-0 mt-1 pt-1 first:mt-0 first:pt-0">
                      <AccountSwitcherMenu variant="inline" onClose={close} />
                    </div>
                  );
                }

                const run = actions[item.id];
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      close();
                      run?.();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-hover transition-colors"
                  >
                    <item.icon className="w-4 h-4 shrink-0 text-text-secondary" />
                    <span className="flex-1 min-w-0 truncate text-[0.8461rem] text-text-primary">
                      {t(item.labelKey)}
                    </span>
                    {/* A dot, not a check: the account rows just below use a check
                        for "currently signed in", and reusing it here would read as
                        "selected" rather than "also sits outside in the dock". */}
                    {docked.has(item.id) && (
                      <span
                        className="w-1.5 h-1.5 shrink-0 rounded-full bg-text-tertiary"
                        title={t('sessionHeader.dock.inDockBadge')}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-border-default py-1">
            <button
              onClick={() => setEditing((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-[0.8461rem] text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <AdjustmentsHorizontalIcon className="w-4 h-4 shrink-0" />
              {editing ? t('sessionHeader.dock.done') : t('sessionHeader.dock.edit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';

interface Props {
  name: string;
  path: string;
  onDelete: () => Promise<boolean>;
}

/**
 * The ⋮ trigger and its menu — a sibling of the row's open button, not a
 * descendant of it, since this is a full menu widget (its own popup, its own
 * confirm dialog) rather than a single inline toggle like the favorite star.
 */
export function ProjectRowMenu(props: Props) {
  const { name, path, onDelete } = props;
  const { t } = useTranslation('projectSelector');
  const { confirmDialog, confirm } = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click, matching every other menu in the app
  // (SponsorManageMenu, OverflowMenu, SessionDropdown).
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleCopyPath = () => {
    setOpen(false);
    void navigator.clipboard.writeText(path);
  };

  const handleDelete = async () => {
    setOpen(false);
    const ok = await confirm({
      title: t('deleteConfirm.title'),
      message: t('deleteConfirm.message', { name }),
      confirmLabel: t('deleteConfirm.confirmLabel'),
      variant: 'danger',
    });
    if (!ok) return;

    const deleted = await onDelete();
    toast[deleted ? 'success' : 'error'](t(deleted ? 'deleteDone' : 'deleteFailed'));
  };

  return (
    // self-center: the row it sits in is `items-start` (needed to keep the
    // badge and two text lines top-aligned), so the trigger needs its own
    // vertical alignment to sit centered on the row's full height instead of
    // pinned to the top line, whatever that height ends up being.
    <div className="relative flex-shrink-0 self-center" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('menu.label')}
        title={t('menu.label')}
        // `.group` is the row div two levels up; group-hover / group-data-[active]
        // read ITS hover state and keyboard-cursor flag, same as the star's
        // visibility rule. `open` is layered on top so a menu the user just
        // opened does not vanish the moment the pointer leaves the row.
        //
        // The hover square uses surface-overlay rather than surface-hover: the
        // row underneath already paints surface-hover the moment it is
        // hovered, so that shade would land on itself and disappear. Overlay
        // is the app's standing icon-button hover token (ZoomIndicator uses
        // the same pairing) and reads as a distinct square either way.
        className={`me-1 rounded p-1.5 text-text-tertiary transition-opacity hover:bg-surface-overlay hover:text-text-primary ${
          open
            ? 'opacity-100'
            : 'opacity-0 focus:opacity-100 group-hover:opacity-100 group-data-[active]:opacity-100'
        }`}
      >
        <EllipsisVerticalIcon className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-border-default bg-surface-overlay py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCopyPath}
            className="block w-full px-3 py-2 text-start text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            {t('menu.copyPath')}
          </button>
          <div className="my-1 border-t border-border-default" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleDelete()}
            className="block w-full px-3 py-2 text-start text-xs text-state-error-fg transition-colors hover:bg-surface-hover"
          >
            {t('menu.delete')}
          </button>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}

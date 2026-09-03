import { useEffect, useRef, useState } from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { ProjectMetaDialog } from './ProjectMetaDialog';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';

interface Props {
  /** What the row currently shows — the alias if one is set, else the real name. Used in the delete confirmation, since that is what the user is looking at when they click it. */
  displayName: string;
  /** The real, unedited folder name — shown as context in the edit dialog and used as its name field's placeholder. */
  realName: string;
  /** Current alias, or '' when none is set. */
  currentName: string;
  /** Current description, or '' when none is set. */
  currentDescription: string;
  path: string;
  onDelete: () => Promise<boolean>;
  onSaveMeta: (fields: { name: string; description: string }) => Promise<boolean>;
}

/**
 * The ⋮ trigger and its menu — a sibling of the row's open button, not a
 * descendant of it, since this is a full menu widget (its own popups, its own
 * confirm dialog) rather than a single inline toggle like the favorite star.
 */
export function ProjectRowMenu(props: Props) {
  const { displayName, realName, currentName, currentDescription, path, onDelete, onSaveMeta } =
    props;
  const { t } = useTranslation('projectSelector');
  const { confirmDialog, confirm } = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
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
      message: t('deleteConfirm.message', { name: displayName }),
      confirmLabel: t('deleteConfirm.confirmLabel'),
      variant: 'danger',
    });
    if (!ok) return;

    const deleted = await onDelete();
    toast[deleted ? 'success' : 'error'](t(deleted ? 'deleteDone' : 'deleteFailed'));
  };

  const handleSaveMeta = async (name: string, description: string) => {
    setEditing(false);
    const ok = await onSaveMeta({ name, description });
    toast[ok ? 'success' : 'error'](t(ok ? 'editDone' : 'editFailed'));
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
            onClick={() => {
              setOpen(false);
              setEditing(true);
            }}
            className="block w-full px-3 py-2 text-start text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            {t('menu.editProject')}
          </button>
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

      {editing && (
        <ProjectMetaDialog
          realName={realName}
          initialName={currentName}
          initialDescription={currentDescription}
          onConfirm={(name, description) => void handleSaveMeta(name, description)}
          onCancel={() => setEditing(false)}
        />
      )}

      {confirmDialog}
    </div>
  );
}

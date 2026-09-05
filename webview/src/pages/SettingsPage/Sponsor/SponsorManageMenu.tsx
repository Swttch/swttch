import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';

interface Props {
  /** Whether a recurring payment exists that can be cancelled. */
  cancellable: boolean;
  /** Clear the stored key on this install (local, reversible). */
  onClearKey: () => Promise<void>;
  /** End the recurring payment (billing, not local). Resolves to success. */
  onCancelSubscription: () => Promise<boolean>;
}

/**
 * The two ways to stop, kept apart because they are not the same thing.
 *
 * "Clear sponsor key" is local and reversible: this install stops treating the
 * user as a sponsor, billing is untouched, and pasting the key back restores it.
 * "Cancel sponsorship" ends the payment itself. One button for both —
 * as the old single "Deactivate" was — invites someone who meant to stop paying
 * to merely hide the key, and keep being charged.
 *
 * Both confirm first and report the outcome, since neither is obviously
 * reversible from the user's side.
 */
export function SponsorManageMenu(props: Props) {
  const { cancellable, onClearKey, onCancelSubscription } = props;
  const { t } = useTranslation('settings');
  const { confirmDialog, confirm } = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape, like every other menu in the app.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleClearKey = async () => {
    setOpen(false);
    const ok = await confirm({
      title: t('sponsor.active.manage.clearKeyConfirmTitle'),
      message: t('sponsor.active.manage.clearKeyConfirmMessage'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onClearKey();
      toast.success(t('sponsor.active.manage.clearKeyDone'));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setOpen(false);
    const ok = await confirm({
      title: t('sponsor.active.manage.cancelConfirmTitle'),
      message: t('sponsor.active.manage.cancelConfirmMessage'),
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const done = await onCancelSubscription();
      if (done) {
        toast.success(t('sponsor.active.manage.cancelDone'));
      } else {
        toast.error(t('sponsor.active.manage.cancelFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-xs text-text-tertiary underline underline-offset-2 transition-colors hover:text-text-secondary disabled:opacity-50"
      >
        {t('sponsor.active.manage.menu')}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 z-10 mt-2 min-w-[14rem] overflow-hidden rounded-lg border border-border-default bg-surface-overlay py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleClearKey()}
            className="block w-full px-3 py-2 text-start text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            {t('sponsor.active.manage.clearKey')}
          </button>
          {cancellable && (
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleCancel()}
              className="block w-full px-3 py-2 text-start text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              {t('sponsor.active.manage.cancel')}
            </button>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

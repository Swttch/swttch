import toast from 'react-hot-toast';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';

/**
 * The delete flow every entry point of a project row shares: confirm, delete,
 * then report the outcome with a toast. The ⋮ menu and the "folder not found"
 * badge both go through here, so the two never drift apart in wording or
 * behavior.
 */
export function useProjectDelete(displayName: string, onDelete: () => Promise<boolean>) {
  const { t } = useTranslation('projectSelector');
  const { confirmDialog, confirm } = useConfirmDialog();

  const requestDelete = async () => {
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

  return { confirmDialog, requestDelete };
}

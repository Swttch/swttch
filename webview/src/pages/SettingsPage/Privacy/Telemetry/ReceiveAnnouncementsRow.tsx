import { SettingRow } from '../../common';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { useAnnouncementsEnabled } from '@/hooks/useAnnouncementsEnabled';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';

/**
 * Whether messages from us arrive in the app.
 *
 * Turning it ON needs no confirmation. Turning it OFF asks first, because the
 * same channel carries urgent patches and required updates, and someone
 * silencing marketing would not expect to silence those too. Cancelling leaves
 * the toggle on.
 */
export function ReceiveAnnouncementsRow() {
  const { t } = useTranslation('settings');
  const { enabled, setEnabled } = useAnnouncementsEnabled();
  const { confirmDialog, confirm } = useConfirmDialog();

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      await setEnabled(true);
      return;
    }
    const ok = await confirm({
      title: t('privacy.telemetry.receiveAnnouncements.confirmTitle'),
      message: t('privacy.telemetry.receiveAnnouncements.confirmMessage'),
    });
    if (!ok) return;
    await setEnabled(false);
  };

  return (
    <>
      <SettingRow
        label={t('privacy.telemetry.receiveAnnouncements.label')}
        description={t('privacy.telemetry.receiveAnnouncements.description')}
      >
        <ToggleSwitch
          checked={enabled ?? true}
          onChange={(checked) => void handleToggle(checked)}
          ariaLabel={t('privacy.telemetry.receiveAnnouncements.label')}
        />
      </SettingRow>
      {/* Rendered from here rather than from the section so the row stays one
          self-contained thing. It costs nothing in layout: the dialog is
          `position: fixed`, and it is null whenever it is not open. */}
      {confirmDialog}
    </>
  );
}

import { useState } from 'react';
import { ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useSponsorDevices, useRemoveSponsorDevice } from '@/hooks/queries/useSponsorAccount';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';

/** Format an ISO timestamp for display, or "" when it is missing/unparseable. */
function formatDate(iso: string | null): string {
  if (iso === null) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString();
}

/**
 * Where this sponsorship is in use, with a way to sign a machine out.
 *
 * The note under the heading is the part that actually prevents support
 * questions: sponsorship follows the DEVICE, not the Claude account, so
 * switching accounts on the same machine does not cost anyone their
 * sponsorship — which is not obvious from a list that shows account emails.
 */
export function SponsorDevicesSection() {
  const { t } = useTranslation('settings');
  const { data: devices = [], isLoading } = useSponsorDevices(true);
  const removeDevice = useRemoveSponsorDevice();
  const { confirmDialog, confirm } = useConfirmDialog();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (telemetryId: string) => {
    const ok = await confirm({
      title: t('sponsor.devices.removeConfirmTitle'),
      message: t('sponsor.devices.removeConfirmMessage'),
    });
    if (!ok) return;
    setRemovingId(telemetryId);
    try {
      await removeDevice(telemetryId);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="rounded-b-xl border border-t-0 border-border-default bg-surface-raised p-6">
      <div className="flex items-center gap-2">
        <ComputerDesktopIcon className="w-5 h-5 text-text-secondary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('sponsor.devices.title')}</h3>
      </div>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed break-keep">
        {t('sponsor.devices.description')}
      </p>
      <p className="mt-2 text-xs text-text-tertiary leading-relaxed break-keep">
        {t('sponsor.devices.note')}
      </p>

      {isLoading ? (
        <p className="mt-4 text-xs text-text-tertiary">{t('sponsor.billing.loading')}</p>
      ) : devices.length === 0 ? (
        <p className="mt-4 text-xs text-text-tertiary">{t('sponsor.devices.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border-default border-t border-border-default">
          {devices.map((device) => {
            const id = device.telemetryId;
            const busy = id !== null && removingId === id;
            return (
              <li key={id ?? device.activatedAt} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-text-primary">
                      {device.deviceName ?? t('sponsor.plan.unknown')}
                    </span>
                    {device.isCurrent && (
                      <span className="flex-shrink-0 rounded bg-state-info-bg px-1.5 py-0.5 text-[0.65rem] font-medium text-state-info-fg">
                        {t('sponsor.devices.thisDevice')}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-text-tertiary">
                    {[device.claudeEmail, formatDate(device.activatedAt)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {id !== null && (
                  <button
                    type="button"
                    onClick={() => void handleRemove(id)}
                    disabled={busy}
                    className="flex-shrink-0 rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary hover:bg-surface-hover disabled:opacity-50"
                  >
                    {busy ? t('sponsor.devices.removing') : t('sponsor.devices.remove')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}

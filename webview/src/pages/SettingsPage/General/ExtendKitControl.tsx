import toast from 'react-hot-toast';
import { ArrowPathIcon, ArrowDownTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useExtendKit } from '@/hooks/queries/useExtendKit';
import { useTranslation } from '@/i18n';

const BUTTON_CLASS =
  'flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ' +
  'bg-accent-primary-hover hover:bg-accent-primary text-text-primary ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

/**
 * Version and install/update control for the kit voice input depends on.
 *
 * Sits at the right of the Voice input section's title rather than in a row of
 * its own: it is the section's own state, not another thing to configure.
 *
 * Shaped after the CLI's update control so the two read the same way — a
 * version with an update button beside it when one is available.
 */
export function ExtendKitControl() {
  const { t } = useTranslation('settings');
  const { info, loading, install, installing } = useExtendKit();

  if (loading || !info) return null;

  const spinner = <ArrowPathIcon className="w-3 h-3 animate-spin" />;

  const run = async (successKey: 'installed' | 'updated') => {
    try {
      await install();
      toast.success(t(`general.voice.kit.${successKey}`));
    } catch (err) {
      // The backend hands back a runnable command when a global install needs
      // elevation, so the message is worth showing verbatim.
      toast.error(err instanceof Error ? err.message : t('general.voice.kit.failed'));
    }
  };

  // Not installed: the version has nothing to report, so the button carries the
  // whole message.
  if (!info.installed) {
    return (
      <button className={BUTTON_CLASS} disabled={installing} onClick={() => void run('installed')}>
        {installing ? spinner : <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
        {installing ? t('general.voice.kit.installing') : t('general.voice.kit.install')}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {info.updatable ? (
        <button className={BUTTON_CLASS} disabled={installing} onClick={() => void run('updated')}>
          {installing ? spinner : null}
          {installing ? t('general.voice.kit.updating') : t('general.voice.kit.update')}
        </button>
      ) : (
        // Say it is current rather than leaving a bare version number, which
        // reads as "not checked yet" — the same note the CLI's control shows.
        // Absent when `latest` is unknown (offline): we cannot claim it then.
        info.latest && (
          <span className="flex items-center gap-1 text-xs text-text-tertiary">
            <CheckCircleIcon className="w-3.5 h-3.5 text-state-success-fg" />
            {t('general.voice.kit.upToDate')}
          </span>
        )
      )}
      <span className="text-xs text-text-tertiary tabular-nums">v{info.installed}</span>
    </span>
  );
}

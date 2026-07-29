import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { useZoom } from '@/contexts/ZoomContext';
import { useTranslation } from '@/i18n';
import { ZOOM_MAX, ZOOM_MIN } from '@/utils/zoom';

/**
 * Chrome-style zoom indicator: appears top-right on any CmdOrCtrl +/-/0 or
 * CmdOrCtrl + wheel adjustment, shows the live percentage, and offers the same
 * buttons as the keyboard/wheel gestures (issue #169).
 *
 * A single instance is kept mounted and only its number changes — deliberately
 * NOT a toast queue, so rapid adjustments never stack multiple popups.
 * ZoomContext owns the show/hide timer; pointer-hover here just holds it open
 * so a user reaching for a button doesn't have the panel vanish under the click.
 */
export function ZoomIndicator() {
  const { t } = useTranslation('common');
  const { level, isIndicatorVisible, zoomIn, zoomOut, reset, holdIndicator, releaseIndicator } = useZoom();

  if (!isIndicatorVisible) return null;

  const percent = Math.round(level * 100);

  return (
    <Portal>
      <div
        className="fixed top-3 right-3 z-[100] flex items-center gap-1 rounded-lg border border-border-default bg-surface-raised px-2 py-1.5 shadow-lg"
        onMouseEnter={holdIndicator}
        onMouseLeave={releaseIndicator}
        role="dialog"
        aria-label={t('zoomIndicator.label')}
      >
        <span className="w-12 text-center text-sm tabular-nums text-text-primary">{percent}%</span>
        <button
          type="button"
          onClick={zoomOut}
          disabled={level <= ZOOM_MIN}
          className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label={t('zoomIndicator.zoomOut')}
        >
          <MinusIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={level >= ZOOM_MAX}
          className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label={t('zoomIndicator.zoomIn')}
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
        <div className="mx-1 h-4 w-px bg-border-default" />
        <button
          type="button"
          onClick={reset}
          className="px-1.5 text-sm font-medium text-accent-primary hover:underline"
        >
          {t('zoomIndicator.reset')}
        </button>
      </div>
    </Portal>
  );
}

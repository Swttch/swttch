import { PhotoIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { OPEN_ASSETS_EVENT } from './dock/actions';

/**
 * Dock icon for the session's Assets screen.
 *
 * Dispatches an event rather than holding the modal itself: the same item can be
 * triggered from the ⋮ overflow menu, whose row unmounts the moment the menu
 * closes, so the modal lives at the app shell (see {@link OPEN_ASSETS_EVENT}).
 */
export function AssetsButton() {
  const { t } = useTranslation('chat');

  return (
    <button
      onClick={() => window.dispatchEvent(new Event(OPEN_ASSETS_EVENT))}
      className="p-1 rounded transition-colors hover:bg-surface-hover"
      title={t('assets.title')}
    >
      <PhotoIcon className="w-5 h-5 text-text-secondary hover:text-text-primary" />
    </button>
  );
}

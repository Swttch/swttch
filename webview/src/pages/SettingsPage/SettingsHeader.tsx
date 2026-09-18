import { XMarkIcon, Bars3Icon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useCloseSettings } from './useCloseSettings';
import { useRouter } from '@/router';
import { useTranslation } from '@/i18n';

/**
 * The three icon buttons in the header, which differ only in glyph and action.
 *
 * Hover lightens in the dark palette and darkens in the light one, which is what
 * `overlay-dim` is: a translucent neutral that moves away from whatever it sits
 * on. A solid `surface-hover` would be wrong here — the header is at the far end
 * of the ramp, so a fixed surface below it darkens the button on hover in dark
 * mode while lightening it in light mode, and the same gesture would read as two
 * opposite things depending on the theme.
 */
const ICON_BUTTON_CLASS =
  'p-1 rounded text-text-secondary hover:text-text-primary hover:bg-overlay-dim transition-colors';

interface SettingsHeaderProps {
  /** On mobile, toggles the sidebar drawer. Omitted (hidden) on desktop. */
  onToggleSidebar?: () => void;
}

export function SettingsHeader({ onToggleSidebar }: SettingsHeaderProps) {
  const { goBack } = useRouter();
  const onClose = useCloseSettings();
  const { t } = useTranslation('settings');

  return (
    // Told apart from what is under it by its own surface, not by a rule.
    //
    // `pressed` is shared with the chosen item in the sidebar and the chosen
    // segment of a SegmentedControl, and sharing it is the point: those are the
    // three places on this screen that need the strongest neutral fill in the
    // palette, and one token keeps them from drifting apart. The name says
    // "pressed" because the token was drawn for a button being held down; what
    // it actually is, is the far end of the neutral ramp, which is why all three
    // reach for it.
    <header className="flex items-center justify-between gap-2 px-4 py-4 xs:px-2 xs:py-1 bg-surface-pressed">
      <button
        onClick={() => goBack()}
        className={`hidden xs:inline-block ${ICON_BUTTON_CLASS}`}
        title={t('layout.back')}
      >
        <ArrowLeftIcon className="w-6 h-6 xs:w-4 xs:h-4 rtl:-scale-x-100" />
      </button>

      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className={ICON_BUTTON_CLASS}
          title={t('layout.toggleMenu')}
        >
          <Bars3Icon className="w-6 h-6 xs:w-4 xs:h-4" />
        </button>
      )}
      <h1 className="text-lg xs:text-sm font-semibold text-text-primary">{t('layout.title')}</h1>
      <button
        onClick={onClose}
        className={ICON_BUTTON_CLASS}
        title={t('layout.close')}
      >
        <XMarkIcon className="w-6 h-6 xs:w-4 xs:h-4" />
      </button>
    </header>
  );
}

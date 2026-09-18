import { XMarkIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useCloseSettings } from './useCloseSettings';
import { useRouter } from '@/router';
import { Tooltip } from '@/components';
import { useTranslation } from '@/i18n';

/**
 * The icon buttons in the header, which differ only in glyph and action.
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

/**
 * The screen, drawn twice: once with the navigation standing in it as a column
 * of the panel, and once with it put away as a shape of its own.
 *
 * The glyph says which state the screen is in rather than which way the button
 * would move it, because the label beside it already names both directions.
 *
 * Drawn here rather than taken from a set, because the sets we have do not have
 * it. Heroicons has no panel glyph, and the codicon font does have one but is
 * not otherwise rendered anywhere in this app — pulling it in for a single
 * button would put a font glyph between two stroked SVGs, at a weight and a
 * baseline neither of them shares. The geometry below is the Heroicons outline
 * spec, so it sits next to Back and Close as one of them.
 */
function SidebarPanelIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // The column is on the start edge, so under RTL the glyph has to turn
      // around with the layout it stands for.
      className={`rtl:-scale-x-100 ${className ?? ''}`}
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      {open ? (
        // A division of the panel: the column is part of the screen, holding a
        // share of it and running its full height.
        <path d="M9 4.5v15" />
      ) : (
        // Detached and set down inside the frame: the same column, no longer
        // dividing anything, waiting to be put back.
        <rect x="5.75" y="7.75" width="3.5" height="8.5" rx="1.25" />
      )}
    </svg>
  );
}

interface SettingsHeaderProps {
  /** Whether the navigation is showing, which is what the toggle offers to change. */
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function SettingsHeader({ sidebarOpen, onToggleSidebar }: SettingsHeaderProps) {
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
      <div className="flex items-center gap-1">
        {/* Shown at every width. It used to be hidden below `xs`, which took the
            way out of the settings away from exactly the window too narrow to
            have another one: the close button ends the whole screen, and going
            back a step is a different thing to want. */}
        <Tooltip content={t('layout.back')}>
          <button onClick={() => goBack()} className={ICON_BUTTON_CLASS}>
            <ArrowLeftIcon className="w-6 h-6 xs:w-4 xs:h-4 rtl:-scale-x-100" />
          </button>
        </Tooltip>

        {/* Beside Back, and the only control over the navigation at any width.
            This used to appear on phones alone, as the way to reach a drawer;
            the navigation is now a column at some widths and a drawer at others,
            and opening either is the same request — show me the navigation — so
            it is one button rather than two that would have sat side by side. */}
        <Tooltip content={t('layout.toggleSidebar')}>
          <button
            onClick={onToggleSidebar}
            // The label names both directions at once, so what the button would
            // do next is left to `aria-expanded` rather than said twice.
            aria-expanded={sidebarOpen}
            className={ICON_BUTTON_CLASS}
          >
            <SidebarPanelIcon open={sidebarOpen} className="w-6 h-6 xs:w-4 xs:h-4" />
          </button>
        </Tooltip>
      </div>

      <h1 className="text-lg xs:text-sm font-semibold text-text-primary">{t('layout.title')}</h1>

      <Tooltip content={t('layout.close')}>
        <button onClick={onClose} className={ICON_BUTTON_CLASS}>
          <XMarkIcon className="w-6 h-6 xs:w-4 xs:h-4" />
        </button>
      </Tooltip>
    </header>
  );
}

import { useTranslation } from '@/i18n';
import { TOGGLE_SESSION_RAIL_EVENT } from '../SessionRail/event';

/** A rounded frame with a column of lines, the glyph Claude Desktop puts on its session rail button. */
export function SessionRailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 7.5h4M11 10h4M11 12.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6.5" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Dock icon for the session rail. It raises an event rather than holding the
 * panel itself, since the same item can be triggered from the ⋮ menu, whose row
 * unmounts when the menu closes (see openAssetsModal for the same reasoning).
 */
export function SessionRailButton() {
  const { t } = useTranslation('chat');

  return (
    <button
      data-session-rail-toggle
      onClick={() => window.dispatchEvent(new Event(TOGGLE_SESSION_RAIL_EVENT))}
      className="p-1 rounded transition-colors hover:bg-surface-hover"
      title={t('sessionRail.title')}
    >
      <SessionRailIcon className="w-5 h-5 text-text-secondary hover:text-text-primary" />
    </button>
  );
}

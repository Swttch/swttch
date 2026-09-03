import { useEffect, useRef } from 'react';
import { MarqueeText } from './MarqueeText';
import { projectBadgeStyle, projectInitials } from './projectBadge';
import { abbreviateHomeDir } from '@/shared';
import { useTranslation } from '@/i18n';

interface Props {
  name: string;
  path: string;
  sessionCount: number;
  /** Home directory of the machine the paths were recorded on, when known. */
  homeDir: string | null;
  /** True for the row the keyboard is currently on. */
  isActive: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

export function ProjectRow(props: Props) {
  const { name, path, sessionCount, homeDir, isActive, isFavorite, onSelect, onToggleFavorite } =
    props;
  const { t } = useTranslation('projectSelector');
  const ref = useRef<HTMLDivElement>(null);

  // Keep the keyboard cursor on screen. Arrow keys move it while focus stays in
  // the search box, so nothing else would scroll the row into view.
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);

  return (
    // The star is its own control, so the row cannot be one button wrapping
    // another — the open action and the pin action sit side by side instead.
    <div
      ref={ref}
      data-active={isActive || undefined}
      className={`group flex items-start rounded-lg transition-colors ${
        isActive ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-3 py-2.5 text-start"
      >
        <span
          aria-hidden="true"
          style={projectBadgeStyle(path)}
          className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-xs font-semibold"
        >
          {projectInitials(name)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium text-text-primary">{name}</span>
            {sessionCount > 0 && (
              <span className="flex-shrink-0 text-xs text-text-tertiary">
                {t('sessionCount', { count: sessionCount })}
              </span>
            )}
          </span>
          <MarqueeText
            text={abbreviateHomeDir(path, homeDir)}
            className="text-[0.7692rem] text-text-tertiary group-hover:text-text-secondary"
          />
        </span>
      </button>

      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? t('removeFavorite') : t('addFavorite')}
        title={isFavorite ? t('removeFavorite') : t('addFavorite')}
        // A pinned row keeps its star visible; the rest reveal one on hover or
        // when the keyboard cursor lands, so an unpinned list stays quiet.
        className={`mt-1 me-1 flex-shrink-0 rounded p-2 transition-opacity hover:text-text-primary ${
          isFavorite
            ? 'text-accent-primary opacity-100'
            : 'text-text-tertiary opacity-0 focus:opacity-100 group-hover:opacity-100 group-data-[active]:opacity-100'
        }`}
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill={isFavorite ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.5a.56.56 0 011.04 0l2.13 4.98 5.4.46c.5.04.7.66.32.99l-4.1 3.56 1.23 5.28c.11.49-.42.87-.85.61L12 16.6l-4.65 2.78c-.43.26-.96-.12-.85-.61l1.23-5.28-4.1-3.56a.56.56 0 01.32-.99l5.4-.46 2.13-4.98z"
          />
        </svg>
      </button>
    </div>
  );
}

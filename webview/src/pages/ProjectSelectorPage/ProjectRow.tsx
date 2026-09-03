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
  onSelect: () => void;
}

export function ProjectRow(props: Props) {
  const { name, path, sessionCount, homeDir, isActive, onSelect } = props;
  const { t } = useTranslation('projectSelector');
  const ref = useRef<HTMLButtonElement>(null);

  // Keep the keyboard cursor on screen. Arrow keys move it while focus stays in
  // the search box, so nothing else would scroll the row into view.
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      data-active={isActive || undefined}
      className={`group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start transition-colors ${
        isActive ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      }`}
    >
      <span
        aria-hidden="true"
        style={projectBadgeStyle(path)}
        className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-xs font-semibold"
      >
        {projectInitials(name)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-text-primary">{name}</span>
          {sessionCount > 0 && (
            <span className="flex-shrink-0 text-xs text-text-tertiary">
              {t('sessionCount', { count: sessionCount })}
            </span>
          )}
        </div>
        <MarqueeText
          text={abbreviateHomeDir(path, homeDir)}
          className="text-[0.7692rem] text-text-tertiary group-hover:text-text-secondary"
        />
      </div>
    </button>
  );
}

import type { ProjectSortOrder } from './sortOrderStorage';
import { useTranslation } from '@/i18n';

interface Props {
  order: ProjectSortOrder;
  onChange: (order: ProjectSortOrder) => void;
}

/**
 * Two mutually-exclusive options, so a segmented control rather than a
 * dropdown: both are visible and one click switches, with no menu to open
 * first.
 */
export function ProjectSortToggle(props: Props) {
  const { order, onChange } = props;
  const { t } = useTranslation('projectSelector');

  const optionClass = (isActive: boolean) =>
    `rounded px-3 py-1.5 text-sm transition-colors ${
      isActive
        ? 'bg-surface-hover text-text-primary'
        : 'text-text-tertiary hover:text-text-secondary'
    }`;

  return (
    <div
      role="group"
      aria-label={t('sortOrder.label')}
      className="flex flex-shrink-0 items-center gap-0.5 rounded border border-border-default p-0.5"
    >
      <button
        type="button"
        aria-pressed={order === 'recent'}
        onClick={() => onChange('recent')}
        className={optionClass(order === 'recent')}
      >
        {t('sortOrder.recent')}
      </button>
      <button
        type="button"
        aria-pressed={order === 'created'}
        onClick={() => onChange('created')}
        className={optionClass(order === 'created')}
      >
        {t('sortOrder.created')}
      </button>
    </div>
  );
}

import type { ProjectSortOrder } from './sortOrderStorage';
import { SegmentedControl } from '@/components/SegmentedControl';
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

  return (
    <SegmentedControl<ProjectSortOrder>
      label={t('sortOrder.label')}
      value={order}
      onChange={onChange}
      options={[
        { value: 'recent', label: t('sortOrder.recent') },
        { value: 'created', label: t('sortOrder.created') },
      ]}
    />
  );
}

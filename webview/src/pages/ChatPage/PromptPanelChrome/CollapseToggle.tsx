import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Minimize/restore control shown at the top-right of a prompt panel.
 * Collapsing keeps the panel pending — it only gets it out of the way so the
 * conversation behind it stays readable (mobile screens especially).
 */
export const CollapseToggle = (props: Props) => {
  const { collapsed, onToggle } = props;
  const { t } = useTranslation('chat');

  const label = collapsed ? t('promptPanel.expand') : t('promptPanel.collapse');

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className="shrink-0 p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-colors"
    >
      {collapsed ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
    </button>
  );
};

import React from 'react';
import { useTranslation } from 'react-i18next';
import { PanelItem, PanelItemBase, ToggleItem, CommandItem, PanelItemType, IconType } from '@/types/commandPalette';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { TerminalIcon, LinkIcon } from './icons/PaletteIcons';
import { HighlightedText } from './HighlightedText';
import { cn } from '@/utils/cn';

interface Props {
  item: PanelItem;
  isSelected: boolean;
  /** Current slash-command filter text, used to highlight matches. */
  query?: string;
  onClick: () => void;
  onExecute: () => void;
}

export const PanelItemComponent = React.forwardRef<HTMLDivElement, Props>((props, ref) => {
  const { item, isSelected, query = '', onClick, onExecute } = props;
  const { t } = useTranslation('commandPalette');
  const isCommand = item.type === PanelItemType.Command;

  const handleClick = () => {
    if (item.disabled) {
      return;
    }
    onClick();
    if (item.type === PanelItemType.Toggle) {
      const toggleItem = item as ToggleItem;
      toggleItem.onToggle(!toggleItem.toggled);
    } else if (item.type === PanelItemType.Link) {
      window.open((item as any).href, '_blank');
    } else if (item.type === PanelItemType.Info) {
      return;
    } else {
      onExecute();
    }
  };

  const isClickable = item.type !== PanelItemType.Info && !item.disabled;
  const hasRightTerminalIcon = item.icon === IconType.Terminal && item.type === PanelItemType.Action;
  const title = item.disabled
    ? ((item as PanelItemBase).disabledReason ?? t('panel.comingSoon'))
    : item.type === PanelItemType.Command
      ? (item as CommandItem).description
      : undefined;

  return (
    <div
      ref={ref}
      onClick={handleClick}
      title={title}
      className={cn(
        'group mx-1 flex items-center justify-between rounded px-2 transition-colors duration-100',
        item.disabled
          ? 'cursor-not-allowed opacity-50'
          : isClickable
            ? 'cursor-pointer'
            : 'cursor-default',
        isClickable && 'hover:bg-[var(--surface-selected)]',
        isSelected && 'bg-[var(--surface-selected)]',
      )}
      style={{ height: 'var(--item-height, 28px)' }}
    >
      {/* Left side: label (+ optional suffix, e.g. Effort's "(Extra high)").
          For slash commands the label is a min-width name column so
          descriptions line up across rows (issue #167). It never shrinks
          (flex-shrink-0) or truncates — a long command name just takes more
          space instead of being cut off, pushing that row's description
          over. */}
      <div
        className={cn(
          'flex items-center gap-1.5',
          isCommand ? 'flex-shrink-0 min-w-[9rem]' : 'min-w-0 flex-1',
        )}
      >
        <span
          className={cn(
            'overflow-hidden whitespace-nowrap text-ellipsis transition-colors duration-100',
            isSelected
              ? 'text-[var(--text-on-selected)]'
              : item.textStyle?.color === 'secondary'
                ? 'text-[var(--secondary-text-color)]'
                : 'text-[var(--item-text-color)]',
            isClickable && 'group-hover:text-[var(--text-on-selected)]',
            item.textStyle?.underline && 'underline',
          )}
          style={{ fontSize: 'var(--item-size, 13px)' }}
        >
          <HighlightedText text={item.label} query={query} initials={isCommand} />
        </span>
        {item.labelSuffix && (
          <span
            className="flex-shrink-0 text-[var(--secondary-text-color)]"
            style={{ fontSize: 'var(--item-size, 13px)' }}
          >
            {item.labelSuffix()}
          </span>
        )}
      </div>

      {/* Slash command description column: the CLI-provided summary, matched
          text bolded. Truncates so long descriptions never wrap. */}
      {isCommand && (
        <span
          className={cn(
            'ms-3 min-w-0 flex-1 overflow-hidden whitespace-nowrap text-ellipsis transition-colors duration-100',
            isSelected
              ? 'text-[var(--text-on-selected)]'
              : 'text-[var(--secondary-text-color)]',
            isClickable && 'group-hover:text-[var(--text-on-selected)]',
          )}
          style={{ fontSize: 'var(--item-size, 13px)' }}
        >
          <HighlightedText text={(item as CommandItem).description} query={query} />
        </span>
      )}

      {/* Right side: secondary label / toggle / icon */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {item.valueComponent && item.valueComponent()}

        {item.type === PanelItemType.Toggle && (
          <ToggleSwitch
            checked={(item as ToggleItem).toggled}
            onChange={(value) => (item as ToggleItem).onToggle(value)}
            size="small"
          />
        )}

        {hasRightTerminalIcon && (
          <TerminalIcon className="flex-shrink-0 text-[var(--secondary-text-color)]" />
        )}

        {item.type === PanelItemType.Link && (
          <LinkIcon className="flex-shrink-0 text-[var(--secondary-text-color)]" />
        )}
      </div>
    </div>
  );
});

PanelItemComponent.displayName = 'PanelItemComponent';

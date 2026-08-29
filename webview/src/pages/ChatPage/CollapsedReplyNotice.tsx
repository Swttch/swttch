import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';

interface Props {
  /** How many entries of the reply are hidden behind this line. */
  count: number;
  onExpand: () => void;
}

/**
 * The line left in place of a reply the user collapsed.
 *
 * A collapsed section renders nothing of its reply, and nothing is exactly what
 * a session whose messages failed to load also renders. The two must not look
 * alike: a user scrolling back through a long transcript has to be able to tell
 * "I hid this" from "this is broken", and the count is what says the reply is
 * still there and how much of it.
 *
 * It is a button, not a caption, so the reply can be brought back from the spot
 * where it is missing. Reaching for the send's own menu works too, but that
 * asks the user to look somewhere other than where they noticed the gap.
 */
export function CollapsedReplyNotice(props: Props) {
  const { count, onExpand } = props;
  const { t } = useTranslation('chat');

  return (
    <div className="px-4 pb-4">
      <button
        type="button"
        onClick={onExpand}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-default border-dashed bg-surface-raised text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <ChevronDownIcon className="w-3.5 h-3.5" />
        {t('sendActions.collapsedReply', { count })}
      </button>
    </div>
  );
}

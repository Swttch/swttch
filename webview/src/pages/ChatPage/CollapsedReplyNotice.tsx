import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';

interface Props {
  onExpand: () => void;
}

/**
 * The line left in place of a reply the user collapsed.
 *
 * A collapsed section renders nothing of its reply, and nothing is exactly what
 * a session whose messages failed to load also renders. The two must not look
 * alike: a user scrolling back through a long transcript has to be able to tell
 * "I hid this" from "this is broken".
 *
 * It is a button, not a caption, so the reply can be brought back from the spot
 * where it is missing. Reaching for the send's own menu works too, but that
 * asks the user to look somewhere other than where they noticed the gap.
 *
 * ## Why there is no count here
 *
 * This said "N hidden messages" at first, and the number was wrong. It counted
 * the section's JSONL entries, but a large share of those draw nothing at all:
 * `IfVisible` removes entries with no visible glyph (`<system-reminder>`, empty
 * content), and `mergeToolResults` folds each tool_result into the tool card
 * above it. Four bubbles on screen reported "2", and the same conversation
 * reloaded from disk reported "11" — live streaming and a replayed transcript
 * do not carry the same entries even when they draw the same thing.
 *
 * Counting the rendered bubbles instead is not available at this point:
 * `IfVisible` decides after mount, by measuring what it drew, so the number
 * does not exist until the very thing being hidden has been rendered.
 *
 * A count could be recovered by teaching this component every rule about which
 * entries draw nothing — which is precisely the approach `IfVisible` exists to
 * replace, having leaked three times as new kinds of invisible entry appeared.
 * So the notice states that a reply is hidden and stops there: that is the part
 * the user needs, and it cannot go stale as renderers change.
 */
export function CollapsedReplyNotice(props: Props) {
  const { onExpand } = props;
  const { t } = useTranslation('chat');

  return (
    <div className="px-4 pb-4">
      <button
        type="button"
        onClick={onExpand}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-default border-dashed bg-surface-raised text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <ChevronDownIcon className="w-3.5 h-3.5" />
        {t('sendActions.collapsedReply')}
      </button>
    </div>
  );
}

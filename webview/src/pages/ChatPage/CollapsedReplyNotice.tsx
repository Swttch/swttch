import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';

interface Props {
  onExpand: () => void;
}

/**
 * The band left in place of a reply the user collapsed.
 *
 * A collapsed section renders nothing of its reply, and nothing is exactly what
 * a session whose messages failed to load also renders. The two must not look
 * alike: a user scrolling back through a long transcript has to be able to tell
 * "I collapsed this" from "this is broken".
 *
 * It is a button, not a caption, so the reply can be brought back from the spot
 * where it is missing. Reaching for the send's own menu works too, but that
 * asks the user to look somewhere other than where they noticed the gap.
 *
 * It spans the column and centres its label, like "Load older messages" above
 * the transcript. Both interrupt the flow of the conversation rather than
 * belonging to any one message in it, and reading as the same kind of thing is
 * what makes that legible. A small chip sitting at the left margin — which this
 * was first — read as something attached to the send above it instead of as the
 * reply's own vacated place.
 *
 * ## Why there is no count here
 *
 * This said "N hidden messages" at first, and the number was wrong: a reply
 * drawing four bubbles reported "2" while streaming and "11" once reloaded from
 * disk.
 *
 * It counted the section's transcript entries, but an entry is not a bubble.
 * Measured on the session where this was caught, one section held 11 entries
 * and drew 4 — the other 7 were `attachment` entries, a type `MessageBubble`
 * has no case for and returns null on. `IfVisible` drops others for having no
 * visible glyph. And a live stream and a transcript replayed from disk do not
 * carry the same entries even when they draw the same thing, which is where the
 * two different wrong numbers came from.
 *
 * Counting the rendered bubbles instead is not available at this point:
 * `IfVisible` decides after mount, by measuring what it drew, so the number
 * does not exist until the very thing being collapsed has been rendered.
 *
 * A count could be recovered by teaching this component every rule about which
 * entries draw nothing — which is precisely the approach `IfVisible` exists to
 * replace, having leaked three times as new kinds of invisible entry appeared.
 * So the notice states that a reply is collapsed and stops there: that is the
 * part the user needs, and it cannot go stale as renderers change.
 */
export function CollapsedReplyNotice(props: Props) {
  const { onExpand } = props;
  const { t } = useTranslation('chat');

  return (
    <div className="px-4 pb-4 flex justify-center">
        <button
            type="button"
            onClick={onExpand}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 border-y border-border-default border-dashed bg-surface-raised text-sm text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
            <ChevronDownIcon className="w-4 h-4" />
            {t('sendActions.collapsedReply')}
        </button>
    </div>
  );
}

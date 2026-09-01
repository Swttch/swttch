import { useTranslation } from '@/i18n';
import { useHiddenBulletCount } from './useHiddenBulletCount';

interface Props {
  /** Section whose reply is folded, used to count what it is hiding. */
  sectionKey: string;
  onExpand: () => void;
}

/**
 * The line left in place of a reply the user collapsed.
 *
 * A collapsed section shows nothing of its reply, and nothing is exactly what a
 * session whose messages failed to load also shows. The two must not look
 * alike: a user scrolling back through a long transcript has to be able to tell
 * "I collapsed this" from "this is broken". Saying that, and how much is
 * hidden, is this line's whole job.
 *
 * It is drawn as an inline system notice — the same size, muted colour and
 * italic as the "interrupted" line, aligned to the same start edge as the sends
 * around it — because that is the family it belongs to: a remark the app makes
 * about the conversation, not a message in it.
 *
 * ## Why it announces rather than invites
 *
 * It is still a button, so the reply can be brought back from the spot where it
 * was noticed missing. But it carries no chevron and no chrome, and it is not
 * meant to be the way anyone expands a section: the fold arrow in the send's
 * gutter is, and that arrow is always on screen and says which state the
 * section is in.
 *
 * A chevron here read as an invitation the label could not honour — "N replies
 * collapsed" is a statement, and a control that looks pressable has to say what
 * pressing it does. Rewriting the label to carry both jobs at once was tried
 * and no wording earned its place, so the notice keeps the plain statement and
 * gives up advertising the click. Anyone who does press it still gets the reply
 * back.
 *
 * ## Why it is not the full-width band it used to be
 *
 * It spanned the column with a dashed rule above and below, centred like "Load
 * older messages". Measured against what it stands for, the marker cost 55px
 * where the send it belongs to is 30px — the thing pressed to save room taking
 * nearly twice the room of the prompt whose reply it hides. It also read as the
 * same kind of object as the "scroll to bottom" pill once both were on screen
 * together.
 *
 * The earlier objection to a left-aligned marker was that it looked attached to
 * the send above it rather than to the reply's vacated place. That objection no
 * longer holds: the send now carries a fold arrow of its own, so being attached
 * to that send is exactly right — it is that send's reply that is missing.
 *
 * ## Where the count comes from
 *
 * `useHiddenBulletCount` counts the bullets still in the document, which is why
 * folding hides the body with CSS instead of unmounting it. An earlier attempt
 * counted transcript entries instead and was wrong by construction; that
 * history is in the hook.
 *
 * Zero falls back to the plain statement. A reply that draws no bullet at all
 * has no number a reader would recognise, and "0 replies collapsed" beside a
 * section that plainly hid something would be worse than silence.
 */
export function CollapsedReplyNotice(props: Props) {
  const { sectionKey, onExpand } = props;
  const { t } = useTranslation('chat');
  const hidden = useHiddenBulletCount(sectionKey);

  // Two keys rather than one with a zero case: the plain statement is what the
  // notice falls back to when there is no number, and it has to read as a
  // finished sentence on its own rather than as the counted form with a hole
  // where the number would be.
  const label =
    hidden > 0
      ? t('sendActions.collapsedReplyCount', { count: hidden })
      : t('sendActions.collapsedReply');

  return (
    <div className="px-4 pb-2 flex justify-start">
        <button
            type="button"
            onClick={onExpand}
            className="py-2 text-[1rem] text-text-primary/60 italic hover:text-text-primary transition-colors cursor-pointer"
        >
            {label}
        </button>
    </div>
  );
}

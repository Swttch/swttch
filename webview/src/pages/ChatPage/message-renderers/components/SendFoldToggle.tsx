import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useSectionFoldValue, useSectionKey } from '../../SectionFoldContext';

/**
 * The fold arrow in the gutter to the start side of a user send.
 *
 * Same control an editor draws beside a foldable line, in the same place and
 * with the same two states: one click folds the reply, one click brings it
 * back. The reporter of issue #368 asked for exactly this after using the ⋮
 * menu that shipped first, and counted the steps — reaching a menu item costs
 * a click to open, a move across the bubble, and a second click, where an
 * arrow costs a move and one click.
 *
 * The ⋮ menu keeps its "Collapse reply" entry. The two are not rivals: the
 * menu is where the other per-send actions (fork and rewind, issue #356) are
 * going to live, and it would be strange for the one action already there to
 * vanish from the list as they arrive.
 *
 * ## Why it floats instead of taking a column
 *
 * It hangs outside the bubble by exactly the transcript's own `px-4`, so it
 * lands in margin that was already empty and every send stays at the left edge
 * it has always had.
 *
 * The first version put it in the flex row instead, which pushed each bubble in
 * by the arrow's width. Losing that column is what the reporter proposed
 * himself, and it is what an editor gutter costs, so it was worth trying — but
 * seen on a real transcript the indent was not worth what it bought. This is
 * the same trick `SendActionMenu` uses to sit on the opposite corner, and the
 * bubble wrapper is `relative` for both of them.
 *
 * The strip is 14px wide (`px-4` against this app's 14px root font), and the
 * icon's glyph is drawn well inside its own box, so the arrow reads as spaced
 * from the panel edge rather than pressed against it. The button fills the full
 * height of the bubble's first line so the target is taller than the glyph.
 *
 * ## Why it is always visible
 *
 * Every other control on a send appears on hover, which keeps a long
 * transcript from reading as a column of buttons. This one does not, for two
 * reasons. A collapsed section must say so from across the screen, or the
 * missing reply reads as something broken rather than as something the user
 * did. And an arrow that has to be hunted for by hovering is back to costing
 * the move-and-wait this control exists to remove. Drawn in the tertiary text
 * colour it reads as gutter furniture, the way the editor's own does.
 */
export function SendFoldToggle() {
  const { t } = useTranslation('chat');
  const fold = useSectionFoldValue();
  const sectionKey = useSectionKey();

  // No section above means no reply to fold: the same renderer draws every
  // unmerged tool result, and those head nothing. See `SectionKeyContext`.
  if (!fold || sectionKey === null) return null;

  const collapsed = fold.isCollapsed(sectionKey);
  const label = collapsed ? t('sendActions.expandReply') : t('sendActions.collapseReply');

  return (
    /*
      --- tweak this ---
        `-start-4` is the transcript's own `px-4` spent in the other direction,
        which is what keeps the arrow off the bubble without moving it. Change
        the padding on the row in `UserMessageRenderer` and this has to follow,
        or the arrow drifts onto the bubble or off the panel.

        `h-[28px]` is the bubble's first line (3.5px padding + 21px line +
        3.5px padding, from `MessageBox`), so the arrow centres on that line
        rather than on a tall bubble's middle. `top-0` measures from the same
        edge the height is taken from.

      The click is swallowed here for the same reason `SendActionMenu` swallows
      its own: `MessageBox` toggles the bubble's expand on click and
      `ChatMessageArea` logs the raw JSONL entry, and neither is what the user
      asked for by folding a reply.
    */
    <div className="absolute -start-4 top-0 w-4 h-[28px]" onClick={e => e.stopPropagation()}>
      {/*
        `Tooltip` rather than a `title` attribute: native tooltips do not render
        in the JCEF WebView the plugin embeds.
      */}
      <Tooltip content={label} placement="top">
        <button
          type="button"
          onClick={() => fold.toggle(sectionKey)}
          aria-expanded={!collapsed}
          aria-label={label}
          className="w-full h-full flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
        >
          <ChevronRightIcon
            // Collapsed: points toward reading-forward direction (right in LTR,
            // left in RTL via rtl:-scale-x-100). Expanded: always points down.
            // Tailwind composes transforms as rotate() then scaleX(), so under
            // RTL the mirrored coordinate frame needs the rotation sign flipped
            // too (rtl:-rotate-90) to still land on "down" once combined with
            // the mirror.
            className={`w-4 h-4 transition-transform rtl:-scale-x-100 ${collapsed ? '' : 'rotate-90 rtl:-rotate-90'}`}
          />
        </button>
      </Tooltip>
    </div>
  );
}

import { useState } from 'react';
import Tippy from '@tippyjs/react/headless';
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useSectionFoldValue, useSectionKey } from '../../SectionFoldContext';

/**
 * The button at the top-right corner of a user send, and the menu it opens.
 *
 * The POSITION is taken from the Claude Code extension in Cursor, which puts
 * the same control in the same corner of the same bubble (issue #356's
 * screenshot): someone arriving from Cursor should find the per-send actions
 * where they already reach for them.
 *
 * The GLYPH is not. Cursor draws a back-arrow there, which reads as "undo" —
 * fair for a menu of fork and rewind, wrong for one whose entry folds a reply.
 * A vertical ellipsis promises a menu and nothing more, and it is already what
 * `OverflowMenu` uses for the same job in the session header, so the two menus
 * in this UI look like the same kind of thing.
 *
 * Cursor's menu lists fork and rewind. Neither exists here yet — issue #356
 * tracks them — so today the menu carries the one action we do have, collapsing
 * the reply below this send (issue #368). The menu is built as a list from the
 * start rather than as a lone button so those entries can join it without the
 * control being redesigned around them.
 *
 * The control renders only for a send that actually heads a section, inside a
 * transcript that groups them. Anywhere else there is no reply to collapse, and
 * drawing a button whose only item cannot act would be a control that does
 * nothing.
 *
 * ## Why Tippy and not a positioned div
 *
 * The first version drew the menu itself, as `absolute end-0` under the button.
 * That is fine only while the button sits far from an edge. A send near the
 * left of a narrow panel opens a menu wider than the space to its left, and a
 * plain `end-0` box has no idea — it runs off the viewport and is simply lost.
 *
 * Tippy (Popper underneath) flips and shifts the menu to stay on screen, which
 * is the whole reason the dependency is here. It also renders into `<body>`, so
 * the menu is not clipped by the chat's own scroll container the way an
 * in-flow absolute box would be.
 */
export function SendActionMenu() {
  const { t } = useTranslation('chat');
  const fold = useSectionFoldValue();
  const sectionKey = useSectionKey();
  const [open, setOpen] = useState(false);

  if (!fold || sectionKey === null) return null;

  const collapsed = fold.isCollapsed(sectionKey);
  const label = t('sendActions.menuLabel');

  return (
    /*
      Straddles the bubble's top-right corner rather than sitting beside it.
      The parent in `UserMessageRenderer` is `relative` and wraps the bubble
      alone, so these offsets are measured from the corner itself.

      --- tweak this ---
        `-top-2 -end-2` pulls the button out by 6px each way, leaving about a
        third of it past the corner (the classes read as 8px on Tailwind's
        scale, but this app sets a 14px root font, so every rem-based utility
        here lands smaller than its name suggests — measure, do not assume).
        Nudge both together; moving one alone slides the button along an edge
        instead of along the diagonal.

      A send is never the first thing in the scroll container (the chat has
      padding above it), so hanging upward cannot clip.

      The click is swallowed here rather than on the button, so it also covers
      the menu Tippy renders through this subtree. Two ancestors act on clicks
      that reach them: `MessageBox` toggles the bubble's expand, and
      `ChatMessageArea` logs the raw JSONL entry. Neither is what the user
      asked for by opening this menu.
    */
    <div className="absolute -top-2 -end-2 z-[2]" onClick={e => e.stopPropagation()}>
      <Tippy
        // Controlled: this is a menu opened by a click, not a hover tooltip, so
        // Tippy is told when it is open instead of deciding for itself.
        visible={open}
        // Tippy's own outside-click handling, which replaces the document-level
        // mousedown listener the hand-rolled version needed. It fires on
        // mousedown, so the bubble underneath does not toggle its expand on the
        // way out — the reason that listener could not use `click` either.
        onClickOutside={() => setOpen(false)}
        interactive
        placement="bottom-end"
        offset={[0, 4]}
        // Out of the chat's scroll container, so the menu is never clipped by
        // it. Same move as `Tooltip`'s interactive mode.
        appendTo={() => document.body}
        render={attrs => (
          <div
            role="menu"
            className="w-max max-w-[16rem] bg-surface-raised border border-border-default rounded-md shadow-xl overflow-hidden z-50"
            {...attrs}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                fold.toggle(sectionKey);
                setOpen(false);
              }}
              className="w-full text-start px-3 py-2 text-xs text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              {collapsed ? t('sendActions.expandReply') : t('sendActions.collapseReply')}
            </button>
          </div>
        )}
      >
        {/*
          `Tooltip` rather than a `title` attribute: native tooltips do not
          render in the JCEF WebView the plugin embeds, so a `title` here would
          label the button in the browser and nowhere in the IDE.
        */}
        <span>
          <Tooltip content={label} placement="top">
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={label}
              // Hidden until the send is hovered, like MessageActions beside
              // it, so a long transcript is not a column of buttons.
              // `focus-visible` keeps it reachable by keyboard, where there is
              // no hover to reveal it.
              //
              // Sized to sit ON the corner: a button big enough to stand next
              // to the bubble would cover the first line of it from here. It
              // measures ~16px across with the icon at ~11px, which is the
              // smallest that still reads as a menu rather than as a speck.
              className="flex items-center justify-center w-5 h-5 rounded-full border border-border-default bg-surface-raised text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 cursor-pointer"
            >
              <EllipsisVerticalIcon className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </span>
      </Tippy>
    </div>
  );
}

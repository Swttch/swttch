import { useEffect, useRef, useState } from 'react';
import { ArrowUturnLeftIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { useSectionFoldValue, useSectionKey } from '../../SectionFoldContext';

/**
 * The round button at the top-right corner of a user send, and the menu it
 * opens.
 *
 * Placed and shaped after the Claude Code extension in Cursor, which puts the
 * same control in the same corner of the same bubble (issue #356's screenshot).
 * Matching it is the point: someone arriving from Cursor should find the
 * per-send actions where they already reach for them.
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
 */
export function SendActionMenu() {
  const { t } = useTranslation('chat');
  const fold = useSectionFoldValue();
  const sectionKey = useSectionKey();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside closes, the same way OverflowMenu and SessionDropdown do.
  //
  // `mousedown` rather than `click`: the bubble underneath toggles its own
  // expand on click, and waiting for the full click would let that fire on the
  // way to closing the menu.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  if (!fold || sectionKey === null) return null;

  const collapsed = fold.isCollapsed(sectionKey);

  // Everything in here stops propagation. Two ancestors act on clicks that
  // reach them: `MessageBox` toggles expand, and `ChatMessageArea` logs the raw
  // JSONL entry. Neither is what the user asked for by opening this menu.
  const swallow = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="relative flex-shrink-0" ref={ref} onClick={swallow}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('sendActions.menuLabel')}
        title={t('sendActions.menuLabel')}
        // Hidden until the send is hovered, like MessageActions beside it, so a
        // long transcript is not a column of buttons. `focus-visible` keeps it
        // reachable by keyboard, where there is no hover to reveal it.
        className="p-1 rounded-full border border-border-default bg-surface-raised text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 cursor-pointer"
      >
        <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full mt-1 w-max max-w-[16rem] bg-surface-raised border border-border-default rounded-md shadow-xl overflow-hidden z-50"
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
    </div>
  );
}

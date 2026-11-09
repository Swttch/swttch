import { useLayoutEffect, useRef, useState } from 'react';
import { stripSessionMentionTags } from '../ChatInput/sessionMentionTag';

/** Height of one row of the list, in pixels. Fixed, so the rows to draw follow from the scroll position alone. */
export const SEND_LIST_ROW_HEIGHT = 28;

/** Width of the list, in pixels. */
const LIST_WIDTH = 320;

/** Rows drawn beyond the visible ones on each side, so a fast scroll does not show blank. */
const OVERSCAN = 6;

/**
 * The rows to draw for a list scrolled to `scrollTop`.
 *
 * A session can hold hundreds of prompts, and a row for each would be hundreds of
 * elements kept up to date for a panel that shows a dozen. Only the visible rows
 * and a few beyond them are drawn; the spacer around them keeps the scroll
 * height true.
 */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  count: number,
  rowHeight = SEND_LIST_ROW_HEIGHT,
  overscan = OVERSCAN,
): { start: number; end: number } {
  const first = Math.floor(scrollTop / rowHeight);
  const last = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  return { start: Math.max(first - overscan, 0), end: Math.min(last + overscan, count) };
}

/** One line for a row: the first non-empty line of the send, with its mention tags read as their labels. */
function rowText(text: string): string {
  const line = stripSessionMentionTags(text).split('\n').find(part => part.trim() !== '');
  return (line ?? '').trim();
}

interface Props {
  /** The edge of the chat the rail is on; the list opens on the side facing the chat. */
  side: 'start' | 'end';
  entries: { key: string; text: string }[];
  /** The entry being read, which is drawn apart and is where the list opens. */
  current: number;
  onPick: (index: number) => void;
}

/**
 * Every send in the session, one line each, opened by holding a tick.
 *
 * It only reads: opening it leaves the transcript and the rail where they are,
 * and picking a row goes through the same jump a tick click does.
 */
export function SendIndexList({ side, entries, current, onPick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 0 });

  // Opens with the entry being read in the middle, so the list starts where the reader is.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(current * SEND_LIST_ROW_HEIGHT - el.clientHeight / 2, 0);
    setScroll({ top: el.scrollTop, height: el.clientHeight });
    // Only on open: later changes of the entry being read must not move the list under the pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { start, end } = visibleRange(scroll.top, scroll.height, entries.length);

  return (
    <div className={`absolute top-0 bottom-0 pointer-events-auto ${side === 'end' ? 'end-full pe-2' : 'start-full ps-2'}`}>
      <div
        ref={scrollRef}
        role="listbox"
        aria-label="All prompts"
        onScroll={e => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
        className="h-full overflow-y-auto bg-surface-raised border border-border-default rounded-lg shadow-md"
        style={{ width: LIST_WIDTH }}
      >
        <div className="relative" style={{ height: entries.length * SEND_LIST_ROW_HEIGHT }}>
          {entries.slice(start, end).map((entry, offset) => {
            const i = start + offset;
            const isCurrent = i === current;
            return (
              <button
                key={entry.key}
                type="button"
                role="option"
                aria-selected={isCurrent}
                onClick={() => onPick(i)}
                className={`absolute inset-x-0 flex items-center px-3 text-start text-xs truncate hover:bg-surface-hover ${
                  isCurrent ? 'text-[var(--text-link)] font-medium' : 'text-text-secondary'
                }`}
                style={{ top: i * SEND_LIST_ROW_HEIGHT, height: SEND_LIST_ROW_HEIGHT }}
              >
                <span className="truncate">{rowText(entry.text) || '\u00a0'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

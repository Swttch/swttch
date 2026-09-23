import React, { useState } from 'react';
import { useScrollFoldValue } from '../../ScrollFoldContext';
import { FOLD_MIN_HEIGHT } from '../../useScrollFold';

interface MessageBoxProps {
  children: React.ReactNode;
  /** 최대 높이 제한 활성화 (기본: true). true면 280px 초과 시 접힘 */
  collapsible?: boolean;
  className?: string;
  /**
   * The collapsed height this box caps itself at before a click expands it.
   *
   * `'default'` (280px) is every ordinary chat bubble. `'compact'` (one line,
   * ~28px at this app's 14px root font: `text-[1rem] leading-[1.5]` plus the
   * `py-[3.5px]` padding above and below) is for a bubble that must read as a
   * single line at rest — the queued-message stack, whose whole stacking and
   * hover-to-expand effect depends on each entry starting that short. Expanding
   * (click) behaves identically either way: both grow to `80vh` and scroll.
   */
  variant?: 'default' | 'compact';
}

/**
 * 사용자 메시지 스타일의 박스 컴포넌트.
 * bg-surface-hover border border-border-default rounded-lg 스타일을 공유.
 *
 * Two things decide how tall this gets, and they never negotiate:
 *
 *   - Expand (click). Off by default. While on, the box shows as much as it
 *     can — capped at 80vh so the reply underneath is never fully buried, and
 *     scrollable inside once it hits that. A send pinned to the top of the
 *     chat cannot be read by scrolling the page, so this is the only way
 *     through a long one.
 *
 *   - The scroll fold. Only while pinned. Gives up a pixel of height per pixel
 *     scrolled, floored at one line here — `useScrollFold` deliberately hands
 *     over a number that has run negative, and clamping anywhere but at the
 *     point of use would break unfolding.
 *
 * Expand wins when both apply: "show me this" outranks "you scrolled past it".
 * Turning expand back off drops straight to whatever the fold says *now*, not
 * to the height it had when expand went on — the fold kept counting the whole
 * time, and that is the point of it being a computed value rather than state.
 *
 * Shrinking here would pull the transcript up with it — a `sticky` element
 * looks detached but keeps its place in the flow. `StickySendHeader` makes up
 * the difference outside itself; see the spacer there.
 */
export const MessageBox: React.FC<MessageBoxProps> = ({ children, collapsible = true, className, variant = 'default' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const fold = useScrollFoldValue();
  const folding = collapsible && !isExpanded && fold !== null;

  // Bounded at both ends. The raw number runs past the floor so unfolding can
  // retrace the same distance, and past the ceiling when scrolled backwards —
  // a bubble must never be drawn taller than it was to begin with.
  const height = fold
    ? Math.min(Math.max(fold.height, FOLD_MIN_HEIGHT), fold.restingHeight)
    : undefined;

  const collapsedHeightClass = variant === 'compact' ? 'max-h-[28px]' : 'max-h-[280px]';

  return (
    <div
      // How useScrollFold finds the element whose natural height it must read.
      data-message-box
      className={`bg-surface-hover border border-border-default rounded-lg px-[8px] py-[3.5px] ${
        collapsible && !isExpanded ? `${collapsedHeightClass} overflow-hidden` : ''
      } ${collapsible && isExpanded ? 'max-h-[80vh] overflow-y-auto overscroll-contain' : ''} ${className ?? ''}`}
      style={folding ? { height } : undefined}
      onClick={collapsible ? () => setIsExpanded(!isExpanded) : undefined}
    >
      {children}
    </div>
  );
};

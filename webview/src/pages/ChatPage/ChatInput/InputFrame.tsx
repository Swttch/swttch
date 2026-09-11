import type { ReactNode } from 'react';
import { INPUT_MODES, type InputMode } from '@/types/chatInput';

interface Props {
  /** Colours the border and the focus ring. */
  mode: InputMode;
  /** Lights the box up — the editor inside owns the focus, not this. */
  isFocused?: boolean;
  /** Paints the drop state over the focus state, as a drop is about to land. */
  isDragOver?: boolean;
  /**
   * Floating children positioned against this box: dropdowns that open upward,
   * overlays that cover it. Rendered before everything else so their absolute
   * positioning resolves against the container.
   */
  overlays?: ReactNode;
  /** The editor. Given a `relative` slot, so anything may sit over it. */
  editor: ReactNode;
  /** Between the editor and the divider — attachment previews, errors. */
  belowEditor?: ReactNode;
  /** Bottom bar, start side: what this composer is pointed at. */
  barStart?: ReactNode;
  /** Bottom bar, end side: what it can do. */
  barEnd?: ReactNode;
}

/**
 * The frame an input sits in, with nothing in it that knows whose input it is.
 *
 * There are two: the session's own, and the one under a background agent's
 * transcript. They are the same control pointed at different recipients, so the
 * shape they share lives here once — a bordered container that takes the mode's
 * colour and lights up on focus, a full-width editor, a divider, and a bottom
 * bar split start/end.
 *
 * Everything that differs is a slot. The session input fills all of them
 * (mention dropdown, slash panel, drag overlay, attachment previews, mode and
 * model tags); the agent input fills two, because a slash command addresses
 * the session rather than the agent and an attachment has nowhere to go —
 * `SendMessage` carries a plain string.
 *
 * Kept as markup only. Both callers hold their own state and hand the result
 * down, which is what lets the second one exist at all: the session input
 * reads session, stream and input-state context directly, and a frame that did
 * the same could never be pointed anywhere else.
 */
export function InputFrame(props: Props) {
  const { mode, isFocused, isDragOver, overlays, editor, belowEditor, barStart, barEnd } = props;
  const modeConfig = INPUT_MODES[mode];

  return (
    <div
      className={`
        relative rounded-lg border bg-surface-raised
        transition-colors duration-150
        ${isDragOver ? 'border-border-focus bg-accent-primary/5' : isFocused ? `${modeConfig.borderColorFocused} outline outline-4 ${modeConfig.outline}` : modeConfig.borderColor}
      `}
    >
      {overlays}

      {/* The editor's slot is the positioning context for anything that sits
          over it — the session input's mic button rides here. */}
      <div className="relative pt-2.5 pb-1.5">{editor}</div>

      {belowEditor}

      <div className="border-t border-border-subtle" />

      {/* Both sides allow shrinking (`min-w-0`) so tags ellipsize instead of
          wrapping when the composer is narrow, while the action buttons stay
          whole (issue #217). */}
      <div className="flex items-center justify-between px-[5px] py-[3px] h-[35px]">
        <div className="flex items-center gap-0.5 xs:gap-1 min-w-0">{barStart}</div>
        <div className="flex items-center gap-0.5 xs:gap-1 min-w-0">{barEnd}</div>
      </div>
    </div>
  );
}

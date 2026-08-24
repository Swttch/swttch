import { useEffect, useState } from 'react';
import { Portal } from '@/components/Portal';
import { useChatFooterHeight } from '../ChatPage/chatFooter';
import { DiffPage } from '.';

interface Props {
  toolUseId: string;
  onClose: () => void;
}

/**
 * How wide the collapsed bar is, matching the approval prompt it stacks on.
 *
 * That panel caps its wrapper at 44rem and pads it by 1rem a side, so the card
 * the reviewer actually sees is 42rem — this is that card's width, not the
 * wrapper's. Kept as one number rather than repeating the arithmetic in a class
 * name, where the reason for the subtraction would be invisible.
 */
const COLLAPSED_WIDTH = '42rem';

/**
 * The diff page as a modal over the current session, for browsers set to review
 * that way.
 *
 * Built like SettingsOverlay — same portal, same scrim, same Escape and
 * click-outside — because it is the same gesture, and two overlays that dismiss
 * differently are two things to learn.
 *
 * Wider than the settings modal: a side-by-side diff splits its room in half, so
 * the same max width would push it into the stacked layout on screens that could
 * comfortably show both sides.
 *
 * Closing without answering is deliberate. The question stays open — it is the
 * approval prompt underneath that owns it — and the file name there opens this
 * again.
 */
export function DiffOverlay({ toolUseId, onClose }: Props) {
  // Collapsed, this stops being a modal: the reviewer folded the diff away in
  // order to read the conversation it was covering, so the layer has to let the
  // mouse through to it.
  const [collapsed, setCollapsed] = useState(false);
  const footerHeight = useChatFooterHeight();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <Portal>
      {/*
        Anchored to the bottom, where the approval and question panels sit.

        Expanded this changes nothing — the diff fills the scrim either way. It
        shows once the diff is collapsed: centred, the leftover header floated
        in the middle of the conversation and cut it in two, which is the thing
        collapsing was supposed to stop doing.
      */}
      {/*
        No tint over the conversation.

        The settings modal dims what is behind it because nothing back there is
        worth reading while it is open. A review is the opposite: the reviewer
        is deciding about a turn they can see, and collapsing the diff exists to
        put that turn back in front of them — a scrim would grey out the very
        thing they collapsed to read.

        The layer stays, transparent, because it is what catches a click outside
        and closes the review.

        Except when the diff is collapsed. Then the layer is exactly what stops
        the reviewer reaching the conversation they folded the diff away to read
        — a full-screen sheet that swallows every scroll and click. So it stops
        taking the mouse, and the header below takes it back. Click-outside goes
        with it, which is right: there is nothing left to dismiss by clicking
        past, and the chevron is how this comes back.
      */}
      <div
        className={`fixed inset-0 z-50 flex items-end justify-center ${
          collapsed ? 'pointer-events-none px-4 -mb-1' : 'p-4'
        }`}
        // Collapsed, this bar stacks on top of whatever the chat has at its
        // bottom — usually the very approval prompt this review belongs to.
        // Measured rather than guessed: that strip is a composer one moment and
        // a three-option prompt with a text box the next.
        //
        // The -mb-1 above closes the gap that measurement leaves. The strip is
        // taller than the card inside it — the approval panel pads itself by
        // pt-2 — so clearing its full height parks this bar a visible step above
        // the card it belongs with. Taken off the margin rather than subtracted
        // from the height so the measurement stays the honest one: the panel's
        // own padding is the panel's to change.
        style={collapsed ? { paddingBottom: footerHeight } : undefined}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/*
          The whole window bar the scrim's own padding.

          A diff is two files side by side, so every column taken away is read
          twice. The settings modal caps its width because a settings form stops
          improving past a certain measure; this does not.

          Height is a ceiling rather than a size, so that collapsing the diff
          shrinks this box to the header it leaves behind. Fixed at h-full it
          stayed full-screen with nothing in it, which hid the conversation the
          collapse was meant to uncover.
        */}
        {/* pointer-events-auto: the layer above gives up the mouse when
            collapsed, and this takes it back — otherwise the chevron that
            expands the diff again could not be clicked either. */}
        {/*
          Collapsed, it lines up with the approval prompt below it, so the two
          read as one stack rather than two things that happen to be near each
          other.

          COLLAPSED_WIDTH is that panel's measure less its gutters — the panel
          caps a wrapper at 44rem and pads it by 1rem a side, and what has to
          match is the card inside, not the wrapper.

          Expanded it goes back to taking the room, which a diff needs and a
          prompt does not.
        */}
        <div
          className={`pointer-events-auto flex max-h-full w-full flex-col overflow-hidden border border-border-default bg-surface-base shadow-2xl ${
            collapsed ? 'rounded-lg' : 'rounded-xl'
          }`}
          style={collapsed ? { maxWidth: COLLAPSED_WIDTH } : undefined}
        >
          {/* isOverlay: the tab still belongs to the chat underneath, so the
              page must not rename it — see diffTabTitle. */}
          <DiffPage
            toolUseId={toolUseId}
            onClose={onClose}
            isOverlay
            onCollapsedChange={setCollapsed}
          />
        </div>
      </div>
    </Portal>
  );
}

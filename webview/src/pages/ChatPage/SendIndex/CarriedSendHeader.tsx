import { StickySendHeader } from '../StickySendHeader';
import { MessageBox } from '../message-renderers/components/MessageBox';

interface Props {
  /** The send's text, from the session index. Truncated at SEND_PREVIEW_LIMIT. */
  preview: string;
}

/**
 * The send a transcript's first section is answering, when that send is further
 * back than the page reaches.
 *
 * A page boundary can land in the middle of a reply, and the run of entries
 * above the first real send then has no header at all: scrolling through it
 * shows tool calls and diffs with nothing saying what was asked. It was empty
 * because the entry that would fill it had not been fetched.
 *
 * The send index changed that. It holds every send in the session, so the text
 * is already here — this draws it in the slot that was blank.
 *
 * What it draws is the INDEX's copy, cut at SEND_PREVIEW_LIMIT, not the entry.
 * That is the whole difference from an ordinary pinned send, and it is why this
 * is a component of its own rather than a branch inside the renderer: a bubble
 * built from the transcript is the real message, and this one is a stand-in for
 * a message that is not loaded. Loading older messages replaces it with the
 * real bubble, unabridged.
 */
export function CarriedSendHeader({ preview }: Props) {
  return (
    <StickySendHeader onClick={() => {}}>
      {/*
        Built from the same pieces as UserMessageRenderer's plain-text branch,
        not merely styled to look like it: the row, the `relative min-w-0`
        column and `MessageBox` are what give a send its fill, its border and
        its 280px cap, and they are also what the scroll fold measures and
        shrinks while the send is pinned.

        Hand-rolling the look instead left this one as bare text on no surface
        at all, which is what the screenshot showed — and it would have gone on
        drifting from the real bubble every time that one was restyled.
      */}
      <div className="group pt-2 pb-4 px-4 space-y-2.5">
        <div className="flex items-start">
          <div className="relative min-w-0">
            <MessageBox>
              <div className="text-text-primary/80 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">
                {preview}
              </div>
            </MessageBox>
          </div>
        </div>
      </div>
    </StickySendHeader>
  );
}

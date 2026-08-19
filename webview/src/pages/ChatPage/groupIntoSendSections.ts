import type { LoadedMessageDto } from '../../types';
import { isUserSend } from './paging';

/**
 * A user send together with everything the CLI produced in reply to it.
 *
 * `head` is the send itself and is `null` only for the first section of a
 * transcript that does not begin with one — an older page can start mid-reply,
 * and a session resumed from a compact summary opens with CLI-authored entries.
 * Such a section renders as a plain run of messages with no sticky header.
 */
export interface SendSection {
  /** uuid of `head`, or of the first message when there is no head. Used as the React key. */
  key: string;
  head: LoadedMessageDto | null;
  body: LoadedMessageDto[];
}

/**
 * Split a flat message list into one section per user send.
 *
 * This exists to make the sticky header push its predecessor off the top
 * instead of covering it. A sticky element cannot escape its own parent, so
 * scoping each send to a section is what evicts the previous header when the
 * next section scrolls up — a flat list of siblings all pinned to `top: 0`
 * would just stack them on the same spot.
 *
 * Only genuine sends open a section. Tool results are `type: "user"` entries
 * too (see `isUserSend`), and treating them as heads would pin a header that
 * `UserMessageRenderer` declines to draw, parking a blank strip at the top.
 */
export function groupIntoSendSections(messages: LoadedMessageDto[]): SendSection[] {
  const sections: SendSection[] = [];

  for (const message of messages) {
    const startsSection = isUserSend(message);
    if (startsSection || sections.length === 0) {
      sections.push({
        key: message.uuid ?? `section-${sections.length}`,
        head: startsSection ? message : null,
        body: startsSection ? [] : [message],
      });
      continue;
    }
    sections[sections.length - 1].body.push(message);
  }

  return sections;
}

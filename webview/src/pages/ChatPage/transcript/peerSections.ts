import type { SendSection } from '../groupIntoSendSections';
import { carriesAppEvent, carriesUserSend, isAppEvent, isPeerMessage } from './buildSegments';

/**
 * The sections of a transcript with a message from another session taken out as sections of their own.
 *
 * The classic chat opens a section at every `user` entry that is not a tool result, and a message another session
 * sent is one. Here it is not a send of the user's: the desktop app draws it in the flow of the reply it arrives in,
 * with the calls around it, so it becomes an entry of the section before it (or of the first, which then has no head).
 */
export function withoutPeerSections(sections: SendSection[]): SendSection[] {
  const result: SendSection[] = [];
  for (const section of sections) {
    if (section.head && (isPeerMessage(section.head) || isAppEvent(section.head))) {
      const entries = [section.head, ...section.body];
      const previous = result[result.length - 1];
      if (previous) {
        result[result.length - 1] = { ...previous, body: [...previous.body, ...entries] };
      } else {
        result.push({ key: section.key, head: null, body: entries });
      }
      continue;
    }
    if (section.head && carriesAppEvent(section.head) && carriesUserSend(section.head)) {
      // The app's reports ride in the entry of the user's next send: they join the run before it, and the send stays.
      const previous = result[result.length - 1];
      if (previous) result[result.length - 1] = { ...previous, body: [...previous.body, section.head] };
      else result.push({ key: `${section.key}-reports`, head: null, body: [section.head] });
    }
    result.push(section);
  }
  return result;
}

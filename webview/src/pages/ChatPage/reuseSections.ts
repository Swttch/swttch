import type { SendSection } from './groupIntoSendSections';

/**
 * Hand back the sections already drawn wherever nothing in them changed (#680).
 *
 * Grouping the messages makes new section objects with new body arrays on every run, and the transcript draws a
 * section again whenever the one it is given is not the one it drew. While a reply streams, a word arrives every few
 * milliseconds and only the last section has changed; every section above it was being drawn again for it, which on
 * a long conversation is hundreds of rows, their tooltips and their markdown, for each word.
 *
 * A section is the same when it has the same key, the same head and the same messages in the same order. Messages
 * are compared as objects: one that was changed is a new object (the streaming one is rebuilt for every delta).
 */
export function reuseSections(previous: readonly SendSection[], next: SendSection[]): SendSection[] {
  const drawn = new Map<string, SendSection>();
  for (const section of previous) drawn.set(section.key, section);

  const sections = next.map((section) => {
    const before = drawn.get(section.key);
    if (
      before !== undefined &&
      before.head === section.head &&
      before.body.length === section.body.length &&
      before.body.every((message, index) => message === section.body[index])
    ) {
      return before;
    }
    return section;
  });

  // Nothing at all changed: the list itself is the one already drawn.
  if (sections.length === previous.length && sections.every((section, index) => section === previous[index])) {
    return previous as SendSection[];
  }
  return sections;
}

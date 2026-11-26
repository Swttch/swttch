import type { LoadedMessageDto } from '../../types';
import { mountKeyOf, type SendSection } from './groupIntoSendSections';

/** What tells one message from another across two groupings: a streamed reply changes its `uuid`, not its `rowKey`. */
function messageId(message: LoadedMessageDto): string | undefined {
  return message.rowKey ?? message.uuid;
}

/**
 * The name each of the `next` sections is drawn under, one per section and never the same twice.
 *
 * A section opening mid-reply has no send to be named after and takes the first entry held, so every older page put
 * in front of it renames it, and so does letting go of its first entries. React draws a section under a new name
 * from nothing: every message in it is parsed and drawn again, which is a visible pause at each page (#747). The
 * name therefore stays with the stretch of the conversation: a section takes the name of the one drawn before that
 * has its key, or else of the one that held a message it holds.
 */
function mountKeysFor(previous: readonly SendSection[], next: readonly SendSection[]): string[] {
  const names: (string | undefined)[] = Array.from({ length: next.length }, () => undefined);
  const taken = new Set<string>();
  const claim = (index: number, name: string) => {
    if (taken.has(name)) return;
    names[index] = name;
    taken.add(name);
  };

  const byKey = new Map(previous.map((section) => [section.key, section]));
  next.forEach((section, i) => {
    const before = byKey.get(section.key);
    if (before) claim(i, mountKeyOf(before));
  });

  // Only looked up when a key is new, which a word of a streaming reply never makes.
  if (names.includes(undefined)) {
    const holders = new Map<string, SendSection>();
    for (const section of previous) {
      for (const message of section.head ? [section.head, ...section.body] : section.body) {
        const id = messageId(message);
        if (id !== undefined) holders.set(id, section);
      }
    }
    next.forEach((section, i) => {
      if (names[i] !== undefined) return;
      // From the end: that is the part an older page leaves where it was.
      for (let at = section.body.length - 1; at >= -1; at--) {
        const message = at >= 0 ? section.body[at] : section.head;
        const id = message ? messageId(message) : undefined;
        const holder = id === undefined ? undefined : holders.get(id);
        if (!holder) continue;
        claim(i, mountKeyOf(holder));
        if (names[i] !== undefined) return;
      }
    });
  }

  next.forEach((section, i) => {
    if (names[i] !== undefined) return;
    let name = section.key;
    for (let n = 2; taken.has(name); n++) name = `${section.key}~${n}`;
    claim(i, name);
  });
  return names as string[];
}

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
 *
 * It also settles the name each section is drawn under (`mountKey`), which is not always the key: see
 * [mountKeysFor].
 */
export function reuseSections(previous: readonly SendSection[], next: SendSection[]): SendSection[] {
  const drawn = new Map<string, SendSection>();
  for (const section of previous) drawn.set(section.key, section);

  const mountKeys = mountKeysFor(previous, next);
  const sections = next.map((section, i) => {
    const before = drawn.get(section.key);
    if (
      before !== undefined &&
      mountKeyOf(before) === mountKeys[i] &&
      before.head === section.head &&
      before.body.length === section.body.length &&
      before.body.every((message, index) => message === section.body[index])
    ) {
      return before;
    }
    if (mountKeys[i] === mountKeyOf(section)) return section;
    return { ...section, mountKey: mountKeys[i] === section.key ? undefined : mountKeys[i] };
  });

  // Nothing at all changed: the list itself is the one already drawn.
  if (sections.length === previous.length && sections.every((section, index) => section === previous[index])) {
    return previous as SendSection[];
  }
  return sections;
}

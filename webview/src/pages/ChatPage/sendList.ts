import { type SessionSend } from '@/shared';
import { type LoadedMessageDto } from '@/types';
import type { SendSection } from './groupIntoSendSections';
import { isUserSend } from './paging';
import { composeSendText, sendText } from './sendText';

/** One send of the session: a tick of the send index, and one step of the composer's history. */
export interface SendIndexEntry {
  /** The section this send opens, which is also how a jump finds it. */
  key: string;
  /** What the tick's preview card shows. For a send that is not loaded, the cut copy the backend keeps. */
  text: string;
  /** How many pictures the send holds. A send of pictures alone has no text. */
  images: number;
  /** The entry itself, when the transcript holds it. */
  message?: LoadedMessageDto;
  /**
   * Whether the transcript currently holds this send.
   *
   * Never drawn. A tick looks the same either way on purpose: which sends we
   * have fetched is our paging arrangement, not a property of the conversation,
   * and a dimmer tick reads as a lesser or deleted message. It only decides
   * whether a jump can scroll straight there or has to load first.
   */
  loaded: boolean;
}

const imagesIn = (message: LoadedMessageDto): number => {
  const content = message.message?.content;
  return Array.isArray(content) ? content.filter((block) => block.type === 'image').length : 0;
};

const notLoaded = (send: SessionSend): SendIndexEntry => ({
  key: send.uuid,
  text: composeSendText(send.preview),
  images: send.images ?? 0,
  loaded: false,
});

/**
 * Every send in the session, in transcript order: the ticks of the send index and the steps of the composer's history.
 *
 * Two sources, joined rather than merged entry by entry. The loaded transcript
 * is authoritative from its oldest send onward, and the backend index covers
 * everything before that.
 *
 * Splitting them at that boundary, instead of taking the union and deduping, is what keeps sends the index does not
 * know yet: a send made in this view goes by a local id until the transcript is read back.
 */
export function buildEntries(
  sessionSends: SessionSend[],
  loadedSections: SendSection[],
): SendIndexEntry[] {
  const loaded: SendIndexEntry[] = loadedSections
    // The same rule the backend's index is built with, so a tick does not appear or vanish as the transcript pages in.
    .filter(section => section.head !== null && isUserSend(section.head))
    .map(section => ({
      key: section.key,
      text: sendText(section.head!),
      images: imagesIn(section.head!),
      message: section.head!,
      loaded: true,
    }));

  // Nothing loaded yet: the index is all there is to draw.
  if (loaded.length === 0) {
    return sessionSends.map(notLoaded);
  }

  /*
    Where the loaded run begins inside the index: the first loaded send the index
    knows. The loaded run can open with sends the index has no entry for (one it
    was read before), so looking up only its very first send would miss and throw
    the whole index away, leaving a rail that grows by one tick per page
    scrolled (#657).

    No send found at all means the index is stale against the transcript — a
    rewind or an edit rebuilt the chain under it. Showing the loaded half alone
    is the honest answer there: it is the half we can still vouch for, and the
    query refetches on its own.
  */
  const indexed = new Set(sessionSends.map(send => send.uuid));
  const anchor = loaded.find(entry => indexed.has(entry.key));
  if (!anchor) return loaded;
  const boundary = sessionSends.findIndex(send => send.uuid === anchor.key);

  const older = sessionSends.slice(0, boundary).map(notLoaded);

  // What the index holds before the anchor comes first, minus anything the transcript already has.
  const loadedKeys = new Set(loaded.map(entry => entry.key));
  const entries = older.filter(entry => !loadedKeys.has(entry.key));

  /*
    The loaded run is not always one stretch: after a jump back it holds the pages around the send jumped to and
    the newest ones, with a gap between. The sends of the index that stand in a gap are put back, in front of the
    loaded send that follows them, or the rail loses their ticks and a tick leads to another send (#747). Nothing
    the index holds after the last loaded send it knows is added: the newest pages are always loaded, so what the
    index has beyond them is not in this transcript.
  */
  const position = new Map(sessionSends.map((send, at) => [send.uuid, at]));
  let next = boundary;
  for (const entry of loaded) {
    const at = position.get(entry.key);
    if (at !== undefined) {
      for (const send of sessionSends.slice(next, at)) {
        if (!loadedKeys.has(send.uuid)) entries.push(notLoaded(send));
      }
      next = Math.max(next, at + 1);
    }
    entries.push(entry);
  }
  return entries;
}

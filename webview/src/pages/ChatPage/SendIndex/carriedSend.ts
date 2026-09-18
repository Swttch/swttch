import type { SessionSend } from '@/shared';
import type { SendSection } from '../groupIntoSendSections';

/**
 * The send that the transcript's opening run of entries is answering, when that
 * send sits further back than the loaded page reaches.
 *
 * Null whenever the transcript begins with a send of its own, which is the
 * ordinary case — there is nothing to carry in, because the real bubble is
 * right there.
 *
 * A headless first section is what this exists for: a page boundary landing
 * mid-reply, or a session resumed from a compact summary. Only the first
 * section can be headless (see groupIntoSendSections), so only it is checked.
 */
export function carriedSend(
  sections: SendSection[],
  sessionSends: SessionSend[],
): SessionSend | null {
  if (sections.length === 0 || sections[0].head !== null) return null;

  const firstLoaded = sections.find(section => section.head !== null);

  // Not one send is loaded, so the whole page is reply to the last send in the
  // session. This is a short page deep inside a long turn.
  if (!firstLoaded) return sessionSends[sessionSends.length - 1] ?? null;

  const at = sessionSends.findIndex(send => send.uuid === firstLoaded.key);

  // `at === 0` means the loaded run starts at the session's first send, so the
  // entries above it are not answering anything the index knows about — a
  // compact summary, most often. `at === -1` means the index is stale against a
  // rebuilt chain. Neither has a send to carry, and inventing one would put
  // somebody else's words above the reply.
  return at > 0 ? sessionSends[at - 1] : null;
}

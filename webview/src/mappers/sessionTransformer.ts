import { parseUserContent } from '../pages/ChatPage/message-renderers/utils/parseUserContent';
import { dropSessionMentions } from '../pages/ChatPage/ChatInput/sessionMentionTag';

/**
 * What {@link toTitle} answers when the session has no first prompt to be named
 * after, or when that prompt parsed away to nothing.
 *
 * Exported because a caller with a better fallback than a placeholder needs to
 * recognise the placeholder to know it should use one. Comparing against a
 * copied literal would silently stop matching the day this string changes.
 */
export const NO_TITLE = 'No title';

/**
 * A stored first prompt turned into the label a conversation goes by.
 *
 * System-prompt tags off, session mentions off, cut at 50 characters. Every
 * surface that names a conversation runs through here — the IDE tab, the
 * dropdown toggle, the dropdown rows, the `@@` panel — so they cannot disagree
 * about what a session is called.
 */
export const toTitle = (v?: string): string => {
  if (!v) return NO_TITLE;
  const { text } = parseUserContent(v);
  // A session mention comes off before the cut, not after it. The tag runs to
  // about a hundred characters of id, name and path, so a conversation that
  // opened by addressing another one had all fifty of its title spent inside
  // the markup: the tab, the dropdown toggle and every dropdown row read
  // `<session-mention session-id="458fa4b4-a049-48…`.
  //
  // The label goes with it. A title says what the conversation is about, and who
  // the opening message was sent to is routing rather than subject.
  return dropSessionMentions(text).substring(0, 50) || NO_TITLE;
}

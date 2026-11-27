export interface CrossSessionMessage {
  from: string;
  name: string;
  body: string;
}

const WRAPPED = /^\s*<cross-session-message\b([^>]*)>([\s\S]*?)<\/cross-session-message>\s*$/;

/**
 * A message the session-management MCP (`@swttch/session-manager-mcp`) delivered: plain text whose first line
 * names the sender, `From <title> (session <id>):`. It cannot use the CLI's own tag, which the CLI drops when
 * it is typed in, so this first line is the contract between that server and the screens that draw its messages.
 */
const LABELLED = /^\s*From ([^\n]*?) \(session ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\):\n([\s\S]*)$/i;

function parseLabelled(text: string): CrossSessionMessage | undefined {
  const match = LABELLED.exec(text);
  return match ? { from: match[2], name: match[1].trim(), body: match[3].trim() } : undefined;
}

/** The sender and text of a user entry that is a message from another session, or undefined when it is anything else. */
export function parseCrossSessionMessage(text: string): CrossSessionMessage | undefined {
  // The CLI puts its own status note (a system reminder) ahead of the message; it is not the sender's.
  const typed = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  const match = WRAPPED.exec(typed);
  if (!match) return parseLabelled(typed);
  const attribute = (key: string) => new RegExp(`\\b${key}="([^"]*)"`).exec(match[1])?.[1] ?? '';
  return { from: attribute('from'), name: attribute('name'), body: match[2].trim() };
}

const PREVIEW_WRAPPED = /^\s*<cross-session-message\b([^>]*)>([\s\S]*?)(?:<\/cross-session-message>)?\s*$/;

/**
 * The same, for the cut copy the session index keeps of a send (the rail's card, the carried header): the
 * closing tag may have been cut off with the rest of the text.
 */
export function parseCrossSessionPreview(text: string): CrossSessionMessage | undefined {
  const match = PREVIEW_WRAPPED.exec(text);
  if (!match) return parseLabelled(text);
  const attribute = (key: string) => new RegExp(`\\b${key}="([^"]*)"`).exec(match[1])?.[1] ?? '';
  return { from: attribute('from'), name: attribute('name'), body: match[2].trim() };
}

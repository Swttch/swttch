/** How the CLI begins its answer to `/rename`; the answer is English whatever the UI language. */
const SESSION_RENAMED_REPLY_PREFIX = 'Session renamed to:';

/**
 * The new name, when `event` is the CLI's answer to a `/rename`.
 *
 * That answer is the one thing that only a rename produces. The CLI also
 * announces a session's name every time its process starts (`--resume`
 * included), with the name unchanged, so the announcement cannot tell a rename
 * from a reopen and reacting to it would let a reopen discard a name typed in
 * the GUI. The answer is also what a terminal user reads, which makes it a
 * steadier thing to depend on than the announcement.
 *
 * @returns The name, or null when `event` is anything else.
 */
export function renamedSessionTitle(event: Record<string, unknown>): string | null {
  if (event.type !== 'assistant') return null;
  const message = event.message as { content?: unknown } | undefined;
  if (!message || !Array.isArray(message.content)) return null;

  for (const block of message.content as Array<{ type?: unknown; text?: unknown }>) {
    if (block?.type !== 'text' || typeof block.text !== 'string') continue;
    if (!block.text.startsWith(SESSION_RENAMED_REPLY_PREFIX)) continue;
    const title = block.text.slice(SESSION_RENAMED_REPLY_PREFIX.length).trim();
    return title || null;
  }
  return null;
}

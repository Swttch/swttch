import { LoadedMessageDto, getTextContent } from '../../types';
import { LoadedMessageType } from '../../dto/common';

/**
 * Drop the `user` entries the CLI writes for Claude's benefit and marks `isMeta`, which the terminal and Claude
 * Desktop never draw (#593). They carry no `sourceToolUseID`, so `mergeToolResults` does not fold them away.
 *
 * - The note under a picture the user attached (`[Image: source: …, original 3024x1824, displayed at …]`), which
 *   tells Claude how to map coordinates on a scaled picture.
 * - What a slash command expands to (`` `/slides` was invoked: … ``), which follows the entry that holds the
 *   `<command-name>` the user typed. The user's own line stays; the expansion is the prompt behind it.
 *
 * Other `isMeta` entries stay: another session's message and the notices about one are drawn on purpose, and a
 * prompt a schedule or a hook injects is something the user wants to see.
 */
export function hideCliNotes(messages: LoadedMessageDto[]): LoadedMessageDto[] {
  const commandEntries = new Set<string>();
  for (const message of messages) {
    if (message.type === LoadedMessageType.User && message.uuid && getTextContent(message).includes('<command-name>')) {
      commandEntries.add(message.uuid);
    }
  }
  return messages.filter((message) => {
    if (message.type !== LoadedMessageType.User || message.isMeta !== true || message.sourceToolUseID) return true;
    if (getTextContent(message).trimStart().startsWith('[Image: ')) return false;
    if (message.parentUuid && commandEntries.has(message.parentUuid)) return false;
    return true;
  });
}

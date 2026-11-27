import { LoadedMessageDto, getTextContent } from '../../types';
import { LoadedMessageType } from '../../dto/common';

/**
 * How the requests the CLI writes to Claude begin, when an answer was cut off, came out empty or could not be used
 * (its own words, as of 2.1.332). Needed for the live stream, which carries no `turnCompanion` to tell them by.
 */
const CLI_REQUEST_OPENINGS = [
  'Your response above was cut off mid-stream',
  'Your response above was stopped by a safety classifier',
  'Your response was cut off because it exceeded the output token limit',
  'Output token limit hit',
  '[Your previous response reached the output limit',
  '[Your previous response had no visible output',
  'The previous response failed to produce a valid tool call',
  'Your tool call was malformed and could not be parsed',
  'The turn did not end: a tool call in your last message',
  'The PermissionDenied hook indicated you may retry',
];

/**
 * A note the CLI slips in beside a turn for the model ("Your previous response had no visible output..."). It is in the
 * record as a user entry, marked `isMeta` and `turnCompanion`, but nobody sent it.
 */
export function isCompanionNote(message: LoadedMessageDto): boolean {
  return message.isMeta === true && message.turnCompanion === true;
}

/**
 * Drop the `user` entries the CLI writes for Claude's benefit and marks `isMeta`, which the terminal and Claude
 * Desktop never draw (#593). They carry no `sourceToolUseID`, so `mergeToolResults` does not fold them away.
 *
 * - The note under a picture the user attached (`[Image: source: …, original 3024x1824, displayed at …]`), which
 *   tells Claude how to map coordinates on a scaled picture.
 * - What a slash command expands to (`` `/slides` was invoked: … ``), which follows the entry that holds the
 *   `<command-name>` the user typed. The user's own line stays; the expansion is the prompt behind it.
 * - The CLI's own requests to Claude, such as the one to resume an answer that was cut off (#735).
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
    if (message.type !== LoadedMessageType.User || message.sourceToolUseID) return true;
    // The saved session marks such a note `isMeta`; the same note on the live stream has no `isMeta`
    // and arrives as `isSynthetic`, so a note still drawn while it streams would vanish on a reload.
    const isCliEntry = message.isMeta === true || message.isSynthetic === true;
    if (!isCliEntry) return true;
    // An entry that says where it came from is somebody's message, whatever else it is marked with.
    if (isCompanionNote(message) && !message.origin) return false;
    const text = getTextContent(message).trimStart();
    if (text.startsWith('[Image: ')) return false;
    if (CLI_REQUEST_OPENINGS.some((opening) => text.startsWith(opening))) return false;
    if (message.isMeta !== true) return true;
    if (message.parentUuid && commandEntries.has(message.parentUuid)) return false;
    return true;
  });
}

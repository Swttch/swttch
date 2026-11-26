import type { LoadedMessageDto } from '../../types';
import { LoadedMessageType } from '../../dto/common';
import { ContentBlockType } from '../../dto/message/ContentBlockDto';
import { isContentBlockArray } from '../../types';
import type { WindowEntry, WindowGap } from '../../utils/transcriptWindow';
import { gapIndex } from '../../utils/transcriptWindow';

function isToolResultOnly(message: LoadedMessageDto): boolean {
  const content = message.message?.content;
  return (
    message.type === LoadedMessageType.User &&
    isContentBlockArray(content) &&
    content.length > 0 &&
    content.every((block) => block.type === ContentBlockType.ToolResult)
  );
}

/**
 * Leave out, for as long as their calls are on their way, the tool results a stretch of the transcript opens with.
 *
 * A page can begin between a call and its result. `mergeToolResults` leaves such a result as a row of its own, so
 * that no output is lost, and it was then drawn as raw text above the oldest message, until the older page arrived,
 * the result was folded into its call and everything below moved up (#747). While there is an older page (or the gap
 * before the newest pages is open) the call is still to come, and the result appears with it. With nothing more to
 * come it stays as it was.
 *
 * `merged` is what is drawn and `held` the raw entries it was made from, which is where the gap is named.
 */
export function withoutSplitResults(
  merged: LoadedMessageDto[],
  held: readonly WindowEntry[],
  gap: WindowGap | null,
  hasOlder: boolean,
): LoadedMessageDto[] {
  const at = gapIndex(held, gap);
  const afterGap = new Set(at > 0 ? held.slice(at).map((entry) => entry.uuid) : []);
  // Whether the rows being passed are still the ones a stretch opens with.
  let opening = hasOlder;
  let pastGap = false;
  const shown = merged.filter((message) => {
    if (!pastGap && message.uuid !== undefined && afterGap.has(message.uuid)) {
      pastGap = true;
      opening = true;
    }
    if (!opening) return true;
    if (isToolResultOnly(message)) return false;
    // What is said ends the opening. Entries that are not part of the conversation do not.
    if (message.type === LoadedMessageType.User || message.type === LoadedMessageType.Assistant) opening = false;
    return true;
  });
  return shown.length === merged.length ? merged : shown;
}

import type { LoadedMessageDto } from '../../../types';
import { isContentBlockArray } from '../../../types';
import { ContentBlockType } from '../../../dto/message/ContentBlockDto';
import { WRAP_UP_TOOL } from '../message-renderers/ToolRenderers/Mcp/CcdTurn';

/**
 * Whether the turn has already started its closing message: some text after the `wrap_up` call.
 *
 * The model calls `wrap_up` with a recap just ahead of its closing message, which says the same thing in
 * its own words. Until that message has begun, the recap stands in for it, drawn as reply text; once any
 * of it is there, the real message is what the reader gets and the recap is not drawn at all.
 */
export function hasTextAfterWrapUp(body: LoadedMessageDto[]): boolean {
  let seen = false;
  for (const message of body) {
    const content = message.message?.content;
    if (message.type !== 'assistant' || !isContentBlockArray(content)) continue;
    for (const block of content) {
      if (block.type === ContentBlockType.ToolUse && block.name === WRAP_UP_TOOL) {
        seen = true;
      } else if (seen && block.type === ContentBlockType.Text && block.text.trim() !== '') {
        return true;
      }
    }
  }
  return false;
}

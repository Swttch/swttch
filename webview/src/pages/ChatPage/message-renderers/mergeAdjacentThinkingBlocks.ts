import {
  AnyContentBlockDto,
  ContentBlockType,
  ThinkingBlockDto,
} from '../../../dto/message/ContentBlockDto';

/**
 * Join two thinking blocks that one response split apart.
 *
 * The API can send a single stretch of thinking as two blocks: the first
 * carries only a signature and no text, and the second follows a few
 * milliseconds later with the summary text. Drawn separately they read as two
 * thoughts, "Thought for 5s" with nothing inside and "Thought for 0s" holding
 * the text (#496).
 *
 * Text is joined with a blank line when both sides have some. Durations add up
 * once both are stamped; while either is still open the merged block has none,
 * so it keeps reading as "still thinking". The latest live token estimate wins.
 */
export function joinThinkingBlocks(a: ThinkingBlockDto, b: ThinkingBlockDto): ThinkingBlockDto {
  const thinking = a.thinking && b.thinking
    ? `${a.thinking}\n\n${b.thinking}`
    : a.thinking || b.thinking;
  const durationMillis = a.durationMillis !== undefined && b.durationMillis !== undefined
    ? a.durationMillis + b.durationMillis
    : undefined;
  return {
    ...a,
    ...b,
    thinking,
    durationMillis,
    estimatedTokens: b.estimatedTokens ?? a.estimatedTokens,
  } as ThinkingBlockDto;
}

/**
 * Merge consecutive thinking blocks inside one message.
 *
 * Every block in a single assistant message belongs to one API response (a new
 * `message.id` seals the entry, see useChatStream), so adjacent thinking
 * blocks here are always one response's split. Thinking blocks separated by
 * text or a tool call stay apart.
 */
export function mergeAdjacentThinkingBlocks(
  blocks: AnyContentBlockDto[],
): AnyContentBlockDto[] {
  const result: AnyContentBlockDto[] = [];
  for (const block of blocks) {
    const prev = result[result.length - 1] as AnyContentBlockDto | undefined;
    if (
      block.type === ContentBlockType.Thinking &&
      prev !== undefined &&
      prev.type === ContentBlockType.Thinking
    ) {
      result[result.length - 1] = joinThinkingBlocks(prev as ThinkingBlockDto, block as ThinkingBlockDto);
    } else {
      result.push(block);
    }
  }
  return result;
}

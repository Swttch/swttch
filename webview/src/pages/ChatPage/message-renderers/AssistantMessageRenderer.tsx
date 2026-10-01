import React from 'react';
import { LoadedMessageDto, isContentBlockArray, isAuthErrorMessage, isLimitErrorMessage } from '../../../types';
import { ToolUseBlockDto, ThinkingBlockDto, ContentBlockType } from '../../../dto/message/ContentBlockDto';
import { StreamingMessage } from '../StreamingMessage';
import { ToolRenderer } from './ToolRenderer';
import { AuthErrorRenderer } from './AuthErrorRenderer';
import { LimitReachedRenderer } from './LimitReachedRenderer';
import { mergeAdjacentTextBlocks } from './mergeAdjacentTextBlocks';
import { mergeAdjacentThinkingBlocks } from './mergeAdjacentThinkingBlocks';
import {ThinkingStreamingMessage} from "@/pages/ChatPage/ThinkingStreamingMessage.tsx";
import { parseContextUsage } from '@/utils/parseContextUsage';
import { ContextUsageCard } from './components/ContextUsageCard';
import { MessageFooter } from './components/MessageFooter';
import { useLastEntryUuid } from '../LastEntryContext';

interface AssistantMessageRendererProps {
  message: LoadedMessageDto;
  onRetry?: (messageId: string) => void;
}

export const AssistantMessageRenderer: React.FC<AssistantMessageRendererProps> = ({
  message,
}) => {
  const content = message.message?.content;
  const isLastEntry = useLastEntryUuid() === message.uuid;
  // Merge adjacent text blocks so a single logical block streamed as multiple
  // text blocks renders as one markdown document (issue #155). Non-text blocks
  // (tool_use/thinking) stay as boundaries, preserving legitimate splits.
  // Adjacent thinking blocks are one response's split stretch of thinking (#496).
  const blocks = mergeAdjacentThinkingBlocks(
    mergeAdjacentTextBlocks(isContentBlockArray(content) ? content : []),
  );
  const hasContent = blocks.length > 0 || typeof content === 'string';

  // Skip rendering if message has no meaningful content (e.g. interrupted empty responses)
  if (!message.isStreaming) {
    const isEmpty = typeof content === 'string'
      ? content.trim() === ''
      : blocks.every(block => {
          if (block.type === ContentBlockType.Text) return block.text.trim() === '';
          if (block.type === ContentBlockType.Thinking) return !(block as ThinkingBlockDto).thinking;
          return false;
        });
    if (isEmpty) return null;
  }

  // Auth-failure entry gets its own one-line renderer (error text + inline login CTA).
  if (!message.isStreaming && isAuthErrorMessage(message)) {
    return <AuthErrorRenderer message={message} />;
  }

  // Usage-limit notice gets its own renderer with the auto-resume action inline
  // to the right of the text (spec: button next to the message, not a banner).
  if (!message.isStreaming && isLimitErrorMessage(message)) {
    return <LimitReachedRenderer message={message} />;
  }

  /*
    Copy and the send time under each stretch of reply text.

    Fork is left out. Forking from a user send branches off before it, carrying
    its prompt; a reply has no prompt to carry, and branching after it is not
    something the backend offers yet.

    Nothing while the text is still streaming: it would copy half a reply, and
    the time on a streaming entry is the webview's own clock until the CLI's
    recorded entry replaces it.

    Always shown, hover or not, on the text the chat ends on: the last block
    of the last entry. Text followed by a tool card in the same entry is not
    where the chat ends, so it waits for a hover like the rest.
  */
  const replyFooter = (text: string, isLastBlock: boolean) =>
      message.isStreaming ? undefined : <MessageFooter className="relative -left-4" copyText={text} timestamp={message.timestamp} alwaysDisplay={isLastEntry && isLastBlock} />;

  return (
      <>
        {hasContent ? (
            <>
              {typeof content === 'string' ? (
                  <StreamingMessage
                      content={content}
                      isStreaming={message.isStreaming ?? false}
                      className="text-text-primary text-[1rem] leading-relaxed"
                      message={message}
                      footer={replyFooter(content, true)}
                  />
              ) : (
                  blocks.map((block, index) => {
                    if (block.type === ContentBlockType.Thinking) {
                      const thinkingBlock = block as ThinkingBlockDto;
                      return (
                          <ThinkingStreamingMessage
                              key={`${message.uuid}-thinking-${index}`}
                              thinking={thinkingBlock.thinking}
                              isStreaming={message.isStreaming ?? false}
                              estimatedTokens={thinkingBlock.estimatedTokens}
                              durationMillis={thinkingBlock.durationMillis}
                              className="text-text-primary text-[1rem] leading-relaxed"
                              message={message}
                          />
                      );
                    }
                    if (block.type === ContentBlockType.Text) {
                      // `/context` reports arrive as markdown; once fully streamed,
                      // render them as the native TUI usage grid. Streaming/partial
                      // text or non-context markdown falls back to plain markdown.
                      const contextUsage = message.isStreaming
                          ? null
                          : parseContextUsage(block.text);
                      if (contextUsage) {
                        return (
                            <ContextUsageCard
                                key={`${message.uuid}-context-${index}`}
                                data={contextUsage}
                                rawMarkdown={block.text}
                            />
                        );
                      }
                      return (
                          <StreamingMessage
                              key={`${message.uuid}-text-${index}`}
                              content={block.text}
                              isStreaming={message.isStreaming ?? false}
                              className="text-text-primary text-[1rem] leading-relaxed"
                              message={message}
                              footer={replyFooter(block.text, index === blocks.length - 1)}
                          />
                      );
                    }
                    if (block.type === ContentBlockType.ToolUse) {
                      return (
                          <ToolRenderer
                              key={(block as ToolUseBlockDto).id}
                              toolUse={block as ToolUseBlockDto}
                              message={message}
                          />
                      );
                    }
                    return null;
                  })
              )}
            </>
        ) : null}

        {/*{message.context && <ContextPills context={message.context} />}*/}
      </>
  );
};

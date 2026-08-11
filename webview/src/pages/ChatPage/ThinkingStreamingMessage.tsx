import React, {useEffect, useState} from 'react';
import {Streamdown} from 'streamdown';
import {math} from '../../utils/mathPlugin';
import {code} from '../../utils/codePlugin';
import {isInsideCodeBlock, isMarkdownComplete} from '../../utils/markdownParser';
import './streaming.css';
import {ToolWrapper} from "@/pages/ChatPage/message-renderers/ToolRenderers/common";
import {useChatStreamContext} from '../../contexts/ChatStreamContext';
import {formatThinkingTokens} from '../../utils/formatThinkingTokens';
import {useTranslation} from '@/i18n';
import {useAnimatedThinkingTokens} from '../../hooks/useAnimatedThinkingTokens';
import {useWorkingDirOrNull} from '@/contexts/WorkingDirContext';
import {MARKDOWN_COMPONENTS} from '@/pages/ChatPage/message-renderers/components/MarkdownFileLink';
import {prepareAssistantMarkdown} from '@/pages/ChatPage/message-renderers/utils/markdownFileLink';

interface ThinkingStreamingMessageProps {
    thinking: string;
    isStreaming: boolean;
    /** Live cumulative thinking-token estimate (shown only while actively thinking). */
    estimatedTokens?: number;
    /** Wall-clock duration (ms); its presence means the block is done thinking. */
    durationMillis?: number;
    className?: string;
    message?: import('../../types').LoadedMessageDto;
}

export const ThinkingStreamingMessage: React.FC<ThinkingStreamingMessageProps> = ({
    thinking,
    isStreaming,
    estimatedTokens,
    durationMillis,
    className = '',
    message,
}) => {
    const { t } = useTranslation('chat');
    const [shouldAnimate, setShouldAnimate] = useState(isStreaming);
    const { isThinkingExpanded, toggleThinkingExpanded } = useChatStreamContext();
    // Null-safe: reasoning blocks may render without a WorkingDirProvider. Used to
    // resolve relative file-link URLs; absolute links work regardless.
    const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? null;

    // The block is "still thinking" until its duration is stamped at content_block_stop.
    const isThinking = durationMillis === undefined && isStreaming;
    const label = durationMillis !== undefined
        ? t('thinking.thoughtFor', { seconds: Math.round(durationMillis / 1000) })
        : isThinking
            ? t('thinking.thinkingEllipsis')
            : t('thinking.thinking');
    // Live token count is only meaningful while actively thinking. The CLI emits
    // the estimate in coarse steps; animate it toward each target so the count
    // scrolls smoothly (matching the Claude Code extension) instead of jumping.
    const animatedTokens = useAnimatedThinkingTokens(isThinking ? estimatedTokens : undefined);
    const tokenText = formatThinkingTokens(animatedTokens);

    // Handle streaming animation
    useEffect(() => {
        if (isStreaming) {
            setShouldAnimate(true);
        } else {
            // Keep animation for a short period after streaming ends
            const timer = setTimeout(() => setShouldAnimate(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isStreaming]);

    // Determine if we should show incomplete indicator
    const showIncompleteIndicator = isStreaming && !isMarkdownComplete(thinking) && isInsideCodeBlock(thinking);

    return (
        <ToolWrapper message={message} className="!mt-0">
            <div className={`text-text-primary/40 streaming-message ${className}`}>
                <div>
                    <div className="mb-0.5 cursor-pointer" onClick={toggleThinkingExpanded}>
                        <div className="italic text-text-primary/50 flex items-center gap-1">
                            {label}
                            {tokenText && (
                                <span className="not-italic tabular-nums opacity-80">· {tokenText}</span>
                            )}
                        </div>
                    </div>

                    <div
                        className={`${isThinkingExpanded ? "" : "hidden"} thinking-message markdown-content ${shouldAnimate ? 'streaming-animate' : ''}`}>
                        <Streamdown
                            className="space-y-0"
                            mode={isStreaming ? 'streaming' : 'static'}
                            parseIncompleteMarkdown={isStreaming}
                            isAnimating={isStreaming}
                            components={MARKDOWN_COMPONENTS}
                            controls={{
                                code: true,
                                table: true,
                            }}
                            plugins={{ math, code }}
                        >
                            {prepareAssistantMarkdown(thinking, workingDirectory)}
                        </Streamdown>
                    </div>
                </div>

                {showIncompleteIndicator && (
                    <div className="incomplete-indicator">
                        <span className="cursor-blink">▋</span>
                    </div>
                )}

            </div>
        </ToolWrapper>
    );
};

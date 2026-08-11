import React, {useEffect, useState} from 'react';
import {Streamdown} from 'streamdown';
import {math} from '../../utils/mathPlugin';
import {code} from '../../utils/codePlugin';
import {isInsideCodeBlock, isMarkdownComplete} from '../../utils/markdownParser';
import './streaming.css';
import {ToolWrapper} from "@/pages/ChatPage/message-renderers/ToolRenderers/common";
import {useWorkingDirOrNull} from '@/contexts/WorkingDirContext';
import {MARKDOWN_COMPONENTS} from '@/pages/ChatPage/message-renderers/components/MarkdownFileLink';
import {prepareAssistantMarkdown} from '@/pages/ChatPage/message-renderers/utils/markdownFileLink';

interface StreamingMessageProps {
    content: string;
    isStreaming: boolean;
    className?: string;
    message?: import('../../types').LoadedMessageDto;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
    content,
    isStreaming,
    className = '',
    message,
}) => {
    const [shouldAnimate, setShouldAnimate] = useState(isStreaming);

    // useWorkingDirOrNull (not useWorkingDir): StreamingMessage is broadly reused
    // and rendered without a WorkingDirProvider in some places (and in tests),
    // where useWorkingDir throws. Used to resolve relative link URLs to absolute
    // project paths; absolute links work regardless.
    const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? null;

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
    const showIncompleteIndicator = isStreaming && !isMarkdownComplete(content) && isInsideCodeBlock(content);

    return (
        <ToolWrapper message={message} className="!mt-0">
            <div className={`streaming-message ${className}`}>
                <div className={`markdown-content ${shouldAnimate ? 'streaming-animate' : ''}`}>
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
                        {prepareAssistantMarkdown(content, workingDirectory)}
                    </Streamdown>
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

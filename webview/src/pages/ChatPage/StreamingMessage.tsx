import React, {useEffect, useRef, useState} from 'react';
import {Streamdown} from 'streamdown';
import {math} from '../../utils/mathPlugin';
import {code} from '../../utils/codePlugin';
import './streaming.css';
import {ToolWrapper} from "@/pages/ChatPage/message-renderers/ToolRenderers/common";
import {useWorkingDirOrNull} from '@/contexts/WorkingDirContext';
import {MARKDOWN_COMPONENTS} from '@/pages/ChatPage/message-renderers/components/MarkdownFileLink';
import {prepareAssistantMarkdown} from '@/pages/ChatPage/message-renderers/utils/markdownFileLink';
import {CodeBlockWrapControls} from '@/pages/ChatPage/message-renderers/components/CodeBlockWrapControls';

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
    const markdownRef = useRef<HTMLDivElement>(null);

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

    return (
        <ToolWrapper message={message} className="!mt-0">
            <div className={`streaming-message ${className}`}>
                <div ref={markdownRef} className={`markdown-content ${shouldAnimate ? 'streaming-animate' : ''}`}>
                    <Streamdown
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
                    <CodeBlockWrapControls containerRef={markdownRef} content={content} />
                </div>
            </div>
        </ToolWrapper>
    );
};

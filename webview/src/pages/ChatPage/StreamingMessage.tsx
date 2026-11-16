import React, {useEffect, useRef, useState} from 'react';
import {Streamdown, defaultRehypePlugins} from 'streamdown';
import {rehypeStreamFade} from '../../utils/streamFadePlugin';
import {math} from '../../utils/mathPlugin';
import {code} from '../../utils/codePlugin';
import {mermaid, MERMAID_CONTROLS, useMermaidOptions} from '../../utils/mermaidPlugin';
import './streaming.css';
import {ToolWrapper} from "@/pages/ChatPage/message-renderers/ToolRenderers/common";
import {useWorkingDirOrNull} from '@/contexts/WorkingDirContext';
import {MARKDOWN_COMPONENTS} from '@/pages/ChatPage/message-renderers/components/MarkdownFileLink';
import {prepareAssistantMarkdown} from '@/pages/ChatPage/message-renderers/utils/markdownFileLink';
import {CodeBlockWrapControls} from '@/pages/ChatPage/message-renderers/components/CodeBlockWrapControls';

/** The plugins Streamdown applies by default, then the word wrapper last so sanitizing cannot strip its class. */
const STREAMING_REHYPE_PLUGINS = [...Object.values(defaultRehypePlugins), rehypeStreamFade];

/**
 * A reply whose first draw is already finished arrives "all at once" (the CLI wrote it whole, or a streamed
 * reply was only seen when done). It slides up when that happens just now. Replies loaded from history carry
 * an old time and are drawn still.
 */
const FRESH_REPLY_WINDOW_MS = 3000;
const isFreshReply = (timestamp: string | undefined): boolean => {
    if (!timestamp) return false;
    const sentAt = Date.parse(timestamp);
    return Number.isFinite(sentAt) && Math.abs(Date.now() - sentAt) < FRESH_REPLY_WINDOW_MS;
};

interface StreamingMessageProps {
    content: string;
    isStreaming: boolean;
    /**
     * Fade in the words that arrive, though `isStreaming` is off: the text still grows because the turn goes on
     * (the last block of a reply whose earlier block was already finished). `isStreaming` on its own implies this.
     */
    fadeWords?: boolean;
    className?: string;
    message?: import('../../types').LoadedMessageDto;
    /**
     * Drawn under the text, inside the same column, for a caller that hangs a
     * line of its own there (the assistant reply's `MessageFooter`). Giving one
     * also tightens the wrapper's bottom padding, so the line takes the room
     * the padding used to.
     */
    footer?: React.ReactNode;
    /**
     * Draw the text alone, without the status bullet a reply carries in front of it. For text that sits inside a
     * card of its own, where the card says what it is and a bullet would read as a second marker.
     */
    plain?: boolean;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
    content,
    isStreaming,
    fadeWords = false,
    className = '',
    message,
    footer,
    plain = false,
}) => {
    const mermaidOptions = useMermaidOptions();
    const [shouldAnimate, setShouldAnimate] = useState(isStreaming);
    // Decided once, on the first draw: a reply that is not streaming yet already fresh arrives whole.
    const [slidesUp] = useState(() => !isStreaming && !!message && isFreshReply(message.timestamp));
    const markdownRef = useRef<HTMLDivElement>(null);
    const wordsFade = isStreaming || fadeWords;
    // Streaming ending is the finished text coming in as a whole: the markdown is drawn again from scratch, as a card
    // that arrives in one piece, so it slides up like one. Decided while rendering, not in an effect, so that the
    // first frame of the new drawing already has it. (The words' own fade is held back by CSS while it plays.)
    const [wasStreaming, setWasStreaming] = useState(isStreaming);
    const [finalized, setFinalized] = useState(false);
    if (wasStreaming !== isStreaming) {
        setWasStreaming(isStreaming);
        if (wasStreaming && !isStreaming) setFinalized(true);
    }

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

    const text = (
        <div className={`streaming-message ${slidesUp || finalized ? 'reply-slide-up' : ''} ${className}`}>
            <div ref={markdownRef} className={`markdown-content ${shouldAnimate ? 'streaming-animate' : ''} ${wordsFade ? 'streaming-words' : ''}`}>
                <Streamdown
                    mode={isStreaming ? 'streaming' : 'static'}
                    parseIncompleteMarkdown={isStreaming}
                    isAnimating={isStreaming}
                    rehypePlugins={wordsFade ? STREAMING_REHYPE_PLUGINS : undefined}
                    components={MARKDOWN_COMPONENTS}
                    controls={{
                        code: true,
                        table: true,
                        mermaid: MERMAID_CONTROLS,
                    }}
                    plugins={{ math, code, mermaid }}
                    mermaid={mermaidOptions}
                >
                    {prepareAssistantMarkdown(content, workingDirectory)}
                </Streamdown>
                <CodeBlockWrapControls containerRef={markdownRef} content={content} />
            </div>
            {footer}
        </div>
    );

    if (plain) return text;
    return (
        <ToolWrapper message={message} className="!mt-0" groupClassName={footer ? '!pb-0 -mb-2' : undefined}>
            {text}
        </ToolWrapper>
    );
};

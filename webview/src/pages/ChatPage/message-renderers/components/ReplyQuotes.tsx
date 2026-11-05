import React from 'react';
import { QuoteBlock } from '@/components/QuoteBlock';
import type { ReplyCard } from '../utils/replyBlocks';

interface Props {
  replies: readonly ReplyCard[];
  /** Whether text typed in the message box follows, so a gap separates it from the last reply. */
  followedByText: boolean;
}

/**
 * The replies a user message opens with, as in Claude Desktop: the quoted text above, grey beside a thick bar and
 * in full, then the comment written about it. An excerpt, which has no comment, is a card above the bubble instead.
 */
export const ReplyQuotes: React.FC<Props> = ({ replies, followedByText }) => (
  <div className={`space-y-3 ${followedByText ? 'mb-3' : ''}`}>
    {replies.map((reply, index) => (
      <div key={index} className="space-y-2">
        <QuoteBlock>{reply.quote}</QuoteBlock>
        <div className="text-text-primary/90 text-[1rem] leading-[1.5] whitespace-pre-wrap break-words">{reply.comment}</div>
      </div>
    ))}
  </div>
);

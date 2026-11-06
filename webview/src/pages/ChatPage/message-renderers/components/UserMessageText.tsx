import React from 'react';
import { splitInlineCode } from '../utils/splitInlineCode';
import { splitMessageBlocks } from '../utils/splitMessageBlocks';
import { tokenizeMessagePaths } from '../utils/tokenizeMessagePaths';
import { MessagePathChip } from './MessagePathChip';
import { MessageSessionMentionChip } from './MessageSessionMentionChip';

/** One run of ordinary text: `code` in the inline-code look, a file path as a chip, a session mention as a chip. */
const InlineText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {splitInlineCode(text).map((part, partIdx) =>
      part.code ? (
        // The same look as `code` in a reply; a path inside it stays code, not a chip.
        <code
          key={partIdx}
          className="rounded px-1 py-0.5 font-mono text-[0.875em]"
          style={{ background: 'var(--md-inline-code-bg)', color: 'var(--md-inline-code-fg)' }}
        >
          {part.text}
        </code>
      ) : (
        tokenizeMessagePaths(part.text).map((seg, idx) =>
          seg.mention ? (
            <MessageSessionMentionChip key={`${partIdx}-${idx}`} mention={seg.mention} />
          ) : seg.isPath ? (
            <MessagePathChip key={`${partIdx}-${idx}`} token={seg.text} />
          ) : (
            <React.Fragment key={`${partIdx}-${idx}`}>{seg.text}</React.Fragment>
          ),
        )
      ),
    )}
  </>
);

/**
 * The text of a user message as the bubble draws it: a fenced code block in the code-block look, a `>` quote in
 * the quote look, and the rest as `InlineText`. Everything that shows text a user (or another session) wrote goes
 * through here, so it reads the same wherever it is.
 */
export const UserMessageText: React.FC<{ text: string }> = ({ text }) => {
  const blocks = splitMessageBlocks(text);

  // No block syntax: the text goes in as it always did, with no wrapper around it.
  if (blocks.every((block) => block.kind === 'text')) return <InlineText text={text} />;

  return (
    <>
      {blocks.map((block, idx) => {
        if (block.kind === 'code') {
          return (
            <pre
              key={idx}
              data-testid="user-message-code-block"
              className="my-1 overflow-x-auto rounded-md px-3 py-2 font-mono text-[0.875em] leading-[1.5] whitespace-pre"
              style={{ background: 'var(--md-code-block-bg)' }}
            >
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.kind === 'quote') {
          return (
            <blockquote
              key={idx}
              data-testid="user-message-quote"
              className="my-1 px-3 py-1 whitespace-pre-wrap"
              style={{
                borderLeft: '3px solid var(--ide-accent)',
                background: 'var(--md-blockquote-bg)',
                color: 'var(--ide-text-secondary, #71717a)',
              }}
            >
              <InlineText text={block.text} />
            </blockquote>
          );
        }
        return (
          <div key={idx}>
            <InlineText text={block.text} />
          </div>
        );
      })}
    </>
  );
};

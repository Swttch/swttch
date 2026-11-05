import React from 'react';
import { splitInlineCode } from '../utils/splitInlineCode';
import { tokenizeMessagePaths } from '../utils/tokenizeMessagePaths';
import { MessagePathChip } from './MessagePathChip';
import { MessageSessionMentionChip } from './MessageSessionMentionChip';

/**
 * The text of a user message as the bubble draws it: `code` in the inline-code look, a file path as a chip, a
 * session mention as a chip. Everything that shows text a user (or another session) wrote goes through here, so
 * it reads the same wherever it is.
 */
export const UserMessageText: React.FC<{ text: string }> = ({ text }) => (
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

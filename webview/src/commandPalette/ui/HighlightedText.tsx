import React from 'react';
import { highlightQuery } from '../highlightQuery';
import { typedKeys } from '../typedKeys';
import { highlightInitials, matchInitials } from '../commandInitials';

interface Props {
  text: string;
  query: string;
  /** Also bold the first letters of the words when the query is their initials (issue #666). */
  initials?: boolean;
}

/**
 * Render `text` with the case-insensitive matches of `query` bolded, so the
 * palette highlights why an item matched (issue #167). With an empty/unmatched
 * query the whole string renders as plain text.
 *
 * A query typed with another layout still on ("ㄱㄷ") matches the item by the
 * keys it stands for ("re"), so those are what get bolded when the text does
 * not hold the Hangul itself.
 */
export const HighlightedText: React.FC<Props> = ({ text, query, initials }) => {
  const matchesAsTyped = text.toLowerCase().includes(query.toLowerCase());
  const keys = matchesAsTyped ? query : typedKeys.keysForQuery(query);
  const segments =
    initials && !text.toLowerCase().includes(keys.toLowerCase()) && matchInitials(text, keys)
      ? highlightInitials(text, keys)
      : highlightQuery(text, keys);
  return (
    <>
      {segments.map((seg, i) =>
        seg.matched ? (
          <strong key={i} className="font-semibold">{seg.text}</strong>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ),
      )}
    </>
  );
};

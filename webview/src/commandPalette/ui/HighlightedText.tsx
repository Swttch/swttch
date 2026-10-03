import React from 'react';
import { highlightQuery } from '../highlightQuery';
import { hangulToQwerty } from '../hangulKeys';

interface Props {
  text: string;
  query: string;
}

/**
 * Render `text` with the case-insensitive matches of `query` bolded, so the
 * palette highlights why an item matched (issue #167). With an empty/unmatched
 * query the whole string renders as plain text.
 *
 * A query typed with the Korean layout still on ("ㄱㄷ") matches the item by the
 * keys it stands for ("re"), so those are what get bolded when the text does
 * not hold the Hangul itself.
 */
export const HighlightedText: React.FC<Props> = ({ text, query }) => {
  const matchesAsTyped = text.toLowerCase().includes(query.toLowerCase());
  const segments = highlightQuery(text, matchesAsTyped ? query : hangulToQwerty(query));
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

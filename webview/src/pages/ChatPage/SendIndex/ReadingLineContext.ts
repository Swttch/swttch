import { createContext, useContext } from 'react';

export interface ReadingLineChannel {
  /**
   * A send reports that it has crossed the reading line, or come back below it.
   *
   * Reported by the send itself rather than measured by the rail, because the
   * send already owns a sentinel at exactly the right spot in the transcript.
   * A second observer walking the DOM for the same answer would disagree with
   * this one mid-scroll and while a section is folded.
   *
   * "Crossed" is not the same as "pinned", and the two are deliberately
   * separate observations of the same sentinel against different lines. See
   * READING_LINE_INSET.
   */
  reportPassed: (sectionKey: string, passed: boolean) => void;
}

/**
 * How sends tell the send index where the reader is.
 *
 * Null outside a provider, which is the ordinary case for the message
 * renderers reused on screens that have no rail. A send that reports to
 * nobody simply behaves as it did before the rail existed.
 */
export const ReadingLineContext = createContext<ReadingLineChannel | null>(null);

export function useReadingLineChannel(): ReadingLineChannel | null {
  return useContext(ReadingLineContext);
}

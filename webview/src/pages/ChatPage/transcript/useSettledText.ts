import { useEffect, useState } from 'react';

/**
 * The text as it stands once it has stopped changing for `ms`. The first value is given at once.
 *
 * What a call is for (the `description` the model writes into it) does not arrive whole: it grows a few letters at a
 * time while the call's input is still being written ("Count l", then "Count lines in", then the whole). Drawn as it
 * arrives, each step is a new sentence for the line to cross into, so the line shrinks to the first few letters
 * and grows again. Waiting until the text rests shows it once, whole.
 */
export function useSettledText(text: string, ms = 160): string {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    if (text === settled) return;
    const timer = setTimeout(() => setSettled(text), ms);
    return () => clearTimeout(timer);
  }, [text, settled, ms]);
  // Before there has been any text to settle on (the line has just become live), the text is shown as it is.
  return settled === '' ? text : settled;
}

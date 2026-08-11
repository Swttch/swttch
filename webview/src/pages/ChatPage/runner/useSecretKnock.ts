import { useCallback, useRef } from 'react';

/** Clicks farther apart than this start the count over. */
const KNOCK_WINDOW_MS = 400;
/** Two quick double-clicks. */
const KNOCK_COUNT = 4;

/**
 * The knock that opens the runner game: four quick clicks on Dorongi.
 *
 * A single click would give the easter egg away to anyone who happened to
 * click the mascot, so it takes a deliberate rhythm — roughly two fast
 * double-clicks. Any pause longer than the window restarts the count, so an
 * idle click here and there never adds up to the secret.
 */
export const useSecretKnock = (onKnock: () => void) => {
  const count = useRef(0);
  const last = useRef(0);

  return useCallback(
    (event: { timeStamp: number }) => {
      const now = event.timeStamp;
      count.current = now - last.current < KNOCK_WINDOW_MS ? count.current + 1 : 1;
      last.current = now;

      if (count.current >= KNOCK_COUNT) {
        count.current = 0;
        last.current = 0;
        onKnock();
      }
    },
    [onKnock],
  );
};

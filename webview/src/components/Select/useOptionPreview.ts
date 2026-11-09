import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the pointer stays on an option before its sample starts, so moving across a list is not a burst of sound. */
const START_DELAY_MS = 150;

/**
 * Plays the sample of the option under the pointer, one at a time: a new one stops the one before, and leaving the
 * option (or closing the list) stops it. A sample that cannot be fetched or played is skipped without a word: it is
 * a convenience on a settings screen, not something to interrupt anyone for.
 */
export function useOptionPreview(): { playingUrl: string | null; start: (url: string) => void; stop: () => void } {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    const current = audio.current;
    audio.current = null;
    if (current) {
      current.onended = null;
      current.onerror = null;
      current.pause();
    }
    setPlayingUrl(null);
  }, []);

  const start = useCallback(
    (url: string) => {
      stop();
      timer.current = setTimeout(() => {
        const next = new Audio(url);
        audio.current = next;
        next.onended = () => {
          if (audio.current === next) {
            audio.current = null;
            setPlayingUrl(null);
          }
        };
        next.onerror = () => {
          if (audio.current === next) {
            audio.current = null;
            setPlayingUrl(null);
          }
        };
        setPlayingUrl(url);
        next.play().catch(() => {
          if (audio.current === next) {
            audio.current = null;
            setPlayingUrl(null);
          }
        });
      }, START_DELAY_MS);
    },
    [stop],
  );

  // Whatever is playing ends with the list.
  useEffect(() => stop, [stop]);

  return { playingUrl, start, stop };
}

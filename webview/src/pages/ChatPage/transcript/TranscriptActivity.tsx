import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import type { StreamingActivity } from './streamingActivity';

/**
 * The dots that say the model is working, drawn as the desktop app draws them: four orange dots in two rows of two,
 * of which some are lit at any moment and the lit ones travel around the square.
 */
export function ActivityGlyph() {
  return (
    <span className="grid h-[14px] w-[14px] flex-shrink-0 grid-cols-2 gap-[3px]" aria-hidden="true">
      {[0, 1, 3, 2].map((slot, order) => (
        <span
          key={slot}
          className="h-[5px] w-[5px] rounded-full bg-[#d97757]"
          style={{ order: slot, animation: 'transcript-grid-dot 1.2s ease-in-out infinite', animationDelay: `${order * 0.3}s` }}
        />
      ))}
    </span>
  );
}

/** The seconds the running turn has taken, counted from the moment its message was sent, once a second. */
export function useTurnSeconds(): number {
  const { turnStartedAt } = useChatStreamContext();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return turnStartedAt === null ? 0 : Math.max(0, Math.floor((now - turnStartedAt) / 1000));
}

/** "31s", or "1m 6s" from the sixtieth second on. */
export function useFormatElapsed(): (seconds: number) => string {
  const { t } = useTranslation('chat');
  return (seconds: number) =>
    seconds < 60
      ? t('transcript.streaming.seconds', { seconds })
      : t('transcript.streaming.minutesSeconds', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
}

/** What the live call is doing, in words: its own description, or the desktop app's phrase for the kind of call. */
export function useActivityLabel(): (activity: StreamingActivity) => string {
  const { t } = useTranslation('chat');
  return (activity) => activity.description ?? t(`transcript.streaming.activity.${activity.phrase}`);
}

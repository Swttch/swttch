import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import type { StreamingActivity } from './streamingActivity';
import { WorkingMark, type WorkingActivity } from './WorkingMark';

/**
 * The mark that says the model is working, drawn as the desktop app draws its own: orange dots that travel and
 * breathe while the model thinks, and an amber ring while the work waits on the person. See WorkingMark.
 */
export function ActivityGlyph({ activity = 'think' }: { activity?: WorkingActivity }) {
  return <WorkingMark activity={activity} />;
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

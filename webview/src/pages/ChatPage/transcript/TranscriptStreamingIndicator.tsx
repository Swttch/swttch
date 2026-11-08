import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { StreamingIndicator } from '../StreamingIndicator';

const DOTS = [0, 1, 2];

/**
 * What the Transcript view modes show while the model's turn runs: three dots breathing in turn, and beside them
 * "Thinking", with the seconds counted from the second one on ("3s · Thinking"), as the desktop app draws it.
 *
 * A dropped connection and the CLI's retries have words of their own, which the classic indicator already says
 * ("(7s)", "(retry 3/10)"), so while either is going on it is that indicator that is shown.
 */
export function TranscriptStreamingIndicator({
  countdownSeconds = null,
  apiRetry = null,
}: {
  countdownSeconds?: number | null;
  apiRetry?: { attempt: number; max: number } | null;
}) {
  const { t } = useTranslation('chat');
  const startedAt = useRef(Date.now());
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (countdownSeconds !== null || apiRetry !== null) {
    return <StreamingIndicator countdownSeconds={countdownSeconds} apiRetry={apiRetry} />;
  }

  const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
  return (
    <div className="flex items-center gap-2.5 px-4 py-[17px] text-[0.9375rem] text-[#9c9c9c]" role="status" data-transcript-streaming>
      <span className="flex items-center gap-[3px]" aria-hidden="true">
        {DOTS.map((dot) => (
          <span
            key={dot}
            className="h-[5px] w-[5px] rounded-full bg-[#d97757]"
            style={{ animation: 'transcript-dot 1.1s ease-in-out infinite', animationDelay: `${dot * 0.18}s` }}
          />
        ))}
      </span>
      <span>
        {seconds >= 2 && <>{t('transcript.streaming.seconds', { seconds })} &middot; </>}
        {t('transcript.streaming.thinking')}
      </span>
    </div>
  );
}

import { useTranslation } from '@/i18n';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { StreamingIndicator } from '../StreamingIndicator';
import { ActivityGlyph, useFormatElapsed, useTurnSeconds } from './TranscriptActivity';
import { formatTokenCount } from './streamingActivity';

/**
 * What the Transcript view modes show while the model's turn runs and no call is being waited on (the model is
 * thinking or writing), as the desktop app draws it: the working dots, and beside them the time the turn has taken
 * and the tokens the model has written so far ("55s · 725 tokens"), or just "Thinking" before the first of them
 * is known. While a call is being waited on, the run of calls that holds it says so itself, with the same dots.
 *
 * A dropped connection and the CLI's retries have words of their own, which the classic indicator already says
 * ("(7s)", "(retry 3/10)"), so while either is going on it is that indicator that is shown.
 */
export function TranscriptStreamingIndicator({
  countdownSeconds = null,
  apiRetry = null,
  replyStarted = false,
  afterBubble = false,
}: {
  countdownSeconds?: number | null;
  apiRetry?: { attempt: number; max: number } | null;
  /** The model has begun writing its answer under the line: the line then carries the time as well ("25s · 71 tokens"). */
  replyStarted?: boolean;
  /** The line stands right under a message bubble: the desktop app's is 15px closer to it than under other lines. */
  afterBubble?: boolean;
}) {
  const { t } = useTranslation('chat');
  const seconds = useTurnSeconds();
  const formatElapsed = useFormatElapsed();
  const { turnOutputTokens } = useChatStreamContext();

  if (countdownSeconds !== null || apiRetry !== null) {
    return <StreamingIndicator countdownSeconds={countdownSeconds} apiRetry={apiRetry} />;
  }

  return (
    <div className={`flex items-center gap-2.5 px-4 py-[17px] text-[0.9375rem] text-[var(--tr-muted)]${afterBubble ? ' -mt-[17.4px]' : ''}`} role="status" data-transcript-streaming>
      <ActivityGlyph />
      <span>
        {turnOutputTokens > 0 ? (
          // Measured on the desktop app: the tokens alone while the model thinks, and once it writes its answer the time
          // first, then the tokens ("25초 · 71 토큰").
          <>
            {replyStarted && <span className="me-1.5">{formatElapsed(seconds)} ·</span>}
            <span className="transcript-shimmer">{t('transcript.streaming.tokens', { count: formatTokenCount(turnOutputTokens) })}</span>
          </>
        ) : (
          <>
            <span className="transcript-shimmer">{t('transcript.streaming.thinking')}</span>
            {seconds >= 2 && <span className="ms-2">{formatElapsed(seconds)}</span>}
          </>
        )}
      </span>
    </div>
  );
}

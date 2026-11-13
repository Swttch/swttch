import { useTranslation } from '@/i18n';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { ActivityGlyph } from './TranscriptActivity';
import { formatTokenCount, type StreamingActivity } from './streamingActivity';

/**
 * The working line under the messages written while a permission card waited, after the card was allowed and the
 * command it held is running: the tokens the model has written so far ("36 토큰"), as the desktop app's line says
 * straight after the click. What the call is for stays on the call's own line above, which is the line that remains
 * when the call is done (the desktop app draws that description a second time here for a moment; that is not copied).
 */
export function TranscriptHeldWorking({ activity }: { activity: StreamingActivity }) {
  const { t } = useTranslation('chat');
  const { turnOutputTokens } = useChatStreamContext();
  return (
    <div className="flex items-center gap-2.5 px-4 py-[17px] text-[0.9375rem] text-[var(--tr-muted)]" role="status" data-transcript-held-working>
      <ActivityGlyph activity={activity.mark} />
      <span className="min-w-0 truncate transcript-shimmer">
        {turnOutputTokens > 0 ? t('transcript.streaming.tokens', { count: formatTokenCount(turnOutputTokens) }) : t('transcript.streaming.thinking')}
      </span>
    </div>
  );
}

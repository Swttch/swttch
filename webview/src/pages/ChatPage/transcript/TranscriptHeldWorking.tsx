import { useTranslation } from '@/i18n';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { ActivityGlyph, useActivityLabel } from './TranscriptActivity';
import { formatTokenCount, type StreamingActivity } from './streamingActivity';

/**
 * The working line under the messages written while a permission card waited, after the card was allowed and the
 * command it held is running, as the desktop app draws it (measured on its own screen): the call's own line about
 * what it is for, and beside it the tokens the model has written so far ("임시 디렉터리 생성 후 파일 만들고 목록
 * 출력  36 토큰"). It is not "Thinking": the model is waiting on the call. The time the call has taken stays on the
 * call's line above.
 */
export function TranscriptHeldWorking({ activity }: { activity: StreamingActivity }) {
  const { t } = useTranslation('chat');
  const label = useActivityLabel();
  const { turnOutputTokens } = useChatStreamContext();
  return (
    <div className="flex items-center gap-2.5 px-4 py-[17px] text-[0.9375rem] text-[var(--tr-muted)]" role="status" data-transcript-held-working>
      <ActivityGlyph activity={activity.mark} />
      <span className="min-w-0 truncate">
        <span className="transcript-shimmer">{label(activity)}</span>
        {turnOutputTokens > 0 && <span className="ms-2">{t('transcript.streaming.tokens', { count: formatTokenCount(turnOutputTokens) })}</span>}
      </span>
    </div>
  );
}

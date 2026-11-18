import { useTranslation } from '@/i18n';
import { useBacklinkedSession } from '@/contexts/BacklinkedSessionsContext';
import { SessionActivity } from '@/shared';
import { ActivityGlyph } from './TranscriptActivity';

/**
 * The line under the transcript of a session that is running although this screen is not the one running it: a
 * program this backend does not run works on it (a session the session-management MCP woke with a message, one
 * in the desktop app), and its turn is not streamed here. The same working dots as a turn of its own, with the
 * word the desktop app says for work in general, so the session does not look stopped while it works.
 */
export function TranscriptExternalWorking({ sessionId }: { sessionId: string | null | undefined }) {
  const { t } = useTranslation('chat');
  const session = useBacklinkedSession(sessionId ?? '');
  if (session?.activity !== SessionActivity.Running) return null;

  return (
    <div className="flex items-center gap-2.5 px-4 py-[1.0625rem] text-[0.9375rem] text-[var(--tr-muted)]" role="status" data-transcript-external-working>
      <ActivityGlyph />
      <span className="transcript-shimmer">{t('transcript.streaming.activity.working')}</span>
    </div>
  );
}

import { useTranslation } from '@/i18n';
import { useBacklinkedSession } from '@/contexts/BacklinkedSessionsContext';
import { SessionActivity } from '@/shared';
import { ActivityGlyph } from './TranscriptActivity';

/**
 * The line under the transcript of a session that is running although this screen is not the one running it: a
 * program this backend does not run works on it (a session the session-management MCP woke with a message, one
 * in the desktop app), and its turn is not streamed here. The same working dots as a turn of its own, with the
 * word the desktop app says for work in general, so the session does not look stopped while it works.
 *
 * The last section keeps 3.0376rem of room under it for the reply that has not come; this line is that reply's place,
 * so it takes the room back (the negative margin) and stands where the desktop app's does: 40px (line to line) under
 * the text above it, its mark 3px in from the text's edge and the words 32px in (measured on the desktop app's screen).
 */
export function TranscriptExternalWorking({ sessionId }: { sessionId: string | null | undefined }) {
  const { t } = useTranslation('chat');
  const session = useBacklinkedSession(sessionId ?? '');
  if (session?.activity !== SessionActivity.Running) return null;

  return (
    <div className="-mt-[3.0376rem] flex items-center gap-[0.75rem] px-4 pb-[0.9563rem] pt-[1.125rem] text-[0.92rem] leading-[0.9rem] text-[var(--tr-muted)]" role="status" data-transcript-external-working>
      <ActivityGlyph />
      <span className="transcript-shimmer">{t('transcript.streaming.activity.working')}</span>
    </div>
  );
}

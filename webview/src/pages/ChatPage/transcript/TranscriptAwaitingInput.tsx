import { useTranslation } from '@/i18n';
import { ActivityGlyph } from './TranscriptActivity';

/**
 * What the Transcript view modes show while a turn runs and a permission card waits for the person, and no call of
 * the turn's own is held by it (a call held by the card says so itself, with its own mark): the amber ring the
 * desktop app draws for work that waits on the person, and a pill that says an answer is needed.
 */
export function TranscriptAwaitingInput() {
  const { t } = useTranslation('chat');
  return (
    <div className="flex items-center gap-[0.5624rem] px-4 py-[0.9563rem] text-[0.8438rem]" role="status" data-transcript-awaiting-input>
      <ActivityGlyph activity="blocked" />
      <span className="rounded-full bg-[#d99a2b]/15 px-[0.675rem] py-[0.225rem] text-[#d99a2b]">{t('chatPage.inputNeeded')}</span>
    </div>
  );
}

import { useTranslation } from '@/i18n';
import { ActivityGlyph } from './TranscriptActivity';

/**
 * What the Transcript view modes show while a turn runs and a permission card waits for the person, and no call of
 * the turn's own is held by it (a call held by the card says so itself, with its own mark): the amber ring the
 * desktop app draws for work that waits on the person, and a pill that says an answer is needed.
 */
export function TranscriptAwaitingInput({ bare = false }: { bare?: boolean } = {}) {
  const { t } = useTranslation('chat');
  const row = (
    <div className="flex w-full items-center gap-[0.5624rem] pt-1 pb-1 text-start leading-[0.9rem] text-[0.9375rem]" role="status" data-transcript-awaiting-input>
      <ActivityGlyph activity="blocked" />
      <span className="rounded-full bg-[#d99a2b]/15 px-[0.675rem] py-[0.225rem] text-[#d99a2b]">{t('chatPage.inputNeeded')}</span>
    </div>
  );
  // `bare`: the line stands inside a block that gives the inset and the space below (the card's own), so it gives none.
  return bare ? row : <div className="px-4 pb-4">{row}</div>;
}

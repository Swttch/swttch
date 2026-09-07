import { useTranslation } from '@/i18n';
import { AudioLevelBars } from './ChatInput/AudioLevelBars';
import { useDictationContext } from './ChatInput/DictationProvider';

/**
 * Says the microphone is still on, in the one place the microphone button
 * cannot be seen.
 *
 * An approval prompt takes the composer's slot at the bottom of the chat, and
 * the composer is where every sign of an ongoing recording lives — the button,
 * its level meter, and the words appearing as they are transcribed. A recording
 * now survives that swap (issue #409), which is what the user asked for, but it
 * would survive invisibly: a lit microphone with nothing on screen to say so is
 * worse than one that stopped, because the user cannot tell whether their
 * sentence is being kept.
 *
 * The same strip carries the other thing they cannot otherwise learn: that the
 * recording stopped on its own after too long a silence. Recording ends there
 * whatever we do — the transcription service stops listening after that much
 * quiet, so the timeout cannot be lengthened (see VOICE_SILENCE_TIMEOUT_MAX) —
 * and the least we can do about a limit we cannot move is not let it happen
 * silently.
 */
export function ListeningNotice() {
  const { t } = useTranslation('chat');
  const { dictation, startDictation } = useDictationContext();

  if (dictation.isRecording) {
    return (
      <div className="max-w-[44rem] mx-auto px-4 pt-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] bg-surface-raised border border-border-subtle text-[0.9230rem] text-text-secondary">
          <span className="text-accent-primary shrink-0">
            <AudioLevelBars level={dictation.level} />
          </span>
          <span className="min-w-0 flex-1">{t('chatInput.dictation.stillListening')}</span>
          <button
            type="button"
            onClick={() => void dictation.stop()}
            className="shrink-0 px-2 py-0.5 rounded-[4px] text-text-primary hover:bg-surface-hover transition-colors"
          >
            {t('chatInput.dictation.stop')}
          </button>
        </div>
      </div>
    );
  }

  if (dictation.stoppedBySilence) {
    return (
      <div className="max-w-[44rem] mx-auto px-4 pt-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] bg-surface-raised border border-border-subtle text-[0.9230rem] text-text-secondary">
          <span className="min-w-0 flex-1">{t('chatInput.dictation.stoppedBySilence')}</span>
          <button
            type="button"
            onClick={startDictation}
            className="shrink-0 px-2 py-0.5 rounded-[4px] text-text-primary hover:bg-surface-hover transition-colors"
          >
            {t('chatInput.dictation.resume')}
          </button>
          <button
            type="button"
            aria-label={t('chatInput.dictation.dismissNotice')}
            onClick={dictation.dismissSilenceNotice}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return null;
}

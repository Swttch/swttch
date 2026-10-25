import { XMarkIcon } from '@heroicons/react/24/outline';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';

/**
 * Top banner for a Claude settings file this app cannot read or write (#595).
 *
 * A settings file that exists but cannot be read (saved with a byte order mark and then broken some
 * other way, not valid JSON, held open by another program) reads as "no settings at all": the effort
 * slider sits on its first step, every toggle looks off, and every change is refused. None of that said
 * why, so the slider looked broken. This says which file and what the operating system or the parser
 * answered, and goes away on its own once the file reads again (the backend re-sends the list whenever
 * a settings file changes).
 *
 * A refused save for another reason (a read-only file, a full disk) has no unreadable file to point at,
 * so the banner shows the reason itself, with a close button because nothing else clears it until the
 * next save goes through.
 */
export function SettingsFileProblemBanner() {
  const { unreadable, saveError, clearSaveError } = useClaudeSettings();
  const { t } = useTranslation('chat');

  const files = unreadable ?? [];
  if (files.length === 0 && !saveError) return null;

  return (
    <div
      role="alert"
      className="w-full z-20 border-t border-b border-state-warning-border bg-state-warning-bg px-4 py-1.5 flex items-start gap-3"
    >
      <div className="mr-auto min-w-0 text-state-warning-fg text-[0.8461rem]">
        {files.length > 0
          ? files.map((f) => (
              <div key={f.file} className="break-words">
                {t('settingsFileProblem.unreadable', { file: f.file, reason: f.reason })}
              </div>
            ))
          : <div className="break-words">{t('settingsFileProblem.saveFailed', { reason: saveError })}</div>}
      </div>
      {files.length === 0 && (
        <button
          type="button"
          onClick={clearSaveError}
          aria-label={t('inputBanner.close')}
          className="flex-shrink-0 rounded p-0.5 text-state-warning-fg hover:bg-state-info-bg transition-colors"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

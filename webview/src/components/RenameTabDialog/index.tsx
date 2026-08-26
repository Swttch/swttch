import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { Portal } from '../Portal';

interface Props {
  /** What the tab is called right now, used to seed the field. */
  initialName: string;
  /** Confirmed name. Empty means "stop using a name of my own". */
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

/**
 * Asks what this tab should be called.
 *
 * Built here rather than reached for from the IDE because the platform's own
 * in-place rename popup is a Swing balloon: over the JCEF browser a chat tab
 * lives in, it receives neither clicks nor keystrokes. Drawing the prompt in the
 * page instead also means someone on the browser side of a tunnel gets the same
 * dialog, where no IDE popup exists at all (issue #301).
 *
 * Submitting an empty field is a real answer, not a cancelled one: it clears the
 * name and lets the tab go back to following its conversation title. Escape and
 * the backdrop are what mean "never mind".
 */
export function RenameTabDialog({ initialName, onConfirm, onCancel }: Props) {
  const { t } = useTranslation('common');
  const [draft, setDraft] = useState(initialName);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the field and hold it there. The chat input underneath re-focuses
  // itself on its own schedule (session change, window focus), and if it wins
  // the race the dialog is left un-typeable while still on screen — the same
  // failure the platform popup has, reproduced in the page.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    inputRef.current?.select();

    const handleFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) {
        inputRef.current?.focus();
      }
    };
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Escape is taken in the capture phase so it closes this rather than reaching
  // the composer, which binds Escape for its own purposes.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  const commit = () => onConfirm(draft.trim());

  return (
    <Portal>
      <div
        data-testid="rename-tab-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          className="relative bg-surface-raised border border-border-default rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4"
        >
          <h2 className="text-md font-semibold text-text-primary">
            {t('renameTabDialog.title')}
          </h2>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            placeholder={t('renameTabDialog.placeholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            className="w-full bg-surface-default border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
          />
          {/* Says what an empty field does, because "clear it to go back" is not
              a thing anyone guesses from an empty box. */}
          <p className="text-xs text-text-tertiary">{t('renameTabDialog.hint')}</p>
          <div className="flex justify-end gap-2">
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-tooltip transition-colors"
              onClick={onCancel}
            >
              {t('confirmDialog.cancel')}
            </button>
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary-hover hover:bg-accent-primary text-text-primary transition-colors"
              onClick={commit}
            >
              {t('confirmDialog.confirm')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

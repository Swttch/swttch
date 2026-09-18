import { useState, useEffect } from 'react';
import { useTranslation } from '@/i18n';
import {
  displayShortcut,
  formatShortcut,
  shortcutPartsFromEvent,
  isBindableShortcut,
  isModifierOnly,
} from '@/utils/shortcut';

interface Props {
  /** Current shortcut in stored form, e.g. 'Alt+D'. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /**
   * Accept Shift as the only modifier when the key types nothing (Shift+Enter).
   *
   * Only the composer rows ask for this. A window-wide shortcut bound to
   * Shift+Enter would eat the composer's line break from a screen that never
   * mentions the composer — see {@link isBindableShortcut}.
   */
  allowShiftAlone?: boolean;
}

/**
 * A button that records the next key combination pressed.
 *
 * Typing a shortcut into a text field would mean spelling out modifier names
 * and getting the syntax right; pressing the keys is the only description of a
 * shortcut that cannot be mistyped.
 */
export function ShortcutInput({ value, onChange, ariaLabel, allowShiftAlone = false }: Props) {
  const { t } = useTranslation('settings');
  const [recording, setRecording] = useState(false);
  const [rejected, setRejected] = useState(false);

  // Leaving the button while it waits would strand it listening for keys the
  // user is now typing somewhere else.
  useEffect(() => {
    if (!recording) return;
    const stop = () => setRecording(false);
    window.addEventListener('blur', stop);
    return () => window.removeEventListener('blur', stop);
  }, [recording]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    // Escape leaves the binding as it was — the way out for someone who opened
    // this by accident.
    if (e.key === 'Escape') {
      setRecording(false);
      setRejected(false);
      return;
    }

    // Modifiers alone are the user still reaching for the combination.
    if (isModifierOnly(e.key)) return;

    const parts = shortcutPartsFromEvent(e);
    if (!isBindableShortcut(parts, { allowShiftAlone })) {
      // A bare letter would swallow that character in the composer, so it is
      // refused with a reason rather than silently ignored.
      setRejected(true);
      return;
    }

    onChange(formatShortcut(parts));
    setRecording(false);
    setRejected(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => {
          setRecording((on) => !on);
          setRejected(false);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setRecording(false)}
        className={`w-32 rounded-lg border px-3 py-1.5 text-sm tabular-nums transition-colors ${
          recording
            ? 'border-accent-primary bg-surface-overlay text-text-tertiary italic'
            : 'border-border-default bg-surface-overlay text-text-primary hover:bg-surface-hover'
        }`}
      >
        {recording
          ? t('general.shortcutInput.recording')
          : // Empty when nothing has been recorded yet, which as a bare button
            // reads as broken rather than as unset. Voice always has a default,
            // so this only shows on a composer row switched to Custom.
            displayShortcut(value) || t('general.shortcutInput.unset')}
      </button>
      {rejected && (
        <span className="text-xs text-state-error-fg">
          {t('general.shortcutInput.needsModifier')}
        </span>
      )}
    </div>
  );
}

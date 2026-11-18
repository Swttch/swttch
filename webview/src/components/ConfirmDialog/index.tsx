import { useEffect, useRef, useState, type ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '../Portal';
import { useEscapeLayer } from '@/hooks/useEscapeLayer';

/**
 * A small opt-in under the message, in the manner of "remember me" on a sign-in
 * form: it rides along with the answer rather than being a question of its own.
 */
export interface ConfirmCheckbox {
  label: string;
  /** Where the box starts. */
  defaultChecked: boolean;
  /** Shown beside the label, for a mark such as the sponsor badge. */
  badge?: ReactNode;
  /** A line of small text under the label that says what ticking the box does. */
  hint?: string;
  /**
   * Asked before the box turns ON, never when it turns off. Resolving to false
   * leaves it unchecked, which is how a gated option refuses without closing the
   * dialog it sits in.
   */
  beforeCheck?: () => Promise<boolean>;
  /**
   * The box is shown but cannot be ticked, because the option behind it is
   * closed to this user. It stays on screen on purpose, dimmed rather than
   * hidden: an option nobody can see sells nothing.
   *
   * Pressing it, on the box or on its label, is the way forward instead of a
   * dead end: `onLockedClick` runs and the dialog is cancelled, since a dialog
   * holds the focus and would sit on top of wherever the click is meant to lead.
   */
  locked?: boolean;
  onLockedClick?: () => void;
  /** The locked box is on screen, which is the moment the offer it carries is shown. */
  onLockedShown?: () => void;
}

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  checkbox?: ConfirmCheckbox;
  /**
   * Closing without answering, when that is a distinct outcome from cancelling.
   *
   * By default Escape and a backdrop click route to `onCancel`, which is right
   * while cancelling means "never mind". Pass this where the two buttons are a
   * question and "no" is itself a recorded answer: leaving without choosing then
   * has to mean "not now", not "no". Escape, the backdrop and a close button —
   * which only appears when this is set — all land here instead.
   */
  onDismiss?: () => void;
  /**
   * What the dialog has to find out before it can ask. With it, the dialog opens in a loading state: the title is
   * there, the body is a spinner with the word for loading, and the confirm button takes no input while Cancel works as
   * ever. The dialog is ready when the call resolves. If the call throws, the body shows the reason as it was given, and
   * the confirm button stays closed.
   */
  onReady?: () => Promise<void>;
  /**
   * Runs when the confirm button is pressed; `checked` is the box's state at that moment, false when there is no box.
   *
   * It may be async. The dialog does not care which: it wraps the call so that a plain function and one that returns a
   * promise are handled the same way, and for as long as the call is pending the dialog is busy. The confirm button
   * then shows a spinner in place of its label, and nothing closes the dialog (the buttons, Escape, the backdrop, the
   * close button) nor runs the callback a second time. The dialog does not close itself when the call is done: the
   * caller takes it down, as it always has. A call that throws is logged and the dialog is free again.
   */
  onConfirm: (checked: boolean) => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog(props: Props) {
  const { t } = useTranslation('common');
  const {
    title,
    message,
    confirmLabel = t('confirmDialog.confirm'),
    cancelLabel = t('confirmDialog.cancel'),
    variant = 'default',
    checkbox,
    onDismiss,
    onReady,
    onConfirm,
    onCancel,
  } = props;

  // Until `onReady` has resolved the dialog is loading; a dialog without one is ready from the start.
  const [readiness, setReadiness] = useState<{ phase: 'loading' | 'ready' | 'failed'; error: string }>({
    phase: onReady ? 'loading' : 'ready',
    error: '',
  });
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    const ready = onReadyRef.current;
    if (!ready) return;
    let cancelled = false;
    (async () => ready())().then(
      () => {
        if (!cancelled) setReadiness({ phase: 'ready', error: '' });
      },
      (err: unknown) => {
        console.error('[ConfirmDialog] The dialog could not get ready:', err);
        if (!cancelled) {
          setReadiness({ phase: 'failed', error: err instanceof Error ? err.message : String(err) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const confirmClosed = readiness.phase !== 'ready';

  // Where the caller distinguishes the two, leaving without answering is a
  // dismissal; otherwise it stays what it has always been — a cancel.
  const closeWhenFree = onDismiss ?? onCancel;

  // The yes has been given and its callback is still pending. The dialog may be taken down by the caller while the
  // callback settles, so the flag is only cleared while the dialog is still on screen.
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const handleConfirm = async () => {
    if (busy || confirmClosed) return;
    setBusy(true);
    try {
      // Wrapped, so a sync callback and an async one take the same road, and a sync throw lands in the catch too.
      await (async () => onConfirm(checked))();
    } catch (err) {
      console.error('[ConfirmDialog] The confirm callback failed:', err);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };
  const close = () => {
    if (!busy) closeWhenFree();
  };

  const [checked, setChecked] = useState(checkbox?.defaultChecked ?? false);
  const locked = checkbox?.locked === true;
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management for the lifetime of the dialog:
  //  1. Remember the opener (typically the chat input) BEFORE moving focus, so
  //     we can hand it back on close. Captured here — not via autoFocus — because
  //     autoFocus runs before effects and would make us record the confirm button.
  //  2. Move focus to the confirm button, and trap it: the chat input underneath
  //     runs auto-focus timers (session change, window focus, …) that would yank
  //     focus back, leaving the dialog non-keyboard-operable and routing Enter to
  //     the input. If focus escapes the dialog while open, pull it back.
  //  3. On close (confirm OR cancel), restore focus to the opener so typing can
  //     resume immediately.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmButtonRef.current?.focus();

    const handleFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) {
        confirmButtonRef.current?.focus();
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

  // Escape is taken in the capture phase by the top-most overlay, so it beats
  // the chat input underneath and, above all, never reaches the key that stops
  // a running response. Enter is deliberately NOT handled here: focus is trapped
  // inside the dialog, so Enter natively activates whichever button is focused,
  // Confirm or Cancel. Intercepting it would force-confirm even when the user
  // has Cancel focused.
  useEscapeLayer(() => {
    close();
    return true;
  });

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      close();
    }
  };

  // A locked box is on screen from the moment the dialog is. Reported once, at
  // mount: this is not Tippy, which commits content while still closed.
  const lockedShownRef = useRef(checkbox?.onLockedShown);
  useEffect(() => {
    if (locked) lockedShownRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheckboxChange = async (next: boolean) => {
    if (next && checkbox?.beforeCheck && !(await checkbox.beforeCheck())) return;
    setChecked(next);
  };

  const confirmButtonClass =
    variant === 'danger'
      ? 'px-4 py-2 rounded-lg text-sm font-medium bg-state-error-fg hover:bg-state-error-fg text-text-inverse transition-colors'
      : 'px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary-hover hover:bg-accent-primary text-white transition-colors';

  return (
    <Portal>
      <div
        data-testid="confirm-dialog-backdrop"
        data-confirm-dialog
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          className="relative bg-surface-raised border border-border-default rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4"
        >
          {/* Only where leaving without answering is its own outcome. A plain
              confirmation has no need of it — Cancel already says that. */}
          {onDismiss && (
            <button
              type="button"
              onClick={close}
              disabled={busy}
              aria-label={t('confirmDialog.close')}
              title={t('confirmDialog.close')}
              className="absolute right-3 top-3 rounded p-1 text-text-tertiary hover:text-text-primary hover:bg-surface-tooltip transition-colors"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
          {/* The texts of the dialog take the reply's colour (`--tr-text`), not the theme's text colours: in a JetBrains
              IDE those are the editor's greys, which read as faded next to the reply text behind the dialog. */}
          <h2 className="text-md font-semibold text-[var(--tr-text)] pr-6">{title}</h2>
          {/* pre-line so a message can break itself into paragraphs. Callers
              write plain strings, and without this a `\n\n` collapses into a
              space — one wall of text where two were intended. */}
          {readiness.phase === 'loading' && (
            <div
              data-testid="confirm-dialog-loading"
              role="status"
              className="flex items-center gap-2 text-sm text-[var(--tr-text)]"
            >
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-text-primary/30 border-t-text-primary" />
              {t('confirmDialog.loading')}
            </div>
          )}
          {readiness.phase === 'failed' && (
            <p data-testid="confirm-dialog-error" className="text-sm text-state-error-fg whitespace-pre-line">
              {readiness.error}
            </p>
          )}
          {readiness.phase === 'ready' && (
            <p className="text-sm text-[var(--tr-text)] whitespace-pre-line">{message}</p>
          )}
          {readiness.phase === 'ready' && checkbox && (
            <div className="flex flex-col gap-1">
              <label
                className={`flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none ${
                  locked ? 'opacity-60' : ''
                }`}
                onClick={() => {
                  if (!locked) return;
                  checkbox?.onLockedClick?.();
                  onCancel();
                }}
              >
                {/* Natively disabled, so it looks and reads as disabled. A disabled
                    control swallows presses, so it lets them through to the label,
                    which is what leads on: pressing the box and pressing its text
                    do the same thing. */}
                <input
                  type="checkbox"
                  checked={locked ? false : checked}
                  disabled={locked}
                  onChange={(e) => void handleCheckboxChange(e.target.checked)}
                  className={`h-3.5 w-3.5 cursor-pointer accent-accent-claude ${
                    locked ? 'pointer-events-none' : ''
                  }`}
                />
                <span>{checkbox.label}</span>
                {checkbox.badge}
              </label>
              {/* Lined up under the label rather than the box: it explains the
                  label, and starting at the box would read as a second item. */}
              {checkbox.hint && <p className="ps-[1.375rem] text-xs text-text-tertiary">{checkbox.hint}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--tr-text)] hover:bg-surface-tooltip transition-colors disabled:opacity-40 disabled:pointer-events-none"
              disabled={busy}
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmButtonRef}
              className={`${confirmButtonClass} relative inline-flex items-center gap-1.5 ${
                confirmClosed ? 'pointer-events-none opacity-40' : ''
              }`}
              disabled={busy}
              aria-busy={busy}
              aria-disabled={confirmClosed}
              onClick={() => void handleConfirm()}
            >
              {/* The label stays (invisible) so the button keeps its width while the spinner takes its place. */}
              <span className={busy ? 'invisible' : undefined}>{confirmLabel}</span>
              {busy && (
                <span
                  data-testid="confirm-dialog-spinner"
                  className="absolute inset-0 m-auto h-4 w-4 animate-spin rounded-full border-2 border-text-primary/30 border-t-text-primary"
                />
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { ConfirmDialog, type ConfirmCheckbox } from './index';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  /** A small opt-in under the message; read its state back with confirmWithCheckbox. */
  checkbox?: ConfirmCheckbox;
}

/** How the dialog was answered. */
export enum ConfirmResult {
  Confirmed = 'confirmed',
  Declined = 'declined',
  /** Closed without answering: Escape, the backdrop, or the close button. */
  Dismissed = 'dismissed',
}

interface DialogState extends ConfirmOptions {
  /** Set when the caller used ask(), which tells dismissal apart from declining. */
  dismissable: boolean;
  resolve: (value: ConfirmResult, checked: boolean) => void;
}

interface UseConfirmDialogReturn {
  confirmDialog: ReactNode;
  /**
   * Ask a yes/no question. Closing the dialog counts as "no", which is what a
   * confirmation means by it.
   */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /**
   * Ask a yes/no question that carries a checkbox. `checked` is the box's state
   * when the question was answered, and is false for anything but a yes.
   */
  confirmWithCheckbox: (options: ConfirmOptions) => Promise<{ confirmed: boolean; checked: boolean }>;
  /**
   * Ask a question where closing is NOT an answer — the dialog grows a close
   * button, and Escape/backdrop/close all resolve to `Dismissed`. For questions
   * whose "no" is recorded and acted on, so walking away has to stay separate.
   */
  ask: (options: ConfirmOptions) => Promise<ConfirmResult>;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
  const [state, setState] = useState<DialogState | null>(null);

  const open = useCallback(
    (options: ConfirmOptions, dismissable: boolean): Promise<{ result: ConfirmResult; checked: boolean }> =>
      new Promise((resolve) => {
        setState({ ...options, dismissable, resolve: (result, checked) => resolve({ result, checked }) });
      }),
    [],
  );

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> =>
      open(options, false).then(({ result }) => result === ConfirmResult.Confirmed),
    [open],
  );

  const confirmWithCheckbox = useCallback(
    (options: ConfirmOptions): Promise<{ confirmed: boolean; checked: boolean }> =>
      open(options, false).then(({ result, checked }) => {
        const confirmed = result === ConfirmResult.Confirmed;
        return { confirmed, checked: confirmed && checked };
      }),
    [open],
  );

  const ask = useCallback(
    (options: ConfirmOptions): Promise<ConfirmResult> => open(options, true).then(({ result }) => result),
    [open],
  );

  const settle = useCallback(
    (result: ConfirmResult, checked = false) => {
      state?.resolve(result, checked);
      setState(null);
    },
    [state],
  );

  const confirmDialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      checkbox={state.checkbox}
      onDismiss={state.dismissable ? () => settle(ConfirmResult.Dismissed) : undefined}
      onConfirm={(checked) => settle(ConfirmResult.Confirmed, checked)}
      onCancel={() => settle(ConfirmResult.Declined)}
    />
  ) : null;

  return { confirmDialog, confirm, confirmWithCheckbox, ask };
}

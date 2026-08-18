import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { ConfirmDialog } from './index';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
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
  resolve: (value: ConfirmResult) => void;
}

interface UseConfirmDialogReturn {
  confirmDialog: ReactNode;
  /**
   * Ask a yes/no question. Closing the dialog counts as "no", which is what a
   * confirmation means by it.
   */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
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
    (options: ConfirmOptions, dismissable: boolean): Promise<ConfirmResult> =>
      new Promise((resolve) => {
        setState({ ...options, dismissable, resolve });
      }),
    [],
  );

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> =>
      open(options, false).then((result) => result === ConfirmResult.Confirmed),
    [open],
  );

  const ask = useCallback(
    (options: ConfirmOptions): Promise<ConfirmResult> => open(options, true),
    [open],
  );

  const settle = useCallback(
    (result: ConfirmResult) => {
      state?.resolve(result);
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
      onDismiss={state.dismissable ? () => settle(ConfirmResult.Dismissed) : undefined}
      onConfirm={() => settle(ConfirmResult.Confirmed)}
      onCancel={() => settle(ConfirmResult.Declined)}
    />
  ) : null;

  return { confirmDialog, confirm, ask };
}

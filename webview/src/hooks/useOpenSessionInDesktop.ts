import { useCallback, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { i18n } from '@/i18n';
import { useSessionContext } from '@/contexts/SessionContext';
import { useConfirmDialog, type ConfirmOptions } from '@/components/ConfirmDialog/useConfirmDialog';
import { openSessionInDesktop } from '@/utils/desktopSessionDeepLink';

/**
 * Asks before handing the session to the Claude Desktop app (that can start the app and takes the person out of
 * the IDE), and opens it only on a yes. Shared by every place that offers it: the session rail, the composer menu,
 * the slash command and the shortcut.
 */
export async function confirmAndOpenSessionInDesktop(
  confirm: (options: ConfirmOptions) => Promise<boolean>,
  cliSessionId: string,
  nameSessionForDesktop: (sessionId: string) => Promise<void>,
): Promise<void> {
  const yes = await confirm({
    title: i18n.t('chat:openInDesktopConfirm.title'),
    message: i18n.t('chat:openInDesktopConfirm.message'),
    confirmLabel: i18n.t('chat:openInDesktopConfirm.confirm'),
    // Desktop names a session it takes in from the transcript's own name, so the title shown here goes in first. The
    // dialog waits for it with a spinner on its button. Not being able to write it must not stop the session from
    // opening: it then opens under its first prompt.
    onConfirm: async () => {
      try {
        await nameSessionForDesktop(cliSessionId);
      } catch (err) {
        console.error('[confirmAndOpenSessionInDesktop] Failed to write the title for Desktop:', err);
      }
    },
  });
  if (!yes) return;
  try {
    await openSessionInDesktop(cliSessionId);
  } catch (err) {
    console.error('[confirmAndOpenSessionInDesktop] Failed to open the session in Desktop:', err);
    toast.error(i18n.t('chat:externalLink.openFailed'));
  }
}

/**
 * Opens the session on screen in the Claude Desktop app after a confirmation. A session that has not started has no
 * id for Desktop to resume, so there is nothing to open until its first message. The caller renders `dialog`.
 */
export function useOpenSessionInDesktop(): { canOpen: boolean; open: () => void; dialog: ReactNode } {
  const { currentSessionId, nameSessionForDesktop } = useSessionContext();
  const { confirm, confirmDialog } = useConfirmDialog();
  const open = useCallback(() => {
    if (!currentSessionId) return;
    void confirmAndOpenSessionInDesktop(confirm, currentSessionId, nameSessionForDesktop);
  }, [confirm, currentSessionId, nameSessionForDesktop]);
  return { canOpen: currentSessionId !== null, open, dialog: confirmDialog };
}

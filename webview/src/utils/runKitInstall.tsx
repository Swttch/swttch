import toast from 'react-hot-toast';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { i18n } from '@/i18n';

/**
 * Install (or update) the kit and say what happened.
 *
 * Shared because the kit is now installable from two places — the Voice input
 * section's control and the onboarding checklist — and the failure path is the
 * part that must not differ between them. A second copy would be the one that
 * silently loses the handling below the first time either is touched.
 *
 * @param install the mutation from `useExtendKit()`, which throws on failure
 * @param successKey which of the two success lines to show
 */
export async function runKitInstall(
  install: () => Promise<void>,
  successKey: 'installed' | 'updated',
): Promise<void> {
  try {
    await install();
    toast.success(i18n.t(`settings:general.voice.kit.${successKey}`));
  } catch (err) {
    // The backend hands back a runnable command when a global install needs
    // elevation, so the message is worth showing verbatim.
    //
    // It also has to stay up long enough to USE. react-hot-toast dismisses an
    // error after 4s, which is not enough time to read a multi-line message,
    // find the command inside it and retype it into a terminal — so the one
    // person who hit this in #298 went and worked the command out themselves
    // instead. Errors here wait to be dismissed, which means they need a way
    // to BE dismissed; `whiteSpace` keeps the command on its own line rather
    // than reflowing it into the prose.
    const text = err instanceof Error ? err.message : i18n.t('settings:general.voice.kit.failed');
    toast.error(
      (instance) => (
        <span className="flex items-start gap-3">
          <span className="whitespace-pre-wrap">{text}</span>
          <button
            type="button"
            onClick={() => toast.dismiss(instance.id)}
            className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
            aria-label={i18n.t('settings:general.voice.kit.dismiss')}
            title={i18n.t('settings:general.voice.kit.dismiss')}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </span>
      ),
      { duration: Infinity },
    );
  }
}

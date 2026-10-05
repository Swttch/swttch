import { useEffect } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { PrimarySelectionReporter } from '@/api/selection/PrimarySelectionReporter';
import { isJetBrains } from '@/config/environment';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';

/**
 * Tell the backend what the user selects, so the IDE host can fill the Linux
 * PRIMARY selection (#513).
 *
 * Only inside the IDE. A real browser fills that buffer on its own, so a
 * standalone tab would send every selection to a backend that has nothing to do
 * with it. The host decides whether the platform has the buffer at all, so no
 * operating system is sniffed here.
 *
 * Fire-and-forget over `sendRaw`, like the focus report: nothing is answered, and
 * one report lost to a socket that is not open yet costs the user one copy.
 *
 * Mounted once at the app level; cleans up its listeners on unmount.
 */
export function usePrimarySelectionReporter(): void {
  const workingDir = useWorkingDirOrNull()?.workingDirectory ?? undefined;

  useEffect(() => {
    if (!isJetBrains()) return;
    const bridge = getBridge();

    const reporter = new PrimarySelectionReporter(document, (text) => {
      try {
        bridge.sendRaw({
          type: MessageType.SET_PRIMARY_SELECTION,
          payload: { text, workingDir },
          timestamp: Date.now(),
        });
      } catch {
        // Socket not open yet; the next selection tries again.
      }
    });
    return reporter.attach();
  }, [workingDir]);
}

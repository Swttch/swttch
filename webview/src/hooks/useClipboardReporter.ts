import { useEffect } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { ClipboardReporter } from '@/api/clipboard/ClipboardReporter';
import { isJetBrains } from '@/config/environment';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';

/**
 * Keep the IDE's system clipboard in sync with copies made inside JCEF.
 *
 * A normal browser owns the clipboard process that performs the copy, so only
 * the embedded JetBrains browser needs this host report.
 */
export function useClipboardReporter(): void {
  const workingDir = useWorkingDirOrNull()?.workingDirectory ?? undefined;

  useEffect(() => {
    if (!isJetBrains()) return;
    const bridge = getBridge();
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    const reporter = new ClipboardReporter(document, clipboard, (text) => {
      try {
        bridge.sendRaw({
          type: MessageType.SET_CLIPBOARD,
          payload: { text, workingDir },
          timestamp: Date.now(),
        });
      } catch {
        // A disconnected socket cannot update the host; a later copy retries.
      }
    });
    return reporter.attach();
  }, [workingDir]);
}

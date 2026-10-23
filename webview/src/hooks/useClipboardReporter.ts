import { useEffect } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { ClipboardReporter } from '@/api/clipboard/ClipboardReporter';
import { isJetBrains } from '@/config/environment';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';

/**
 * How long a copy waits for the host to place the text. Placing it is instant when it works, so
 * this only ends the wait for a host that never answers, which would otherwise leave a copy button
 * waiting for the bridge's thirty seconds when the browser's own write also failed.
 */
const HOST_CLIPBOARD_WRITE_TIMEOUT_MS = 5_000;

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
    const reporter = new ClipboardReporter(document, clipboard, (text) =>
      bridge.request(
        MessageType.SET_CLIPBOARD,
        { text, workingDir },
        { timeout: HOST_CLIPBOARD_WRITE_TIMEOUT_MS },
      ),
    );
    return reporter.attach();
  }, [workingDir]);
}

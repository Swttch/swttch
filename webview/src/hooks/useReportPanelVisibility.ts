import { useEffect } from 'react';
import { useBridge } from './useBridge';
import { MessageType } from '@/shared';

/**
 * How long the page has to stay hidden before it is reported hidden. In the JetBrains JCEF
 * webview, leaving the tab fires `visibilitychange(hidden)` and 43ms later
 * `visibilitychange(visible)` (see FocusManager), so a report on the first event would flash
 * hidden and visible for a tab the user is still on. Showing again is reported at once.
 */
export const HIDDEN_REPORT_DELAY_MS = 1_000;

/**
 * Tell the backend whether this screen is showing, so it can stop the CLI of a session nobody
 * is looking at (see `stopIdleSessions` in the backend).
 *
 * "Showing" is not keyboard focus: a window the user has clicked away from but can still see is
 * being watched. It is `document.visibilityState`, and in an IDE also what the host says. On IDE
 * 2024.2 a tab behind another editor tab turns hidden by itself; on 2026.3 it does not (measured:
 * the page stayed visible and kept drawing frames), so the IDE tells the page through the
 * `ide-panel-showing` event and `window.__ccgHostShowing`. Either one saying "not showing" is
 * enough. Fire and forget; a dropped report leaves the backend believing the screen is showing,
 * which only keeps a CLI alive longer.
 *
 * On unmount a hidden screen reports showing, so a screen that has gone away cannot leave
 * the backend counting it as hidden.
 */
export function useReportPanelVisibility(): void {
  const { send } = useBridge();

  useEffect(() => {
    let reported: boolean | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const report = (visible: boolean) => {
      if (reported === visible) return;
      reported = visible;
      void send(MessageType.REPORT_PANEL_VISIBILITY, { visible }).catch(() => {});
    };

    // Undefined until the host has said anything, which counts as showing.
    const notShowing = () =>
      document.visibilityState === 'hidden' ||
      (window as unknown as { __ccgHostShowing?: boolean }).__ccgHostShowing === false;

    const refresh = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (!notShowing()) {
        report(true);
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        if (notShowing()) report(false);
      }, HIDDEN_REPORT_DELAY_MS);
    };

    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('ide-panel-showing', refresh);
    refresh();

    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('ide-panel-showing', refresh);
      if (timer !== undefined) clearTimeout(timer);
      if (reported === false) void send(MessageType.REPORT_PANEL_VISIBILITY, { visible: true }).catch(() => {});
    };
  }, [send]);
}

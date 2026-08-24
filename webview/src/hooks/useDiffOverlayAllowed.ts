import { useSettings } from '@/contexts/SettingsContext';
import { isJetBrains } from '@/config/environment';
import { SettingKey, HostMode, BrowserDiffPresentation } from '@/types/settings';

/**
 * Whether the review may be drawn as an overlay rather than a window of its own.
 *
 * A browser can always do it. Inside an IDE it depends on where the chat itself
 * lives, because the overlay is drawn over that chat and inherits its room:
 *
 * - Sidebar (`tool-window`): no. A tool window is a column, and a side-by-side
 *   diff laid over it has nowhere to be — the review would be unreadable in the
 *   surface it is meant to be reviewed in. The editor tab is the only sensible
 *   answer there, so the setting is not offered.
 * - Panel (`editor-tab`): yes. The chat already occupies an editor tab with the
 *   full width of the window, which is room enough to review in.
 *
 * Shared rather than repeated so the settings screen and the code that opens the
 * review cannot disagree — one saying the choice is available while the other
 * ignores it.
 */
export function useDiffOverlayAllowed(): boolean {
  const { settings } = useSettings();
  if (!isJetBrains()) return true;
  // Absent reads as the default, which is the panel — the same value the
  // backend falls back to. Treating "unset" as the sidebar would take the
  // choice away from everyone who has never opened this setting.
  const hostMode = settings[SettingKey.HOST_MODE] ?? HostMode.EDITOR_TAB;
  return hostMode === HostMode.EDITOR_TAB;
}

/**
 * Whether the next review will actually be drawn as an overlay.
 *
 * The setting asked for one AND there is room for one. Kept as its own name
 * because three places need this same answer and they must not disagree: the
 * code that opens a review on click, the one that opens it unprompted, and the
 * backend — which declines to open an editor tab in exactly this case, leaving
 * the webview to draw the overlay itself.
 */
export function useDiffOpensAsOverlay(): boolean {
  const { scopeSettings } = useSettings();
  const allowed = useDiffOverlayAllowed();
  const presentation =
    (scopeSettings[SettingKey.BROWSER_DIFF_PRESENTATION] as BrowserDiffPresentation | undefined) ??
    BrowserDiffPresentation.NEW_TAB;
  return allowed && presentation === BrowserDiffPresentation.OVERLAY;
}
